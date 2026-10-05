import type { Request, Response } from 'express';
import { notificationsService } from './service.js';
import {
  notificationPaginationSchema,
  updateNotificationPreferencesSchema,
  createNotificationSchema,
} from '@oams/shared';
import { redis } from '../../core/redis.js';
import { logger } from '../../core/logger.js';

export class NotificationsController {
  async getStreamTicket(req: Request, res: Response): Promise<void> {
    const result = await notificationsService.createStreamTicket(req.user!.id);
    res.json({ success: true, data: result });
  }

  async stream(req: Request, res: Response): Promise<void> {
    const ticket = req.query.ticket as string;
    let userId: string | null = null;

    if (ticket) {
      userId = await notificationsService.verifyStreamTicket(ticket);
    } else if (req.user) {
      userId = req.user.id;
    }

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Valid stream ticket required for SSE' },
      });
      return;
    }

    // Set SSE headers per §14.2
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(': connected\n\n');

    // Send initial unread count
    const initialUnread = await notificationsService.getUnreadCount(userId, req.user?.orgId || '');
    res.write(`event: unread-count\ndata: ${JSON.stringify({ count: initialUnread })}\n\n`);

    // Create a duplicate Redis client for subscribing
    const subRedis = redis.duplicate();
    const channel = `user:${userId}`;

    await subRedis.subscribe(channel, (err) => {
      if (err) {
        logger.error({ err, channel }, 'Failed to subscribe to Redis user channel');
      }
    });

    subRedis.on('message', (_chan, message) => {
      res.write(`event: notification\ndata: ${message}\n\n`);
    });

    // 25s heartbeat per §14.2
    const heartbeatTimer = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 25000);

    req.on('close', async () => {
      clearInterval(heartbeatTimer);
      try {
        await subRedis.unsubscribe(channel);
        await subRedis.quit();
      } catch (err) {
        logger.warn({ err }, 'Error cleaning up SSE subscriber');
      }
    });
  }

  async list(req: Request, res: Response): Promise<void> {
    const query = notificationPaginationSchema.parse(req.query);
    const result = await notificationsService.listNotifications(
      req.user!.id,
      req.user!.orgId,
      query,
    );

    res.json({
      success: true,
      data: result.items,
      items: result.items,
      total: result.total,
      unreadCount: result.unreadCount,
      page: result.page,
      limit: result.limit,
      meta: {
        nextCursor: result.nextCursor,
        total: result.total,
        unreadCount: result.unreadCount,
      },
    });
  }

  async unreadCount(req: Request, res: Response): Promise<void> {
    const count = await notificationsService.getUnreadCount(req.user!.id, req.user!.orgId);
    res.json({
      success: true,
      data: { count, unreadCount: count },
      count,
      unreadCount: count,
    });
  }

  async markRead(req: Request, res: Response): Promise<void> {
    const result = await notificationsService.markAsRead(
      req.user!.id,
      req.params.id as string,
      req.user!.orgId,
    );
    res.json({ success: true, data: result });
  }

  async markAllRead(req: Request, res: Response): Promise<void> {
    const result = await notificationsService.markAllAsRead(req.user!.id, req.user!.orgId);
    res.json({ success: true, data: result });
  }

  async delete(req: Request, res: Response): Promise<void> {
    const result = await notificationsService.deleteNotification(
      req.user!.id,
      req.params.id as string,
      req.user!.orgId,
    );
    res.json({ success: true, data: result });
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = createNotificationSchema.parse(req.body);
    const result = await notificationsService.createNotification({
      orgId: req.user!.orgId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      appointmentId: input.appointmentId,
      link: input.link,
      priority: input.priority,
    });
    res.status(201).json({ success: true, data: result });
  }

  async getPreferences(req: Request, res: Response): Promise<void> {
    const prefs = await notificationsService.getPreferences(req.user!.id);
    res.json({ success: true, data: prefs });
  }

  async updatePreferences(req: Request, res: Response): Promise<void> {
    const input = updateNotificationPreferencesSchema.parse(req.body);
    const result = await notificationsService.updatePreferences(req.user!.id, input);
    res.json({ success: true, data: result });
  }
}

export const notificationsController = new NotificationsController();
