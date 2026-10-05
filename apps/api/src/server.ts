import { app } from './app.js';
import { config } from './core/config.js';
import { logger } from './core/logger.js';
import { db } from './core/db.js';
import { redis } from './core/redis.js';
import { startOutboxWorker, stopOutboxWorker } from './jobs/outboxWorker.js';
import { startTaskRemindersWorker, stopTaskRemindersWorker } from './jobs/taskReminders.js';
import { startTaskOverdueWorker, stopTaskOverdueWorker } from './jobs/taskOverdue.js';
import { startRecurringTasksWorker, stopRecurringTasksWorker } from './jobs/recurringTasks.js';
import { startNoShowDetectWorker, stopNoShowDetectWorker } from './jobs/noshowDetect.js';
import {
  startVisitorAutoCheckoutWorker,
  stopVisitorAutoCheckoutWorker,
} from './jobs/visitorAutoCheckout.js';
import {
  startAutoCloseAppointmentsWorker,
  stopAutoCloseAppointmentsWorker,
} from './jobs/autoCloseAppointments.js';
import {
  startRerouteAssignmentsWorker,
  stopRerouteAssignmentsWorker,
} from './jobs/rerouteAssignments.js';
import {
  startQuietHoursReleaseWorker,
  stopQuietHoursReleaseWorker,
} from './jobs/quietHoursRelease.js';
import { startDailyDigestWorker, stopDailyDigestWorker } from './jobs/dailyDigest.js';

const server = app.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, env: config.NODE_ENV },
    `🚀 OAMS API Server running at http://localhost:${config.PORT}`,
  );
  startOutboxWorker(1000);
  startTaskRemindersWorker(60000);
  startTaskOverdueWorker(60000);
  startRecurringTasksWorker(15 * 60 * 1000);
  startNoShowDetectWorker(60000);
  startVisitorAutoCheckoutWorker(300000);
  startAutoCloseAppointmentsWorker(3600000);
  startRerouteAssignmentsWorker(60000);
  startQuietHoursReleaseWorker(60000);
  startDailyDigestWorker(60000);
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Graceful shutdown initiated');
  stopOutboxWorker();
  stopTaskRemindersWorker();
  stopTaskOverdueWorker();
  stopRecurringTasksWorker();
  stopNoShowDetectWorker();
  stopVisitorAutoCheckoutWorker();
  stopAutoCloseAppointmentsWorker();
  stopRerouteAssignmentsWorker();
  stopQuietHoursReleaseWorker();
  stopDailyDigestWorker();

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await redis.quit();
      logger.info('Redis connection closed');
    } catch (err) {
      logger.error({ err }, 'Error closing Redis connection');
    }

    try {
      await db.destroy();
      logger.info('Database connection pool closed');
    } catch (err) {
      logger.error({ err }, 'Error closing Database connection');
    }

    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
