import { Router } from 'express';
import { visitsController } from './controller.js';
import { requireAuth } from '../../core/auth/middleware.js';

export const visitsRouter: Router = Router();

visitsRouter.use('/api/v1/visits', requireAuth);

// Static actions & downloads (must precede /:id)
visitsRouter.get('/api/v1/visits/today.pdf', (req, res, next) =>
  visitsController.downloadTodayPdf(req, res).catch(next),
);

visitsRouter.get('/api/v1/visits/emergency-list', (req, res, next) =>
  visitsController.emergencyList(req, res).catch(next),
);

visitsRouter.all('/api/v1/visits/lookup', (req, res, next) =>
  visitsController.lookup(req, res).catch(next),
);

visitsRouter.post('/api/v1/visits/walk-in', (req, res, next) =>
  visitsController.walkIn(req, res).catch(next),
);

// List visits
visitsRouter.get('/api/v1/visits', (req, res, next) => visitsController.list(req, res).catch(next));

// Detail
visitsRouter.get('/api/v1/visits/:id', (req, res, next) =>
  visitsController.getById(req, res).catch(next),
);

// Lifecycle actions (§15.2, §15.3)
visitsRouter.post('/api/v1/visits/:id/arrive', (req, res, next) =>
  visitsController.arrive(req, res).catch(next),
);

visitsRouter.post('/api/v1/visits/:id/check-in', (req, res, next) =>
  visitsController.checkIn(req, res).catch(next),
);

visitsRouter.post('/api/v1/visits/:id/with-host', (req, res, next) =>
  visitsController.withHost(req, res).catch(next),
);

visitsRouter.post('/api/v1/visits/:id/check-out', (req, res, next) =>
  visitsController.checkOut(req, res).catch(next),
);

visitsRouter.post('/api/v1/visits/:id/deny', (req, res, next) =>
  visitsController.deny(req, res).catch(next),
);
