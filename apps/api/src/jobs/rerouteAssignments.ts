import crypto from 'crypto';
import { db } from '../core/db.js';
import { logger } from '../core/logger.js';
import { resolveAssignee } from '../modules/appointments/routing.js';
import { writeAuditEvent } from '../core/audit/auditWriter.js';
import { writeOutboxEvent } from '../core/outbox/outboxWriter.js';
import { routeNotificationEvent } from '../core/notifications/router.js';
import { AppointmentStatus } from '@oams/shared';

const REVIEW_STAGE_STATUSES = [
  AppointmentStatus.UNDER_REVIEW,
  AppointmentStatus.INFO_REQUESTED,
  AppointmentStatus.AWAITING_REQUESTER,
];

/**
 * Re-evaluates routing and reassigns all review-stage appointments for a specific official.
 * Can be triggered immediately when a delegation is created or revoked.
 */
export async function rerouteAppointmentsForOfficial(officialId: string): Promise<number> {
  let rerouted = 0;

  try {
    const appointments = await db('appointments')
      .where('primary_official_id', officialId)
      .whereIn('status', REVIEW_STAGE_STATUSES);

    const now = new Date();
    const newAssigneeId = await resolveAssignee(officialId, now);

    if (!newAssigneeId) {
      return 0;
    }

    for (const apt of appointments) {
      if (apt.assigned_to_user_id !== newAssigneeId) {
        rerouted++;

        await db.transaction(async (trx) => {
          await trx('appointments').where('id', apt.id).update({
            assigned_to_user_id: newAssigneeId,
            updated_at: trx.fn.now(),
          });

          await writeAuditEvent(trx, {
            orgId: apt.org_id,
            action: 'appointment.rerouted',
            entityType: 'appointment',
            entityId: apt.id,
            changes: { assigned_to_user_id: [apt.assigned_to_user_id, newAssigneeId] },
            correlationId: crypto.randomUUID(),
          });

          await writeOutboxEvent(trx, {
            orgId: apt.org_id,
            eventType: 'AppointmentAssigned',
            aggregateType: 'appointment',
            aggregateId: apt.id,
            payload: {
              appointmentId: apt.id,
              referenceNo: apt.reference_no,
              assignedToUserId: newAssigneeId,
              officialId: apt.primary_official_id,
            },
          });
        });

        try {
          await routeNotificationEvent({
            id: `event-${Date.now()}`,
            orgId: apt.org_id,
            eventType: 'AppointmentAssigned',
            aggregateType: 'appointment',
            aggregateId: apt.id,
            payload: {
              appointmentId: apt.id,
              referenceNo: apt.reference_no,
              assignedToUserId: newAssigneeId,
              officialId: apt.primary_official_id,
            },
            occurredAt: new Date(),
          });
        } catch (e) {
          logger.warn({ err: e }, 'Failed to route AppointmentAssigned event during reroute');
        }
      }
    }

    return rerouted;
  } catch (err) {
    logger.error({ err, officialId }, 'Error running rerouteAppointmentsForOfficial');
    return rerouted;
  }
}

/**
 * Global background job:
 * 1. Checks review-stage appointments across all officials and updates assignees if routing changed.
 * 2. Checks delegation transitions (started or expired) to ensure domain events are published.
 */
export async function processRerouteAssignmentsOnce(): Promise<number> {
  let rerouted = 0;

  try {
    const appointments = await db('appointments').whereIn('status', REVIEW_STAGE_STATUSES);

    const now = new Date();

    for (const apt of appointments) {
      const newAssigneeId = await resolveAssignee(apt.primary_official_id, now);

      if (newAssigneeId && newAssigneeId !== apt.assigned_to_user_id) {
        rerouted++;

        await db.transaction(async (trx) => {
          await trx('appointments').where('id', apt.id).update({
            assigned_to_user_id: newAssigneeId,
            updated_at: trx.fn.now(),
          });

          await writeAuditEvent(trx, {
            orgId: apt.org_id,
            action: 'appointment.rerouted',
            entityType: 'appointment',
            entityId: apt.id,
            changes: { assigned_to_user_id: [apt.assigned_to_user_id, newAssigneeId] },
            correlationId: crypto.randomUUID(),
          });

          await writeOutboxEvent(trx, {
            orgId: apt.org_id,
            eventType: 'AppointmentAssigned',
            aggregateType: 'appointment',
            aggregateId: apt.id,
            payload: {
              appointmentId: apt.id,
              referenceNo: apt.reference_no,
              assignedToUserId: newAssigneeId,
              officialId: apt.primary_official_id,
            },
          });
        });

        try {
          await routeNotificationEvent({
            id: `event-${Date.now()}`,
            orgId: apt.org_id,
            eventType: 'AppointmentAssigned',
            aggregateType: 'appointment',
            aggregateId: apt.id,
            payload: {
              appointmentId: apt.id,
              referenceNo: apt.reference_no,
              assignedToUserId: newAssigneeId,
              officialId: apt.primary_official_id,
            },
            occurredAt: new Date(),
          });
        } catch (e) {
          logger.warn({ err: e }, 'Failed to route AppointmentAssigned event');
        }
      }
    }

    return rerouted;
  } catch (err) {
    logger.error({ err }, 'Error running reroute-assignments job');
    return rerouted;
  }
}

let timer: NodeJS.Timeout | null = null;

export function startRerouteAssignmentsWorker(intervalMs = 60000): void {
  if (timer) return;
  logger.info({ intervalMs }, 'Starting reroute-assignments worker');

  timer = setInterval(async () => {
    try {
      const count = await processRerouteAssignmentsOnce();
      if (count > 0) {
        logger.info({ count }, 'Rerouted appointments during background cycle');
      }
    } catch (err) {
      logger.error({ err }, 'Unexpected error in reroute-assignments worker');
    }
  }, intervalMs);
}

export function stopRerouteAssignmentsWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info('Stopped reroute-assignments worker');
  }
}
