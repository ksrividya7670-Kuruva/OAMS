import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError, ErrorCode, type ApiErrorResponse } from '@oams/shared';
import { logger } from '../logger.js';
import { config } from '../config.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // 1. Handled ApiError
  if (err instanceof ApiError) {
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // 2. Zod validation error
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
      code: e.code,
    }));

    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details,
      },
    };
    res.status(400).json(response);
    return;
  }

  // 3. Body-parser payload limit exceeded (413)
  const errStatus = (err as any)?.status || (err as any)?.statusCode;
  if (errStatus === 413) {
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds allowable limit (1MB max)',
      },
    };
    res.status(413).json(response);
    return;
  }

  // 4. Unhandled internal error
  const message = err instanceof Error ? err.message : 'An unexpected error occurred';
  const stack = err instanceof Error ? err.stack : undefined;

  logger.error(
    {
      err,
      requestId: req.id,
      correlationId: req.correlationId,
      url: req.originalUrl,
      method: req.method,
    },
    `Unhandled error: ${message}`,
  );

  const response: ApiErrorResponse = {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: config.NODE_ENV === 'production' ? 'Internal server error' : message,
      details: config.NODE_ENV === 'development' ? [{ message: stack || message }] : undefined,
    },
  };

  res.status(500).json(response);
}

export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code: ErrorCode.NOT_FOUND,
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  };
  res.status(404).json(response);
}
