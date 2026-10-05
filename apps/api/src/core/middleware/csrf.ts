import type { Request, Response, NextFunction } from 'express';

/**
 * CSRF Protection Middleware (§17.1)
 * Enforces `X-Requested-With: oams` header on state-changing or token-rotating endpoints
 * such as refresh and logout to prevent cross-site request forgery attacks.
 */
export function requireCsrfHeader(req: Request, res: Response, next: NextFunction): void {
  const headerValue = req.headers['x-requested-with'];

  if (!headerValue || (typeof headerValue === 'string' && headerValue.toLowerCase() !== 'oams')) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Missing or invalid X-Requested-With CSRF protection header. Must be "oams".',
      },
    });
    return;
  }

  next();
}
