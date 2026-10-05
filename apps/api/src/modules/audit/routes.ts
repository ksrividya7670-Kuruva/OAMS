import { Router } from 'express';
import { auditController } from './controller.js';
import { requireAuth, requirePermission } from '../../core/auth/middleware.js';
import { Permission } from '@oams/shared';

export const auditRouter: Router = Router();

auditRouter.use('/api/v1/audit', requireAuth, requirePermission(Permission.AUDIT_READ));

auditRouter.get('/api/v1/audit', (req, res, next) => auditController.list(req, res).catch(next));

auditRouter.get('/api/v1/audit/verify', (req, res, next) =>
  auditController.verifyChain(req, res).catch(next),
);
