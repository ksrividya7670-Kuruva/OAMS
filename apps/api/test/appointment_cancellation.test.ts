import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoleCode, type AuthUser, AppointmentStatus, CancelReason } from '@oams/shared';

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
      whereNotIn: vi.fn().mockReturnThis(),
      whereNot: vi.fn().mockReturnThis(),
      del: vi.fn().mockResolvedValue(1),
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

  const dbInstance: any = vi.fn((tableName: string) => createQb(tableName));
  dbInstance.fn = { now: vi.fn(() => new Date().toISOString()) };
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

const mockRouteNotification = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/core/notifications/router.js', () => ({
  routeNotificationEvent: (...args: any[]) => mockRouteNotification(...args),
}));

import { appointmentsService } from '../src/modules/appointments/service.js';

describe('Track 5: Appointment Cancellation & Resource Release (§10.2, §10.6, §22)', () => {
  const requesterUser: AuthUser = {
    id: 'user-req-1',
    orgId: 'org-apex',
    email: 'requester@example.com',
    fullName: 'Meeting Requester',
    roles: [RoleCode.GUEST],
    status: 'ACTIVE',
    authProvider: 'EMAIL_OTP',
    timezone: 'Asia/Kolkata',
    theme: 'SYSTEM',
    assignedOfficialIds: [],
  };

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

  const confirmedAppointment = {
    id: 'apt-300',
    org_id: 'org-apex',
    reference_no: 'APT-2026-000300',
    primary_official_id: 'official-1',
    requester_user_id: 'user-req-1',
    subject: 'VIP Diplomatic Meeting',
    status: AppointmentStatus.CONFIRMED,
    priority: 'HIGH',
    meeting_mode: 'IN_PERSON',
    duration_min: 60,
    start_at: '2026-10-15T15:00:00.000Z',
    end_at: '2026-10-15T16:00:00.000Z',
    room_id: 'room-exec',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(insertedRows).forEach((k) => delete insertedRows[k]);
    Object.keys(updatedRows).forEach((k) => delete updatedRows[k]);

    mockTableHandlers['appointments'] = () => confirmedAppointment;
  });

  it('should cancel appointment, release calendar events, release room bookings, and cancel visits', async () => {
    await appointmentsService.cancelAppointment(
      staffUser,
      'apt-300',
      CancelReason.OFFICIAL_UNAVAILABLE,
      'Official summoned to urgent cabinet session',
    );

    // 1. Appointment updated to CANCELLED
    expect(updatedRows['appointments']).toBeDefined();
    expect(updatedRows['appointments']![0]).toMatchObject({
      status: AppointmentStatus.CANCELLED,
      cancel_reason: CancelReason.OFFICIAL_UNAVAILABLE,
      cancel_note: 'Official summoned to urgent cabinet session',
    });

    // 2. Calendar events released (status CANCELLED)
    expect(updatedRows['calendar_events']).toBeDefined();
    expect(updatedRows['calendar_events']![0]).toMatchObject({
      status: 'CANCELLED',
    });

    // 3. Room bookings released (status RELEASED)
    expect(updatedRows['room_bookings']).toBeDefined();
    expect(updatedRows['room_bookings']![0]).toMatchObject({
      status: 'RELEASED',
    });

    // 4. Visits cancelled (status CANCELLED)
    expect(updatedRows['visits']).toBeDefined();
    expect(updatedRows['visits']![0]).toMatchObject({
      status: 'CANCELLED',
    });

    // 5. Active change requests expired
    expect(updatedRows['change_requests']).toBeDefined();
    expect(updatedRows['change_requests']![0]).toMatchObject({
      status: 'EXPIRED',
    });

    // 6. History recorded
    expect(insertedRows['appointment_status_history']).toBeDefined();
    expect(insertedRows['appointment_status_history']![0]).toMatchObject({
      to_status: AppointmentStatus.CANCELLED,
    });

    // 7. Audit log written
    expect(insertedRows['audit_events']).toBeDefined();
    expect(insertedRows['audit_events']![0]).toMatchObject({
      action: 'appointment.cancel',
    });

    // 8. Notification routed
    expect(mockRouteNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'AppointmentCancelled',
      }),
    );
  });

  it('should allow requester to cancel their own appointment and release resources', async () => {
    await appointmentsService.cancelAppointment(
      requesterUser,
      'apt-300',
      CancelReason.REQUESTER_CANCELLED,
      'Trip postponed',
    );

    expect(updatedRows['appointments']).toBeDefined();
    expect(updatedRows['appointments']![0]).toMatchObject({
      status: AppointmentStatus.CANCELLED,
      cancel_reason: CancelReason.REQUESTER_CANCELLED,
    });
  });
});
