import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RoleCode,
  type AuthUser,
  type RescheduleAppointmentInput,
  AppointmentStatus,
  ConflictCode,
} from '@oams/shared';

const { mockTableHandlers, mockDb, insertedRows, updatedRows } = vi.hoisted(() => {
  const handlers: Record<string, () => any> = {};
  const inserted: Record<string, any[]> = {};
  const updated: Record<string, any[]> = {};

  const createQb = (tableName: string) => {
    const qb: any = {
      where: vi.fn().mockImplementation((...args: any[]) => {
        if (typeof args[0] === 'function') {
          args[0].call(qb, qb);
        }
        return qb;
      }),
      whereIn: vi.fn().mockReturnThis(),
      whereNot: vi.fn().mockReturnThis(),
      whereNull: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orWhere: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      first: vi.fn().mockImplementation(async () => {
        if (handlers[tableName]) {
          return handlers[tableName]();
        }
        return null;
      }),
      update: vi.fn().mockImplementation((data: any) => {
        if (!updated[tableName]) updated[tableName] = [];
        updated[tableName].push(data);
        return Promise.resolve(1);
      }),
      insert: vi.fn().mockImplementation((data: any) => {
        if (!inserted[tableName]) inserted[tableName] = [];
        inserted[tableName].push(data);
        return {
          returning: vi.fn().mockImplementation((col: string) => {
            const id = data.id || `gen-${tableName}-${inserted[tableName].length}`;
            return Promise.resolve([{ [col]: id, ...data }]);
          }),
          then: vi.fn().mockImplementation((resolve) => resolve([1])),
        };
      }),
      then: vi.fn().mockImplementation((resolve) => {
        const val = handlers[tableName] ? handlers[tableName]() : [];
        return Promise.resolve(Array.isArray(val) ? val : [val]).then(resolve);
      }),
    };
    return qb;
  };

  const trxInstance: any = vi.fn((tableName: string) => createQb(tableName));
  trxInstance.fn = { now: vi.fn(() => new Date().toISOString()) };
  trxInstance.raw = vi.fn().mockReturnValue('tstzrange');

  const dbInstance: any = vi.fn((tableName: string) => createQb(tableName));
  dbInstance.fn = { now: vi.fn(() => new Date().toISOString()) };
  dbInstance.raw = vi.fn().mockReturnValue('tstzrange');
  dbInstance.transaction = vi
    .fn()
    .mockImplementation(async (callback: (trx: any) => Promise<any>) => {
      return callback(trxInstance);
    });

  return {
    mockTableHandlers: handlers,
    mockDb: dbInstance,
    mockTrx: trxInstance,
    insertedRows: inserted,
    updatedRows: updated,
  };
});

vi.mock('../src/core/db.js', () => ({
  db: mockDb,
}));

vi.mock('../src/core/redis.js', () => ({
  redis: {
    publish: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../src/core/notifications/router.js', () => ({
  routeNotificationEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockCheckConflicts = vi.fn();
vi.mock('../src/modules/scheduling/engine.js', () => ({
  schedulingEngine: {
    checkConflicts: (...args: any[]) => mockCheckConflicts(...args),
  },
}));

import { appointmentsService } from '../src/modules/appointments/service.js';

describe('Track 5: Reschedule Rollback Guarantee (§10.6, §22)', () => {
  const staffUser: AuthUser = {
    id: 'user-pa-1',
    orgId: 'org-apex',
    email: 'pa@apex.local',
    fullName: 'Executive Assistant',
    roles: [RoleCode.PA],
    status: 'ACTIVE',
    authProvider: 'LOCAL',
    timezone: 'Asia/Kolkata',
    theme: 'SYSTEM',
    assignedOfficialIds: ['official-1'],
  };

  const existingAppointment = {
    id: 'apt-100',
    org_id: 'org-apex',
    reference_no: 'APT-2026-000100',
    primary_official_id: 'official-1',
    requester_user_id: 'requester-1',
    subject: 'High Priority Strategic Alignment',
    status: AppointmentStatus.CONFIRMED,
    priority: 'HIGH',
    meeting_mode: 'IN_PERSON',
    duration_min: 30,
    start_at: '2026-10-01T10:00:00.000Z',
    end_at: '2026-10-01T10:30:00.000Z',
    room_id: 'room-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(insertedRows).forEach((k) => delete insertedRows[k]);
    Object.keys(updatedRows).forEach((k) => delete updatedRows[k]);

    mockTableHandlers['appointments'] = () => existingAppointment;
    mockTableHandlers['calendars'] = () => ({
      id: 'cal-official-1',
      official_id: 'official-1',
      type: 'ORG',
    });
    mockTableHandlers['rooms'] = () => ({
      id: 'room-1',
      name: 'Boardroom A',
      capacity: 10,
      is_active: true,
    });
    mockTableHandlers['officials'] = () => ({
      id: 'official-1',
      user_id: 'user-off-1',
      title: 'Director',
    });
  });

  it('should reject reschedule and return 409 SLOT_TAKEN when conflict engine detects hard conflict', async () => {
    mockCheckConflicts.mockResolvedValueOnce({
      bookable: false,
      conflicts: [
        {
          code: ConflictCode.SLOT_TAKEN,
          severity: 'HARD',
          message: 'Official official-1 has a conflicting event at the requested time',
        },
      ],
    });

    const input: RescheduleAppointmentInput = {
      startAt: '2026-10-02T14:00:00.000Z',
      endAt: '2026-10-02T14:30:00.000Z',
      roomId: 'room-1',
      reason: 'Requester requested date shift',
    };

    await expect(appointmentsService.reschedule(staffUser, 'apt-100', input)).rejects.toMatchObject(
      {
        statusCode: 409,
        code: ConflictCode.SLOT_TAKEN,
      },
    );

    // Verify appointment was NOT updated
    expect(updatedRows['appointments']).toBeUndefined();
  });

  it('should catch database exclusion constraint error (23P01) and rollback leaving original booking intact', async () => {
    // Conflict engine passed (e.g. race condition), but DB exclusion constraint throws 23P01
    mockCheckConflicts.mockResolvedValueOnce({
      bookable: true,
      conflicts: [],
    });

    // Mock transaction to throw GiST exclusion constraint error during insertion
    mockDb.transaction.mockImplementationOnce(async () => {
      const dbErr: any = new Error(
        'conflicting key value violates exclusion constraint "no_overlap_hard"',
      );
      dbErr.code = '23P01';
      dbErr.constraint = 'no_overlap_hard';
      throw dbErr;
    });

    const input: RescheduleAppointmentInput = {
      startAt: '2026-10-02T14:00:00.000Z',
      endAt: '2026-10-02T14:30:00.000Z',
      roomId: 'room-1',
      reason: 'Simulated race collision',
    };

    await expect(appointmentsService.reschedule(staffUser, 'apt-100', input)).rejects.toMatchObject(
      {
        statusCode: 409,
        code: ConflictCode.SLOT_TAKEN,
      },
    );

    // Original appointment remains untouched
    expect(existingAppointment.start_at).toBe('2026-10-01T10:00:00.000Z');
    expect(existingAppointment.status).toBe(AppointmentStatus.CONFIRMED);
  });

  it('should successfully reschedule atomically when no conflicts exist', async () => {
    mockCheckConflicts.mockResolvedValueOnce({
      bookable: true,
      conflicts: [],
    });

    const input: RescheduleAppointmentInput = {
      startAt: '2026-10-05T09:00:00.000Z',
      endAt: '2026-10-05T09:30:00.000Z',
      roomId: 'room-1',
      reason: 'Official schedule reorganized',
    };

    await appointmentsService.reschedule(staffUser, 'apt-100', input);

    // Verify appointment was updated
    expect(updatedRows['appointments']).toBeDefined();
    expect(updatedRows['appointments']![0]).toMatchObject({
      start_at: input.startAt,
      end_at: input.endAt,
      room_id: input.roomId,
    });

    // Verify new calendar event was inserted
    expect(insertedRows['calendar_events']).toBeDefined();
    expect(insertedRows['calendar_events']![0]).toMatchObject({
      kind: 'APPOINTMENT',
      status: 'ACTIVE',
      start_at: input.startAt,
      end_at: input.endAt,
    });
  });
});
