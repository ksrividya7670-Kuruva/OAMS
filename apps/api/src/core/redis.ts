import { Redis } from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';
import type { ServiceHealth } from './db.js';

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 3) {
      return null; // Stop retrying after 3 attempts in health check
    }
    return Math.min(times * 100, 1000);
  },
});

redis.on('error', (err) => {
  logger.warn({ err: err.message }, 'Redis connection warning');
});

export async function checkRedisHealth(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    if (redis.status === 'wait') {
      await redis.connect();
    }
    const pong = await redis.ping();
    if (pong === 'PONG') {
      return {
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    }
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: `Unexpected ping response: ${pong}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: message,
    };
  }
}
