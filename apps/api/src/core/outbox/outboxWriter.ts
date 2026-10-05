import type { Knex } from 'knex';

export interface OutboxParams {
  orgId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

export async function writeOutboxEvent(
  trx: Knex.Transaction | Knex,
  params: OutboxParams,
): Promise<string> {
  const [inserted] = await trx('outbox_events')
    .insert({
      org_id: params.orgId,
      event_type: params.eventType,
      aggregate_type: params.aggregateType,
      aggregate_id: params.aggregateId,
      payload: JSON.stringify(params.payload),
      occurred_at: trx.fn.now(),
      attempts: 0,
    })
    .returning('id');

  return inserted.id || inserted;
}
