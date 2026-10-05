import { Router } from 'express';
import { officialsController } from './controller.js';
import { requireAuth, requirePermission } from '../../core/auth/middleware.js';
import { Permission } from '@oams/shared';

import { db } from '../../core/db.js';

const requireSupportStaffManageOrSelf = async (req: any, res: any, next: any) => {
  if (
    req.user?.permissions?.includes(Permission.SUPPORT_STAFF_MANAGE) ||
    req.user?.roles?.includes('SUPER_ADMIN')
  ) {
    return next();
  }
  const officialId = req.params.id;
  if (officialId) {
    const official = await db('officials').where('id', officialId).first();
    if (official && official.user_id === req.user?.id) {
      return next();
    }
  }
  return res.status(403).json({
    success: false,
    error: {
      code: 'FORBIDDEN',
      message: 'Only the official or an authorized administrator can manage support staff access',
    },
  });
};

export const officialsRouter: Router = Router();

officialsRouter.use('/api/v1/officials', requireAuth);

officialsRouter.get('/api/v1/officials', (req, res, next) =>
  officialsController.list(req, res).catch(next),
);

officialsRouter.post(
  '/api/v1/officials',
  requirePermission(Permission.OFFICIAL_MANAGE),
  (req, res, next) => officialsController.create(req, res).catch(next),
);

officialsRouter.get('/api/v1/officials/:id', (req, res, next) =>
  officialsController.getById(req, res).catch(next),
);

officialsRouter.patch(
  '/api/v1/officials/:id',
  requirePermission(Permission.OFFICIAL_MANAGE),
  (req, res, next) => officialsController.update(req, res).catch(next),
);

officialsRouter.get('/api/v1/officials/:id/support-staff', (req, res, next) =>
  officialsController.listSupportStaff(req, res).catch(next),
);

officialsRouter.post(
  '/api/v1/officials/:id/support-staff',
  requireSupportStaffManageOrSelf,
  (req, res, next) => officialsController.assignSupportStaff(req, res).catch(next),
);

officialsRouter.patch(
  '/api/v1/officials/:id/support-staff/:staffId',
  requireSupportStaffManageOrSelf,
  (req, res, next) => officialsController.updateSupportStaff(req, res).catch(next),
);

officialsRouter.post(
  '/api/v1/officials/:id/personal-access/:staffId',
  requireSupportStaffManageOrSelf,
  (req, res, next) => officialsController.updateSupportStaff(req, res).catch(next),
);

officialsRouter.delete(
  '/api/v1/officials/:id/support-staff/:staffId',
  requireSupportStaffManageOrSelf,
  (req, res, next) => officialsController.removeSupportStaff(req, res).catch(next),
);
