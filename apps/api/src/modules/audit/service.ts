import { db } from '../../core/db.js';
import { computeAuditHash } from '../../core/audit/auditWriter.js';

export interface AuditQueryInput {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface HashChainVerificationResult {
  valid: boolean;
  verifiedCount: number;
  tipHash?: string;
  breachedEventId?: string;
  error?: string;
}

export class AuditService {
  async listEvents(orgId: string, query: AuditQueryInput) {
    const limit = Math.min(100, Math.max(1, query.limit || 50));

    const qb = db('audit_events')
      .where('audit_events.org_id', orgId)
      .leftJoin('users', 'audit_events.actor_id', 'users.id');

    if (query.entityType) {
      qb.andWhere('audit_events.entity_type', query.entityType);
    }
    if (query.entityId) {
      qb.andWhere('audit_events.entity_id', query.entityId);
    }
    if (query.actorId) {
      qb.andWhere('audit_events.actor_id', query.actorId);
    }
    if (query.action) {
      qb.andWhere('audit_events.action', query.action);
    }
    if (query.from) {
      qb.andWhere('audit_events.occurred_at', '>=', new Date(query.from));
    }
    if (query.to) {
      qb.andWhere('audit_events.occurred_at', '<=', new Date(query.to));
    }
    if (query.cursor) {
      qb.andWhere('audit_events.occurred_at', '<', new Date(query.cursor));
    }

    const rows = await qb
      .select('audit_events.*', 'users.full_name as actor_name', 'users.email as actor_email')
      .orderBy('audit_events.occurred_at', 'desc')
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      orgId: r.org_id,
      actorId: r.actor_id,
      actorRole: r.actor_role,
      actorName: r.actor_name,
      actorEmail: r.actor_email,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      changes: typeof r.changes === 'string' ? JSON.parse(r.changes) : r.changes,
      reason: r.reason,
      ip: r.ip,
      userAgent: r.user_agent,
      correlationId: r.correlation_id,
      occurredAt: new Date(r.occurred_at).toISOString(),
      prevHash: r.prev_hash,
      hash: r.hash,
    }));
  }

  async verifyHashChain(orgId: string): Promise<HashChainVerificationResult> {
    const rows = await db('audit_events')
      .where('org_id', orgId)
      .orderBy('occurred_at', 'asc')
      .select('*');

    if (rows.length === 0) {
      return { valid: true, verifiedCount: 0 };
    }

    let expectedPrevHash = '0'.repeat(64);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // 1. Verify prev_hash link
      if (row.prev_hash !== expectedPrevHash) {
        return {
          valid: false,
          verifiedCount: i,
          breachedEventId: row.id,
          error: `Broken chain link at event ${row.id}: expected prev_hash ${expectedPrevHash}, found ${row.prev_hash}`,
        };
      }

      // 2. Recompute SHA-256 hash
      const rowWithoutHash = {
        orgId: row.org_id,
        actorId: row.actor_id || null,
        actorRole: row.actor_role || null,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        changes: typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes || null,
        reason: row.reason || null,
        ip: row.ip || null,
        userAgent: row.user_agent || null,
        correlationId: row.correlation_id,
        occurredAt: new Date(row.occurred_at).toISOString(),
      };

      const recomputedHash = computeAuditHash(row.prev_hash, rowWithoutHash);

      if (recomputedHash !== row.hash) {
        return {
          valid: false,
          verifiedCount: i,
          breachedEventId: row.id,
          error: `Hash mismatch at event ${row.id}: recomputed ${recomputedHash}, stored ${row.hash}`,
        };
      }

      expectedPrevHash = row.hash;
    }

    return {
      valid: true,
      verifiedCount: rows.length,
      tipHash: expectedPrevHash,
    };
  }
}

export const auditService = new AuditService();
