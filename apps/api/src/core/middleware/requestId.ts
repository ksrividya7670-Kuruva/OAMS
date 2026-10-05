import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

declare global {
  namespace Express {
    interface Request {
      id: string;
      correlationId: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.headers['x-request-id'] as string;
  const requestId = existingId || crypto.randomUUID();

  req.id = requestId;
  req.correlationId = (req.headers['x-correlation-id'] as string) || requestId;

  res.setHeader('x-request-id', requestId);
  res.setHeader('x-correlation-id', req.correlationId);

  next();
}
