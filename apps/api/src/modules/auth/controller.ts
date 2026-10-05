import type { Request, Response } from 'express';
import { authService } from './service.js';
import {
  requestOtpSchema,
  verifyOtpSchema,
  breakGlassLoginSchema,
  type ApiSuccessResponse,
  type AuthResponse,
} from '@oams/shared';
import { config } from '../../core/config.js';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export class AuthController {
  async requestOtp(req: Request, res: Response): Promise<void> {
    const input = requestOtpSchema.parse(req.body);
    const result = await authService.requestEmailOtp(input.email, req.correlationId, req.ip);
    res.json({ success: true, data: result });
  }

  async verifyOtp(req: Request, res: Response): Promise<void> {
    const input = verifyOtpSchema.parse(req.body);
    const session = await authService.verifyEmailOtp(
      input.email,
      input.code,
      req.correlationId,
      req.ip,
      req.headers['user-agent'],
    );

    setRefreshCookie(res, session.rawRefreshToken);

    const response: ApiSuccessResponse<AuthResponse> = {
      success: true,
      data: {
        user: session.user,
        accessToken: session.accessToken,
        expiresInSec: session.expiresInSec,
      },
    };
    res.json(response);
  }

  async breakGlass(req: Request, res: Response): Promise<void> {
    const input = breakGlassLoginSchema.parse(req.body);
    const session = await authService.breakGlassLogin(
      input.email,
      input.password,
      req.correlationId,
      req.ip,
      req.headers['user-agent'],
    );

    setRefreshCookie(res, session.rawRefreshToken);

    const response: ApiSuccessResponse<AuthResponse> = {
      success: true,
      data: {
        user: session.user,
        accessToken: session.accessToken,
        expiresInSec: session.expiresInSec,
      },
    };
    res.json(response);
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const token = req.cookies.refreshToken || req.body.refreshToken;
    if (!token) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Refresh token required' },
      });
      return;
    }

    const session = await authService.refreshToken(
      token,
      req.correlationId,
      req.ip,
      req.headers['user-agent'],
    );

    setRefreshCookie(res, session.rawRefreshToken);

    const response: ApiSuccessResponse<AuthResponse> = {
      success: true,
      data: {
        user: session.user,
        accessToken: session.accessToken,
        expiresInSec: session.expiresInSec,
      },
    };
    res.json(response);
  }

  async logout(req: Request, res: Response): Promise<void> {
    const token = req.cookies.refreshToken || req.body.refreshToken;
    if (token) {
      await authService.logout(token);
    }
    res.clearCookie('refreshToken', { path: '/api/v1/auth' });
    res.json({ success: true, data: { message: 'Logged out successfully' } });
  }

  async getMe(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: req.user });
  }
}

export const authController = new AuthController();
