import { db } from '../../core/db.js';
import { writeAuditEvent } from '../../core/audit/auditWriter.js';
import { writeOutboxEvent } from '../../core/outbox/outboxWriter.js';
import {
  ApiError,
  type CreateUserInput,
  type UpdateUserInput,
  type UserQueryInput,
  type RoleCode,
} from '@oams/shared';

export class UsersService {
  async listUsers(orgId: string, query: UserQueryInput) {
    let qb = db('users').where({ 'users.org_id': orgId }).whereNull('users.deleted_at');

    if (query.q) {
      const term = `%${query.q}%`;
      qb = qb.where((w) => {
        w.whereILike('users.full_name', term)
          .orWhereILike('users.email', term)
          .orWhereILike('users.designation', term);
      });
    }

    if (query.departmentId) {
      qb = qb.where('users.department_id', query.departmentId);
    }

    if (query.status) {
      qb = qb.where('users.status', query.status);
    }

    if (query.role) {
      qb = qb
        .join('user_roles', 'users.id', 'user_roles.user_id')
        .join('roles', 'user_roles.role_id', 'roles.id')
        .where('roles.code', query.role);
    }

    const rows = await qb
      .select('users.*')
      .distinctOn('users.id')
      .orderBy('users.id', 'asc')
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;

    // Attach roles for each user
    const userIds = items.map((u) => u.id);
    const userRolesRows = await db('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .whereIn('user_roles.user_id', userIds)
      .select('user_roles.user_id', 'roles.code');

    const roleMap: Record<string, string[]> = {};
    for (const ur of userRolesRows) {
      if (!roleMap[ur.userId]) roleMap[ur.userId] = [];
      roleMap[ur.userId].push(ur.code);
    }

    const data = items.map((u) => ({
      ...u,
      roles: roleMap[u.id] || [],
    }));

    return {
      items: data,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
    };
  }

  async getUser(orgId: string, id: string) {
    const user = await db('users').where({ id, org_id: orgId }).whereNull('deleted_at').first();

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const rolesRows = await db('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .where('user_roles.user_id', user.id)
      .select('roles.code');

    return {
      ...user,
      roles: rolesRows.map((r) => r.code),
    };
  }

  async createUser(
    orgId: string,
    input: CreateUserInput,
    actorId?: string,
    actorRole?: string,
    correlationId = 'sys',
  ) {
    return await db.transaction(async (trx) => {
      // Check if email already exists in org
      const existing = await trx('users')
        .where({ org_id: orgId, email: input.email.toLowerCase().trim() })
        .first();

      if (existing) {
        throw ApiError.badRequest('A user with this email already exists in the organization');
      }

      const [user] = await trx('users')
        .insert({
          org_id: orgId,
          email: input.email.toLowerCase().trim(),
          full_name: input.fullName,
          phone: input.phone || null,
          designation: input.designation || null,
          department_id: input.departmentId || null,
          timezone: input.timezone || 'Asia/Kolkata',
          auth_provider: 'LOCAL',
          status: 'ACTIVE',
        })
        .returning('*');

      // Assign initial roles
      const roles = await trx('roles').whereIn('code', input.roleCodes);
      if (roles.length > 0) {
        await trx('user_roles').insert(
          roles.map((r) => ({
            user_id: user.id,
            role_id: r.id,
          })),
        );
      }

      await writeAuditEvent(trx, {
        orgId,
        actorId,
        actorRole,
        action: 'user.create',
        entityType: 'user',
        entityId: user.id,
        changes: { email: [null, user.email], roles: [[], input.roleCodes] },
        correlationId,
      });

      return {
        ...user,
        roles: input.roleCodes,
      };
    });
  }

  async updateUser(
    orgId: string,
    id: string,
    input: UpdateUserInput,
    actorId?: string,
    actorRole?: string,
    correlationId = 'sys',
  ) {
    return await db.transaction(async (trx) => {
      const existing = await trx('users')
        .where({ id, org_id: orgId })
        .whereNull('deleted_at')
        .first();

      if (!existing) {
        throw ApiError.notFound('User not found');
      }

      const [updated] = await trx('users')
        .where({ id, org_id: orgId })
        .update({
          full_name: input.fullName ?? existing.fullName,
          phone: input.phone ?? existing.phone,
          designation: input.designation ?? existing.designation,
          department_id:
            input.departmentId !== undefined ? input.departmentId : existing.departmentId,
          timezone: input.timezone ?? existing.timezone,
          theme: input.theme ?? existing.theme,
          quiet_hours_start:
            input.quietHoursStart !== undefined ? input.quietHoursStart : existing.quietHoursStart,
          quiet_hours_end:
            input.quietHoursEnd !== undefined ? input.quietHoursEnd : existing.quietHoursEnd,
          digest_mode: input.digestMode ?? existing.digestMode,
          updated_at: trx.fn.now(),
        })
        .returning('*');

      await writeAuditEvent(trx, {
        orgId,
        actorId,
        actorRole,
        action: 'user.update',
        entityType: 'user',
        entityId: id,
        changes: input as Record<string, unknown>,
        correlationId,
      });

      return updated;
    });
  }

  async disableUser(
    orgId: string,
    id: string,
    actorId?: string,
    actorRole?: string,
    correlationId = 'sys',
  ) {
    return await db.transaction(async (trx) => {
      const existing = await trx('users').where({ id, org_id: orgId }).first();

      if (!existing) {
        throw ApiError.notFound('User not found');
      }

      // Bump version and set status to DISABLED, revoke all refresh tokens (§17.1)
      const [updated] = await trx('users')
        .where({ id, org_id: orgId })
        .increment('version', 1)
        .update({
          status: 'DISABLED',
          updated_at: trx.fn.now(),
        })
        .returning('*');

      await trx('refresh_tokens').where('user_id', id).update({ revoked_at: trx.fn.now() });

      await writeAuditEvent(trx, {
        orgId,
        actorId,
        actorRole,
        action: 'user.disable',
        entityType: 'user',
        entityId: id,
        changes: { status: [existing.status, 'DISABLED'] },
        correlationId,
      });

      return updated;
    });
  }

  async assignRoles(
    orgId: string,
    userId: string,
    roleCodes: RoleCode[],
    actorId?: string,
    actorRole?: string,
    correlationId = 'sys',
  ) {
    return await db.transaction(async (trx) => {
      const user = await trx('users').where({ id: userId, org_id: orgId }).first();
      if (!user) {
        throw ApiError.notFound('User not found');
      }

      // Find role ids
      const roles = await trx('roles').whereIn('code', roleCodes);

      // Remove existing roles
      await trx('user_roles').where('user_id', userId).delete();

      // Insert new roles
      if (roles.length > 0) {
        await trx('user_roles').insert(
          roles.map((r) => ({
            user_id: userId,
            role_id: r.id,
          })),
        );
      }

      // Increment version to force re-login/token refresh if roles changed
      await trx('users').where('id', userId).increment('version', 1);

      // Outbox domain event per §14.4 (RoleChanged)
      await writeOutboxEvent(trx, {
        orgId,
        eventType: 'RoleChanged',
        aggregateType: 'user',
        aggregateId: userId,
        payload: {
          userId,
          roleCodes,
        },
      });

      await writeAuditEvent(trx, {
        orgId,
        actorId,
        actorRole,
        action: 'user.assign_roles',
        entityType: 'user',
        entityId: userId,
        changes: { roles: roleCodes },
        correlationId,
      });

      return { userId, roles: roleCodes };
    });
  }

  async listRoles() {
    return db('roles').select('*').orderBy('code', 'asc');
  }

  async listDepartments(orgId: string) {
    return db('departments').where('org_id', orgId).select('*').orderBy('name', 'asc');
  }

  async createDepartment(orgId: string, name: string, headUserId?: string) {
    const [dept] = await db('departments')
      .insert({
        org_id: orgId,
        name,
        head_user_id: headUserId || null,
      })
      .returning('*');
    return dept;
  }
}

export const usersService = new UsersService();
