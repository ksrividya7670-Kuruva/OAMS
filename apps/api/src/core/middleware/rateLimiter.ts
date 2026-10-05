import type { Request, Response, NextFunction } from 'express';
import { redis } from '../redis.js';
import { logger } from '../logger.js';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  prefix: string;
  keyGenerator?: (req: Request) => string;
  message?: string;
}

// In-memory fallback bucket for environments where Redis is disconnected or during tests
interface MemoryRecord {
  count: number;
  resetAt: number;
}
const memoryStore = new Map<string, MemoryRecord>();

// Clean up expired in-memory rate limit records periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (record.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}, 60000).unref();

export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    prefix,
    keyGenerator = (req: Request) => req.ip || req.socket.remoteAddress || 'unknown-ip',
    message = 'Too many requests. Please try again later.',
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip rate-limiting during standard unit tests if header X-Skip-Rate-Limit is provided
    if (process.env.NODE_ENV === 'test' && req.headers['x-skip-rate-limit'] === 'true') {
      return next();
    }

    const key = `${prefix}:${keyGenerator(req)}`;
    const now = Date.now();
    let currentCount = 0;
    let resetTimeMs = now + windowMs;

    let useMemory = true;

    // Attempt Redis if ready
    if (redis.status === 'ready') {
      try {
        const redisKey = `ratelimit:${key}`;
        const multi = redis.multi();
        multi.incr(redisKey);
        multi.pttl(redisKey);
        const results = await multi.exec();

        if (results && results[0] && results[1]) {
          const [errIncr, count] = results[0];
          const [errTtl, ttl] = results[1];

          if (!errIncr && typeof count === 'number') {
            currentCount = count;
            useMemory = false;

            const ttlMs = typeof ttl === 'number' && ttl > 0 ? ttl : windowMs;
            if (currentCount === 1 || ttlMs <= 0) {
              await redis.pexpire(redisKey, windowMs);
              resetTimeMs = now + windowMs;
            } else {
              resetTimeMs = now + ttlMs;
            }
          }
        }
      } catch (err) {
        logger.warn({ err }, 'Redis rate limit error, falling back to memory store');
        useMemory = true;
      }
    }

    // In-memory fallback
    if (useMemory) {
      let record = memoryStore.get(key);
      if (!record || record.resetAt <= now) {
        record = { count: 1, resetAt: now + windowMs };
      } else {
        record.count += 1;
      }
      memoryStore.set(key, record);
      currentCount = record.count;
      resetTimeMs = record.resetAt;
    }

    const remaining = Math.max(0, max - currentCount);
    const resetSec = Math.ceil((resetTimeMs - now) / 1000);

    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSec);

    if (currentCount > max) {
      res.setHeader('Retry-After', resetSec);
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message,
          retryAfterSec: resetSec,
        },
      });
      return;
    }

    next();
  };
}

/**
 * Reset memory store — useful for isolated tests
 */
export function resetRateLimitStore(): void {
  memoryStore.clear();
}

/**
 * §17.3 Rate Limits:
 * - Login / OTP: 10 per 15 min per IP
 * - Public requests: 20 per hour per user
 * - Slot search: 60 per min per user
 * - General API: 300 per min per user
 */

export const authRateLimiter = createRateLimiter({
  prefix: 'auth',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'ip',
  message: 'Too many authentication attempts. Please try again after 15 minutes.',
});

export const publicRequestsRateLimiter = createRateLimiter({
  prefix: 'public_requests',
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  keyGenerator: (req) => req.user?.id || req.ip || 'req',
  message: 'Public request limit exceeded. Maximum 20 requests per hour.',
});

export const slotSearchRateLimiter = createRateLimiter({
  prefix: 'slot_search',
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  keyGenerator: (req) => req.user?.id || req.ip || 'slot',
  message: 'Slot search limit exceeded. Maximum 60 searches per minute.',
});

export const generalApiRateLimiter = createRateLimiter({
  prefix: 'general_api',
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  keyGenerator: (req) => req.user?.id || req.ip || 'api',
  message: 'API rate limit exceeded. Maximum 300 requests per minute.',
});
