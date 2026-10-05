import { db } from '../core/db.js';
import { logger } from '../core/logger.js';
import { sendEmail } from '../core/email/mailer.js';

interface HeldDigestItem {
  delivery_id: string;
  notification_id: string;
  title: string;
  body: string;
  link: string;
  priority: string;
  created_at: string | Date;
  user_id: string;
  email: string;
  full_name: string;
  timezone: string;
}

export async function processDailyDigestOnce(): Promise<{
  usersCount: number;
  deliveriesCount: number;
}> {
  let usersCount = 0;
  let deliveriesCount = 0;

  try {
    const heldItems: HeldDigestItem[] = await db('notification_deliveries')
      .where('notification_deliveries.channel', 'EMAIL')
      .where('notification_deliveries.status', 'HELD_DIGEST')
      .join('notifications', 'notification_deliveries.notification_id', 'notifications.id')
      .join('users', 'notifications.user_id', 'users.id')
      .select(
        'notification_deliveries.id as delivery_id',
        'notifications.id as notification_id',
        'notifications.title',
        'notifications.body',
        'notifications.link',
        'notifications.priority',
        'notifications.created_at',
        'users.id as user_id',
        'users.email',
        'users.full_name',
        'users.timezone',
      );

    if (heldItems.length === 0) {
      return { usersCount: 0, deliveriesCount: 0 };
    }

    // Group by user_id
    const userGroups = new Map<string, HeldDigestItem[]>();
    for (const item of heldItems) {
      const existing = userGroups.get(item.user_id) || [];
      existing.push(item);
      userGroups.set(item.user_id, existing);
    }

    for (const [userId, items] of userGroups.entries()) {
      const user = items[0];
      if (!user.email) continue;

      const dateStr = new Date().toLocaleDateString('en-IN', {
        dateStyle: 'medium',
      });

      const itemsListHtml = items
        .map(
          (it) => `
          <li style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #eee;">
            <strong style="color: #1e293b;">${it.title}</strong>
            <span style="font-size: 11px; color: #64748b; margin-left: 8px;">[${it.priority}]</span>
            <p style="margin: 4px 0 0 0; color: #334155; font-size: 13px;">${it.body}</p>
          </li>`,
        )
        .join('');

      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0f172a; margin-bottom: 8px;">OAMS Morning Digest</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 0;">Daily summary for ${dateStr} &bull; ${items.length} notification(s)</p>
          <ul style="list-style: none; padding-left: 0; margin-top: 20px;">
            ${itemsListHtml}
          </ul>
          <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">
            You are receiving this summary because your notification preference is set to Daily Digest.
          </p>
        </div>
      `;

      try {
        await sendEmail({
          to: user.email,
          subject: `OAMS Daily Digest: ${items.length} update(s) for ${dateStr}`,
          html,
        });

        const deliveryIds = items.map((i) => i.delivery_id);
        await db('notification_deliveries').whereIn('id', deliveryIds).update({
          status: 'SENT',
          sent_at: db.fn.now(),
        });

        usersCount++;
        deliveriesCount += items.length;
      } catch (err: any) {
        logger.error({ err, userId }, 'Failed to deliver daily digest email');
        const deliveryIds = items.map((i) => i.delivery_id);
        await db('notification_deliveries')
          .whereIn('id', deliveryIds)
          .update({
            status: 'FAILED',
            last_error: err?.message || String(err),
          });
      }
    }

    return { usersCount, deliveriesCount };
  } catch (err) {
    logger.error({ err }, 'Error running daily digest job');
    return { usersCount, deliveriesCount };
  }
}

let timer: NodeJS.Timeout | null = null;

export function startDailyDigestWorker(intervalMs = 60000): void {
  if (timer) return;
  logger.info({ intervalMs }, 'Starting daily-digest worker');

  timer = setInterval(async () => {
    try {
      // Check if it is around 08:00 AM in standard business hours
      const now = new Date();
      if (now.getMinutes() === 0 && now.getHours() === 8) {
        const result = await processDailyDigestOnce();
        if (result.usersCount > 0) {
          logger.info(result, 'Delivered daily digests to users');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Unexpected error in daily digest worker');
    }
  }, intervalMs);
}

export function stopDailyDigestWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info('Stopped daily-digest worker');
  }
}
