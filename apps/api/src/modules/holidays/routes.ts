import { Router } from 'express';
import { holidaysController } from './controller.js';
import { requireAuth, requirePermission } from '../../core/auth/middleware.js';
import { Permission } from '@oams/shared';

export const holidaysRouter: Router = Router();

holidaysRouter.use('/api/v1/holidays', requireAuth);

holidaysRouter.get('/api/v1/holidays', (req, res, next) =>
  holidaysController.list(req, res).catch(next),
);

holidaysRouter.post(
  '/api/v1/holidays',
  requirePermission(Permission.HOLIDAY_MANAGE),
  (req, res, next) => holidaysController.create(req, res).catch(next),
);

holidaysRouter.delete(
  '/api/v1/holidays/:id',
  requirePermission(Permission.HOLIDAY_MANAGE),
  (req, res, next) => holidaysController.delete(req, res).catch(next),
);
