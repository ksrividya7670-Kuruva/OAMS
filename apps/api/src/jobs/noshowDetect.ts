import { db } from '../core/db.js';
import { logger } from '../core/logger.js';
import { writeAuditEvent } from '../core/audit/auditWriter.js';
import { writeOutboxEvent } from '../core/outbox/outboxWriter.js';
import { routeNotificationEvent } from '../core/notifications/router.js';
import { AppointmentStatus, VisitStatus } from '@oams/shared';

let intervalHandle: NodeJS.Timeout | null = null;

export async function processNoShowDetectOnce(graceMinutes = 30): Promise<number> {
  const threshold = new Date(Date.now() - graceMinutes * 60 * 1000);

  // Find confirmed appointments where start_at + graceMinutes < now
  const candidates = await db('appointments')
    .where('status', AppointmentStatus.CONFIRMED)
    .andWhere('start_at', '<', threshold)
    .select('id', 'org_id', 'reference_no', 'official_id', 'created_by', 'requester_snapshot');

  let processedCount = 0;

  for (const apt of candidates) {
    try {
      // Check if any visitor has checked in
      const checkedInVisits = await db('visits')
        .where('appointment_id', apt.id)
        .whereIn('status', [
          VisitStatus.CHECKED_IN,
          VisitStatus.WITH_HOST,
          VisitStatus.CHECKED_OUT,
        ]);

      if (checkedInVisits.length > 0) {
        continue;
      }

      let domainEvent: any = null;

      await db.transaction(async (trx) => {
        const now = new Date();

        // 1. Mark appointment as NO_SHOW
        await trx('appointments').where('id', apt.id).update({
          status: AppointmentStatus.NO_SHOW,
          updated_at: now,
        });

        // 2. Mark remaining visits as NO_SHOW
        await trx('visits')
          .where('appointment_id', apt.id)
          .whereIn('status', [VisitStatus.EXPECTED, VisitStatus.ARRIVED])
          .update({
            status: VisitStatus.NO_SHOW,
            updated_at: now,
          });

        // 3. Audit log
        await writeAuditEvent(trx, {
          orgId: apt.org_id,
          entityType: 'appointment',
          entityId: apt.id,
          action: 'appointment.no_show',
          actorId: apt.created_by || 'system',
          actorRole: 'SYSTEM',
          correlationId: 'noshow-job',
          changes: { status: [AppointmentStatus.CONFIRMED, AppointmentStatus.NO_SHOW] },
        });

        // 4. Domain event
        domainEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          orgId: apt.org_id,
          eventType: 'AppointmentNoShow',
          aggregateType: 'appointment',
          aggregateId: apt.id,
          payload: {
            appointmentId: apt.id,
            referenceNo: apt.reference_no,
            officialId: apt.official_id,
            requesterUserId: apt.created_by,
            requesterEmail: apt.requester_snapshot?.email,
          },
          occurredAt: now,
        };

        await writeOutboxEvent(trx, domainEvent);
      });

      if (domainEvent) {
        routeNotificationEvent(domainEvent).catch(() => {});
      }

      processedCount++;
    } catch (err) {
      logger.error({ err, appointmentId: apt.id }, 'Error marking appointment as no-show');
    }
  }

  return processedCount;
}

export function startNoShowDetectWorker(intervalMs = 60000): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(async () => {
    try {
      await processNoShowDetectOnce();
    } catch (err) {
      logger.error({ err }, 'Error in no-show detect worker');
    }
  }, intervalMs);
}

export function stopNoShowDetectWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
