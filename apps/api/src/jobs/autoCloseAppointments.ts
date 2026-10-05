import { db } from '../core/db.js';
import { logger } from '../core/logger.js';
import { writeAuditEvent } from '../core/audit/auditWriter.js';
import { writeOutboxEvent } from '../core/outbox/outboxWriter.js';
import { routeNotificationEvent } from '../core/notifications/router.js';
import { AppointmentStatus } from '@oams/shared';

let intervalHandle: NodeJS.Timeout | null = null;

export async function processAutoCloseAppointmentsOnce(closeDays = 14): Promise<number> {
  const threshold = new Date(Date.now() - closeDays * 24 * 60 * 60 * 1000);

  // Find COMPLETED appointments where completed_at < threshold (or fallback to status_changed_at)
  const candidates = await db('appointments')
    .where('status', AppointmentStatus.COMPLETED)
    .andWhere((builder) => {
      builder.where('completed_at', '<', threshold).orWhere((inner) => {
        inner.whereNull('completed_at').andWhere('status_changed_at', '<', threshold);
      });
    })
    .select('id', 'org_id', 'reference_no', 'primary_official_id', 'created_by');

  let processedCount = 0;

  for (const apt of candidates) {
    try {
      let domainEvent: any = null;

      await db.transaction(async (trx) => {
        const now = new Date();

        // 1. Mark appointment as CLOSED
        await trx('appointments').where('id', apt.id).update({
          status: AppointmentStatus.CLOSED,
          closed_at: now,
          status_changed_at: now,
          updated_at: now,
        });

        // 2. Record status history
        await trx('appointment_status_history').insert({
          appointment_id: apt.id,
          from_status: AppointmentStatus.COMPLETED,
          to_status: AppointmentStatus.CLOSED,
          action: 'autoClose',
          actor_id: null,
          note: `Automatically closed after ${closeDays} days in completed status (§16, §22 Track 8)`,
          at: now,
        });

        // 3. Write audit log
        await writeAuditEvent(trx, {
          orgId: apt.org_id,
          entityType: 'appointment',
          entityId: apt.id,
          action: 'appointment.auto_close',
          actorId: apt.created_by || '00000000-0000-0000-0000-000000000000',
          actorRole: 'SYSTEM',
          changes: {
            fromStatus: AppointmentStatus.COMPLETED,
            toStatus: AppointmentStatus.CLOSED,
            autoClosedDays: closeDays,
          },
          correlationId: crypto.randomUUID(),
        });

        // 4. Write outbox event
        domainEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          orgId: apt.org_id,
          eventType: 'AppointmentClosed',
          aggregateType: 'appointment',
          aggregateId: apt.id,
          payload: {
            appointmentId: apt.id,
            referenceNo: apt.reference_no,
            primaryOfficialId: apt.primary_official_id,
            closedAt: now,
            autoClosed: true,
          },
          occurredAt: now,
        };

        await writeOutboxEvent(trx, domainEvent);
      });

      if (domainEvent) {
        routeNotificationEvent(domainEvent).catch(() => {});
      }

      processedCount++;
      logger.info(
        { appointmentId: apt.id, referenceNo: apt.reference_no },
        'Auto-closed completed appointment',
      );
    } catch (err) {
      logger.error({ err, appointmentId: apt.id }, 'Failed to auto-close appointment');
    }
  }

  return processedCount;
}

export function startAutoCloseAppointmentsWorker(intervalMs = 60 * 60 * 1000): void {
  if (intervalHandle) return;

  logger.info({ intervalMs }, 'Starting autoCloseAppointments worker');
  intervalHandle = setInterval(async () => {
    try {
      const count = await processAutoCloseAppointmentsOnce();
      if (count > 0) {
        logger.info({ count }, 'Auto-closed completed appointments batch');
      }
    } catch (err) {
      logger.error({ err }, 'Error in autoCloseAppointments worker cycle');
    }
  }, intervalMs);
}

export function stopAutoCloseAppointmentsWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('Stopped autoCloseAppointments worker');
  }
}
