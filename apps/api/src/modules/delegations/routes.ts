import { Router } from 'express';
import { delegationsController } from './controller.js';
import { requireAuth } from '../../core/auth/middleware.js';

export const delegationsRouter: Router = Router();

delegationsRouter.use('/api/v1/officials/:officialId/delegations', requireAuth);

delegationsRouter.get('/api/v1/officials/:officialId/delegations', (req, res, next) =>
  delegationsController.list(req, res).catch(next),
);

delegationsRouter.post('/api/v1/officials/:officialId/delegations', (req, res, next) =>
  delegationsController.create(req, res).catch(next),
);

delegationsRouter.post('/api/v1/officials/:officialId/delegations/:id/revoke', (req, res, next) =>
  delegationsController.revoke(req, res).catch(next),
);

delegationsRouter.delete('/api/v1/officials/:officialId/delegations/:id', (req, res, next) =>
  delegationsController.revoke(req, res).catch(next),
);
