import { Router } from 'express';
import { schedulingController } from './controller.js';
import { requireAuth } from '../../core/auth/middleware.js';
import { slotSearchRateLimiter } from '../../core/middleware/rateLimiter.js';

export const schedulingRouter: Router = Router();

schedulingRouter.use('/api/v1/scheduling', requireAuth);

schedulingRouter.post('/api/v1/scheduling/check', (req, res, next) =>
  schedulingController.checkConflicts(req, res).catch(next),
);

schedulingRouter.post('/api/v1/scheduling/slots', slotSearchRateLimiter, (req, res, next) =>
  schedulingController.recommendSlots(req, res).catch(next),
);
