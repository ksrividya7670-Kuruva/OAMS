import { Router, type Request, type Response } from 'express';
import { checkDbHealth } from '../core/db.js';
import { checkRedisHealth } from '../core/redis.js';
import type { HealthResponse, ApiSuccessResponse } from '@oams/shared';

export const healthRouter: Router = Router();

healthRouter.get('/health', async (_req: Request, res: Response) => {
  const [dbHealth, redisHealth] = await Promise.all([checkDbHealth(), checkRedisHealth()]);

  const isHealthy = dbHealth.status === 'ok' && redisHealth.status === 'ok';
  const isDegraded = !isHealthy && (dbHealth.status === 'ok' || redisHealth.status === 'ok');
  const overallStatus = isHealthy ? 'ok' : isDegraded ? 'degraded' : 'error';

  const healthData: HealthResponse = {
    status: overallStatus,
    uptimeSec: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    services: {
      database: dbHealth,
      redis: redisHealth,
    },
  };

  const response: ApiSuccessResponse<HealthResponse> = {
    success: true,
    data: healthData,
  };

  // HTTP 200 if ok or degraded, 503 if completely down
  const statusCode = overallStatus === 'error' ? 503 : 200;
  res.status(statusCode).json(response);
});
