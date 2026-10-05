import { Router } from 'express';
import { authController } from './controller.js';
import { requireAuth } from '../../core/auth/middleware.js';
import { requireCsrfHeader } from '../../core/middleware/csrf.js';
import { authRateLimiter } from '../../core/middleware/rateLimiter.js';

export const authRouter: Router = Router();

authRouter.post('/api/v1/auth/otp/request', authRateLimiter, (req, res, next) =>
  authController.requestOtp(req, res).catch(next),
);

authRouter.post('/api/v1/auth/otp/verify', authRateLimiter, (req, res, next) =>
  authController.verifyOtp(req, res).catch(next),
);

authRouter.post('/api/v1/auth/break-glass', authRateLimiter, (req, res, next) =>
  authController.breakGlass(req, res).catch(next),
);

authRouter.post('/api/v1/auth/refresh', requireCsrfHeader, (req, res, next) =>
  authController.refresh(req, res).catch(next),
);

authRouter.post('/api/v1/auth/logout', requireCsrfHeader, (req, res, next) =>
  authController.logout(req, res).catch(next),
);

authRouter.get('/api/v1/auth/me', requireAuth, (req, res, next) =>
  authController.getMe(req, res).catch(next),
);
