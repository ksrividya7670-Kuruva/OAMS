import { db } from '../core/db.js';
import { logger } from '../core/logger.js';
import { sendEmail } from '../core/email/mailer.js';
import { isUserInQuietHours } from '../core/notifications/router.js';

export async function processQuietHoursReleaseOnce(): Promise<number> {
  let released = 0;

  try {
    const heldDeliveries = await db('notification_deliveries')
      .where('notification_deliveries.channel', 'EMAIL')
      .where('notification_deliveries.status', 'HELD_QUIET_HOURS')
      .join('notifications', 'notification_deliveries.notification_id', 'notifications.id')
      .join('users', 'notifications.user_id', 'users.id')
      .select(
        'notification_deliveries.id as delivery_id',
        'notifications.id as notification_id',
        'notifications.title',
        'notifications.body',
        'users.id as user_id',
        'users.email',
        'users.quiet_hours_start',
        'users.quiet_hours_end',
        'users.timezone',
      );

    const now = new Date();

    for (const item of heldDeliveries) {
      const inQuietHours = isUserInQuietHours(
        item.quiet_hours_start,
        item.quiet_hours_end,
        item.timezone || 'Asia/Kolkata',
        now,
      );

      // If quiet hours have concluded, release and deliver the held email
      if (!inQuietHours && item.email) {
        try {
          await sendEmail({
            to: item.email,
            subject: `OAMS: ${item.title}`,
            html: `<p><strong>${item.title}</strong></p><p>${item.body}</p>`,
          });

          await db('notification_deliveries').where('id', item.delivery_id).update({
            status: 'SENT',
            sent_at: db.fn.now(),
          });

          released++;
        } catch (err: any) {
          logger.error(
            { err, deliveryId: item.delivery_id },
            'Failed to send released quiet hours email',
          );
          await db('notification_deliveries')
            .where('id', item.delivery_id)
            .update({
              status: 'FAILED',
              last_error: err?.message || String(err),
            });
        }
      }
    }

    return released;
  } catch (err) {
    logger.error({ err }, 'Error in processQuietHoursReleaseOnce');
    return released;
  }
}

let timer: NodeJS.Timeout | null = null;

export function startQuietHoursReleaseWorker(intervalMs = 60000): void {
  if (timer) return;
  logger.info({ intervalMs }, 'Starting quiet-hours-release worker');

  timer = setInterval(async () => {
    try {
      const count = await processQuietHoursReleaseOnce();
      if (count > 0) {
        logger.info({ count }, 'Released quiet hours held notifications');
      }
    } catch (err) {
      logger.error({ err }, 'Unexpected error in quiet hours release worker');
    }
  }, intervalMs);
}

export function stopQuietHoursReleaseWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info('Stopped quiet-hours-release worker');
  }
}
