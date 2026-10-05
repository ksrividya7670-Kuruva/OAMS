import crypto from 'crypto';
import type { Knex } from 'knex';

export interface AuditParams {
  orgId: string;
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, unknown> | null;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  correlationId: string;
  occurredAt?: Date;
}

export function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const entries = keys.map((key) => {
    return JSON.stringify(key) + ':' + canonicalJson((obj as Record<string, unknown>)[key]);
  });
  return '{' + entries.join(',') + '}';
}

export function computeAuditHash(prevHash: string, rowData: Record<string, unknown>): string {
  const canonical = canonicalJson(rowData);
  return crypto
    .createHash('sha256')
    .update(prevHash + canonical)
    .digest('hex');
}

export async function writeAuditEvent(
  trx: Knex.Transaction | Knex,
  params: AuditParams,
): Promise<string> {
  const occurredAt = params.occurredAt || new Date();

  // Find latest audit row for this organization to link the hash chain
  const latest = await trx('audit_events')
    .where('org_id', params.orgId)
    .orderBy('occurred_at', 'desc')
    .first('hash');

  const prevHash = latest && latest.hash ? latest.hash : '0'.repeat(64);

  const rowWithoutHash = {
    orgId: params.orgId,
    actorId: params.actorId || null,
    actorRole: params.actorRole || null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    changes: params.changes || null,
    reason: params.reason || null,
    ip: params.ip || null,
    userAgent: params.userAgent || null,
    correlationId: params.correlationId,
    occurredAt: occurredAt.toISOString(),
  };

  const hash = computeAuditHash(prevHash, rowWithoutHash);

  const [inserted] = await trx('audit_events')
    .insert({
      org_id: rowWithoutHash.orgId,
      actor_id: rowWithoutHash.actorId,
      actor_role: rowWithoutHash.actorRole,
      action: rowWithoutHash.action,
      entity_type: rowWithoutHash.entityType,
      entity_id: rowWithoutHash.entityId,
      changes: rowWithoutHash.changes ? JSON.stringify(rowWithoutHash.changes) : null,
      reason: rowWithoutHash.reason,
      ip: rowWithoutHash.ip,
      user_agent: rowWithoutHash.userAgent,
      correlation_id: rowWithoutHash.correlationId,
      occurred_at: occurredAt,
      prev_hash: prevHash,
      hash,
    })
    .returning('id');

  return inserted.id || inserted;
}
