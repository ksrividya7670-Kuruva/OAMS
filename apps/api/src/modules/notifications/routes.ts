import { Router } from 'express';
import { notificationsController } from './controller.js';
import { requireAuth, optionalAuth } from '../../core/auth/middleware.js';

export const notificationsRouter: Router = Router();

// Stream ticket and SSE endpoint
notificationsRouter.post(
  ['/api/v1/notifications/stream-ticket', '/api/notifications/stream-ticket'],
  requireAuth,
  (req, res, next) => notificationsController.getStreamTicket(req, res).catch(next),
);

notificationsRouter.get(
  ['/api/v1/notifications/stream', '/api/notifications/stream'],
  optionalAuth,
  (req, res, next) => notificationsController.stream(req, res).catch(next),
);

// Standard notification management routes (supporting both /api/notifications and /api/v1/notifications)
notificationsRouter.get(
  ['/api/v1/notifications', '/api/notifications'],
  requireAuth,
  (req, res, next) => notificationsController.list(req, res).catch(next),
);

notificationsRouter.get(
  ['/api/v1/notifications/unread-count', '/api/notifications/unread-count'],
  requireAuth,
  (req, res, next) => notificationsController.unreadCount(req, res).catch(next),
);

// Mark read: both PATCH and POST supported
notificationsRouter.patch(
  ['/api/v1/notifications/:id/read', '/api/notifications/:id/read'],
  requireAuth,
  (req, res, next) => notificationsController.markRead(req, res).catch(next),
);

notificationsRouter.post(
  ['/api/v1/notifications/:id/read', '/api/notifications/:id/read'],
  requireAuth,
  (req, res, next) => notificationsController.markRead(req, res).catch(next),
);

// Mark all read: both PATCH and POST supported
notificationsRouter.patch(
  ['/api/v1/notifications/read-all', '/api/notifications/read-all'],
  requireAuth,
  (req, res, next) => notificationsController.markAllRead(req, res).catch(next),
);

notificationsRouter.post(
  ['/api/v1/notifications/read-all', '/api/notifications/read-all'],
  requireAuth,
  (req, res, next) => notificationsController.markAllRead(req, res).catch(next),
);

// Delete notification
notificationsRouter.delete(
  ['/api/v1/notifications/:id', '/api/notifications/:id'],
  requireAuth,
  (req, res, next) => notificationsController.delete(req, res).catch(next),
);

// Optional create notification
notificationsRouter.post(
  ['/api/v1/notifications', '/api/notifications'],
  requireAuth,
  (req, res, next) => notificationsController.create(req, res).catch(next),
);

// Notification preferences
notificationsRouter.get(
  ['/api/v1/notification-preferences', '/api/notification-preferences'],
  requireAuth,
  (req, res, next) => notificationsController.getPreferences(req, res).catch(next),
);

notificationsRouter.put(
  ['/api/v1/notification-preferences', '/api/notification-preferences'],
  requireAuth,
  (req, res, next) => notificationsController.updatePreferences(req, res).catch(next),
);
