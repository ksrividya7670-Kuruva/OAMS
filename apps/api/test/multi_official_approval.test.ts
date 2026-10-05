import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RoleCode,
  type AuthUser,
  AppointmentStatus,
  Requirement,
  OfficialDecision,
} from '@oams/shared';

const { mockTableHandlers, mockDb, insertedRows, updatedRows, deletedRows } = vi.hoisted(() => {
  const handlers: Record<string, () => any> = {};
  const inserted: Record<string, any[]> = {};
  const updated: Record<string, any[]> = {};
  const deleted: Record<string, any[]> = {};

  const createQb = (tableName: string) => {
    const qb: any = {
      where: vi.fn().mockImplementation((...args: any[]) => {
        if (typeof args[0] === 'function') {
          args[0].call(qb, qb);
        }
        return qb;
      }),
      whereIn: vi.fn().mockReturnThis(),
      whereNotIn: vi.fn().mockReturnThis(),
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
      del: vi.fn().mockImplementation(() => {
        if (!deleted[tableName]) deleted[tableName] = [];
        deleted[tableName].push(true);
        return Promise.resolve(1);
      }),
      delete: vi.fn().mockImplementation(() => {
        if (!deleted[tableName]) deleted[tableName] = [];
        deleted[tableName].push(true);
        return Promise.resolve(1);
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
    deletedRows: deleted,
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

import { appointmentsService } from '../src/modules/appointments/service.js';

describe('Track 5: Multi-Official Consensus & Approval Rules (§10.5, §22)', () => {
  const paUser: AuthUser = {
    id: 'user-pa-1',
    orgId: 'org-apex',
    email: 'pa@apex.local',
    fullName: 'Executive Assistant',
    roles: [RoleCode.EA, RoleCode.PA],
    status: 'ACTIVE',
    authProvider: 'LOCAL',
    timezone: 'Asia/Kolkata',
    theme: 'SYSTEM',
    assignedOfficialIds: ['official-primary', 'official-secondary'],
  };

  const baseAppointment = {
    id: 'apt-200',
    org_id: 'org-apex',
    reference_no: 'APT-2026-000200',
    primary_official_id: 'official-primary',
    requester_user_id: 'requester-1',
    subject: 'Multi-Department Coordination Meeting',
    status: AppointmentStatus.PENDING_APPROVAL,
    priority: 'MEDIUM',
    meeting_mode: 'IN_PERSON',
    duration_min: 45,
    start_at: '2026-10-10T11:00:00.000Z',
    end_at: '2026-10-10T11:45:00.000Z',
    room_id: 'room-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(insertedRows).forEach((k) => delete insertedRows[k]);
    Object.keys(updatedRows).forEach((k) => delete updatedRows[k]);
    Object.keys(deletedRows).forEach((k) => delete deletedRows[k]);

    mockTableHandlers['appointments'] = () => baseAppointment;
    mockTableHandlers['calendars'] = () => ({
      id: 'cal-1',
      official_id: 'official-primary',
      type: 'ORG',
    });
    mockTableHandlers['rooms'] = () => ({
      id: 'room-1',
      name: 'Conference Room 1',
      capacity: 12,
      is_active: true,
    });
    mockTableHandlers['appointment_attendees'] = () => [
      { id: 'att-1', name: 'Visitor Alice', is_external: true },
    ];
  });

  it('should NOT move to CONFIRMED when only 1 of 2 REQUIRED officials approves', async () => {
    // 2 officials: primary (REQUIRED, pending) and secondary (REQUIRED, pending)
    const officialsState = [
      {
        official_id: 'official-primary',
        requirement: Requirement.REQUIRED,
        decision: OfficialDecision.PENDING,
      },
      {
        official_id: 'official-secondary',
        requirement: Requirement.REQUIRED,
        decision: OfficialDecision.PENDING,
      },
    ];
    mockTableHandlers['appointment_officials'] = () => officialsState;

    // Primary official approves
    await appointmentsService.approve(paUser, 'apt-200', { officialId: 'official-primary' });

    // Verify official decision updated
    expect(updatedRows['appointment_officials']).toBeDefined();
    expect(updatedRows['appointment_officials']![0]).toMatchObject({
      decision: OfficialDecision.APPROVED,
    });

    // Appointment status should NOT have transitioned to CONFIRMED
    const aptUpdates = updatedRows['appointments'] || [];
    const confirmedUpdate = aptUpdates.find((u) => u.status === AppointmentStatus.CONFIRMED);
    expect(confirmedUpdate).toBeUndefined();
  });

  it('should move to CONFIRMED when all REQUIRED officials have approved, ignoring OPTIONAL officials', async () => {
    // Primary is already APPROVED, secondary is REQUIRED (approving now), tertiary is OPTIONAL (still PENDING)
    const officialsState = [
      {
        official_id: 'official-primary',
        requirement: Requirement.REQUIRED,
        decision: OfficialDecision.APPROVED,
      },
      {
        official_id: 'official-secondary',
        requirement: Requirement.REQUIRED,
        decision: OfficialDecision.PENDING,
      },
      {
        official_id: 'official-optional',
        requirement: Requirement.OPTIONAL,
        decision: OfficialDecision.PENDING,
      },
    ];
    mockTableHandlers['appointment_officials'] = () => officialsState;

    // Simulate approval of official-secondary
    mockDb.transaction.mockImplementationOnce(async (callback: any) => {
      // During transaction, query returns all required as approved
      mockTableHandlers['appointment_officials'] = () => [
        {
          official_id: 'official-primary',
          requirement: Requirement.REQUIRED,
          decision: OfficialDecision.APPROVED,
        },
        {
          official_id: 'official-secondary',
          requirement: Requirement.REQUIRED,
          decision: OfficialDecision.APPROVED,
        },
        {
          official_id: 'official-optional',
          requirement: Requirement.OPTIONAL,
          decision: OfficialDecision.PENDING,
        },
      ];
      return callback(mockDb);
    });

    await appointmentsService.approve(paUser, 'apt-200', { officialId: 'official-secondary' });

    // Verify appointment moved to CONFIRMED
    expect(updatedRows['appointments']).toBeDefined();
    const confirmedUpdate = updatedRows['appointments']!.find(
      (u) => u.status === AppointmentStatus.CONFIRMED,
    );
    expect(confirmedUpdate).toBeDefined();

    // Verify calendar event was converted from HOLD to APPOINTMENT
    expect(updatedRows['calendar_events']).toBeDefined();
    expect(updatedRows['calendar_events']![0]).toMatchObject({
      kind: 'APPOINTMENT',
      hold_expires_at: null,
    });

    // Verify visits were generated for confirmed meeting
    expect(insertedRows['visits']).toBeDefined();
  });

  it('should auto-confirm appointment when PA removes rejecting official and all remaining required officials are approved', async () => {
    // Primary is APPROVED, secondary was REJECTED
    const officialsState = [
      {
        official_id: 'official-primary',
        requirement: Requirement.REQUIRED,
        decision: OfficialDecision.APPROVED,
      },
      {
        official_id: 'official-secondary',
        requirement: Requirement.REQUIRED,
        decision: OfficialDecision.REJECTED,
      },
    ];
    mockTableHandlers['appointment_officials'] = () => officialsState;

    // PA removes secondary official
    mockDb.transaction.mockImplementationOnce(async (callback: any) => {
      // Remaining official is only primary (approved)
      mockTableHandlers['appointment_officials'] = () => [
        {
          official_id: 'official-primary',
          requirement: Requirement.REQUIRED,
          decision: OfficialDecision.APPROVED,
        },
      ];
      return callback(mockDb);
    });

    await appointmentsService.removeOfficial(paUser, 'apt-200', 'official-secondary', {
      reason: 'Official had a scheduling conflict; PA proceeding with primary official',
    });

    // Verify official was deleted from appointment_officials
    expect(deletedRows['appointment_officials']).toBeDefined();

    // Verify appointment was confirmed
    const confirmedUpdate = updatedRows['appointments']?.find(
      (u) => u.status === AppointmentStatus.CONFIRMED,
    );
    expect(confirmedUpdate).toBeDefined();
  });
});
