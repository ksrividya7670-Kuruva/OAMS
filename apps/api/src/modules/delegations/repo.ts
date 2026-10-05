import { db } from '../../core/db.js';

export interface DelegationRecord {
  id: string;
  official_id: string;
  from_user_id: string;
  from_user_name?: string;
  to_user_id: string;
  to_user_name?: string;
  to_user_email?: string;
  scope: 'ALL' | 'APPOINTMENTS' | 'TASKS';
  starts_at: string | Date;
  ends_at: string | Date;
  reason: string | null;
  revoked_at: string | Date | null;
  created_at: string | Date;
  created_by: string | null;
  updated_at: string | Date;
  updated_by: string | null;
  version: number;
}

export class DelegationsRepo {
  async listByOfficial(officialId: string): Promise<any[]> {
    const now = new Date();
    const rows = await db('delegations')
      .leftJoin('users as from_user', 'delegations.from_user_id', 'from_user.id')
      .leftJoin('users as to_user', 'delegations.to_user_id', 'to_user.id')
      .where('delegations.official_id', officialId)
      .select(
        'delegations.*',
        'from_user.full_name as from_user_name',
        'to_user.full_name as to_user_name',
        'to_user.email as to_user_email',
      )
      .orderBy('delegations.created_at', 'desc');

    return rows.map((r: any) => {
      const startsAt = r.starts_at ? new Date(r.starts_at) : now;
      const endsAt = r.ends_at ? new Date(r.ends_at) : now;
      const isRevoked = Boolean(r.revoked_at);
      const isActive = !isRevoked && startsAt <= now && endsAt >= now;

      return {
        id: r.id,
        officialId: r.official_id,
        fromUserId: r.from_user_id,
        fromUserName: r.from_user_name || undefined,
        toUserId: r.to_user_id,
        toUserName: r.to_user_name || undefined,
        toUserEmail: r.to_user_email || undefined,
        scope: r.scope,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: r.reason,
        revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
        isActive,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : now.toISOString(),
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : now.toISOString(),
      };
    });
  }

  async findById(id: string, officialId?: string): Promise<any | null> {
    const query = db('delegations')
      .leftJoin('users as from_user', 'delegations.from_user_id', 'from_user.id')
      .leftJoin('users as to_user', 'delegations.to_user_id', 'to_user.id')
      .where('delegations.id', id);

    if (officialId) {
      query.andWhere('delegations.official_id', officialId);
    }

    const r = await query.first(
      'delegations.*',
      'from_user.full_name as from_user_name',
      'to_user.full_name as to_user_name',
      'to_user.email as to_user_email',
    );

    if (!r) return null;

    const now = new Date();
    const startsAt = r.starts_at ? new Date(r.starts_at) : now;
    const endsAt = r.ends_at ? new Date(r.ends_at) : now;
    const isRevoked = Boolean(r.revoked_at);
    const isActive = !isRevoked && startsAt <= now && endsAt >= now;

    return {
      id: r.id,
      officialId: r.official_id,
      fromUserId: r.from_user_id,
      fromUserName: r.from_user_name || undefined,
      toUserId: r.to_user_id,
      toUserName: r.to_user_name || undefined,
      toUserEmail: r.to_user_email || undefined,
      scope: r.scope,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      reason: r.reason,
      revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
      isActive,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : now.toISOString(),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : now.toISOString(),
    };
  }

  async create(data: {
    officialId: string;
    fromUserId: string;
    toUserId: string;
    scope: 'ALL' | 'APPOINTMENTS' | 'TASKS';
    startsAt: Date;
    endsAt: Date;
    reason?: string | null;
    createdBy?: string;
  }): Promise<any> {
    const [row] = await db('delegations')
      .insert({
        official_id: data.officialId,
        from_user_id: data.fromUserId,
        to_user_id: data.toUserId,
        scope: data.scope,
        starts_at: data.startsAt,
        ends_at: data.endsAt,
        reason: data.reason || null,
        created_by: data.createdBy || null,
        updated_by: data.createdBy || null,
      })
      .returning('*');

    return this.findById(row.id);
  }

  async revoke(id: string, revokedBy?: string): Promise<any> {
    await db('delegations')
      .where('id', id)
      .update({
        revoked_at: db.fn.now(),
        updated_by: revokedBy || null,
        updated_at: db.fn.now(),
      });

    return this.findById(id);
  }
}

export const delegationsRepo = new DelegationsRepo();
