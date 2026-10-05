import type { Knex } from 'knex';
import { db } from '../../core/db.js';
import type { MeetingNoteDto, ActionItemDto } from '@oams/shared';

export class MeetingsRepo {
  private baseDb(trx?: Knex | Knex.Transaction): Knex | Knex.Transaction {
    return trx || db;
  }

  async getNotesByAppointmentId(
    appointmentId: string,
    orgId: string,
    trx?: Knex | Knex.Transaction,
  ): Promise<MeetingNoteDto[]> {
    const rows = await this.baseDb(trx)('meeting_notes')
      .leftJoin('users', 'meeting_notes.author_id', 'users.id')
      .where('meeting_notes.appointment_id', appointmentId)
      .andWhere('meeting_notes.org_id', orgId)
      .select('meeting_notes.*', 'users.full_name as author_name')
      .orderBy('meeting_notes.created_at', 'desc');

    return rows.map((r: any) => this.mapNoteRow(r));
  }

  async getNoteById(
    id: string,
    orgId: string,
    trx?: Knex | Knex.Transaction,
  ): Promise<MeetingNoteDto | null> {
    const row = await this.baseDb(trx)('meeting_notes')
      .leftJoin('users', 'meeting_notes.author_id', 'users.id')
      .where('meeting_notes.id', id)
      .andWhere('meeting_notes.org_id', orgId)
      .select('meeting_notes.*', 'users.full_name as author_name')
      .first();

    return row ? this.mapNoteRow(row) : null;
  }

  async createNote(
    trx: Knex | Knex.Transaction,
    data: {
      orgId: string;
      appointmentId: string;
      body: string;
      decisions?: string | null;
      visibility?: string;
      authorId: string;
    },
  ): Promise<MeetingNoteDto> {
    const [row] = await trx('meeting_notes')
      .insert({
        org_id: data.orgId,
        appointment_id: data.appointmentId,
        body: data.body,
        decisions: data.decisions || null,
        visibility: data.visibility || 'INTERNAL',
        author_id: data.authorId,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .returning('*');

    return this.mapNoteRow(row);
  }

  async updateNote(
    trx: Knex | Knex.Transaction,
    id: string,
    orgId: string,
    data: {
      body?: string;
      decisions?: string | null;
    },
  ): Promise<MeetingNoteDto> {
    const updatePayload: any = {
      updated_at: trx.fn.now(),
    };
    if (data.body !== undefined) updatePayload.body = data.body;
    if (data.decisions !== undefined) updatePayload.decisions = data.decisions;

    const [row] = await trx('meeting_notes')
      .where('id', id)
      .andWhere('org_id', orgId)
      .update(updatePayload)
      .returning('*');

    return this.mapNoteRow(row);
  }

  async getActionItemsByAppointmentId(
    appointmentId: string,
    orgId: string,
    trx?: Knex | Knex.Transaction,
  ): Promise<ActionItemDto[]> {
    const rows = await this.baseDb(trx)('action_items')
      .leftJoin('users', 'action_items.owner_user_id', 'users.id')
      .leftJoin('tasks', 'action_items.converted_task_id', 'tasks.id')
      .where('action_items.appointment_id', appointmentId)
      .andWhere('action_items.org_id', orgId)
      .select(
        'action_items.*',
        'users.full_name as owner_name',
        'tasks.reference_no as converted_task_ref',
      )
      .orderBy('action_items.created_at', 'asc');

    return rows.map((r: any) => this.mapActionItemRow(r));
  }

  async getActionItemById(
    id: string,
    orgId: string,
    trx?: Knex | Knex.Transaction,
  ): Promise<ActionItemDto | null> {
    const row = await this.baseDb(trx)('action_items')
      .leftJoin('users', 'action_items.owner_user_id', 'users.id')
      .leftJoin('tasks', 'action_items.converted_task_id', 'tasks.id')
      .where('action_items.id', id)
      .andWhere('action_items.org_id', orgId)
      .select(
        'action_items.*',
        'users.full_name as owner_name',
        'tasks.reference_no as converted_task_ref',
      )
      .first();

    return row ? this.mapActionItemRow(row) : null;
  }

  async getActionItemByConvertedTaskId(
    taskId: string,
    orgId: string,
    trx?: Knex | Knex.Transaction,
  ): Promise<ActionItemDto | null> {
    const row = await this.baseDb(trx)('action_items')
      .leftJoin('users', 'action_items.owner_user_id', 'users.id')
      .leftJoin('tasks', 'action_items.converted_task_id', 'tasks.id')
      .where('action_items.converted_task_id', taskId)
      .andWhere('action_items.org_id', orgId)
      .select(
        'action_items.*',
        'users.full_name as owner_name',
        'tasks.reference_no as converted_task_ref',
      )
      .first();

    return row ? this.mapActionItemRow(row) : null;
  }

  async createActionItem(
    trx: Knex | Knex.Transaction,
    data: {
      orgId: string;
      appointmentId: string;
      noteId?: string | null;
      title: string;
      ownerUserId?: string | null;
      dueDate?: Date | string | null;
      status?: string;
    },
  ): Promise<ActionItemDto> {
    const [row] = await trx('action_items')
      .insert({
        org_id: data.orgId,
        appointment_id: data.appointmentId,
        note_id: data.noteId || null,
        title: data.title,
        owner_user_id: data.ownerUserId || null,
        due_date: data.dueDate ? new Date(data.dueDate) : null,
        status: data.status || 'OPEN',
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .returning('*');

    return this.mapActionItemRow(row);
  }

  async updateActionItem(
    trx: Knex | Knex.Transaction,
    id: string,
    orgId: string,
    data: {
      title?: string;
      ownerUserId?: string | null;
      dueDate?: Date | string | null;
      status?: string;
      convertedTaskId?: string | null;
    },
  ): Promise<ActionItemDto> {
    const updatePayload: any = {
      updated_at: trx.fn.now(),
    };
    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.ownerUserId !== undefined) updatePayload.owner_user_id = data.ownerUserId;
    if (data.dueDate !== undefined)
      updatePayload.due_date = data.dueDate ? new Date(data.dueDate) : null;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.convertedTaskId !== undefined) updatePayload.converted_task_id = data.convertedTaskId;

    const [row] = await trx('action_items')
      .where('id', id)
      .andWhere('org_id', orgId)
      .update(updatePayload)
      .returning('*');

    return this.mapActionItemRow(row);
  }

  private mapNoteRow(r: any): MeetingNoteDto {
    return {
      id: r.id,
      orgId: r.org_id,
      appointmentId: r.appointment_id,
      body: r.body,
      decisions: r.decisions || null,
      visibility: r.visibility,
      authorId: r.author_id,
      authorName: r.author_name || undefined,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    };
  }

  private mapActionItemRow(r: any): ActionItemDto {
    return {
      id: r.id,
      orgId: r.org_id,
      appointmentId: r.appointment_id,
      noteId: r.note_id || null,
      title: r.title,
      ownerUserId: r.owner_user_id || null,
      ownerName: r.owner_name || undefined,
      dueDate: r.due_date
        ? r.due_date instanceof Date
          ? r.due_date.toISOString()
          : String(r.due_date)
        : null,
      status: r.status,
      convertedTaskId: r.converted_task_id || null,
      convertedTaskRef: r.converted_task_ref || null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    };
  }
}

export const meetingsRepo = new MeetingsRepo();
