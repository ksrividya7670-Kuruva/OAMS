import { db } from '../core/db.js';
import { logger } from '../core/logger.js';
import { routeNotificationEvent, type DomainEvent } from '../core/notifications/router.js';

let intervalHandle: NodeJS.Timeout | null = null;
let isProcessing = false;

export async function processOutboxOnce(batchSize = 25): Promise<number> {
  if (isProcessing) return 0;
  isProcessing = true;

  try {
    const events = await db('outbox_events')
      .whereNull('dispatched_at')
      .orderBy('occurred_at', 'asc')
      .limit(batchSize);

    for (const rawEvent of events) {
      const event: DomainEvent = {
        id: rawEvent.id,
        orgId: rawEvent.orgId,
        eventType: rawEvent.eventType,
        aggregateType: rawEvent.aggregateType,
        aggregateId: rawEvent.aggregateId,
        payload:
          typeof rawEvent.payload === 'string' ? JSON.parse(rawEvent.payload) : rawEvent.payload,
        occurredAt: rawEvent.occurredAt,
      };

      try {
        await routeNotificationEvent(event);
        await db('outbox_events').where('id', rawEvent.id).update({
          dispatched_at: db.fn.now(),
        });
      } catch (dispatchErr: unknown) {
        const errorMsg = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
        logger.error({ err: dispatchErr, eventId: rawEvent.id }, 'Outbox event dispatch failure');
        await db('outbox_events').where('id', rawEvent.id).increment('attempts', 1).update({
          last_error: errorMsg,
        });
      }
    }

    return events.length;
  } catch (err) {
    logger.error({ err }, 'Error polling outbox_events');
    return 0;
  } finally {
    isProcessing = false;
  }
}

export function startOutboxWorker(intervalMs = 1000): void {
  if (intervalHandle) return;

  logger.info({ intervalMs }, 'Starting outbox dispatcher worker');
  intervalHandle = setInterval(async () => {
    try {
      await processOutboxOnce();
    } catch {
      // handled inside processOutboxOnce
    }
  }, intervalMs);
}

export function stopOutboxWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('Stopped outbox dispatcher worker');
  }
}
