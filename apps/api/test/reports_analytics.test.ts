import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportsService } from '../src/modules/reports/service.js';
import { AppointmentStatus, Priority, Visibility } from '@oams/shared';

const { appointmentsTable, roomsTable, calendarEventsTable, officialsTable } = vi.hoisted(() => ({
  appointmentsTable: [] as any[],
  roomsTable: [] as any[],
  calendarEventsTable: [] as any[],
  officialsTable: [] as any[],
}));

vi.mock('../src/core/db.js', () => {
  const trxFn: any = vi.fn().mockImplementation((tableName: string) => {
    let whereClauses: Record<string, any> = {};
    const whereNotClauses: Record<string, any> = {};
    const greaterEqualClauses: Record<string, any> = {};
    const lessEqualClauses: Record<string, any> = {};
    const whereNotNullCols: string[] = [];

    const executeQuery = () => {
      let source: any[] = [];
      if (tableName.includes('appointments')) source = appointmentsTable;
      else if (tableName.includes('rooms')) source = roomsTable;
      else if (tableName.includes('calendar_events')) source = calendarEventsTable;
      else if (tableName.includes('officials')) source = officialsTable;

      let results = source.filter((row) => {
        for (const [k, v] of Object.entries(whereClauses)) {
          const cleanKey = k.includes('.') ? k.split('.')[1] : k;
          if (row[cleanKey] !== v) return false;
        }
        for (const [k, v] of Object.entries(whereNotClauses)) {
          const cleanKey = k.includes('.') ? k.split('.')[1] : k;
          if (row[cleanKey] === v) return false;
        }
        for (const col of whereNotNullCols) {
          const cleanKey = col.includes('.') ? col.split('.')[1] : col;
          if (row[cleanKey] == null) return false;
        }
        for (const [k, v] of Object.entries(greaterEqualClauses)) {
          const cleanKey = k.includes('.') ? k.split('.')[1] : k;
          if (new Date(row[cleanKey]).getTime() < new Date(v).getTime()) return false;
        }
        for (const [k, v] of Object.entries(lessEqualClauses)) {
          const cleanKey = k.includes('.') ? k.split('.')[1] : k;
          if (new Date(row[cleanKey]).getTime() > new Date(v).getTime()) return false;
        }
        return true;
      });

      if (tableName.includes('appointments')) {
        results = results.map((a) => {
          const off = officialsTable.find((o) => o.id === a.primary_official_id);
          return { ...a, official_title: off?.title };
        });
      }

      return results;
    };

    const qb: any = {
      where: vi.fn().mockImplementation((col: any, opOrVal?: any, val?: any) => {
        if (typeof col === 'object') {
          whereClauses = { ...whereClauses, ...col };
        } else if (val !== undefined) {
          if (opOrVal === '<=') lessEqualClauses[col] = val;
          else if (opOrVal === '>=') greaterEqualClauses[col] = val;
          else whereClauses[col] = val;
        } else {
          whereClauses[col] = opOrVal;
        }
        return qb;
      }),
      andWhere: vi.fn().mockImplementation((col: any, opOrVal?: any, val?: any) => {
        return qb.where(col, opOrVal, val);
      }),
      whereNot: vi.fn().mockImplementation((col: string, val: any) => {
        whereNotClauses[col] = val;
        return qb;
      }),
      whereNotNull: vi.fn().mockImplementation((col: string) => {
        whereNotNullCols.push(col);
        return qb;
      }),
      leftJoin: vi.fn().mockImplementation(() => qb),
      orderBy: vi.fn().mockImplementation(() => qb),
      select: vi.fn().mockImplementation(() => qb),
      limit: vi.fn().mockImplementation(() => qb),
    };

    qb.then = (resolve: any) => Promise.resolve(executeQuery()).then(resolve);
    return qb;
  });

  return { db: trxFn };
});

describe('Reports & Analytics Module (§18, §22 Track 10)', () => {
  const orgId = 'org-reports-123';
  const official1 = 'official-1';

  beforeEach(() => {
    appointmentsTable.length = 0;
    roomsTable.length = 0;
    calendarEventsTable.length = 0;
    officialsTable.length = 0;

    officialsTable.push({
      id: official1,
      org_id: orgId,
      title: 'Secretary of Defense',
    });

    roomsTable.push(
      { id: 'room-1', org_id: orgId, name: 'Caucus Room A', capacity: 12, is_active: true },
      { id: 'room-2', org_id: orgId, name: 'Committee Room B', capacity: 25, is_active: true },
    );
  });

  it('should compute exact KPI formulas and strictly exclude PERSONAL visibility appointments (§18)', async () => {
    const baseDate = new Date('2026-09-10T10:00:00.000Z');

    // Apt 1: Confirmed. Submit 10:00 -> Confirm 10:30 (30 mins). Meets SLA (sla_due_at 12:00)
    appointmentsTable.push({
      id: 'apt-1',
      reference_no: 'REF-001',
      org_id: orgId,
      primary_official_id: official1,
      status: AppointmentStatus.CONFIRMED,
      priority: Priority.LOW,
      meeting_mode: 'IN_PERSON',
      visibility: Visibility.PUBLIC,
      created_at: baseDate,
      submitted_at: new Date('2026-09-10T10:00:00.000Z'),
      confirmed_at: new Date('2026-09-10T10:30:00.000Z'),
      sla_due_at: new Date('2026-09-10T12:00:00.000Z'),
    });

    // Apt 2: Confirmed. Submit 10:00 -> Confirm 11:30 (90 mins). Breached SLA (sla_due_at 11:00)
    appointmentsTable.push({
      id: 'apt-2',
      reference_no: 'REF-002',
      org_id: orgId,
      primary_official_id: official1,
      status: AppointmentStatus.CONFIRMED,
      priority: Priority.URGENT,
      meeting_mode: 'IN_PERSON',
      visibility: Visibility.PUBLIC,
      created_at: baseDate,
      submitted_at: new Date('2026-09-10T10:00:00.000Z'),
      confirmed_at: new Date('2026-09-10T11:30:00.000Z'),
      sla_due_at: new Date('2026-09-10T11:00:00.000Z'),
    });

    // Apt 3: No-show appointment
    appointmentsTable.push({
      id: 'apt-3',
      reference_no: 'REF-003',
      org_id: orgId,
      primary_official_id: official1,
      status: AppointmentStatus.NO_SHOW,
      priority: Priority.LOW,
      meeting_mode: 'IN_PERSON',
      visibility: Visibility.PUBLIC,
      created_at: baseDate,
      submitted_at: new Date('2026-09-10T10:00:00.000Z'),
    });

    // Apt 4: Cancelled appointment
    appointmentsTable.push({
      id: 'apt-4',
      reference_no: 'REF-004',
      org_id: orgId,
      primary_official_id: official1,
      status: AppointmentStatus.CANCELLED,
      priority: Priority.HIGH,
      meeting_mode: 'IN_PERSON',
      visibility: Visibility.PUBLIC,
      created_at: baseDate,
      submitted_at: new Date('2026-09-10T10:00:00.000Z'),
    });

    // Apt 5: Personal appointment (MUST BE EXCLUDED FROM REPORTS)
    appointmentsTable.push({
      id: 'apt-5',
      reference_no: 'REF-005-SECRET',
      org_id: orgId,
      primary_official_id: official1,
      status: AppointmentStatus.CONFIRMED,
      priority: Priority.LOW,
      meeting_mode: 'IN_PERSON',
      visibility: Visibility.PERSONAL,
      created_at: baseDate,
      submitted_at: new Date('2026-09-10T10:00:00.000Z'),
      confirmed_at: new Date('2026-09-10T10:10:00.000Z'),
    });

    // Calendar booking: 240 minutes in Room 1
    calendarEventsTable.push({
      id: 'event-1',
      org_id: orgId,
      room_id: 'room-1',
      status: 'ACTIVE',
      start_at: new Date('2026-09-10T09:00:00.000Z'),
      end_at: new Date('2026-09-10T13:00:00.000Z'), // 4 hours = 240 mins
    });

    const report = await reportsService.getOverview(orgId, {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-20T23:59:59.000Z',
    });

    // 1. Total volume excludes Apt 5 (PERSONAL): exactly 4
    expect(report.kpis.volume.value).toBe(4);
    expect(report.kpis.volume.formula).toBe('Count(appointments within date range)');
    expect(report.kpis.volume.dateRange.from).toBe('2026-09-01T00:00:00.000Z');

    // 2. Average confirm time: (30 + 90) / 2 = 60.0 mins
    expect(report.kpis.averageConfirmTimeMin.value).toBe(60);
    expect(report.kpis.averageConfirmTimeMin.formula).toBe(
      'Sum(confirmed_at - submitted_at) / Count(confirmed_appointments)',
    );

    // 3. No-show rate: 1 NO_SHOW out of 3 concluded (2 CONFIRMED + 1 NO_SHOW) = 33.33%
    expect(report.kpis.noShowRate.value).toBe(33.33);

    // 4. Cancellation rate: 1 CANCELLED out of 4 total = 25.0%
    expect(report.kpis.cancellationRate.value).toBe(25);

    // 5. SLA breaches: exactly 1 breach (Apt 2 confirmed_at > sla_due_at)
    expect(report.kpis.slaBreaches.value).toBe(1);

    // 6. Volume breakdown by priority
    const low = report.breakdowns.byPriority.find((p) => p.priority === Priority.LOW);
    const urgent = report.breakdowns.byPriority.find((p) => p.priority === Priority.URGENT);
    const high = report.breakdowns.byPriority.find((p) => p.priority === Priority.HIGH);
    expect(low?.count).toBe(2);
    expect(urgent?.count).toBe(1);
    expect(high?.count).toBe(1);

    // 7. Room utilization
    const room1Util = report.breakdowns.roomUtilization.find((r) => r.roomId === 'room-1');
    expect(room1Util?.bookedMinutes).toBe(240);
  });

  it('should export non-confidential appointments to CSV format', async () => {
    appointmentsTable.push({
      id: 'apt-pub',
      reference_no: 'REF-CSV-01',
      org_id: orgId,
      primary_official_id: official1,
      status: AppointmentStatus.CONFIRMED,
      priority: Priority.LOW,
      meeting_mode: 'IN_PERSON',
      visibility: Visibility.PUBLIC,
      created_at: new Date('2026-09-10T10:00:00.000Z'),
      submitted_at: new Date('2026-09-10T10:00:00.000Z'),
      confirmed_at: new Date('2026-09-10T10:30:00.000Z'),
    });

    appointmentsTable.push({
      id: 'apt-priv',
      reference_no: 'REF-CSV-PRIVATE',
      org_id: orgId,
      primary_official_id: official1,
      status: AppointmentStatus.CONFIRMED,
      priority: Priority.LOW,
      meeting_mode: 'IN_PERSON',
      visibility: Visibility.PERSONAL,
      created_at: new Date('2026-09-10T10:00:00.000Z'),
    });

    const csv = await reportsService.exportAppointmentsCsv(orgId, {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-20T23:59:59.000Z',
    });

    expect(csv).toContain('Reference No,Official,Status,Priority,Meeting Mode');
    expect(csv).toContain('REF-CSV-01');
    expect(csv).not.toContain('REF-CSV-PRIVATE'); // Strictly excluded per §18
  });
});
