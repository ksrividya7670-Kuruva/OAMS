import type { Knex } from 'knex';
import { db } from '../../core/db.js';
import type { NotificationDto, Priority } from '@oams/shared';

export class NotificationsRepo {
  private baseDb(trx?: Knex | Knex.Transaction): Knex | Knex.Transaction {
    return trx || db;
  }

  mapNotificationRow(row: any): NotificationDto {
    const isRead = !!row.read_at;
    const appointmentId =
      row.appointment_id ||
      (row.entity_type === 'appointment' ? row.entity_id : null);

    return {
      id: row.id,
      userId: row.user_id,
      type: row.event_type,
      title: row.title,
      message: row.body,
      appointmentId: appointmentId || null,
      isRead,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
      // Backward compatibility fields
      eventType: row.event_type,
      body: row.body,
      link: row.link || '/app/dashboard',
      priority: row.priority || 'MEDIUM',
      entityType: row.entity_type || 'notification',
      entityId: row.entity_id || row.id,
      targetRoles: row.target_roles ? (Array.isArray(row.target_roles) ? row.target_roles : [row.target_roles]) : undefined,
      officialId: row.official_id || null,
    };
  }

  async create(
    data: {
      orgId?: string;
      userId: string;
      type: string;
      title: string;
      message: string;
      appointmentId?: string | null;
      link?: string;
      priority?: Priority | string;
      dedupeKey?: string;
      targetRoles?: string[];
      officialId?: string | null;
    },
    trx?: Knex | Knex.Transaction,
  ): Promise<NotificationDto> {
    const dedupeKey =
      data.dedupeKey || `${data.type}:${data.userId}:${data.appointmentId || 'gen'}:${Date.now()}`;

    // Deduplication check
    const existing = await this.baseDb(trx)('notifications')
      .where('dedupe_key', dedupeKey)
      .first();

    if (existing) {
      return this.mapNotificationRow(existing);
    }

    const insertPayload: any = {
      org_id: data.orgId || 'org-apex-main',
      user_id: data.userId,
      event_type: data.type,
      title: data.title,
      body: data.message,
      link: data.link || (data.appointmentId ? `/app/appointments/${data.appointmentId}` : '/app/dashboard'),
      priority: data.priority || 'MEDIUM',
      entity_type: data.appointmentId ? 'appointment' : 'system',
      entity_id: data.appointmentId || data.userId,
      dedupe_key: dedupeKey,
    };

    if (data.targetRoles && data.targetRoles.length > 0) {
      insertPayload.target_roles = JSON.stringify(data.targetRoles);
    }
    if (data.officialId) {
      insertPayload.official_id = data.officialId;
    }

    try {
      insertPayload.appointment_id = data.appointmentId || null;
      const [row] = await this.baseDb(trx)('notifications')
        .insert(insertPayload)
        .returning('*');
      return this.mapNotificationRow(row);
    } catch {
      delete insertPayload.appointment_id;
      delete insertPayload.target_roles;
      delete insertPayload.official_id;
      const [row] = await this.baseDb(trx)('notifications')
        .insert(insertPayload)
        .returning('*');
      return this.mapNotificationRow(row);
    }
  }

  async getById(id: string, userId?: string, trx?: Knex | Knex.Transaction): Promise<NotificationDto | null> {
    let qb = this.baseDb(trx)('notifications').where('id', id);
    if (userId) {
      qb = qb.andWhere('user_id', userId);
    }
    const row = await qb.first();
    return row ? this.mapNotificationRow(row) : null;
  }

  async listByUser(
    userId: string,
    options: {
      unread?: boolean;
      limit?: number;
      page?: number;
      cursor?: string;
      orgId?: string;
    },
    trx?: Knex | Knex.Transaction,
  ): Promise<{ items: NotificationDto[]; total: number; unreadCount: number; nextCursor: string | null }> {
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);
    const page = Math.max(options.page || 1, 1);
    const offset = (page - 1) * limit;

    let qb = this.baseDb(trx)('notifications').where('user_id', userId);
    if (options.orgId) {
      qb = qb.andWhere('org_id', options.orgId);
    }

    if (options.unread) {
      qb = qb.whereNull('read_at');
    }

    if (options.cursor) {
      const cursorRow = await this.baseDb(trx)('notifications').where('id', options.cursor).first('created_at');
      if (cursorRow) {
        qb = qb.where('created_at', '<', cursorRow.created_at || cursorRow.createdAt);
      }
    }

    const totalRes = await this.baseDb(trx)('notifications')
      .where('user_id', userId)
      .count('* as count')
      .first();
    const total = totalRes ? Number(totalRes.count) : 0;

    const unreadRes = await this.baseDb(trx)('notifications')
      .where('user_id', userId)
      .whereNull('read_at')
      .count('* as count')
      .first();
    const unreadCount = unreadRes ? Number(unreadRes.count) : 0;

    const rows = await qb
      .orderBy('created_at', 'desc')
      .limit(limit + 1)
      .offset(options.cursor ? 0 : offset);

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;
    const items = resultRows.map((r: any) => this.mapNotificationRow(r));
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return {
      items,
      total,
      unreadCount,
      nextCursor,
    };
  }

  async countUnread(userId: string, orgId?: string, trx?: Knex | Knex.Transaction): Promise<number> {
    let qb = this.baseDb(trx)('notifications')
      .where('user_id', userId)
      .whereNull('read_at');

    if (orgId) {
      qb = qb.andWhere('org_id', orgId);
    }

    const res = await qb.count('* as count').first();
    return res ? Number(res.count) : 0;
  }

  async markAsRead(id: string, userId: string, orgId?: string, trx?: Knex | Knex.Transaction): Promise<NotificationDto | null> {
    let qb = this.baseDb(trx)('notifications')
      .where({ id, user_id: userId });

    if (orgId) {
      qb = qb.andWhere({ org_id: orgId });
    }

    const [updated] = await qb.update({ read_at: this.baseDb(trx).fn.now() }).returning('*');
    return updated ? this.mapNotificationRow(updated) : null;
  }

  async markAllAsRead(userId: string, orgId?: string, trx?: Knex | Knex.Transaction): Promise<number> {
    let qb = this.baseDb(trx)('notifications')
      .where('user_id', userId)
      .whereNull('read_at');

    if (orgId) {
      qb = qb.andWhere('org_id', orgId);
    }

    return await qb.update({ read_at: this.baseDb(trx).fn.now() });
  }

  async delete(id: string, userId: string, orgId?: string, trx?: Knex | Knex.Transaction): Promise<boolean> {
    let qb = this.baseDb(trx)('notifications')
      .where({ id, user_id: userId });

    if (orgId) {
      qb = qb.andWhere({ org_id: orgId });
    }

    const count = await qb.delete();
    return count > 0;
  }
}

export const notificationsRepo = new NotificationsRepo();
