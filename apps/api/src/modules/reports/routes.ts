import { Router } from 'express';
import { reportsController } from './controller.js';
import { requireAuth, requirePermission } from '../../core/auth/middleware.js';
import { Permission } from '@oams/shared';

export const reportsRouter: Router = Router();

reportsRouter.use('/api/v1/reports', requireAuth, requirePermission(Permission.REPORT_READ));

reportsRouter.get('/api/v1/reports/overview', (req, res, next) =>
  reportsController.getOverview(req, res).catch(next),
);

reportsRouter.get('/api/v1/reports/export', (req, res, next) =>
  reportsController.exportCsv(req, res).catch(next),
);
