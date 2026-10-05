import { db } from '../../core/db.js';
import { EventKind } from '@oams/shared';
import { logger } from '../../core/logger.js';

/**
 * Resolves the reviewer / assignee for an appointment according to §10.3:
 * 1. Active delegation for the official (scope ALL or APPOINTMENTS) -> delegation.to_user_id
 * 2. Active support staff ordered by routing_order, skipping anyone with an active LEAVE event -> staff.user_id
 * 3. Official themself -> official.user_id
 * 4. Official inactive -> null (unassigned queue for APPOINTMENT_ADMIN)
 */
export async function resolveAssignee(
  officialId: string,
  at: Date = new Date(),
): Promise<string | null> {
  const official = await db('officials').where('id', officialId).first();
  if (!official || !official.is_active) {
    logger.info({ officialId }, 'Official is inactive or not found, appointment unassigned');
    return null;
  }

  // 1. Check active delegations
  const delegation = await db('delegations')
    .where('official_id', officialId)
    .whereIn('scope', ['ALL', 'APPOINTMENTS'])
    .whereNull('revoked_at')
    .where('starts_at', '<=', at)
    .where('ends_at', '>=', at)
    .first();

  if (delegation) {
    logger.debug(
      { officialId, toUserId: delegation.to_user_id },
      'Routing resolved via active delegation',
    );
    return delegation.to_user_id;
  }

  // 2. Query active support staff ordered by routing_order
  const supportStaffList = await db('official_support_staff')
    .join('users', 'official_support_staff.user_id', 'users.id')
    .where('official_support_staff.official_id', officialId)
    .where('official_support_staff.active_from', '<=', at)
    .andWhere((qb) => {
      qb.whereNull('official_support_staff.active_to').orWhere(
        'official_support_staff.active_to',
        '>=',
        at,
      );
    })
    .where('users.status', 'ACTIVE')
    .orderBy('official_support_staff.routing_order', 'asc')
    .select(
      'official_support_staff.user_id',
      'users.id as userId',
      'official_support_staff.support_role',
    );

  for (const staff of supportStaffList) {
    // Check if staff has an active LEAVE event covering `at`
    const leaveEvent = await db('calendar_events')
      .where('calendar_events.kind', EventKind.LEAVE)
      .where('calendar_events.status', 'ACTIVE')
      .where('calendar_events.start_at', '<=', at)
      .where('calendar_events.end_at', '>=', at)
      .join('calendars', 'calendar_events.calendar_id', 'calendars.id')
      .join('officials', 'calendars.official_id', 'officials.id')
      .where('officials.user_id', staff.userId)
      .first();

    if (!leaveEvent) {
      logger.debug(
        { officialId, staffUserId: staff.userId, role: staff.support_role },
        'Routing resolved to active support staff',
      );
      return staff.userId;
    }
  }

  // 3. Fallback to official themself
  logger.debug({ officialId, userId: official.user_id }, 'Routing fell back to official');
  return official.user_id;
}
