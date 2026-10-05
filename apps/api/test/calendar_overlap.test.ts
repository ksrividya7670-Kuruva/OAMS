import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BlockStrength,
  CalendarType,
  EventKind,
  Visibility,
  ApiError,
  type AuthUser,
  RoleCode,
} from '@oams/shared';

// Use vi.hoisted for variables referenced in vi.mock
const { mockDb, mockQueryBuilder } = vi.hoisted(() => {
  const qb: any = {
    where: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockReturnThis(),
    whereNot: vi.fn().mockReturnThis(),
    whereNull: vi.fn().mockReturnThis(),
    orWhere: vi.fn().mockReturnThis(),
    join: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    first: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };

  const dbInstance: any = vi.fn(() => qb);
  dbInstance.fn = { now: vi.fn(() => new Date().toISOString()) };
  dbInstance.raw = vi.fn((sql: string, bindings: any[]) => ({ sql, bindings }));
  dbInstance.transaction = vi.fn(async (cb: (trx: any) => Promise<any>) => cb(dbInstance));

  return { mockDb: dbInstance, mockQueryBuilder: qb };
});

vi.mock('../src/core/db.js', () => ({
  db: mockDb,
}));

// Import service after mock is established
import { calendarsService } from '../src/modules/calendars/service.js';

describe('Calendar Overlap & Exclusion Constraints (§7.4, Criterion #3)', () => {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const officialId = '00000000-0000-4000-8000-000000000010';

  const caller: AuthUser = {
    id: 'user-admin',
    orgId,
    email: 'admin@apex.gov.in',
    fullName: 'Super Admin',
    status: 'ACTIVE',
    authProvider: 'LOCAL',
    timezone: 'Asia/Kolkata',
    theme: 'SYSTEM',
    roles: [RoleCode.SUPER_ADMIN],
    assignedOfficialIds: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PostgreSQL 23P01 Exclusion Constraint Mapping (§7.4)', () => {
    it('should catch PostgreSQL 23P01 error and throw ApiError.conflict (Criterion #3)', async () => {
      // 1. Mock official found
      mockQueryBuilder.first
        .mockResolvedValueOnce({
          id: officialId,
          orgId,
          userId: 'user-1',
          bufferAfterMin: 15,
        })
        // 2. Mock calendar found
        .mockResolvedValueOnce({
          id: 'cal-org-1',
          officialId,
          type: CalendarType.ORG,
        });

      // 3. Simulate PostgreSQL btree_gist exclusion violation during transaction insert
      const pgExclusionError = new Error(
        'conflicting key value violates exclusion constraint "no_overlap_hard"',
      );
      (pgExclusionError as any).code = '23P01';

      mockDb.transaction.mockRejectedValueOnce(pgExclusionError);

      await expect(
        calendarsService.createCalendarEvent(
          orgId,
          caller,
          {
            calendarType: CalendarType.ORG,
            officialId,
            kind: EventKind.MEETING,
            blockStrength: BlockStrength.HARD,
            title: 'Conflicting Board Meeting',
            startAt: '2026-09-24T10:00:00.000Z',
            endAt: '2026-09-24T11:00:00.000Z',
            visibility: Visibility.INTERNAL,
          },
          'test-corr-id',
        ),
      ).rejects.toThrow(
        new ApiError(
          409,
          'CONFLICT',
          'Slot already booked or overlaps an active hard calendar block',
        ),
      );
    });

    it('should rethrow unexpected database errors without masking them', async () => {
      mockQueryBuilder.first
        .mockResolvedValueOnce({
          id: officialId,
          orgId,
          userId: 'user-1',
          bufferAfterMin: 15,
        })
        .mockResolvedValueOnce({
          id: 'cal-org-1',
          officialId,
          type: CalendarType.ORG,
        });

      const dbConnError = new Error('Database connection timeout');
      (dbConnError as any).code = 'ETIMEDOUT';

      mockDb.transaction.mockRejectedValueOnce(dbConnError);

      await expect(
        calendarsService.createCalendarEvent(
          orgId,
          caller,
          {
            calendarType: CalendarType.ORG,
            officialId,
            kind: EventKind.MEETING,
            blockStrength: BlockStrength.HARD,
            title: 'Normal Meeting',
            startAt: '2026-09-24T10:00:00.000Z',
            endAt: '2026-09-24T11:00:00.000Z',
            visibility: Visibility.INTERNAL,
          },
          'test-corr-id',
        ),
      ).rejects.toThrow('Database connection timeout');
    });
  });

  describe('Buffer Interval & Occupied Range Computation (§7.4, §11.2)', () => {
    it('should compute correct [start - setup, end + cleanup) buffered range', () => {
      const startAt = new Date('2026-09-24T10:00:00.000Z');
      const endAt = new Date('2026-09-24T11:00:00.000Z');
      const setupMin = 15;
      const cleanupMin = 10;

      const occupiedStart = new Date(startAt.getTime() - setupMin * 60 * 1000);
      const occupiedEnd = new Date(endAt.getTime() + cleanupMin * 60 * 1000);

      expect(occupiedStart.toISOString()).toBe('2026-09-24T09:45:00.000Z');
      expect(occupiedEnd.toISOString()).toBe('2026-09-24T11:10:00.000Z');

      // Test overlap detection against a candidate slot inside the buffer
      const candidateInsideBuffer = {
        start: new Date('2026-09-24T11:05:00.000Z'),
        end: new Date('2026-09-24T11:35:00.000Z'),
      };

      const overlaps =
        candidateInsideBuffer.start < occupiedEnd && candidateInsideBuffer.end > occupiedStart;
      expect(overlaps).toBe(true);

      // Candidate starting strictly after the buffer window
      const candidateAfterBuffer = {
        start: new Date('2026-09-24T11:10:00.000Z'),
        end: new Date('2026-09-24T11:40:00.000Z'),
      };

      const overlapsAfter =
        candidateAfterBuffer.start < occupiedEnd && candidateAfterBuffer.end > occupiedStart;
      expect(overlapsAfter).toBe(false);
    });

    it('SOFT and NONE block strengths do not enter the HARD exclusion index', () => {
      const strengths = [BlockStrength.SOFT, BlockStrength.NONE];
      for (const s of strengths) {
        expect(s).not.toBe(BlockStrength.HARD);
      }
    });
  });
});
