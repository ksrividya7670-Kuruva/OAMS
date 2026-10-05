import crypto from 'crypto';
import { db } from '../core/db.js';
import { logger } from '../core/logger.js';

import { writeAuditEvent } from '../core/audit/auditWriter.js';
import { writeOutboxEvent } from '../core/outbox/outboxWriter.js';
import { routeNotificationEvent } from '../core/notifications/router.js';
import { AppointmentStatus } from '@oams/shared';

export async function processHoldExpiryOnce(): Promise<number> {
  const now = new Date();
  let processedCount = 0;

  try {
    // 1. Find all active holds that have expired (§10.7)
    const expiredEvents = await db('calendar_events')
      .where('kind', 'HOLD')
      .where('status', 'ACTIVE')
      .where('hold_expires_at', '<', now);

    for (const hold of expiredEvents) {
      processedCount++;

      // Cancel the expired hold event
      await db('calendar_events').where('id', hold.id).update({
        status: 'CANCELLED',
        updated_at: db.fn.now(),
      });

      if (hold.appointment_id) {
        const apt = await db('appointments').where('id', hold.appointment_id).first();
        if (apt && apt.status === AppointmentStatus.AWAITING_REQUESTER) {
          // Check if all proposals for this appointment are expired or cancelled
          const activeProposals = await db('appointment_proposals')
            .where('appointment_id', apt.id)
            .where('expires_at', '>', now)
            .where('chosen', false);

          if (activeProposals.length === 0) {
            // Revert appointment to UNDER_REVIEW (§10.2: AWAITING_REQUESTER -> UNDER_REVIEW)
            await db.transaction(async (trx) => {
              await trx('appointments').where('id', apt.id).update({
                status: AppointmentStatus.UNDER_REVIEW,
                status_changed_at: trx.fn.now(),
                updated_at: trx.fn.now(),
              });

              await trx('appointment_status_history').insert({
                appointment_id: apt.id,
                from_status: AppointmentStatus.AWAITING_REQUESTER,
                to_status: AppointmentStatus.UNDER_REVIEW,
                action: 'expireProposals',
                note: 'All proposed time slots expired without requester response',
                at: trx.fn.now(),
              });

              await writeAuditEvent(trx, {
                orgId: apt.org_id,
                action: 'appointment.proposals_expired',
                entityType: 'appointment',
                entityId: apt.id,
                changes: {
                  status: [AppointmentStatus.AWAITING_REQUESTER, AppointmentStatus.UNDER_REVIEW],
                },
                correlationId: crypto.randomUUID(),
              });

              await writeOutboxEvent(trx, {
                orgId: apt.org_id,
                eventType: 'HoldExpired',
                aggregateType: 'appointment',
                aggregateId: apt.id,
                payload: {
                  appointmentId: apt.id,
                  referenceNo: apt.reference_no,
                  assignedToUserId: apt.assigned_to_user_id,
                  officialId: apt.primary_official_id,
                },
              });
            });

            try {
              await routeNotificationEvent({
                id: `event-${Date.now()}`,
                orgId: apt.org_id,
                eventType: 'HoldExpired',
                aggregateType: 'appointment',
                aggregateId: apt.id,
                payload: {
                  appointmentId: apt.id,
                  referenceNo: apt.reference_no,
                  assignedToUserId: apt.assigned_to_user_id,
                  officialId: apt.primary_official_id,
                },
                occurredAt: new Date(),
              });
            } catch (e) {
              logger.warn({ err: e }, 'Failed to route HoldExpired event');
            }
          }
        }
      }
    }

    return processedCount;
  } catch (err) {
    logger.error({ err }, 'Error running hold-expiry job');
    return 0;
  }
}
