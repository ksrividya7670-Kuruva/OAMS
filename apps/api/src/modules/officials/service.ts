import { db } from '../../core/db.js';
import { writeAuditEvent } from '../../core/audit/auditWriter.js';
import { writeOutboxEvent } from '../../core/outbox/outboxWriter.js';
import {
  ApiError,
  CalendarType,
  type CreateOfficialInput,
  type UpdateOfficialInput,
  type AssignSupportStaffInput,
} from '@oams/shared';

export class OfficialsService {
  async listOfficials(orgId: string, onlyActive = true) {
    let qb = db('officials')
      .where({ 'officials.org_id': orgId })
      .whereNull('officials.deleted_at')
      .join('users', 'officials.user_id', 'users.id')
      .leftJoin('departments', 'officials.department_id', 'departments.id');

    if (onlyActive) {
      qb = qb.where('officials.is_active', true);
    }

    const rows = await qb.select(
      'officials.*',
      'users.full_name as user_full_name',
      'users.email as user_email',
      'departments.name as department_name',
    );

    return rows;
  }

  async getOfficial(orgId: string, id: string) {
    const official = await db('officials')
      .where({ 'officials.id': id, 'officials.org_id': orgId })
      .whereNull('officials.deleted_at')
      .join('users', 'officials.user_id', 'users.id')
      .leftJoin('departments', 'officials.department_id', 'departments.id')
      .select(
        'officials.*',
        'users.full_name as user_full_name',
        'users.email as user_email',
        'departments.name as department_name',
      )
      .first();

    if (!official) {
      throw ApiError.notFound('Official not found');
    }

    // Attach support staff
    const supportStaff = await this.listSupportStaff(official.id);

    // Attach calendars
    const calendars = await db('calendars').where('official_id', official.id);

    return {
      ...official,
      supportStaff,
      calendars,
    };
  }

  async createOfficial(
    orgId: string,
    input: CreateOfficialInput,
    actorId?: string,
    actorRole?: string,
    correlationId = 'sys',
  ) {
    return await db.transaction(async (trx) => {
      // Ensure user exists and isn't already an official
      const user = await trx('users').where({ id: input.userId, org_id: orgId }).first();
      if (!user) {
        throw ApiError.notFound('User not found');
      }

      const existing = await trx('officials')
        .where({ user_id: input.userId, org_id: orgId })
        .whereNull('deleted_at')
        .first();

      if (existing) {
        throw ApiError.badRequest('This user is already an official');
      }

      const [official] = await trx('officials')
        .insert({
          org_id: orgId,
          user_id: input.userId,
          title: input.title,
          department_id: input.departmentId || null,
          is_vip: input.isVip,
          timezone: input.timezone || user.timezone || 'Asia/Kolkata',
          default_duration_min: input.defaultDurationMin,
          buffer_before_min: input.bufferBeforeMin,
          buffer_after_min: input.bufferAfterMin,
          min_notice_min: input.minNoticeMin,
          max_advance_days: input.maxAdvanceDays,
          slot_granularity_min: input.slotGranularityMin,
          booking_mode: input.bookingMode,
          approval_mode: input.approvalMode,
          default_visibility: input.defaultVisibility,
          is_active: true,
        })
        .returning('*');

      // Auto-create ORG + PERSONAL calendars per §8.1
      await trx('calendars').insert([
        {
          official_id: official.id,
          type: CalendarType.ORG,
          color: '#2563eb', // Brand blue
        },
        {
          official_id: official.id,
          type: CalendarType.PERSONAL,
          color: '#7c3aed', // Purple
        },
      ]);

      // Create default capacity policy
      await trx('capacity_policies').insert({
        official_id: official.id,
        max_meetings_per_day: 8,
        max_meeting_minutes_per_day: 360,
        max_external_per_day: 4,
        max_consecutive: 3,
        min_break_after_consecutive_min: 15,
        on_exceed: 'WARN',
      });

      await writeAuditEvent(trx, {
        orgId,
        actorId,
        actorRole,
        action: 'official.create',
        entityType: 'official',
        entityId: official.id,
        changes: { title: [null, official.title], userId: [null, official.userId] },
        correlationId,
      });

      return official;
    });
  }

  async updateOfficial(
    orgId: string,
    id: string,
    input: UpdateOfficialInput,
    actorId?: string,
    actorRole?: string,
    correlationId = 'sys',
  ) {
    return await db.transaction(async (trx) => {
      const existing = await trx('officials')
        .where({ id, org_id: orgId })
        .whereNull('deleted_at')
        .first();

      if (!existing) {
        throw ApiError.notFound('Official not found');
      }

      const [updated] = await trx('officials')
        .where({ id, org_id: orgId })
        .update({
          title: input.title ?? existing.title,
          department_id:
            input.departmentId !== undefined ? input.departmentId : existing.departmentId,
          is_vip: input.isVip ?? existing.isVip,
          timezone: input.timezone ?? existing.timezone,
          default_duration_min: input.defaultDurationMin ?? existing.defaultDurationMin,
          buffer_before_min: input.bufferBeforeMin ?? existing.bufferBeforeMin,
          buffer_after_min: input.bufferAfterMin ?? existing.bufferAfterMin,
          min_notice_min: input.minNoticeMin ?? existing.minNoticeMin,
          max_advance_days: input.maxAdvanceDays ?? existing.maxAdvanceDays,
          slot_granularity_min: input.slotGranularityMin ?? existing.slotGranularityMin,
          booking_mode: input.bookingMode ?? existing.bookingMode,
          approval_mode: input.approvalMode ?? existing.approvalMode,
          default_visibility: input.defaultVisibility ?? existing.defaultVisibility,
          updated_at: trx.fn.now(),
        })
        .returning('*');

      await writeAuditEvent(trx, {
        orgId,
        actorId,
        actorRole,
        action: 'official.update',
        entityType: 'official',
        entityId: id,
        changes: input as Record<string, unknown>,
        correlationId,
      });

      return updated;
    });
  }

  async listSupportStaff(officialId: string) {
    return db('official_support_staff')
      .where({ 'official_support_staff.official_id': officialId })
      .join('users', 'official_support_staff.user_id', 'users.id')
      .select(
        'official_support_staff.*',
        'users.full_name as user_full_name',
        'users.email as user_email',
        'users.phone as user_phone',
      )
      .orderBy('routing_order', 'asc');
  }

  async assignSupportStaff(
    orgId: string,
    officialId: string,
    input: AssignSupportStaffInput,
    actorId?: string,
    actorRole?: string,
    correlationId = 'sys',
  ) {
    return await db.transaction(async (trx) => {
      const official = await trx('officials').where({ id: officialId, org_id: orgId }).first();

      if (!official) {
        throw ApiError.notFound('Official not found');
      }

      const user = await trx('users').where({ id: input.userId, org_id: orgId }).first();

      if (!user) {
        throw ApiError.notFound('User not found');
      }

      // Check if assignment exists
      const existing = await trx('official_support_staff')
        .where({ official_id: officialId, user_id: input.userId })
        .first();

      let staffRecord: any;

      if (existing) {
        [staffRecord] = await trx('official_support_staff')
          .where('id', existing.id)
          .update({
            support_role: input.supportRole,
            rank: input.rank,
            routing_order: input.routingOrder,
            can_approve: input.canApprove,
            can_view_confidential: input.canViewConfidential,
            can_view_personal: input.canViewPersonal,
            can_edit_personal: input.canEditPersonal,
            can_manage_tasks: input.canManageTasks,
            active_from: input.activeFrom || trx.fn.now(),
            active_to: input.activeTo || null,
            updated_at: trx.fn.now(),
          })
          .returning('*');
      } else {
        [staffRecord] = await trx('official_support_staff')
          .insert({
            official_id: officialId,
            user_id: input.userId,
            support_role: input.supportRole,
            rank: input.rank,
            routing_order: input.routingOrder,
            can_approve: input.canApprove,
            can_view_confidential: input.canViewConfidential,
            can_view_personal: input.canViewPersonal,
            can_edit_personal: input.canEditPersonal,
            can_manage_tasks: input.canManageTasks,
            active_from: input.activeFrom || trx.fn.now(),
            active_to: input.activeTo || null,
          })
          .returning('*');
      }

      // Outbox domain event per §14.4 (SupportStaffAssigned)
      await writeOutboxEvent(trx, {
        orgId,
        eventType: 'SupportStaffAssigned',
        aggregateType: 'official',
        aggregateId: officialId,
        payload: {
          officialId,
          userId: input.userId,
          supportRole: input.supportRole,
          title: official.title,
          officialUserId: official.user_id,
        },
      });

      // Emit PersonalAccessGranted / PersonalAccessRevoked when personal access flags change (§14.4 T2)
      const grantedPermissions: string[] = [];
      const revokedPermissions: string[] = [];

      const permKeys = [
        { key: 'can_view_personal', name: 'VIEW_PERSONAL' },
        { key: 'can_edit_personal', name: 'EDIT_PERSONAL' },
        { key: 'can_manage_tasks', name: 'MANAGE_TASKS' },
      ] as const;

      for (const { key, name } of permKeys) {
        const oldVal = existing ? Boolean(existing[key]) : false;
        const newVal = Boolean(staffRecord[key]);
        if (!oldVal && newVal) {
          grantedPermissions.push(name);
        } else if (oldVal && !newVal) {
          revokedPermissions.push(name);
        }
      }

      if (grantedPermissions.length > 0) {
        await writeOutboxEvent(trx, {
          orgId,
          eventType: 'PersonalAccessGranted',
          aggregateType: 'official',
          aggregateId: officialId,
          payload: {
            officialId,
            officialUserId: official.user_id,
            staffUserId: input.userId,
            permissions: grantedPermissions,
            officialTitle: official.title,
          },
        });
      }

      if (revokedPermissions.length > 0) {
        await writeOutboxEvent(trx, {
          orgId,
          eventType: 'PersonalAccessRevoked',
          aggregateType: 'official',
          aggregateId: officialId,
          payload: {
            officialId,
            officialUserId: official.user_id,
            staffUserId: input.userId,
            permissions: revokedPermissions,
            officialTitle: official.title,
          },
        });
      }

      await writeAuditEvent(trx, {
        orgId,
        actorId,
        actorRole,
        action: 'official.assign_support_staff',
        entityType: 'official_support_staff',
        entityId: staffRecord.id,
        changes: { officialId, userId: input.userId, role: input.supportRole },
        correlationId,
      });

      return staffRecord;
    });
  }

  async removeSupportStaff(
    orgId: string,
    officialId: string,
    staffId: string,
    actorId?: string,
    actorRole?: string,
    correlationId = 'sys',
  ) {
    return await db.transaction(async (trx) => {
      const record = await trx('official_support_staff')
        .where({ id: staffId, official_id: officialId })
        .first();

      if (!record) {
        throw ApiError.notFound('Support staff assignment not found');
      }

      const official = await trx('officials').where('id', officialId).first();

      await trx('official_support_staff').where('id', staffId).delete();

      // Outbox domain event per §14.4 (SupportStaffRemoved)
      await writeOutboxEvent(trx, {
        orgId,
        eventType: 'SupportStaffRemoved',
        aggregateType: 'official',
        aggregateId: officialId,
        payload: {
          officialId,
          userId: record.userId,
          title: official?.title || 'Official',
        },
      });

      await writeAuditEvent(trx, {
        orgId,
        actorId,
        actorRole,
        action: 'official.remove_support_staff',
        entityType: 'official_support_staff',
        entityId: staffId,
        correlationId,
      });

      return { success: true };
    });
  }
}

export const officialsService = new OfficialsService();
