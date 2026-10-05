import { db } from '../core/db.js';
import { logger } from '../core/logger.js';
import { writeOutboxEvent } from '../core/outbox/outboxWriter.js';
import { routeNotificationEvent } from '../core/notifications/router.js';

let intervalHandle: NodeJS.Timeout | null = null;

export async function processTaskRemindersOnce(): Promise<number> {
  const now = new Date();

  // Find due reminders that haven't been sent yet
  const reminders = await db('task_reminders')
    .join('tasks', 'task_reminders.task_id', 'tasks.id')
    .where('task_reminders.remind_at', '<=', now)
    .whereNull('task_reminders.sent_at')
    .whereNotIn('tasks.status', ['DONE', 'CANCELLED'])
    .select(
      'task_reminders.id as reminder_id',
      'task_reminders.remind_at',
      'task_reminders.channel',
      'tasks.id as task_id',
      'tasks.org_id',
      'tasks.reference_no',
      'tasks.title',
      'tasks.owner_user_id',
      'tasks.assignee_user_id',
      'tasks.visibility',
    );

  let processedCount = 0;

  for (const rem of reminders) {
    try {
      const recipientId = rem.assignee_user_id || rem.owner_user_id;

      await db.transaction(async (trx) => {
        await trx('task_reminders').where('id', rem.reminder_id).update({ sent_at: trx.fn.now() });

        const domainEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          orgId: rem.org_id,
          eventType: 'TaskReminder',
          aggregateType: 'task',
          aggregateId: rem.task_id,
          payload: {
            taskId: rem.task_id,
            referenceNo: rem.reference_no,
            title: rem.title,
            userId: recipientId,
            channel: rem.channel,
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
      logger.error({ err, reminderId: rem.reminder_id }, 'Failed to dispatch task reminder');
    }
  }

  return processedCount;
}

export function startTaskRemindersWorker(intervalMs = 60000): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(async () => {
    try {
      await processTaskRemindersOnce();
    } catch (err) {
      logger.error({ err }, 'Error in task reminders worker');
    }
  }, intervalMs);
}

export function stopTaskRemindersWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
