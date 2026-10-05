import { db } from '../core/db.js';
import { logger } from '../core/logger.js';
import { writeOutboxEvent } from '../core/outbox/outboxWriter.js';
import { routeNotificationEvent } from '../core/notifications/router.js';

let intervalHandle: NodeJS.Timeout | null = null;

export async function processTaskOverdueOnce(): Promise<number> {
  const now = new Date();

  // Find overdue tasks that are still active
  const overdueTasks = await db('tasks')
    .where('due_at', '<', now)
    .whereNotIn('status', ['DONE', 'CANCELLED'])
    .select(
      'id',
      'org_id',
      'reference_no',
      'title',
      'owner_user_id',
      'assignee_user_id',
      'visibility',
    );

  let processedCount = 0;

  for (const task of overdueTasks) {
    try {
      const dedupeKey = `TaskOverdue:${task.id}:${task.owner_user_id}`;
      // Check if notification already delivered for this overdue event
      const alreadySent = await db('notifications').where('dedupe_key', dedupeKey).first();
      if (alreadySent) {
        continue;
      }

      await db.transaction(async (trx) => {
        const domainEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          orgId: task.org_id,
          eventType: 'TaskOverdue',
          aggregateType: 'task',
          aggregateId: task.id,
          payload: {
            taskId: task.id,
            referenceNo: task.reference_no,
            title: task.title,
            ownerUserId: task.owner_user_id,
            assigneeUserId: task.assignee_user_id,
          },
          occurredAt: new Date(),
        };

        await writeOutboxEvent(trx, domainEvent);
        trx.executionPromise.then(() => {
          routeNotificationEvent(domainEvent).catch(() => {});
        });
      });

      processedCount++;
    } catch (err) {
      logger.error({ err, taskId: task.id }, 'Failed to dispatch task overdue notification');
    }
  }

  return processedCount;
}

export function startTaskOverdueWorker(intervalMs = 60000): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(async () => {
    try {
      await processTaskOverdueOnce();
    } catch (err) {
      logger.error({ err }, 'Error in task overdue worker');
    }
  }, intervalMs);
}

export function stopTaskOverdueWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
