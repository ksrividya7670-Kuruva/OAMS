import { Router } from 'express';
import { roomsController } from './controller.js';
import { requireAuth, requirePermission } from '../../core/auth/middleware.js';
import { Permission } from '@oams/shared';

export const roomsRouter: Router = Router();

roomsRouter.use('/api/v1/rooms', requireAuth);

roomsRouter.get('/api/v1/rooms', (req, res, next) => roomsController.list(req, res).catch(next));

roomsRouter.get('/api/v1/rooms/:id', (req, res, next) =>
  roomsController.getById(req, res).catch(next),
);

roomsRouter.post('/api/v1/rooms', requirePermission(Permission.ROOM_MANAGE), (req, res, next) =>
  roomsController.create(req, res).catch(next),
);

roomsRouter.patch(
  '/api/v1/rooms/:id',
  requirePermission(Permission.ROOM_MANAGE),
  (req, res, next) => roomsController.update(req, res).catch(next),
);
