import { db } from '../../core/db.js';
import { ApiError, CreateDelegationInput, Permission } from '@oams/shared';
import { writeAuditEvent } from '../../core/audit/auditWriter.js';
import { writeOutboxEvent } from '../../core/outbox/outboxWriter.js';
import { routeNotificationEvent } from '../../core/notifications/router.js';
import { delegationsRepo } from './repo.js';
import { rerouteAppointmentsForOfficial } from '../../jobs/rerouteAssignments.js';
import { logger } from '../../core/logger.js';

export class DelegationsService {
  async listDelegations(officialId: string) {
    const official = await db('officials').where('id', officialId).first();
    if (!official) {
      throw ApiError.notFound('Official not found');
    }
    return delegationsRepo.listByOfficial(officialId);
  }

  async createDelegation(
    orgId: string,
    officialId: string,
    input: CreateDelegationInput,
    actorId?: string,
    actorRole?: string,
    actorPermissions: string[] = [],
    correlationId = 'sys',
  ) {
    const official = await db('officials')
      .where({ id: officialId, org_id: orgId })
      .whereNull('deleted_at')
      .first();

    if (!official) {
      throw ApiError.notFound('Official not found');
    }

    // Authorization: actor must be official user or possess management permission
    const isOfficialUser = actorId && actorId === official.user_id;
    const hasManagePermission =
      actorPermissions.includes(Permission.OFFICIAL_MANAGE) ||
      actorPermissions.includes(Permission.SUPPORT_STAFF_MANAGE) ||
      actorRole === 'SUPER_ADMIN' ||
      actorRole === 'APPOINTMENT_ADMIN';

    if (!isOfficialUser && !hasManagePermission) {
      throw ApiError.forbidden(
        'Only the official or an authorized administrator can create delegations',
      );
    }

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);

    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()) || startsAt >= endsAt) {
      throw ApiError.badRequest('Invalid delegation date range: startsAt must be before endsAt');
    }

    // Validate target user
    const toUser = await db('users')
      .where({ id: input.toUserId, org_id: orgId })
      .where('status', 'ACTIVE')
      .first();

    if (!toUser) {
      throw ApiError.notFound('Target delegate user not found or inactive');
    }

    if (input.toUserId === official.user_id) {
      throw ApiError.badRequest('Cannot delegate authority to the official themselves');
    }

    const now = new Date();

    const created = await db.transaction(async (trx) => {
      const [record] = await trx('delegations')
        .insert({
          official_id: officialId,
          from_user_id: official.user_id,
          to_user_id: input.toUserId,
          scope: input.scope,
          starts_at: startsAt,
          ends_at: endsAt,
          reason: input.reason || null,
          created_by: actorId || null,
          updated_by: actorId || null,
        })
        .returning('*');

      await writeAuditEvent(trx, {
        orgId,
        actorId,
        actorRole,
        action: 'official.create_delegation',
        entityType: 'delegation',
        entityId: record.id,
        changes: {
          officialId,
          fromUserId: official.user_id,
          toUserId: input.toUserId,
          scope: input.scope,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        },
        correlationId,
      });

      // If active now or already in effect, emit DelegationStarted
      if (startsAt <= now && endsAt >= now) {
        await writeOutboxEvent(trx, {
          orgId,
          eventType: 'DelegationStarted',
          aggregateType: 'official',
          aggregateId: officialId,
          payload: {
            delegationId: record.id,
            officialId,
            fromUserId: official.user_id,
            toUserId: input.toUserId,
            scope: input.scope,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            officialTitle: official.title,
            delegateName: toUser.full_name,
          },
        });
      }

      return record;
    });

    // Notify if starting now
    if (startsAt <= now && endsAt >= now) {
      try {
        await routeNotificationEvent({
          id: `event-${Date.now()}`,
          orgId,
          eventType: 'DelegationStarted',
          aggregateType: 'official',
          aggregateId: officialId,
          payload: {
            delegationId: created.id,
            officialId,
            fromUserId: official.user_id,
            toUserId: input.toUserId,
            scope: input.scope,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            officialTitle: official.title,
            delegateName: toUser.full_name,
          },
          occurredAt: new Date(),
        });
      } catch (e) {
        logger.warn({ err: e }, 'Failed to route DelegationStarted event');
      }
    }

    // Re-route review-stage appointments immediately
    await rerouteAppointmentsForOfficial(officialId);

    return delegationsRepo.findById(created.id);
  }

  async revokeDelegation(
    orgId: string,
    officialId: string,
    delegationId: string,
    actorId?: string,
    actorRole?: string,
    actorPermissions: string[] = [],
    correlationId = 'sys',
  ) {
    const official = await db('officials')
      .where({ id: officialId, org_id: orgId })
      .whereNull('deleted_at')
      .first();

    if (!official) {
      throw ApiError.notFound('Official not found');
    }

    // Authorization
    const isOfficialUser = actorId && actorId === official.user_id;
    const hasManagePermission =
      actorPermissions.includes(Permission.OFFICIAL_MANAGE) ||
      actorPermissions.includes(Permission.SUPPORT_STAFF_MANAGE) ||
      actorRole === 'SUPER_ADMIN' ||
      actorRole === 'APPOINTMENT_ADMIN';

    if (!isOfficialUser && !hasManagePermission) {
      throw ApiError.forbidden(
        'Only the official or an authorized administrator can revoke delegations',
      );
    }

    const delegation = await delegationsRepo.findById(delegationId, officialId);
    if (!delegation) {
      throw ApiError.notFound('Delegation not found');
    }

    if (delegation.revokedAt) {
      throw ApiError.badRequest('Delegation is already revoked');
    }

    await db.transaction(async (trx) => {
      await trx('delegations')
        .where('id', delegationId)
        .update({
          revoked_at: trx.fn.now(),
          updated_by: actorId || null,
          updated_at: trx.fn.now(),
        });

      await writeAuditEvent(trx, {
        orgId,
        actorId,
        actorRole,
        action: 'official.revoke_delegation',
        entityType: 'delegation',
        entityId: delegationId,
        changes: { revokedAt: new Date().toISOString() },
        correlationId,
      });

      await writeOutboxEvent(trx, {
        orgId,
        eventType: 'DelegationEnded',
        aggregateType: 'official',
        aggregateId: officialId,
        payload: {
          delegationId,
          officialId,
          fromUserId: official.user_id,
          toUserId: delegation.toUserId,
          scope: delegation.scope,
          officialTitle: official.title,
          delegateName: delegation.toUserName,
        },
      });
    });

    try {
      await routeNotificationEvent({
        id: `event-${Date.now()}`,
        orgId,
        eventType: 'DelegationEnded',
        aggregateType: 'official',
        aggregateId: officialId,
        payload: {
          delegationId,
          officialId,
          fromUserId: official.user_id,
          toUserId: delegation.toUserId,
          scope: delegation.scope,
          officialTitle: official.title,
          delegateName: delegation.toUserName,
        },
        occurredAt: new Date(),
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to route DelegationEnded event');
    }

    // Re-route review-stage appointments immediately
    await rerouteAppointmentsForOfficial(officialId);

    return delegationsRepo.findById(delegationId);
  }
}

export const delegationsService = new DelegationsService();
