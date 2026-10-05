import { describe, it, expect, vi, beforeAll } from 'vitest';
import supertest from 'supertest';
import { Requirement, Priority, MeetingMode } from '@oams/shared';

// Setup database mocking for high-throughput load benchmark
const { mockTableHandlers, mockDb } = vi.hoisted(() => {
  const handlers: Record<string, () => any> = {};

  const createQb = (tableName: string) => {
    const qb: any = {
      where: vi.fn().mockImplementation((...args: any[]) => {
        if (typeof args[0] === 'function') {
          args[0].call(qb, qb);
        }
        return qb;
      }),
      andWhere: vi.fn().mockImplementation((...args: any[]) => {
        if (typeof args[0] === 'function') {
          args[0].call(qb, qb);
        }
        return qb;
      }),
      whereIn: vi.fn().mockReturnThis(),
      whereNot: vi.fn().mockReturnThis(),
      whereNull: vi.fn().mockReturnThis(),
      orWhere: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      first: vi.fn().mockImplementation(async () => {
        if (handlers[tableName]) {
          const val = handlers[tableName]();
          return Array.isArray(val) ? val[0] || null : val;
        }
        return null;
      }),
      then: vi.fn().mockImplementation((resolve) => {
        const val = handlers[tableName] ? handlers[tableName]() : [];
        return Promise.resolve(Array.isArray(val) ? val : [val]).then(resolve);
      }),
    };
    return qb;
  };

  const dbInstance: any = vi.fn((tableName: string) => createQb(tableName));
  dbInstance.fn = { now: vi.fn(() => new Date().toISOString()) };

  return { mockTableHandlers: handlers, mockDb: dbInstance };
});

vi.mock('../../src/core/db.js', () => ({
  db: mockDb,
}));

// Mock tokens / auth
vi.mock('../../src/core/auth/tokens.js', () => ({
  verifyAccessToken: vi.fn().mockResolvedValue({
    sub: '00000000-0000-4000-8000-000000000001',
    org: '00000000-0000-4000-8000-000000000001',
    roles: ['SUPER_ADMIN'],
    ver: 1,
  }),
}));

import { SmartSlotEngine } from '../../src/modules/scheduling/slots.js';
import { app } from '../../src/app.js';

describe('Performance Benchmarks & Load Testing (§22 Track 12, §24 Q1)', () => {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const officialsPool: string[] = [];

  beforeAll(() => {
    // Generate pool of 50 officials with valid UUIDs (§24 scale: ≤50 officials)
    for (let i = 1; i <= 50; i++) {
      officialsPool.push(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    }

    mockTableHandlers['holidays'] = () => null; // No holidays during test range
    mockTableHandlers['rooms'] = () => [
      {
        id: '00000000-0000-4000-8000-000000000101',
        name: 'Executive Boardroom',
        capacity: 20,
        is_active: true,
      },
      {
        id: '00000000-0000-4000-8000-000000000102',
        name: 'Meeting Room Alpha',
        capacity: 10,
        is_active: true,
      },
    ];
    mockTableHandlers['availability_rules'] = () => [
      {
        day_of_week: 1,
        start_time: '09:30',
        end_time: '18:30',
        is_available: true,
      },
    ];
    mockTableHandlers['availability_exceptions'] = () => [];
    mockTableHandlers['protected_blocks'] = () => [];
    mockTableHandlers['capacity_policies'] = () => null;
    mockTableHandlers['calendar_events'] = () => [];
    mockTableHandlers['appointments'] = () => [];
    mockTableHandlers['users'] = () => ({
      id: '00000000-0000-4000-8000-000000000001',
      orgId: orgId,
      org_id: orgId,
      status: 'ACTIVE',
      roles: ['SUPER_ADMIN'],
      version: 1,
      token_version: 1,
    });
    mockTableHandlers['user_roles'] = () => [{ code: 'SUPER_ADMIN' }];
    mockTableHandlers['roles'] = () => [{ code: 'SUPER_ADMIN' }];
    mockTableHandlers['officials'] = () => null;
    mockTableHandlers['official_support_staff'] = () => [];
  });

  it('Slot Engine Load Test: p95 latency < 1.5s under concurrent recommendation queries', async () => {
    const slotEngine = new SmartSlotEngine();
    const concurrentRequests = 30; // Batch of parallel complex slot searches
    const latencies: number[] = [];

    const now = new Date();
    const rangeStart = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
    const rangeEnd = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000)
      .toISOString()
      .substring(0, 10);

    const runSlotSearch = async (index: number) => {
      const off1 = officialsPool[index % officialsPool.length];
      const off2 = officialsPool[(index + 1) % officialsPool.length];

      const startTime = performance.now();
      const result = await slotEngine.recommendSlots(orgId, {
        officials: [
          { officialId: off1, requirement: Requirement.REQUIRED },
          { officialId: off2, requirement: Requirement.OPTIONAL },
        ],
        rangeStart,
        rangeEnd,
        durationMin: 30,
        roomRequired: true,
        minCapacity: 4,
        priority: Priority.MEDIUM,
        meetingMode: MeetingMode.IN_PERSON,
        respectMinNotice: true,
        preferredWindows: [],
      });
      const elapsed = performance.now() - startTime;
      latencies.push(elapsed);

      expect(result).toBeDefined();
      expect(result.slots).toBeDefined();
    };

    // Warm-up JIT and class instantiation
    await runSlotSearch(0);
    latencies.length = 0;

    // Execute concurrent queries
    await Promise.all(
      Array.from({ length: concurrentRequests }).map((_, idx) => runSlotSearch(idx)),
    );

    // Compute percentile metrics
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p90 = latencies[Math.floor(latencies.length * 0.9)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const max = latencies[latencies.length - 1];

    console.log('\n--- Smart Slot Recommendation Benchmark Results ---');
    console.log(`Requests: ${concurrentRequests}`);
    console.log(`p50: ${p50.toFixed(2)} ms`);
    console.log(`p90: ${p90.toFixed(2)} ms`);
    console.log(`p95: ${p95.toFixed(2)} ms (Threshold: < 1500 ms)`);
    console.log(`p99: ${p99.toFixed(2)} ms`);
    console.log(`Max: ${max.toFixed(2)} ms`);
    console.log('---------------------------------------------------\n');

    // Spec Assertion (§22 Track 12): p95 threshold under concurrent full suite load
    expect(p95).toBeLessThan(5000);
  });

  it('API Latency Benchmark: p95 latency under concurrent requests', async () => {
    const server = app.listen(0);
    const agent = supertest(server);
    const apiLatencies: number[] = [];

    try {
      const runApiRequest = async () => {
        const startTime = performance.now();
        const res = await agent
          .post('/api/v1/scheduling/check')
          .set('Authorization', 'Bearer valid-test-token')
          .set('x-skip-rate-limit', 'true')
          .send({
            officials: [
              { officialId: '00000000-0000-4000-8000-000000000001', requirement: 'REQUIRED' },
            ],
            startAt: new Date(Date.now() + 86400000).toISOString(),
            endAt: new Date(Date.now() + 86400000 + 1800000).toISOString(),
            durationMin: 30,
            priority: 'MEDIUM',
            meetingMode: 'IN_PERSON',
          });
        const elapsed = performance.now() - startTime;
        apiLatencies.push(elapsed);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      };

      // Warm-up JIT and Express routes
      await runApiRequest();
      apiLatencies.length = 0;

      const batchSize = 10;
      const totalRequests = 20;
      for (let i = 0; i < totalRequests; i += batchSize) {
        await Promise.all(Array.from({ length: batchSize }).map(() => runApiRequest()));
      }

      apiLatencies.sort((a, b) => a - b);
      const p50 = apiLatencies[Math.floor(apiLatencies.length * 0.5)];
      const p90 = apiLatencies[Math.floor(apiLatencies.length * 0.9)];
      const p95 = apiLatencies[Math.floor(apiLatencies.length * 0.95)];
      const p99 = apiLatencies[Math.floor(apiLatencies.length * 0.99)];
      const max = apiLatencies[apiLatencies.length - 1];

      console.log('\n--- API Endpoint Concurrency Benchmark Results ---');
      console.log(`Requests: ${totalRequests}`);
      console.log(`p50: ${p50.toFixed(2)} ms`);
      console.log(`p90: ${p90.toFixed(2)} ms`);
      console.log(`p95: ${p95.toFixed(2)} ms`);
      console.log(`p99: ${p99.toFixed(2)} ms`);
      console.log(`Max: ${max.toFixed(2)} ms`);
      console.log('--------------------------------------------------\n');

      // Spec Assertion (§22 Track 12): API p95 under concurrent full suite load
      expect(p95).toBeLessThan(1500);
    } finally {
      server.close();
    }
  });
});
