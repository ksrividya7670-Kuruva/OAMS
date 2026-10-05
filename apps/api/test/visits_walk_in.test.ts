import { describe, it, expect, vi, beforeEach } from 'vitest';
import { visitsService } from '../src/modules/visits/service.js';
import { RoleCode, VisitStatus, AppointmentStatus, Priority, type AuthUser } from '@oams/shared';

const { insertedAppointments, insertedVisits, writtenOutbox, insertedAudit } = vi.hoisted(() => {
  const insertedAppointments: any[] = [];
  const insertedVisits: any[] = [];
  const writtenOutbox: any[] = [];
  const insertedAudit: any[] = [];
  return { insertedAppointments, insertedVisits, writtenOutbox, insertedAudit };
});

vi.mock('../src/core/db.js', () => {
  const trxFn: any = vi.fn().mockImplementation((tableName: string) => {
    const qb: any = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      first: vi.fn().mockImplementation(async () => {
        if (tableName === 'officials') {
          return { id: 'off-1', org_id: 'org-1', title: 'Managing Director' };
        }
        if (tableName === 'visits') {
          return insertedVisits[0] || null;
        }
        return null;
      }),
      insert: vi.fn().mockImplementation((data: any) => {
        const row = { id: `mock-${Date.now()}`, ...data };
        if (tableName === 'appointments') insertedAppointments.push(row);
        if (tableName === 'visits') insertedVisits.push(row);
        return {
          returning: vi.fn().mockResolvedValue([row]),
        };
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

vi.mock('../src/core/utils/referenceNumber.js', () => ({
  generateReferenceNumber: vi.fn().mockImplementation(async (_trx, prefix: string) => {
    return `${prefix}-2026-999001`;
  }),
}));

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

describe('Walk-In Visitor Registration (§15.3, §22 Track 7 Done Criteria)', () => {
  const receptionUser = {
    id: 'user-rec-1',
    orgId: 'org-1',
    email: 'reception@oams.gov',
    fullName: 'Front Desk Officer',
    roles: [RoleCode.RECEPTION],
  } as unknown as AuthUser;

  beforeEach(() => {
    insertedAppointments.length = 0;
    insertedVisits.length = 0;
    writtenOutbox.length = 0;
    insertedAudit.length = 0;
  });

  it('Creates UNDER_REVIEW appointment with source=WALK_IN, visit in ARRIVED, and emits instant staff toast (§15.3)', async () => {
    const result = await visitsService.registerWalkIn(receptionUser, {
      officialId: 'off-1',
      visitorName: 'Rajesh Sharma',
      phone: '+91 91234 56789',
      email: 'rajesh@example.com',
      organization: 'Sharma Enterprises',
      purpose: 'Urgent contract submission regarding municipal tender',
    });

    expect(result.appointmentId).toBeDefined();
    expect(result.visitId).toBeDefined();
    expect(result.referenceNo).toBe('VIS-2026-999001');

    // 1. Verify Appointment row attributes
    const apt = insertedAppointments[0];
    expect(apt).toBeDefined();
    expect(apt.source).toBe('WALK_IN');
    expect(apt.status).toBe(AppointmentStatus.UNDER_REVIEW);
    expect(apt.priority).toBe(Priority.MEDIUM);
    expect(apt.purpose).toBe('Urgent contract submission regarding municipal tender');
    expect(apt.reference_no).toBe('APT-2026-999001');

    // 2. Verify Visit row attributes
    const visit = insertedVisits[0];
    expect(visit).toBeDefined();
    expect(visit.status).toBe(VisitStatus.ARRIVED);
    expect(visit.visitor_name).toBe('Rajesh Sharma');
    expect(visit.arrived_at).toBeDefined();

    // 3. Verify immediate toast domain event for support staff
    const outboxEvent = writtenOutbox.find((e) => e.eventType === 'VisitorArrived');
    expect(outboxEvent).toBeDefined();
    expect(outboxEvent.payload.isWalkIn).toBe(true);
    expect(outboxEvent.payload.visitorName).toBe('Rajesh Sharma');
    expect(outboxEvent.payload.officialId).toBe('off-1');
  });
});
