import crypto from 'crypto';
import { db } from '../core/db.js';
import { logger } from '../core/logger.js';

import { writeAuditEvent } from '../core/audit/auditWriter.js';
import { writeOutboxEvent } from '../core/outbox/outboxWriter.js';
import { routeNotificationEvent } from '../core/notifications/router.js';
import { AppointmentStatus } from '@oams/shared';

export async function processSlaEscalationOnce(): Promise<{
  reminders: number;
  escalations: number;
}> {
  const now = new Date();
  let reminders = 0;
  let escalations = 0;

  try {
    const underReviewAppointments = await db('appointments')
      .where('status', AppointmentStatus.UNDER_REVIEW)
      .whereNotNull('sla_due_at');

    for (const apt of underReviewAppointments) {
      const slaDueAt = new Date(apt.sla_due_at);
      const submittedAt = apt.submitted_at ? new Date(apt.submitted_at) : new Date(apt.created_at);

      // 1. 100% SLA Escalation (SLA breached) (§20, §22 Criterion 5)
      if (now > slaDueAt && (apt.escalation_level ?? 0) < 1) {
        escalations++;

        await db.transaction(async (trx) => {
          await trx('appointments').where('id', apt.id).update({
            escalation_level: 1,
            updated_at: trx.fn.now(),
          });

          await trx('appointment_status_history').insert({
            appointment_id: apt.id,
            from_status: AppointmentStatus.UNDER_REVIEW,
            to_status: AppointmentStatus.UNDER_REVIEW,
            action: 'sla_escalate',
            note: '100% SLA deadline elapsed without review decision - escalated',
            at: trx.fn.now(),
          });

          await writeAuditEvent(trx, {
            orgId: apt.org_id,
            action: 'appointment.sla_escalated',
            entityType: 'appointment',
            entityId: apt.id,
            changes: { escalation_level: [0, 1] },
            correlationId: crypto.randomUUID(),
          });

          await writeOutboxEvent(trx, {
            orgId: apt.org_id,
            eventType: 'SlaEscalated',
            aggregateType: 'appointment',
            aggregateId: apt.id,
            payload: {
              appointmentId: apt.id,
              referenceNo: apt.reference_no,
              assignedToUserId: apt.assigned_to_user_id,
              officialId: apt.primary_official_id,
              slaDueAt: slaDueAt.toISOString(),
            },
          });
        });

        try {
          await routeNotificationEvent({
            id: `event-${Date.now()}`,
            orgId: apt.org_id,
            eventType: 'SlaEscalated',
            aggregateType: 'appointment',
            aggregateId: apt.id,
            payload: {
              appointmentId: apt.id,
              referenceNo: apt.reference_no,
              assignedToUserId: apt.assigned_to_user_id,
              officialId: apt.primary_official_id,
              slaDueAt: slaDueAt.toISOString(),
            },
            occurredAt: new Date(),
          });
        } catch (e) {
          logger.warn({ err: e }, 'Failed to route SlaEscalated event');
        }
      }

      // 2. 50% SLA Reminder (§14.4 T4, §20, §22 Criterion 5)
      if (!apt.sla_reminder_sent && now <= slaDueAt) {
        const totalDuration = slaDueAt.getTime() - submittedAt.getTime();
        const elapsed = now.getTime() - submittedAt.getTime();

        if (totalDuration > 0 && elapsed >= totalDuration * 0.5) {
          reminders++;

          await db.transaction(async (trx) => {
            await trx('appointments').where('id', apt.id).update({
              sla_reminder_sent: true,
              updated_at: trx.fn.now(),
            });

            await writeOutboxEvent(trx, {
              orgId: apt.org_id,
              eventType: 'SlaReminder',
              aggregateType: 'appointment',
              aggregateId: apt.id,
              payload: {
                appointmentId: apt.id,
                referenceNo: apt.reference_no,
                assignedToUserId: apt.assigned_to_user_id,
                officialId: apt.primary_official_id,
                slaDueAt: slaDueAt.toISOString(),
              },
            });
          });

          try {
            await routeNotificationEvent({
              id: `event-${Date.now()}`,
              orgId: apt.org_id,
              eventType: 'SlaReminder',
              aggregateType: 'appointment',
              aggregateId: apt.id,
              payload: {
                appointmentId: apt.id,
                referenceNo: apt.reference_no,
                assignedToUserId: apt.assigned_to_user_id,
                officialId: apt.primary_official_id,
                slaDueAt: slaDueAt.toISOString(),
              },
              occurredAt: new Date(),
            });
          } catch (e) {
            logger.warn({ err: e }, 'Failed to route SlaReminder event');
          }
        }
      }
    }

    return { reminders, escalations };
  } catch (err) {
    logger.error({ err }, 'Error running sla-escalation job');
    return { reminders, escalations };
  }
}
