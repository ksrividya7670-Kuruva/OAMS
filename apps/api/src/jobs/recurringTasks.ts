import { tasksService } from '../modules/tasks/service.js';
import { logger } from '../core/logger.js';

let intervalHandle: NodeJS.Timeout | null = null;

export async function processRecurringTasksOnce(): Promise<number> {
  try {
    const generated = await tasksService.generateRecurringOccurrences(undefined, 14);
    if (generated > 0) {
      logger.info({ generated }, 'Generated recurring task occurrences');
    }
    return generated;
  } catch (err) {
    logger.error({ err }, 'Error in recurring tasks generator');
    return 0;
  }
}

/**
 * Runs periodically (default every 15 minutes) to ensure future occurrences are populated (§12.6)
 */
export function startRecurringTasksWorker(intervalMs = 15 * 60 * 1000): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(async () => {
    try {
      await processRecurringTasksOnce();
    } catch (err) {
      logger.error({ err }, 'Error in recurring tasks worker');
    }
  }, intervalMs);
}

export function stopRecurringTasksWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
