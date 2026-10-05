import { Router } from 'express';
import { privacyController } from './controller.js';
import { requireAuth } from '../../core/auth/middleware.js';
import { RoleCode } from '@oams/shared';

export const privacyRouter: Router = Router();

const requirePrivacyAdmin = (req: any, res: any, next: any) => {
  if (
    req.user?.roles?.includes(RoleCode.SUPER_ADMIN) ||
    req.user?.roles?.includes(RoleCode.APPOINTMENT_ADMIN)
  ) {
    return next();
  }
  return res.status(403).json({
    success: false,
    error: {
      code: 'FORBIDDEN',
      message: 'Administrator privileges required for privacy operations',
    },
  });
};

privacyRouter.use('/api/v1/privacy', requireAuth, requirePrivacyAdmin);

privacyRouter.get('/api/v1/privacy/export', (req, res, next) =>
  privacyController.exportData(req, res).catch(next),
);

privacyRouter.post('/api/v1/privacy/export', (req, res, next) =>
  privacyController.exportData(req, res).catch(next),
);

privacyRouter.post('/api/v1/privacy/erase', (req, res, next) =>
  privacyController.eraseData(req, res).catch(next),
);
