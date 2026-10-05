import { describe, it, expect, vi } from 'vitest';
import { processNoShowDetectOnce } from '../src/jobs/noshowDetect.js';
import {
  generateDailyExpectedPdf,
  generateEmergencyEvacuationPdf,
} from '../src/modules/visits/exportEngine.js';
import {
  AppointmentStatus,
  VisitStatus,
  type VisitDto,
  type EmergencyGroupDto,
} from '@oams/shared';

const { aptList, visitsList, updatedApts, updatedVisits, writtenOutbox } = vi.hoisted(() => {
  const aptList = [
    {
      id: 'apt-expired-1',
      org_id: 'org-1',
      reference_no: 'APT-2026-000101',
      official_id: 'off-1',
      status: 'CONFIRMED',
      start_at: new Date(Date.now() - 45 * 60 * 1000), // 45 min ago (exceeds 30 min grace)
      created_by: 'user-guest-1',
      requester_snapshot: { email: 'guest@example.com' },
    },
  ];

  const visitsList = [
    {
      id: 'visit-expired-1',
      appointment_id: 'apt-expired-1',
      status: 'EXPECTED', // NOT checked in
    },
  ];

  const updatedApts: any[] = [];
  const updatedVisits: any[] = [];
  const writtenOutbox: any[] = [];

  return { aptList, visitsList, updatedApts, updatedVisits, writtenOutbox };
});

vi.mock('../src/core/db.js', () => {
  const trxFn: any = vi.fn().mockImplementation((tableName: string) => {
    let whereCol: string | null = null;
    let whereVal: any = null;

    const qb: any = {
      where: vi.fn().mockImplementation((col: any, val: any) => {
        whereCol = col;
        whereVal = val;
        return qb;
      }),
      andWhere: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      select: vi.fn().mockImplementation(async () => {
        if (tableName === 'appointments') return aptList;
        if (tableName === 'visits') return [];
        return [];
      }),
      update: vi.fn().mockImplementation(async (updates: any) => {
        if (tableName === 'appointments') updatedApts.push({ whereCol, whereVal, updates });
        if (tableName === 'visits') updatedVisits.push({ whereCol, whereVal, updates });
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
  writeAuditEvent: vi.fn().mockResolvedValue('audit-1'),
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

describe('No-Show Background Job & PDF Generators (§15.2, §15.3, §15.4, §22)', () => {
  it('No-Show detect job marks expired confirmed appointments as NO_SHOW (§15.2, §22)', async () => {
    const processed = await processNoShowDetectOnce(30);
    expect(processed).toBe(1);

    // Verify appointment status updated to NO_SHOW
    const aptUpdate = updatedApts.find((u) => u.updates.status === AppointmentStatus.NO_SHOW);
    expect(aptUpdate).toBeDefined();

    // Verify visit updated to NO_SHOW
    const visitUpdate = updatedVisits.find((u) => u.updates.status === VisitStatus.NO_SHOW);
    expect(visitUpdate).toBeDefined();

    // Verify AppointmentNoShow domain event emitted
    const noshowEvent = writtenOutbox.find((e) => e.eventType === 'AppointmentNoShow');
    expect(noshowEvent).toBeDefined();
    expect(noshowEvent.payload.referenceNo).toBe('APT-2026-000101');
  });

  it('generateDailyExpectedPdf generates valid PDF document buffer (§15.3)', async () => {
    const mockVisits: VisitDto[] = [
      {
        id: 'v-1',
        orgId: 'org-1',
        appointmentId: 'apt-1',
        referenceNo: 'VIS-2026-000001',
        visitorName: 'Anand Kumar',
        phone: '+91 98765 00001',
        organization: 'Infosys',
        partySize: 1,
        status: VisitStatus.EXPECTED,
        scheduledStartTime: new Date().toISOString(),
        hostOfficialName: 'Chief Director',
        hostOfficialTitle: 'Director General',
        roomName: 'Board Room A',
        floor: 'Floor 2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const buffer = await generateDailyExpectedPdf(mockVisits, '2026-09-23');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF');
  });

  it('generateEmergencyEvacuationPdf generates valid PDF document buffer (§15.4)', async () => {
    const mockGroups: EmergencyGroupDto[] = [
      {
        building: 'North Block',
        floor: 'Floor 3',
        count: 1,
        visitors: [
          {
            id: 'v-1',
            referenceNo: 'VIS-2026-000001',
            visitorName: 'Vikram Singh',
            phone: '+91 98765 43210',
            organization: 'Tata Consultancy',
            badgeNo: 'B-099',
            checkedInAt: new Date().toISOString(),
            status: VisitStatus.CHECKED_IN,
            hostOfficialName: 'Chairman',
            roomName: 'Conference Room 3B',
            building: 'North Block',
            floor: 'Floor 3',
          },
        ],
      },
    ];

    const buffer = await generateEmergencyEvacuationPdf(mockGroups, '2026-09-23 15:30:00');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF');
  });
});
