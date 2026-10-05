import { db } from '../../core/db.js';
import { tasksRepo } from './repo.js';
import { generateReferenceNumber } from '../../core/utils/referenceNumber.js';
import { writeAuditEvent } from '../../core/audit/auditWriter.js';
import { writeOutboxEvent } from '../../core/outbox/outboxWriter.js';
import { routeNotificationEvent } from '../../core/notifications/router.js';
import {
  ApiError,
  RoleCode,
  TaskStatus,
  Priority,
  type AuthUser,
  type CreateTaskInput,
  type UpdateTaskInput,
  type BlockTaskInput,
  type CancelTaskInput,
  type ReorderTaskInput,
  type BulkTaskActionInput,
  type CreateChecklistItemInput,
  type UpdateChecklistItemInput,
  type CreateTaskCommentInput,
  type CreateTaskReminderInput,
  type TaskExportQuery,
  type TaskDetailDto,
} from '@oams/shared';
import {
  mapTaskToExportRow,
  generateCsvExport,
  generateXlsxExport,
  generatePdfExport,
} from './exportEngine.js';
import { DateTime } from 'luxon';
import pkgRRule from 'rrule';
const { rrulestr } = pkgRRule;

export class TasksService {
  /**
   * Helper to verify if user has management permissions for this official's tasks
   */
  async checkOfficialTaskAccess(
    user: AuthUser,
    officialId: string,
  ): Promise<{ official: any; isOfficial: boolean; canManage: boolean }> {
    const isSuperAdmin = user.roles.includes(RoleCode.SUPER_ADMIN);

    const official = await db('officials')
      .where('id', officialId)
      .where('org_id', user.orgId)
      .first();

    if (!official) {
      throw ApiError.notFound('Official not found');
    }

    const isOfficial = official.user_id === user.id;

    if (isSuperAdmin || isOfficial) {
      return { official, isOfficial, canManage: true };
    }

    // Check PA/EA assignment with can_manage_tasks (§7.2, §12.1)
    const staff = await db('official_support_staff')
      .where('official_id', officialId)
      .where('user_id', user.id)
      .where('can_manage_tasks', true)
      .where((qb) => {
        qb.whereNull('active_to').orWhere('active_to', '>=', db.fn.now());
      })
      .first();

    if (staff) {
      return { official, isOfficial: false, canManage: true };
    }

    return { official, isOfficial: false, canManage: false };
  }

  /**
   * Helper to fetch assigned official IDs for a PA/EA
   */
  async getAssignedOfficialIds(userId: string): Promise<string[]> {
    const rows = await db('official_support_staff')
      .where('user_id', userId)
      .where('can_manage_tasks', true)
      .where((qb) => {
        qb.whereNull('active_to').orWhere('active_to', '>=', db.fn.now());
      })
      .select('official_id');

    return rows.map((r: any) => r.official_id);
  }

  /**
   * Create task (§12.1, §12.3)
   */
  async createTask(user: AuthUser, input: CreateTaskInput): Promise<TaskDetailDto> {
    const { official, isOfficial, canManage } = await this.checkOfficialTaskAccess(
      user,
      input.officialId,
    );

    if (!canManage) {
      throw ApiError.forbidden('You do not have permission to create tasks for this official');
    }

    const visibility = input.visibility || 'ORG';

    // §12.1 PERSONAL tasks can only be created by the official
    if (visibility === 'PERSONAL' && !isOfficial) {
      throw ApiError.forbidden('Only the official can create personal tasks');
    }

    // §12.4 PERSONAL tasks cannot be delegated
    if (visibility === 'PERSONAL' && input.assigneeUserId) {
      throw ApiError.badRequest('Personal tasks cannot be delegated to an assignee');
    }

    let createdId = '';

    await db.transaction(async (trx) => {
      // Generate reference number TSK-YYYY-XXXXXX (§4.2)
      const referenceNo = await generateReferenceNumber(trx, 'TSK');

      // Default position to bottom of list
      const maxPos = await trx('tasks')
        .where('official_id', input.officialId)
        .max('position as max_p')
        .first();
      const position = Number(maxPos?.max_p || 0) + 1000;

      const seriesId = input.recurrenceRule ? db.raw('gen_random_uuid()') : null;

      const [taskRow] = await trx('tasks')
        .insert({
          org_id: user.orgId,
          reference_no: referenceNo,
          official_id: input.officialId,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          category: input.category,
          priority: input.priority,
          status: TaskStatus.TODO,
          visibility,
          start_date: input.startDate ? new Date(input.startDate) : null,
          due_at: input.dueAt ? new Date(input.dueAt) : null,
          estimated_min: input.estimatedMin || null,
          owner_user_id: official.user_id,
          assignee_user_id: input.assigneeUserId || null,
          created_by: user.id,
          requires_verification: !!input.requiresVerification,
          source: input.source,
          source_id: input.sourceId || null,
          series_id: seriesId,
          recurrence_rule: input.recurrenceRule || null,
          position,
        })
        .returning('*');

      createdId = taskRow.id;

      // Add checklist items if provided
      if (input.checklist && input.checklist.length > 0) {
        const items = input.checklist.map((text, idx) => ({
          task_id: createdId,
          text: text.trim(),
          done: false,
          position: (idx + 1) * 10,
        }));
        await trx('task_checklist_items').insert(items);
      }

      // Add reminders if provided
      if (input.reminders && input.reminders.length > 0) {
        const rems = input.reminders.map((r) => ({
          task_id: createdId,
          remind_at: new Date(r),
          channel: 'IN_APP',
        }));
        await trx('task_reminders').insert(rems);
      }

      // Write audit log (§12.1: PERSONAL tasks record ID only, never title or description)
      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'task.create',
        entityType: 'task',
        entityId: createdId,
        changes:
          visibility === 'PERSONAL' ? null : { title: taskRow.title, category: taskRow.category },
        correlationId: createdId,
      });

      // Write outbox event for assignment (§14.4 T6)
      if (input.assigneeUserId && visibility !== 'PERSONAL') {
        const domainEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          orgId: user.orgId,
          eventType: 'TaskAssigned',
          aggregateType: 'task',
          aggregateId: createdId,
          payload: {
            taskId: createdId,
            referenceNo: taskRow.reference_no,
            title: taskRow.title,
            assigneeUserId: input.assigneeUserId,
            officialId: input.officialId,
            assignedByUserId: user.id,
            dueAt: taskRow.due_at,
          },
          occurredAt: new Date(),
        };

        await writeOutboxEvent(trx, domainEvent);
        trx.executionPromise.then(() => {
          routeNotificationEvent(domainEvent).catch(() => {});
        });
      }
    });

    const result = await tasksRepo.getWithDetails(createdId, user.orgId, user.id, user.roles);
    if (!result) {
      throw ApiError.internal('Failed to retrieve created task');
    }
    return result;
  }

  /**
   * Update task fields (§12.1, §12.4)
   */
  async updateTask(user: AuthUser, id: string, input: UpdateTaskInput): Promise<TaskDetailDto> {
    const existing = await tasksRepo.getById(id, user.orgId);
    if (!existing) {
      throw ApiError.notFound('Task not found');
    }

    const { isOfficial, canManage } = await this.checkOfficialTaskAccess(
      user,
      existing.official_id,
    );

    // Check §12.1 PERSONAL task visibility
    if (existing.visibility === 'PERSONAL' && !isOfficial) {
      throw ApiError.notFound('Task not found');
    }

    // Check assignee limitations (§12.4): Assignee cannot change title, priority, or due date
    const isAssignee = existing.assignee_user_id === user.id;
    if (isAssignee && !canManage && !isOfficial) {
      if (input.title !== undefined || input.priority !== undefined || input.dueAt !== undefined) {
        throw ApiError.forbidden(
          'Assignees cannot change the title, priority, or due date of a delegated task',
        );
      }
    } else if (!canManage && !isOfficial) {
      throw ApiError.forbidden('You do not have permission to edit this task');
    }

    // If changing to or maintaining PERSONAL, ensure not assigned
    const targetVisibility =
      input.visibility !== undefined ? input.visibility : existing.visibility;
    if (targetVisibility === 'PERSONAL') {
      if (!isOfficial) {
        throw ApiError.forbidden('Only the official can set task visibility to PERSONAL');
      }
      if (input.assigneeUserId || existing.assignee_user_id) {
        throw ApiError.badRequest('Personal tasks cannot be delegated');
      }
    }

    const updates: any = {
      updated_at: db.fn.now(),
      version: existing.version + 1,
    };

    if (input.title !== undefined) updates.title = input.title.trim();
    if (input.description !== undefined) updates.description = input.description?.trim() || null;
    if (input.category !== undefined) updates.category = input.category;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.visibility !== undefined) updates.visibility = input.visibility;
    if (input.startDate !== undefined)
      updates.start_date = input.startDate ? new Date(input.startDate) : null;
    if (input.dueAt !== undefined) updates.due_at = input.dueAt ? new Date(input.dueAt) : null;
    if (input.estimatedMin !== undefined) updates.estimated_min = input.estimatedMin || null;
    if (input.assigneeUserId !== undefined) updates.assignee_user_id = input.assigneeUserId || null;
    if (input.requiresVerification !== undefined)
      updates.requires_verification = !!input.requiresVerification;
    if (input.recurrenceRule !== undefined) updates.recurrence_rule = input.recurrenceRule || null;
    if (input.position !== undefined) updates.position = input.position;

    await db.transaction(async (trx) => {
      await trx('tasks').where('id', id).update(updates);

      // Audit log (§12.1: PERSONAL tasks record ID only)
      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'task.update',
        entityType: 'task',
        entityId: id,
        changes: targetVisibility === 'PERSONAL' ? null : updates,
        correlationId: id,
      });

      // Notification if assignee changed
      if (
        input.assigneeUserId &&
        input.assigneeUserId !== existing.assignee_user_id &&
        targetVisibility !== 'PERSONAL'
      ) {
        const domainEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          orgId: user.orgId,
          eventType: 'TaskAssigned',
          aggregateType: 'task',
          aggregateId: id,
          payload: {
            taskId: id,
            referenceNo: existing.reference_no,
            title: updates.title || existing.title,
            assigneeUserId: input.assigneeUserId,
            officialId: existing.official_id,
            assignedByUserId: user.id,
            dueAt: updates.due_at || existing.due_at,
          },
          occurredAt: new Date(),
        };

        await writeOutboxEvent(trx, domainEvent);
        trx.executionPromise.then(() => {
          routeNotificationEvent(domainEvent).catch(() => {});
        });
      }
    });

    const updated = await tasksRepo.getWithDetails(id, user.orgId, user.id, user.roles);
    if (!updated) {
      throw ApiError.internal('Failed to retrieve updated task');
    }
    return updated;
  }

  /**
   * Start task: TODO -> IN_PROGRESS (§12.2)
   */
  async startTask(user: AuthUser, id: string): Promise<TaskDetailDto> {
    const task = await tasksRepo.getById(id, user.orgId);
    if (!task) throw ApiError.notFound('Task not found');

    const { isOfficial, canManage } = await this.checkOfficialTaskAccess(user, task.official_id);
    const isAssignee = task.assignee_user_id === user.id;

    if (!canManage && !isOfficial && !isAssignee) {
      throw ApiError.forbidden('You do not have permission to start this task');
    }
    if (task.visibility === 'PERSONAL' && !isOfficial) {
      throw ApiError.notFound('Task not found');
    }

    if (task.status !== TaskStatus.TODO) {
      throw ApiError.stateConflict(`Task cannot be started from status ${task.status}`);
    }

    await db.transaction(async (trx) => {
      await trx('tasks')
        .where('id', id)
        .update({
          status: TaskStatus.IN_PROGRESS,
          updated_at: db.fn.now(),
          version: task.version + 1,
        });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'task.start',
        entityType: 'task',
        entityId: id,
        changes: task.visibility === 'PERSONAL' ? null : { status: TaskStatus.IN_PROGRESS },
        correlationId: id,
      });
    });

    return (await tasksRepo.getWithDetails(id, user.orgId, user.id, user.roles))!;
  }

  /**
   * Complete task: TODO | IN_PROGRESS | BLOCKED -> DONE (§12.2)
   */
  async completeTask(user: AuthUser, id: string): Promise<TaskDetailDto> {
    const task = await tasksRepo.getById(id, user.orgId);
    if (!task) throw ApiError.notFound('Task not found');

    const { isOfficial, canManage } = await this.checkOfficialTaskAccess(user, task.official_id);
    const isAssignee = task.assignee_user_id === user.id;

    if (!canManage && !isOfficial && !isAssignee) {
      throw ApiError.forbidden('You do not have permission to complete this task');
    }
    if (task.visibility === 'PERSONAL' && !isOfficial) {
      throw ApiError.notFound('Task not found');
    }

    if (task.status === TaskStatus.DONE || task.status === TaskStatus.CANCELLED) {
      throw ApiError.stateConflict(`Task is already ${task.status}`);
    }

    const isCompletedByOfficial = isOfficial;
    const completedAt = new Date();

    await db.transaction(async (trx) => {
      const updates: any = {
        status: TaskStatus.DONE,
        completed_at: completedAt,
        updated_at: db.fn.now(),
        version: task.version + 1,
      };

      // If completed directly by the official, auto-verify
      if (isCompletedByOfficial) {
        updates.verified_by = user.id;
        updates.verified_at = completedAt;
      }

      await trx('tasks').where('id', id).update(updates);

      // Track 8 (§16, §22): Completing the task closes the action item automatically (status -> DONE)
      await trx('action_items')
        .where('converted_task_id', id)
        .orWhere(function (this: any) {
          if (task.source === 'ACTION_ITEM' && task.source_id) {
            this.where('id', task.source_id);
          }
        })
        .update({
          status: 'DONE',
          updated_at: trx.fn.now(),
        });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'task.complete',
        entityType: 'task',
        entityId: id,
        changes: task.visibility === 'PERSONAL' ? null : { status: TaskStatus.DONE, completedAt },
        correlationId: id,
      });

      // If delegated task completed by non-official, notify official live (§12.4, §14.4 T6)
      if (!isCompletedByOfficial && task.visibility !== 'PERSONAL') {
        const domainEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          orgId: user.orgId,
          eventType: 'TaskCompleted',
          aggregateType: 'task',
          aggregateId: id,
          payload: {
            taskId: id,
            referenceNo: task.reference_no,
            title: task.title,
            officialId: task.official_id,
            ownerUserId: task.owner_user_id,
            completedByUserId: user.id,
            completedByName: user.fullName,
            requiresVerification: !!task.requires_verification,
          },
          occurredAt: new Date(),
        };

        await writeOutboxEvent(trx, domainEvent);
        trx.executionPromise.then(() => {
          routeNotificationEvent(domainEvent).catch(() => {});
        });

        // Also emit TaskVerificationNeeded if verification is required (§12.2, §14.4 T6)
        if (task.requires_verification) {
          const verifyEvent = {
            id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            orgId: user.orgId,
            eventType: 'TaskVerificationNeeded',
            aggregateType: 'task',
            aggregateId: id,
            payload: {
              taskId: id,
              referenceNo: task.reference_no,
              title: task.title,
              officialId: task.official_id,
              ownerUserId: task.owner_user_id,
              completedByUserId: user.id,
            },
            occurredAt: new Date(),
          };

          await writeOutboxEvent(trx, verifyEvent);
          trx.executionPromise.then(() => {
            routeNotificationEvent(verifyEvent).catch(() => {});
          });
        }
      }
    });

    return (await tasksRepo.getWithDetails(id, user.orgId, user.id, user.roles))!;
  }

  /**
   * Verify completed task: sets verified_by and verified_at (§12.2)
   */
  async verifyTask(user: AuthUser, id: string): Promise<TaskDetailDto> {
    const task = await tasksRepo.getById(id, user.orgId);
    if (!task) throw ApiError.notFound('Task not found');

    const { isOfficial } = await this.checkOfficialTaskAccess(user, task.official_id);

    // Only the official owner can verify (§12.2)
    if (!isOfficial) {
      throw ApiError.forbidden('Only the official can verify completed tasks');
    }

    if (task.status !== TaskStatus.DONE) {
      throw ApiError.stateConflict('Only DONE tasks can be verified');
    }

    await db.transaction(async (trx) => {
      await trx('tasks')
        .where('id', id)
        .update({
          verified_by: user.id,
          verified_at: db.fn.now(),
          updated_at: db.fn.now(),
          version: task.version + 1,
        });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'task.verify',
        entityType: 'task',
        entityId: id,
        changes:
          task.visibility === 'PERSONAL' ? null : { verifiedBy: user.id, verifiedAt: new Date() },
        correlationId: id,
      });
    });

    return (await tasksRepo.getWithDetails(id, user.orgId, user.id, user.roles))!;
  }

  /**
   * Block task: IN_PROGRESS -> BLOCKED (§12.2)
   */
  async blockTask(user: AuthUser, id: string, input: BlockTaskInput): Promise<TaskDetailDto> {
    const task = await tasksRepo.getById(id, user.orgId);
    if (!task) throw ApiError.notFound('Task not found');

    const { isOfficial, canManage } = await this.checkOfficialTaskAccess(user, task.official_id);
    const isAssignee = task.assignee_user_id === user.id;

    if (!canManage && !isOfficial && !isAssignee) {
      throw ApiError.forbidden('You do not have permission to block this task');
    }
    if (task.visibility === 'PERSONAL' && !isOfficial) {
      throw ApiError.notFound('Task not found');
    }

    if (task.status !== TaskStatus.IN_PROGRESS) {
      throw ApiError.stateConflict('Only IN_PROGRESS tasks can be marked as BLOCKED');
    }

    await db.transaction(async (trx) => {
      await trx('tasks')
        .where('id', id)
        .update({
          status: TaskStatus.BLOCKED,
          blocked_reason: input.reason.trim(),
          updated_at: db.fn.now(),
          version: task.version + 1,
        });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'task.block',
        entityType: 'task',
        entityId: id,
        changes:
          task.visibility === 'PERSONAL'
            ? null
            : { status: TaskStatus.BLOCKED, reason: input.reason },
        correlationId: id,
      });
    });

    return (await tasksRepo.getWithDetails(id, user.orgId, user.id, user.roles))!;
  }

  /**
   * Unblock task: BLOCKED -> IN_PROGRESS (§12.2)
   */
  async unblockTask(user: AuthUser, id: string): Promise<TaskDetailDto> {
    const task = await tasksRepo.getById(id, user.orgId);
    if (!task) throw ApiError.notFound('Task not found');

    const { isOfficial, canManage } = await this.checkOfficialTaskAccess(user, task.official_id);
    const isAssignee = task.assignee_user_id === user.id;

    if (!canManage && !isOfficial && !isAssignee) {
      throw ApiError.forbidden('You do not have permission to unblock this task');
    }
    if (task.visibility === 'PERSONAL' && !isOfficial) {
      throw ApiError.notFound('Task not found');
    }

    if (task.status !== TaskStatus.BLOCKED) {
      throw ApiError.stateConflict('Only BLOCKED tasks can be unblocked');
    }

    await db.transaction(async (trx) => {
      await trx('tasks')
        .where('id', id)
        .update({
          status: TaskStatus.IN_PROGRESS,
          blocked_reason: null,
          updated_at: db.fn.now(),
          version: task.version + 1,
        });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'task.unblock',
        entityType: 'task',
        entityId: id,
        changes: task.visibility === 'PERSONAL' ? null : { status: TaskStatus.IN_PROGRESS },
        correlationId: id,
      });
    });

    return (await tasksRepo.getWithDetails(id, user.orgId, user.id, user.roles))!;
  }

  /**
   * Cancel task: TODO / IN_PROGRESS / BLOCKED -> CANCELLED (§12.2)
   */
  async cancelTask(user: AuthUser, id: string, input: CancelTaskInput): Promise<TaskDetailDto> {
    const task = await tasksRepo.getById(id, user.orgId);
    if (!task) throw ApiError.notFound('Task not found');

    const { isOfficial, canManage } = await this.checkOfficialTaskAccess(user, task.official_id);

    if (!canManage && !isOfficial) {
      throw ApiError.forbidden('You do not have permission to cancel this task');
    }
    if (task.visibility === 'PERSONAL' && !isOfficial) {
      throw ApiError.notFound('Task not found');
    }

    if (task.status === TaskStatus.DONE || task.status === TaskStatus.CANCELLED) {
      throw ApiError.stateConflict(`Task is already in status ${task.status}`);
    }

    await db.transaction(async (trx) => {
      await trx('tasks')
        .where('id', id)
        .update({
          status: TaskStatus.CANCELLED,
          cancel_reason: input.reason.trim(),
          cancelled_at: db.fn.now(),
          updated_at: db.fn.now(),
          version: task.version + 1,
        });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'task.cancel',
        entityType: 'task',
        entityId: id,
        changes:
          task.visibility === 'PERSONAL'
            ? null
            : { status: TaskStatus.CANCELLED, reason: input.reason },
        correlationId: id,
      });
    });

    return (await tasksRepo.getWithDetails(id, user.orgId, user.id, user.roles))!;
  }

  /**
   * Reopen task: DONE / CANCELLED -> TODO (§12.2)
   */
  async reopenTask(user: AuthUser, id: string): Promise<TaskDetailDto> {
    const task = await tasksRepo.getById(id, user.orgId);
    if (!task) throw ApiError.notFound('Task not found');

    const { isOfficial, canManage } = await this.checkOfficialTaskAccess(user, task.official_id);

    if (!canManage && !isOfficial) {
      throw ApiError.forbidden('You do not have permission to reopen this task');
    }
    if (task.visibility === 'PERSONAL' && !isOfficial) {
      throw ApiError.notFound('Task not found');
    }

    if (task.status !== TaskStatus.DONE && task.status !== TaskStatus.CANCELLED) {
      throw ApiError.stateConflict('Only DONE or CANCELLED tasks can be reopened');
    }

    await db.transaction(async (trx) => {
      await trx('tasks')
        .where('id', id)
        .update({
          status: TaskStatus.TODO,
          completed_at: null,
          cancelled_at: null,
          verified_by: null,
          verified_at: null,
          blocked_reason: null,
          cancel_reason: null,
          updated_at: db.fn.now(),
          version: task.version + 1,
        });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'task.reopen',
        entityType: 'task',
        entityId: id,
        changes: task.visibility === 'PERSONAL' ? null : { status: TaskStatus.TODO },
        correlationId: id,
      });
    });

    return (await tasksRepo.getWithDetails(id, user.orgId, user.id, user.roles))!;
  }

  /**
   * Reorder tasks (§12.3)
   */
  async reorderTasks(user: AuthUser, input: ReorderTaskInput): Promise<void> {
    await db.transaction(async (trx) => {
      for (const item of input.items) {
        await trx('tasks').where('id', item.id).where('org_id', user.orgId).update({
          position: item.position,
          updated_at: db.fn.now(),
        });
      }
    });
  }

  /**
   * Bulk actions on multiple tasks (§12.3)
   */
  async bulkAction(user: AuthUser, input: BulkTaskActionInput): Promise<{ count: number }> {
    let affected = 0;

    for (const taskId of input.taskIds) {
      try {
        switch (input.action) {
          case 'COMPLETE':
            await this.completeTask(user, taskId);
            affected++;
            break;
          case 'CHANGE_PRIORITY':
            if (input.priority) {
              await this.updateTask(user, taskId, { priority: input.priority });
              affected++;
            }
            break;
          case 'CHANGE_DUE_DATE':
            await this.updateTask(user, taskId, { dueAt: input.dueAt });
            affected++;
            break;
          case 'ASSIGN':
            await this.updateTask(user, taskId, { assigneeUserId: input.assigneeUserId });
            affected++;
            break;
          case 'CANCEL':
            await this.cancelTask(user, taskId, { reason: input.reason || 'Bulk cancelled' });
            affected++;
            break;
        }
      } catch {
        // Continue processing others in bulk operation
      }
    }

    return { count: affected };
  }

  /**
   * Checklist operations (§12.3)
   */
  async addChecklistItem(user: AuthUser, taskId: string, input: CreateChecklistItemInput) {
    const task = await tasksRepo.getById(taskId, user.orgId);
    if (!task) throw ApiError.notFound('Task not found');

    const maxPos = await db('task_checklist_items')
      .where('task_id', taskId)
      .max('position as max_p')
      .first();
    const position = (maxPos?.max_p || 0) + 10;

    const [item] = await db('task_checklist_items')
      .insert({
        task_id: taskId,
        text: input.text.trim(),
        done: false,
        position,
      })
      .returning('*');

    return item;
  }

  async updateChecklistItem(
    user: AuthUser,
    taskId: string,
    itemId: string,
    input: UpdateChecklistItemInput,
  ) {
    const task = await tasksRepo.getById(taskId, user.orgId);
    if (!task) throw ApiError.notFound('Task not found');

    const updates: any = { updated_at: db.fn.now() };
    if (input.text !== undefined) updates.text = input.text.trim();
    if (input.done !== undefined) updates.done = input.done;
    if (input.position !== undefined) updates.position = input.position;

    const [updated] = await db('task_checklist_items')
      .where('id', itemId)
      .where('task_id', taskId)
      .update(updates)
      .returning('*');

    return updated;
  }

  async deleteChecklistItem(user: AuthUser, taskId: string, itemId: string) {
    const task = await tasksRepo.getById(taskId, user.orgId);
    if (!task) throw ApiError.notFound('Task not found');

    await db('task_checklist_items').where('id', itemId).where('task_id', taskId).delete();
  }

  /**
   * Comments operations (§12.3)
   */
  async addComment(user: AuthUser, taskId: string, input: CreateTaskCommentInput) {
    const task = await tasksRepo.getById(taskId, user.orgId);
    if (!task) throw ApiError.notFound('Task not found');

    let createdComment: any = null;

    await db.transaction(async (trx) => {
      const [comment] = await trx('task_comments')
        .insert({
          task_id: taskId,
          author_id: user.id,
          body: input.body.trim(),
        })
        .returning('*');

      createdComment = comment;

      // Notify watchers, assignee and owner (§14.4 T6)
      if (task.visibility !== 'PERSONAL') {
        const domainEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          orgId: user.orgId,
          eventType: 'TaskCommented',
          aggregateType: 'task',
          aggregateId: taskId,
          payload: {
            taskId,
            referenceNo: task.reference_no,
            title: task.title,
            authorId: user.id,
            authorName: user.fullName,
            ownerUserId: task.owner_user_id,
            assigneeUserId: task.assignee_user_id,
          },
          occurredAt: new Date(),
        };

        await writeOutboxEvent(trx, domainEvent);
        trx.executionPromise.then(() => {
          routeNotificationEvent(domainEvent).catch(() => {});
        });
      }
    });

    return createdComment;
  }

  /**
   * Reminders operations (§12.3)
   */
  async addReminder(user: AuthUser, taskId: string, input: CreateTaskReminderInput) {
    const task = await tasksRepo.getById(taskId, user.orgId);
    if (!task) throw ApiError.notFound('Task not found');

    const [reminder] = await db('task_reminders')
      .insert({
        task_id: taskId,
        remind_at: new Date(input.remindAt),
        channel: input.channel,
      })
      .returning('*');

    return reminder;
  }

  async deleteReminder(user: AuthUser, taskId: string, reminderId: string) {
    const task = await tasksRepo.getById(taskId, user.orgId);
    if (!task) throw ApiError.notFound('Task not found');

    await db('task_reminders').where('id', reminderId).where('task_id', taskId).delete();
  }

  /**
   * Exports engine (§12.7)
   */
  async exportTasks(user: AuthUser, query: TaskExportQuery) {
    const isOfficialUser = user.roles.includes(RoleCode.OFFICIAL);
    const assignedIds = await this.getAssignedOfficialIds(user.id);

    // Fetch tasks using scoped list
    const { tasks } = await tasksRepo.list({
      orgId: user.orgId,
      currentUserId: user.id,
      userRoles: user.roles,
      isOfficial: isOfficialUser,
      assignedOfficialIds: assignedIds,
      officialId: query.officialId,
      status: query.status,
      priority: query.priority,
      category: query.category,
      scope: query.scope,
      fromDate: query.fromDate,
      toDate: query.toDate,
      page: 1,
      limit: 2000,
    });

    // Filter by selectedIds if provided
    let finalTasks = tasks;
    if (query.selectedIds) {
      const ids = query.selectedIds.split(',').map((id) => id.trim());
      finalTasks = tasks.filter((t) => ids.includes(t.id));
    }

    const officialTitle = finalTasks[0]?.officialName || 'Official';
    const dateStr = DateTime.now().toFormat('yyyy-MM-dd');
    const ext = query.format.toLowerCase();
    const filename = `OAMS_Todo_${officialTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}_${dateStr}.${ext}`;

    const rows = finalTasks.map(mapTaskToExportRow);

    let buffer: Buffer;
    let mimeType: string;

    if (query.format === 'CSV') {
      buffer = await generateCsvExport(rows);
      mimeType = 'text/csv';
    } else if (query.format === 'XLSX') {
      buffer = await generateXlsxExport(rows, officialTitle);
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      buffer = await generatePdfExport(rows, officialTitle);
      mimeType = 'application/pdf';
    }

    // Write audit event (§12.7: format, filter, row count, file reference)
    await writeAuditEvent(db, {
      orgId: user.orgId,
      actorId: user.id,
      actorRole: user.roles[0],
      action: 'task.export',
      entityType: 'task_export',
      entityId: user.id,
      changes: {
        format: query.format,
        rowCount: finalTasks.length,
        filename,
      },
      correlationId: `export-${Date.now()}`,
    });

    return {
      filename,
      mimeType,
      buffer,
    };
  }

  /**
   * Recurring task generation job helper (§12.6)
   */
  async generateRecurringOccurrences(orgId?: string, horizonDays = 14): Promise<number> {
    const q = db('tasks')
      .whereNotNull('recurrence_rule')
      .whereNotNull('series_id')
      .where('source', 'MANUAL');

    if (orgId) {
      q.where('org_id', orgId);
    }

    const seriesTemplates = await q;
    let generatedCount = 0;

    const now = DateTime.now();
    const horizonEnd = now.plus({ days: horizonDays }).endOf('day');

    for (const template of seriesTemplates) {
      try {
        const rule = rrulestr(template.recurrence_rule);
        const dates = rule.between(now.toJSDate(), horizonEnd.toJSDate(), true);

        for (const date of dates) {
          const dueAt = date.toISOString();

          // Check if an occurrence already exists for this series and due date
          const exists = await db('tasks')
            .where('series_id', template.series_id)
            .where('due_at', dueAt)
            .first();

          if (!exists) {
            const referenceNo = await generateReferenceNumber(db, 'TSK');
            await db('tasks').insert({
              org_id: template.org_id,
              reference_no: referenceNo,
              official_id: template.official_id,
              title: template.title,
              description: template.description,
              category: template.category,
              priority: template.priority,
              status: TaskStatus.TODO,
              visibility: template.visibility,
              due_at: dueAt,
              estimated_min: template.estimated_min,
              owner_user_id: template.owner_user_id,
              assignee_user_id: template.assignee_user_id,
              created_by: template.created_by,
              requires_verification: template.requires_verification,
              source: template.source,
              series_id: template.series_id,
              recurrence_rule: template.recurrence_rule,
              position: template.position,
            });
            generatedCount++;
          }
        }
      } catch {
        // Skip invalid rule string
      }
    }

    return generatedCount;
  }
}

export const tasksService = new TasksService();
