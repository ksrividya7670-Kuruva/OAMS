import { db } from '../../core/db.js';
import { meetingsRepo } from './repo.js';
import { appointmentsRepo } from '../appointments/repo.js';
import { tasksService } from '../tasks/service.js';
import { writeAuditEvent } from '../../core/audit/auditWriter.js';
import { writeOutboxEvent } from '../../core/outbox/outboxWriter.js';
import { routeNotificationEvent } from '../../core/notifications/router.js';
import { validateTransition } from '../appointments/state-machine.js';
import {
  ApiError,
  AppointmentStatus,
  ActionItemStatus,
  RoleCode,
  Permission,
  type AuthUser,
  type CompleteMeetingWithNotesInput,
  type CreateMeetingNoteInput,
  type UpdateMeetingNoteInput,
  type CreateActionItemInput,
  type UpdateActionItemInput,
  type ConvertActionItemToTaskInput,
  type MeetingNoteDto,
  type ActionItemDto,
  type TaskDetailDto,
} from '@oams/shared';

export class MeetingsService {
  /**
   * Helper to verify if the user has permission to manage/access meetings for this appointment (§16)
   */
  async checkMeetingAccess(
    user: AuthUser,
    appointment: any,
  ): Promise<{ canManage: boolean; isOfficial: boolean; isStaff: boolean }> {
    const isSuperAdmin = user.roles.includes(RoleCode.SUPER_ADMIN);
    const isAdmin = user.roles.includes(RoleCode.APPOINTMENT_ADMIN);

    if (isSuperAdmin || isAdmin) {
      return { canManage: true, isOfficial: false, isStaff: true };
    }

    // Check if user is the primary official
    const official = await db('officials')
      .where('id', appointment.primary_official_id)
      .where('org_id', user.orgId)
      .first();

    const isOfficial = official ? official.user_id === user.id : false;
    if (isOfficial) {
      return { canManage: true, isOfficial: true, isStaff: false };
    }

    // Check if user is assigned support staff (PA/EA/COS) for this official
    const assignment = await db('support_staff_assignments')
      .where('official_id', appointment.primary_official_id)
      .where('staff_user_id', user.id)
      .where('org_id', user.orgId)
      .first();

    const isStaff = !!assignment || appointment.assigned_to_user_id === user.id;
    const isAssigned = user.assignedOfficialIds?.includes(appointment.primary_official_id);
    const canManage = isOfficial || isStaff || isAssigned;

    return { canManage, isOfficial, isStaff };
  }

  /**
   * Complete meeting with notes and action items (§16, §22 Track 8)
   */
  async completeMeetingWithNotes(
    user: AuthUser,
    appointmentId: string,
    input: CompleteMeetingWithNotesInput,
  ): Promise<{
    appointment: any;
    note: MeetingNoteDto;
    actionItems: ActionItemDto[];
    followUpRequested: boolean;
  }> {
    const appointment = await appointmentsRepo.getById(appointmentId, user.orgId);
    if (!appointment) {
      throw ApiError.notFound('Appointment not found');
    }

    const { canManage } = await this.checkMeetingAccess(user, appointment);
    if (!canManage) {
      throw ApiError.forbidden('You do not have permission to conclude this meeting');
    }

    // Validate state machine transition from current status using 'complete'
    const { nextStatus } = validateTransition(appointment.status, 'complete');

    let createdNote: MeetingNoteDto = null!;
    const createdActionItems: ActionItemDto[] = [];
    const now = new Date();

    let domainEvent: any = null;

    await db.transaction(async (trx) => {
      // 1. Update appointment status to COMPLETED
      await trx('appointments')
        .where('id', appointment.id)
        .update({
          status: nextStatus,
          completed_at: now,
          status_changed_at: now,
          updated_at: trx.fn.now(),
          updated_by: user.id,
          version: appointment.version + 1,
        });

      // 2. Record status history
      await trx('appointment_status_history').insert({
        appointment_id: appointment.id,
        from_status: appointment.status,
        to_status: nextStatus,
        action: 'complete',
        actor_id: user.id,
        note: input.decisions || 'Meeting completed with notes',
        at: now,
      });

      // 3. Create meeting notes
      createdNote = await meetingsRepo.createNote(trx, {
        orgId: user.orgId,
        appointmentId: appointment.id,
        body: input.notes || 'Meeting completed without detailed notes.',
        decisions: input.decisions || null,
        visibility: appointment.visibility || 'INTERNAL',
        authorId: user.id,
      });

      // 4. Create action items if any
      if (input.actionItems && input.actionItems.length > 0) {
        for (const item of input.actionItems) {
          const actionItem = await meetingsRepo.createActionItem(trx, {
            orgId: user.orgId,
            appointmentId: appointment.id,
            noteId: createdNote.id,
            title: item.title,
            ownerUserId: item.ownerUserId || null,
            dueDate: item.dueDate || null,
            status: ActionItemStatus.OPEN,
          });
          createdActionItems.push(actionItem);
        }
      }

      // 5. Write audit event
      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'appointment.complete',
        entityType: 'appointment',
        entityId: appointment.id,
        changes: {
          fromStatus: appointment.status,
          toStatus: nextStatus,
          noteId: createdNote.id,
          actionItemsCount: createdActionItems.length,
        },
        correlationId: appointment.id,
      });

      // 6. Write outbox event
      domainEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        orgId: user.orgId,
        eventType: 'MeetingCompleted',
        aggregateType: 'appointment',
        aggregateId: appointment.id,
        payload: {
          appointmentId: appointment.id,
          referenceNo: appointment.reference_no,
          primaryOfficialId: appointment.primary_official_id,
          completedByUserId: user.id,
          completedAt: now,
          hasActionItems: createdActionItems.length > 0,
          actionItemCount: createdActionItems.length,
        },
        occurredAt: now,
      };

      await writeOutboxEvent(trx, domainEvent);
    });

    if (domainEvent) {
      routeNotificationEvent(domainEvent).catch(() => {});
    }

    const updatedApt = await appointmentsRepo.getById(appointmentId, user.orgId);

    return {
      appointment: updatedApt,
      note: createdNote,
      actionItems: createdActionItems,
      followUpRequested: !!input.scheduleFollowUp,
    };
  }

  /**
   * Get notes for an appointment
   */
  async getNotes(user: AuthUser, appointmentId: string): Promise<MeetingNoteDto[]> {
    const appointment = await appointmentsRepo.getById(appointmentId, user.orgId);
    if (!appointment) {
      throw ApiError.notFound('Appointment not found');
    }

    const { canManage } = await this.checkMeetingAccess(user, appointment);
    if (!canManage) {
      throw ApiError.forbidden('You do not have permission to view internal meeting notes');
    }

    return meetingsRepo.getNotesByAppointmentId(appointmentId, user.orgId);
  }

  /**
   * Add a new note to an appointment
   */
  async createNote(
    user: AuthUser,
    appointmentId: string,
    input: CreateMeetingNoteInput,
  ): Promise<MeetingNoteDto> {
    const appointment = await appointmentsRepo.getById(appointmentId, user.orgId);
    if (!appointment) {
      throw ApiError.notFound('Appointment not found');
    }

    const { canManage } = await this.checkMeetingAccess(user, appointment);
    if (!canManage) {
      throw ApiError.forbidden('You do not have permission to add meeting notes');
    }

    let note: MeetingNoteDto = null!;
    await db.transaction(async (trx) => {
      note = await meetingsRepo.createNote(trx, {
        orgId: user.orgId,
        appointmentId,
        body: input.body,
        decisions: input.decisions || null,
        visibility: appointment.visibility || 'INTERNAL',
        authorId: user.id,
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'meeting_note.create',
        entityType: 'meeting_note',
        entityId: note.id,
        changes: { appointmentId, bodyLength: input.body.length },
        correlationId: appointmentId,
      });
    });

    return note;
  }

  /**
   * Update an existing note
   */
  async updateNote(
    user: AuthUser,
    noteId: string,
    input: UpdateMeetingNoteInput,
  ): Promise<MeetingNoteDto> {
    const existing = await meetingsRepo.getNoteById(noteId, user.orgId);
    if (!existing) {
      throw ApiError.notFound('Meeting note not found');
    }

    const isAuthor = existing.authorId === user.id;
    const isSuperAdmin = user.roles.includes(RoleCode.SUPER_ADMIN);

    if (!isAuthor && !isSuperAdmin) {
      throw ApiError.forbidden('Only the author or administrator can edit this note');
    }

    let updated: MeetingNoteDto = null!;
    await db.transaction(async (trx) => {
      updated = await meetingsRepo.updateNote(trx, noteId, user.orgId, input);

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'meeting_note.update',
        entityType: 'meeting_note',
        entityId: noteId,
        changes: input,
        correlationId: existing.appointmentId,
      });
    });

    return updated;
  }

  /**
   * Get action items for an appointment
   */
  async getActionItems(user: AuthUser, appointmentId: string): Promise<ActionItemDto[]> {
    const appointment = await appointmentsRepo.getById(appointmentId, user.orgId);
    if (!appointment) {
      throw ApiError.notFound('Appointment not found');
    }

    return meetingsRepo.getActionItemsByAppointmentId(appointmentId, user.orgId);
  }

  /**
   * Create an action item
   */
  async createActionItem(
    user: AuthUser,
    appointmentId: string,
    input: CreateActionItemInput,
  ): Promise<ActionItemDto> {
    const appointment = await appointmentsRepo.getById(appointmentId, user.orgId);
    if (!appointment) {
      throw ApiError.notFound('Appointment not found');
    }

    const { canManage } = await this.checkMeetingAccess(user, appointment);
    if (!canManage) {
      throw ApiError.forbidden('You do not have permission to add action items');
    }

    let actionItem: ActionItemDto = null!;
    await db.transaction(async (trx) => {
      actionItem = await meetingsRepo.createActionItem(trx, {
        orgId: user.orgId,
        appointmentId,
        title: input.title,
        ownerUserId: input.ownerUserId || null,
        dueDate: input.dueDate || null,
        status: ActionItemStatus.OPEN,
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'action_item.create',
        entityType: 'action_item',
        entityId: actionItem.id,
        changes: { title: actionItem.title, ownerUserId: actionItem.ownerUserId },
        correlationId: appointmentId,
      });
    });

    return actionItem;
  }

  /**
   * Update an action item
   */
  async updateActionItem(
    user: AuthUser,
    actionItemId: string,
    input: UpdateActionItemInput,
  ): Promise<ActionItemDto> {
    const existing = await meetingsRepo.getActionItemById(actionItemId, user.orgId);
    if (!existing) {
      throw ApiError.notFound('Action item not found');
    }

    let updated: ActionItemDto = null!;
    await db.transaction(async (trx) => {
      updated = await meetingsRepo.updateActionItem(trx, actionItemId, user.orgId, input);

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'action_item.update',
        entityType: 'action_item',
        entityId: actionItemId,
        changes: input,
        correlationId: existing.appointmentId,
      });
    });

    return updated;
  }

  /**
   * Convert action item to task (§16, §22 Track 8)
   * Links both ways:
   * - task.source = 'ACTION_ITEM'
   * - task.source_id = action_item.id
   * - action_item.converted_task_id = task.id
   */
  async convertActionItemToTask(
    user: AuthUser,
    actionItemId: string,
    input: ConvertActionItemToTaskInput = {},
  ): Promise<{ actionItem: ActionItemDto; task: TaskDetailDto }> {
    const actionItem = await meetingsRepo.getActionItemById(actionItemId, user.orgId);
    if (!actionItem) {
      throw ApiError.notFound('Action item not found');
    }

    if (actionItem.convertedTaskId) {
      throw ApiError.stateConflict(
        `Action item is already converted to task ${actionItem.convertedTaskRef || actionItem.convertedTaskId}`,
      );
    }

    const appointment = await appointmentsRepo.getById(actionItem.appointmentId, user.orgId);
    if (!appointment) {
      throw ApiError.notFound('Associated appointment not found');
    }

    const targetOfficialId = input.officialId || appointment.primary_official_id;

    // Create the task linked to this action item
    const createdTask = await tasksService.createTask(user, {
      officialId: targetOfficialId,
      title: actionItem.title,
      description: `Action item from appointment ${appointment.reference_no} (${appointment.subject})`,
      category: (input.category as any) || 'MEETING',
      priority: (input.priority as any) || 'MEDIUM',
      visibility: 'ORG',
      requiresVerification: false,
      dueAt: actionItem.dueDate || undefined,
      assigneeUserId: actionItem.ownerUserId || undefined,
      source: 'ACTION_ITEM',
      sourceId: actionItem.id,
    });

    // Update action item with converted_task_id
    let updatedActionItem: ActionItemDto = null!;
    await db.transaction(async (trx) => {
      updatedActionItem = await meetingsRepo.updateActionItem(trx, actionItemId, user.orgId, {
        convertedTaskId: createdTask.id,
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'action_item.convert_to_task',
        entityType: 'action_item',
        entityId: actionItemId,
        changes: {
          convertedTaskId: createdTask.id,
          taskRef: createdTask.referenceNo,
        },
        correlationId: actionItem.appointmentId,
      });
    });

    // Fetch refreshed action item with task reference
    const refreshedActionItem = await meetingsRepo.getActionItemById(actionItemId, user.orgId);

    return {
      actionItem: refreshedActionItem || updatedActionItem,
      task: createdTask,
    };
  }

  /**
   * Manual close appointment: COMPLETED -> CLOSED (§10.2, §16)
   */
  async closeAppointment(user: AuthUser, appointmentId: string, reason?: string): Promise<any> {
    const appointment = await appointmentsRepo.getById(appointmentId, user.orgId);
    if (!appointment) {
      throw ApiError.notFound('Appointment not found');
    }

    const { canManage } = await this.checkMeetingAccess(user, appointment);
    if (!canManage) {
      throw ApiError.forbidden('You do not have permission to close this appointment');
    }

    const { nextStatus } = validateTransition(appointment.status, 'close');
    const now = new Date();

    let domainEvent: any = null;

    await db.transaction(async (trx) => {
      await trx('appointments')
        .where('id', appointment.id)
        .update({
          status: nextStatus,
          closed_at: now,
          status_changed_at: now,
          updated_at: trx.fn.now(),
          updated_by: user.id,
          version: appointment.version + 1,
        });

      await trx('appointment_status_history').insert({
        appointment_id: appointment.id,
        from_status: appointment.status,
        to_status: nextStatus,
        action: 'close',
        actor_id: user.id,
        note: reason || 'Appointment manually closed',
        at: now,
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0],
        action: 'appointment.close',
        entityType: 'appointment',
        entityId: appointment.id,
        changes: {
          fromStatus: appointment.status,
          toStatus: nextStatus,
          reason,
        },
        correlationId: appointment.id,
      });

      domainEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        orgId: user.orgId,
        eventType: 'AppointmentClosed',
        aggregateType: 'appointment',
        aggregateId: appointment.id,
        payload: {
          appointmentId: appointment.id,
          referenceNo: appointment.reference_no,
          closedByUserId: user.id,
          closedAt: now,
          reason,
        },
        occurredAt: now,
      };

      await writeOutboxEvent(trx, domainEvent);
    });

    if (domainEvent) {
      routeNotificationEvent(domainEvent).catch(() => {});
    }

    return appointmentsRepo.getById(appointmentId, user.orgId);
  }
}

export const meetingsService = new MeetingsService();
