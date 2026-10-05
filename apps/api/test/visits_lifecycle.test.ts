import { describe, it, expect, vi, beforeEach } from 'vitest';
import { visitsService } from '../src/modules/visits/service.js';
import { RoleCode, VisitStatus, AppointmentStatus, type AuthUser } from '@oams/shared';

const { visitsTable, appointmentsTable, insertedAudit, writtenOutbox } = vi.hoisted(() => {
  const visitsTable: any[] = [];
  const appointmentsTable: any[] = [];
  const insertedAudit: any[] = [];
  const writtenOutbox: any[] = [];
  return { visitsTable, appointmentsTable, insertedAudit, writtenOutbox };
});

vi.mock('../src/core/db.js', () => {
  const trxFn: any = vi.fn().mockImplementation((tableName: string) => {
    let whereClauses: Record<string, any> = {};

    const qb: any = {
      where: vi.fn().mockImplementation((col: any, val: any) => {
        if (typeof col === 'object') {
          whereClauses = { ...whereClauses, ...col };
        } else {
          whereClauses[col] = val;
        }
        return qb;
      }),
      andWhere: vi.fn().mockImplementation((col: string, val: any) => {
        whereClauses[col] = val;
        return qb;
      }),
      select: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      first: vi.fn().mockImplementation(async () => {
        if (tableName === 'visits') {
          return visitsTable.find((v) => {
            if (whereClauses.id && v.id !== whereClauses.id) return false;
            if (whereClauses.org_id && v.org_id !== whereClauses.org_id) return false;
            return true;
          });
        }
        if (tableName === 'appointments') {
          return appointmentsTable.find((a) => {
            if (whereClauses.id && a.id !== whereClauses.id) return false;
            return true;
          });
        }
        return null;
      }),
      update: vi.fn().mockImplementation(async (updates: any) => {
        if (tableName === 'visits') {
          const v = visitsTable.find((row) => row.id === whereClauses.id);
          if (v) Object.assign(v, updates);
        }
        if (tableName === 'appointments') {
          const a = appointmentsTable.find((row) => row.id === whereClauses.id);
          if (a) Object.assign(a, updates);
        }
        return 1;
      }),
    };
    return qb;
  });

  const dbFn: any = vi.fn().mockImplementation((tableName: string) => trxFn(tableName));
  dbFn.transaction = vi.fn().mockImplementation(async (callback: any) => {
    return callback(trxFn);
  });
  dbFn.fn = { now: vi.fn().mockReturnValue(new Date()) };
  return { db: dbFn };
});

vi.mock('../src/core/audit/auditWriter.js', () => ({
  writeAuditEvent: vi.fn().mockImplementation(async (_trx, params) => {
    insertedAudit.push(params);
    return 'audit-1';
  }),
}));

vi.mock('../src/core/outbox/outboxWriter.js', () => ({
  writeOutboxEvent: vi.fn().mockImplementation(async (_trx, params) => {
    writtenOutbox.push(params);
    return 'outbox-1';
  }),
}));

vi.mock('../src/core/notifications/router.js', () => ({
  routeNotificationEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('Visit Lifecycle State Machine (§15.2, §15.3, §22 Track 7 Done Criteria)', () => {
  const receptionUser = {
    id: 'user-rec-1',
    orgId: 'org-1',
    email: 'reception@oams.gov',
    fullName: 'Reception Officer',
    roles: [RoleCode.RECEPTION],
  } as unknown as AuthUser;

  beforeEach(() => {
    insertedAudit.length = 0;
    writtenOutbox.length = 0;
    visitsTable.length = 0;
    appointmentsTable.length = 0;

    appointmentsTable.push({
      id: 'apt-1',
      org_id: 'org-1',
      status: AppointmentStatus.CONFIRMED,
      official_id: 'off-1',
      subject: 'Quarterly Infrastructure Review',
      start_at: new Date('2026-09-23T11:00:00Z'),
    });

    visitsTable.push({
      id: 'visit-1',
      org_id: 'org-1',
      appointment_id: 'apt-1',
      reference_no: 'VIS-2026-000001',
      visitor_name: 'Miles Dyson',
      phone: '+91 99999 88888',
      status: VisitStatus.EXPECTED,
      badge_no: null,
      arrived_at: null,
      checked_in_at: null,
      with_host_at: null,
      checked_out_at: null,
      denied_reason: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  it('Flow: EXPECTED -> ARRIVED (Visitor arrives at reception desk)', async () => {
    const updated = await visitsService.arrive(receptionUser, 'visit-1');
    expect(updated.status).toBe(VisitStatus.ARRIVED);
    expect(updated.arrivedAt).toBeDefined();

    // Verify outbox domain event for host PA notification
    const arrivedEvent = writtenOutbox.find((e) => e.eventType === 'VisitorArrived');
    expect(arrivedEvent).toBeDefined();
    expect(arrivedEvent.payload.visitorName).toBe('Miles Dyson');
    expect(arrivedEvent.payload.referenceNo).toBe('VIS-2026-000001');
  });

  it('Flow: ARRIVED -> CHECKED_IN with badge assignment & updates appointment to CHECKED_IN (§15.2)', async () => {
    // 1. Mark arrived first
    await visitsService.arrive(receptionUser, 'visit-1');

    // 2. Check in and issue badge #B-42
    const checkedIn = await visitsService.checkIn(receptionUser, 'visit-1', {
      badgeNo: 'B-42',
      idType: 'DRIVING_LICENSE',
      idLast4: '5566',
    });

    expect(checkedIn.status).toBe(VisitStatus.CHECKED_IN);
    expect(checkedIn.badgeNo).toBe('B-42');
    expect(checkedIn.idType).toBe('DRIVING_LICENSE');
    expect(checkedIn.idLast4).toBe('5566');

    // First visitor check-in MUST move appointment to CHECKED_IN (§15.2)
    const apt = appointmentsTable.find((a) => a.id === 'apt-1');
    expect(apt?.status).toBe(AppointmentStatus.CHECKED_IN);

    // Verify VisitorCheckedIn domain event emitted
    const checkinEvent = writtenOutbox.find((e) => e.eventType === 'VisitorCheckedIn');
    expect(checkinEvent).toBeDefined();
    expect(checkinEvent.payload.badgeNo).toBe('B-42');
    expect(checkinEvent.payload.appointmentStatusChanged).toBe(true);
  });

  it('Flow: CHECKED_IN -> WITH_HOST -> CHECKED_OUT', async () => {
    await visitsService.arrive(receptionUser, 'visit-1');
    await visitsService.checkIn(receptionUser, 'visit-1', { badgeNo: 'B-42' });

    // Host receives visitor
    const withHost = await visitsService.withHost(receptionUser, 'visit-1');
    expect(withHost.status).toBe(VisitStatus.WITH_HOST);
    expect(withHost.withHostAt).toBeDefined();

    // Departure checkout
    const checkedOut = await visitsService.checkOut(receptionUser, 'visit-1');
    expect(checkedOut.status).toBe(VisitStatus.CHECKED_OUT);
    expect(checkedOut.checkedOutAt).toBeDefined();

    expect(insertedAudit.some((a) => a.action === 'visit.checkout')).toBe(true);
  });

  it('Flow: Deny entry to visitor with reason (§15.2)', async () => {
    await visitsService.arrive(receptionUser, 'visit-1');

    const denied = await visitsService.deny(receptionUser, 'visit-1', {
      reason: 'Failed security ID verification check',
    });

    expect(denied.status).toBe(VisitStatus.DENIED);
    expect(denied.deniedReason).toBe('Failed security ID verification check');

    const denyEvent = writtenOutbox.find((e) => e.eventType === 'VisitorDenied');
    expect(denyEvent).toBeDefined();
    expect(denyEvent.payload.reason).toBe('Failed security ID verification check');
  });
});
