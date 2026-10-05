import { Router } from 'express';
import { calendarsController } from './controller.js';
import { requireAuth } from '../../core/auth/middleware.js';

export const calendarsRouter: Router = Router();

calendarsRouter.use('/api/v1/calendar-events', requireAuth);
calendarsRouter.use('/api/v1/officials/:officialId/personal-access', requireAuth);

calendarsRouter.get('/api/v1/calendar-events', (req, res, next) =>
  calendarsController.listEvents(req, res).catch(next),
);

calendarsRouter.post('/api/v1/calendar-events', (req, res, next) =>
  calendarsController.createEvent(req, res).catch(next),
);

calendarsRouter.patch('/api/v1/calendar-events/:id', (req, res, next) =>
  calendarsController.updateEvent(req, res).catch(next),
);

calendarsRouter.delete('/api/v1/calendar-events/:id', (req, res, next) =>
  calendarsController.deleteEvent(req, res).catch(next),
);

calendarsRouter.post('/api/v1/officials/:officialId/personal-access/:staffId', (req, res, next) =>
  calendarsController.updatePersonalAccess(req, res).catch(next),
);
