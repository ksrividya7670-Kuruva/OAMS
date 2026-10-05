import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/core/db.js';
import { redis } from '../src/core/redis.js';

describe('Health & Error Handling API', () => {
  afterAll(async () => {
    // Clean up connection handles if any were opened
    try {
      await redis.quit();
    } catch {
      // ignore in tests
    }
    try {
      await db.destroy();
    } catch {
      // ignore in tests
    }
  });

  describe('GET /health', () => {
    it('should return 200 or 503 with standard health check envelope', async () => {
      const response = await request(app).get('/health');

      expect([200, 503]).toContain(response.status);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.headers['x-request-id']).toBeDefined();

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('uptimeSec');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('version');
      expect(response.body.data).toHaveProperty('services');
      expect(response.body.data.services).toHaveProperty('database');
      expect(response.body.data.services).toHaveProperty('redis');
    });

    it('should attach unique x-request-id headers', async () => {
      const res1 = await request(app).get('/health');
      const res2 = await request(app).get('/health');

      expect(res1.headers['x-request-id']).toBeDefined();
      expect(res2.headers['x-request-id']).toBeDefined();
      expect(res1.headers['x-request-id']).not.toEqual(res2.headers['x-request-id']);
    });
  });

  describe('404 Not Found Handling', () => {
    it('should return 404 with standard error envelope for unknown routes', async () => {
      const response = await request(app).get('/api/unknown-endpoint-404');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found: GET /api/unknown-endpoint-404',
        },
      });
      expect(response.headers['x-request-id']).toBeDefined();
    });
  });
});
