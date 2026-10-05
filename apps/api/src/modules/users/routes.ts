import { Router } from 'express';
import { usersController } from './controller.js';
import { requireAuth, requirePermission } from '../../core/auth/middleware.js';
import { Permission } from '@oams/shared';

export const usersRouter: Router = Router();

usersRouter.use('/api/v1/users', requireAuth);

usersRouter.get('/api/v1/users', requirePermission(Permission.USER_MANAGE), (req, res, next) =>
  usersController.list(req, res).catch(next),
);

usersRouter.post('/api/v1/users', requirePermission(Permission.USER_MANAGE), (req, res, next) =>
  usersController.create(req, res).catch(next),
);

usersRouter.get('/api/v1/users/:id', (req, res, next) =>
  usersController.getById(req, res).catch(next),
);

usersRouter.patch('/api/v1/users/:id', (req, res, next) =>
  usersController.update(req, res).catch(next),
);

usersRouter.post(
  '/api/v1/users/:id/disable',
  requirePermission(Permission.USER_MANAGE),
  (req, res, next) => usersController.disable(req, res).catch(next),
);

usersRouter.put(
  '/api/v1/users/:id/roles',
  requirePermission(Permission.ROLE_MANAGE),
  (req, res, next) => usersController.assignRoles(req, res).catch(next),
);

usersRouter.get('/api/v1/roles', (req, res, next) =>
  usersController.listRoles(req, res).catch(next),
);

usersRouter.get('/api/v1/departments', (req, res, next) =>
  usersController.listDepartments(req, res).catch(next),
);

usersRouter.post(
  '/api/v1/departments',
  requirePermission(Permission.SETTINGS_MANAGE),
  (req, res, next) => usersController.createDepartment(req, res).catch(next),
);
