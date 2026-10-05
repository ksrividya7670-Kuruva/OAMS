import { db } from '../core/db.js';
import { logger } from '../core/logger.js';
import { writeAuditEvent } from '../core/audit/auditWriter.js';
import { VisitStatus } from '@oams/shared';

let intervalHandle: NodeJS.Timeout | null = null;

export async function processVisitorAutoCheckoutOnce(): Promise<number> {
  const now = new Date();

  // Find visits in CHECKED_IN or WITH_HOST where appointment has ended
  const leftoverVisits = await db('visits')
    .join('appointments', 'visits.appointment_id', 'appointments.id')
    .whereIn('visits.status', [VisitStatus.CHECKED_IN, VisitStatus.WITH_HOST])
    .andWhere('appointments.end_at', '<', now)
    .select(
      'visits.id',
      'visits.org_id',
      'visits.reference_no',
      'visits.status',
      'visits.visitor_name',
    );

  let processedCount = 0;

  for (const visit of leftoverVisits) {
    try {
      await db.transaction(async (trx) => {
        await trx('visits').where('id', visit.id).update({
          status: VisitStatus.CHECKED_OUT,
          checked_out_at: now,
          updated_at: now,
        });

        await writeAuditEvent(trx, {
          orgId: visit.org_id,
          entityType: 'visit',
          entityId: visit.id,
          action: 'visit.auto_checkout',
          actorId: 'system',
          actorRole: 'SYSTEM',
          correlationId: 'visitor-autocheckout-job',
          changes: {
            status: [visit.status, VisitStatus.CHECKED_OUT],
            note: 'Auto-checked out by security background job (§15.2)',
          },
        });
      });

      processedCount++;
    } catch (err) {
      logger.error({ err, visitId: visit.id }, 'Error auto-checking out leftover visitor');
    }
  }

  return processedCount;
}

export function startVisitorAutoCheckoutWorker(intervalMs = 300000): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(async () => {
    try {
      await processVisitorAutoCheckoutOnce();
    } catch (err) {
      logger.error({ err }, 'Error in visitor auto-checkout worker');
    }
  }, intervalMs);
}

export function stopVisitorAutoCheckoutWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
