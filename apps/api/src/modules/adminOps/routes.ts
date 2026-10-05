import { Router } from 'express';
import { adminOpsController } from './controller.js';
import { requireAuth } from '../../core/auth/middleware.js';
import { RoleCode } from '@oams/shared';

export const adminOpsRouter: Router = Router();

const requireAdmin = (req: any, res: any, next: any) => {
  if (
    req.user?.roles?.includes(RoleCode.SUPER_ADMIN) ||
    req.user?.roles?.includes(RoleCode.APPOINTMENT_ADMIN)
  ) {
    return next();
  }
  return res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN', message: 'Administrator privileges required for ops console' },
  });
};

adminOpsRouter.use('/api/v1/admin/ops', requireAuth, requireAdmin);

adminOpsRouter.get('/api/v1/admin/ops', (req, res, next) =>
  adminOpsController.getOverview(req, res).catch(next),
);

adminOpsRouter.post('/api/v1/admin/ops/retry-delivery/:id', (req, res, next) =>
  adminOpsController.retryDelivery(req, res).catch(next),
);

adminOpsRouter.post('/api/v1/admin/ops/retry-sync/:id', (req, res, next) =>
  adminOpsController.retrySync(req, res).catch(next),
);

adminOpsRouter.post('/api/v1/admin/ops/run-job/:jobName', (req, res, next) =>
  adminOpsController.runJob(req, res).catch(next),
);
