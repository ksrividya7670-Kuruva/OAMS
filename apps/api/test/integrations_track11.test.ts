import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CalendarSyncStatus,
  EventKind,
  BlockStrength,
  Visibility,
  CalendarType,
  MeetingMode,
  DltTemplateId,
  NotificationChannel,
} from '@oams/shared';
import { microsoftGraphService } from '../src/core/integrations/microsoftGraph.js';
import { smsProviderService } from '../src/core/integrations/sms.js';
import { calendarSyncService } from '../src/modules/calendars/syncService.js';
import { processCalendarSyncOnce } from '../src/jobs/calendarSync.js';
import { routeNotificationEvent } from '../src/core/notifications/router.js';

// In-memory table stores for mocking Knex db
const {
  calendarsTable,
  calendarEventsTable,
  appointmentsTable,
  calendarSyncRecordsTable,
  notificationsTable,
  notificationDeliveriesTable,
  usersTable,
  officialsTable,
  supportStaffTable,
  rolesTable,
  userRolesTable,
} = vi.hoisted(() => ({
  calendarsTable: [] as any[],
  calendarEventsTable: [] as any[],
  appointmentsTable: [] as any[],
  calendarSyncRecordsTable: [] as any[],
  notificationsTable: [] as any[],
  notificationDeliveriesTable: [] as any[],
  usersTable: [] as any[],
  officialsTable: [] as any[],
  supportStaffTable: [] as any[],
  rolesTable: [] as any[],
  userRolesTable: [] as any[],
}));

// Mock DB
vi.mock('../src/core/db.js', () => {
  const trxFn: any = vi.fn().mockImplementation((tableName: string) => {
    let whereClauses: Record<string, any> = {};
    const whereInClauses: Record<string, any[]> = {};
    const operatorClauses: Array<{ col: string; op: string; val: any }> = [];
    const joins: any[] = [];

    const getTableSource = () => {
      if (tableName.includes('calendars')) return calendarsTable;
      if (tableName.includes('calendar_events')) return calendarEventsTable;
      if (tableName.includes('appointments')) return appointmentsTable;
      if (tableName.includes('calendar_sync_records')) return calendarSyncRecordsTable;
      if (tableName.includes('notification_deliveries')) return notificationDeliveriesTable;
      if (tableName.includes('notifications')) return notificationsTable;
      if (tableName.includes('users')) return usersTable;
      if (tableName.includes('officials')) return officialsTable;
      if (tableName.includes('official_support_staff')) return supportStaffTable;
      if (tableName.includes('roles')) return rolesTable;
      if (tableName.includes('user_roles')) return userRolesTable;
      return [];
    };

    const filterSource = () => {
      let source = getTableSource();

      source = source.filter((row) => {
        for (const [key, val] of Object.entries(whereClauses)) {
          const cleanKey = key.includes('.') ? key.split('.')[1] : key;
          if (row[cleanKey] !== val) return false;
        }
        for (const [key, vals] of Object.entries(whereInClauses)) {
          const cleanKey = key.includes('.') ? key.split('.')[1] : key;
          if (!vals.includes(row[cleanKey])) return false;
        }
        for (const { col, op, val } of operatorClauses) {
          const cleanKey = col.includes('.') ? col.split('.')[1] : col;
          const rowDate =
            row[cleanKey] instanceof Date
              ? row[cleanKey].getTime()
              : new Date(row[cleanKey]).getTime();
          const targetDate = val instanceof Date ? val.getTime() : new Date(val).getTime();
          if (!isNaN(rowDate) && !isNaN(targetDate)) {
            if (op === '>=' && !(rowDate >= targetDate)) return false;
            if (op === '<=' && !(rowDate <= targetDate)) return false;
          }
        }
        return true;
      });

      return source;
    };

    const queryBuilder: any = {
      where: (arg1: any, arg2?: any, arg3?: any) => {
        if (typeof arg1 === 'object') {
          whereClauses = { ...whereClauses, ...arg1 };
        } else if (arg3 !== undefined) {
          operatorClauses.push({ col: arg1, op: arg2, val: arg3 });
        } else if (typeof arg1 === 'string' && arg2 !== undefined) {
          whereClauses[arg1] = arg2;
        }
        return queryBuilder;
      },
      whereIn: (col: string, vals: any[]) => {
        whereInClauses[col] = vals;
        return queryBuilder;
      },
      whereNull: () => queryBuilder,
      whereNot: () => queryBuilder,
      andWhere: (cb: any) => {
        if (typeof cb === 'function') {
          cb(queryBuilder);
        }
        return queryBuilder;
      },
      orWhere: () => queryBuilder,
      join: (table: string, col1: string, col2: string) => {
        joins.push({ table, col1, col2 });
        return queryBuilder;
      },
      leftJoin: (table: string, col1: string, col2: string) => {
        joins.push({ table, col1, col2 });
        return queryBuilder;
      },
      select: () => queryBuilder,
      distinct: () => queryBuilder,
      orderBy: () => queryBuilder,
      limit: () => queryBuilder,
      first: async () => {
        const rows = filterSource();
        return rows[0] || null;
      },
      insert: (data: any) => {
        const items = Array.isArray(data) ? data : [data];
        const inserted = items.map((item) => {
          const newItem = {
            id: item.id || `gen-${Math.random().toString(36).substring(2, 9)}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...item,
          };
          getTableSource().push(newItem);
          return newItem;
        });
        return {
          ...queryBuilder,
          returning: async () => inserted,
          then: (resolve: any) => resolve(inserted),
        };
      },
      returning: async () => {
        const source = getTableSource();
        return [source[source.length - 1]];
      },
      update: async (data: any) => {
        const rows = filterSource();
        rows.forEach((r) => {
          Object.assign(r, data, { updated_at: new Date().toISOString() });
        });
        return rows.length;
      },
      then: (resolve: any) => resolve(filterSource()),
    };

    return queryBuilder;
  });

  trxFn.fn = { now: () => new Date().toISOString() };
  trxFn.raw = (str: string, bindings: any[]) => str;

  return { db: trxFn };
});

// Mock Redis
vi.mock('../src/core/redis.js', () => ({
  redis: {
    publish: vi.fn().mockResolvedValue(1),
  },
}));

// Mock Email
vi.mock('../src/core/email/mailer.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

describe('Track 11: Integrations (Outlook, Teams, SMS)', () => {
  const orgId = 'org-apex-01';
  const officialId = 'off-ceo-01';
  const paUserId = 'user-pa-01';
  const adminUserId = 'user-admin-01';

  beforeEach(() => {
    calendarsTable.length = 0;
    calendarEventsTable.length = 0;
    appointmentsTable.length = 0;
    calendarSyncRecordsTable.length = 0;
    notificationsTable.length = 0;
    notificationDeliveriesTable.length = 0;
    usersTable.length = 0;
    officialsTable.length = 0;
    supportStaffTable.length = 0;
    rolesTable.length = 0;
    userRolesTable.length = 0;

    microsoftGraphService.setSimulateOutage(false);
    smsProviderService.setSimulateOutage(false);

    // Seed official & staff
    usersTable.push(
      {
        id: paUserId,
        org_id: orgId,
        email: 'pa.ceo@apex.local',
        phone: '+919876543210',
        full_name: 'Primary PA',
        timezone: 'Asia/Kolkata',
      },
      {
        id: adminUserId,
        org_id: orgId,
        email: 'admin@apex.local',
        phone: '+919876543211',
        full_name: 'Appt Admin',
        timezone: 'Asia/Kolkata',
      },
    );

    officialsTable.push({
      id: officialId,
      org_id: orgId,
      user_id: 'user-ceo',
      title: 'Chief Executive Officer',
    });

    supportStaffTable.push({
      id: 'staff-1',
      official_id: officialId,
      user_id: paUserId,
      support_role: 'PA',
      active_from: new Date(Date.now() - 100000),
      active_to: null,
    });

    rolesTable.push({ id: 'role-pa', code: 'PA' }, { id: 'role-admin', code: 'APPOINTMENT_ADMIN' });

    userRolesTable.push(
      { user_id: paUserId, role_id: 'role-pa' },
      { user_id: adminUserId, role_id: 'role-admin' },
    );
  });

  it('Criterion 1: Calendar sync is idempotent across multiple sync passes (§8.4, §22 Track 11)', async () => {
    // 1. Setup Org calendar and an OAMS event
    const orgCal = {
      id: 'cal-org-1',
      official_id: officialId,
      type: CalendarType.ORG,
      sync_enabled: true,
      external_calendar_id: 'ext-cal-1',
    };
    calendarsTable.push(orgCal);

    const eventStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const eventEnd = new Date(Date.now() + 25 * 60 * 60 * 1000);

    calendarEventsTable.push({
      id: 'ev-oams-01',
      org_id: orgId,
      calendar_id: orgCal.id,
      official_id: officialId,
      title: 'Executive Review',
      start_at: eventStart,
      end_at: eventEnd,
      status: 'ACTIVE',
      external_source: 'NONE',
    });

    // Mock Outlook returning one external event
    vi.spyOn(microsoftGraphService, 'fetchOutlookEvents').mockResolvedValue([
      {
        id: 'outlook-ext-99',
        subject: 'External Vendor Discussion',
        startAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        endAt: new Date(Date.now() + 49 * 60 * 60 * 1000),
      },
    ]);

    // First Sync Pass
    const res1 = await calendarSyncService.syncOfficialCalendars({
      orgId,
      officialId,
    });

    expect(res1).toHaveLength(1);
    expect(res1[0].exportedCount).toBe(1);
    expect(res1[0].importedCount).toBe(1);
    expect(calendarSyncRecordsTable).toHaveLength(1);

    // Second Sync Pass (Immediate rerun)
    const res2 = await calendarSyncService.syncOfficialCalendars({
      orgId,
      officialId,
    });

    // Idempotency: second run should not duplicate export or import
    expect(res2[0].exportedCount).toBe(0);
    expect(res2[0].importedCount).toBe(0);
    expect(calendarSyncRecordsTable).toHaveLength(1); // No duplicate sync records
    expect(
      calendarEventsTable.filter((e) => e.title === 'External Vendor Discussion'),
    ).toHaveLength(1);
  });

  it('Criterion 2: External edit in Outlook raises CalendarSyncMismatch and preserves OAMS appointment (§8.4)', async () => {
    const orgCal = {
      id: 'cal-org-1',
      official_id: officialId,
      type: CalendarType.ORG,
      sync_enabled: true,
      external_calendar_id: 'ext-cal-1',
    };
    calendarsTable.push(orgCal);

    const aptId = 'apt-conf-1';
    const oamsStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const oamsEnd = new Date(Date.now() + 25 * 60 * 60 * 1000);

    appointmentsTable.push({
      id: aptId,
      org_id: orgId,
      reference_no: 'APT-2026-000501',
      primary_official_id: officialId,
      subject: 'Annual Strategic Review',
      start_at: oamsStart,
      end_at: oamsEnd,
      status: 'CONFIRMED',
      calendar_sync_status: CalendarSyncStatus.SYNCED,
    });

    // Outlook returns the appointment event with a MODIFIED time (+2 hours)
    const alteredStart = new Date(oamsStart.getTime() + 2 * 60 * 60 * 1000);
    const alteredEnd = new Date(oamsEnd.getTime() + 2 * 60 * 60 * 1000);

    vi.spyOn(microsoftGraphService, 'fetchOutlookEvents').mockResolvedValue([
      {
        id: 'ms-apt-ext-1',
        subject: 'Annual Strategic Review (Moved in Outlook)',
        startAt: alteredStart,
        endAt: alteredEnd,
        oamsAppointmentId: aptId,
      },
    ]);

    const res = await calendarSyncService.syncOfficialCalendars({
      orgId,
      officialId,
    });

    expect(res[0].mismatchesCount).toBe(1);

    // OAMS Authority Rule: Appointment time in OAMS is NOT altered!
    const aptAfter = appointmentsTable.find((a) => a.id === aptId);
    expect(aptAfter.start_at).toEqual(oamsStart);
    expect(aptAfter.calendar_sync_status).toBe(CalendarSyncStatus.MISMATCH);
    expect(aptAfter.calendar_sync_error).toContain('Appointment start time was changed in Outlook');

    // Mismatch in-app notification sent
    const mismatchNotif = notificationsTable.find((n) => n.event_type === 'CalendarSyncMismatch');
    expect(mismatchNotif).toBeDefined();
    expect(mismatchNotif.title).toContain('APT-2026-000501');
    expect(mismatchNotif.body).toContain('OAMS schedule remains authoritative');
  });

  it('Criterion 3: Personal calendar sync imports free/busy "Busy" only with no titles (§8.1, §8.4)', async () => {
    const personalCal = {
      id: 'cal-personal-1',
      official_id: officialId,
      type: CalendarType.PERSONAL,
      sync_enabled: true,
      external_calendar_id: 'ext-personal-1',
    };
    calendarsTable.push(personalCal);

    const slotStart = new Date(Date.now() + 10 * 60 * 60 * 1000);
    const slotEnd = new Date(Date.now() + 11 * 60 * 60 * 1000);

    vi.spyOn(microsoftGraphService, 'fetchOutlookFreeBusy').mockResolvedValue([
      {
        startAt: slotStart,
        endAt: slotEnd,
        status: 'BUSY',
      },
    ]);

    const res = await calendarSyncService.syncOfficialCalendars({
      orgId,
      officialId,
    });

    expect(res[0].calendarType).toBe(CalendarType.PERSONAL);
    expect(res[0].importedCount).toBe(1);

    // Verify imported personal event
    const importedEv = calendarEventsTable.find((e) => e.calendar_id === personalCal.id);
    expect(importedEv).toBeDefined();
    expect(importedEv.title).toBe('Busy'); // NEVER stores title
    expect(importedEv.kind).toBe(EventKind.PERSONAL);
    expect(importedEv.visibility).toBe(Visibility.PERSONAL);
  });

  it('Criterion 4: Teams meeting link generation & non-blocking provider outage resilience (§8.4, §22 Track 11)', async () => {
    const aptId = 'apt-online-1';

    appointmentsTable.push({
      id: aptId,
      org_id: orgId,
      reference_no: 'APT-2026-000777',
      primary_official_id: officialId,
      subject: 'Online High-Level Conference',
      meeting_mode: MeetingMode.ONLINE,
      start_at: new Date(Date.now() + 3600000),
      end_at: new Date(Date.now() + 7200000),
      status: 'CONFIRMED',
      calendar_sync_status: CalendarSyncStatus.NONE,
      online_link: null,
    });

    // 1. Simulate Graph Provider Outage
    microsoftGraphService.setSimulateOutage(true);

    // Call ensureTeamsMeetingLink during confirmation
    const outcomeDuringOutage = await calendarSyncService.ensureTeamsMeetingLink(aptId);

    // Outage NEVER blocks confirmation: returns false but does not throw!
    expect(outcomeDuringOutage.success).toBe(false);

    // Status is set to PENDING for background retry
    let apt = appointmentsTable.find((a) => a.id === aptId);
    expect(apt.calendar_sync_status).toBe(CalendarSyncStatus.PENDING);
    expect(apt.calendar_sync_error).toContain('outage');
    expect(apt.online_link).toBeNull();

    // 2. Recovery: Outage resolves
    microsoftGraphService.setSimulateOutage(false);

    // Background job runs (§20 calendar-sync)
    const jobResult = await processCalendarSyncOnce(orgId);
    expect(jobResult.teamsLinksRetried).toBe(1);

    apt = appointmentsTable.find((a) => a.id === aptId);
    expect(apt.calendar_sync_status).toBe(CalendarSyncStatus.SYNCED);
    expect(apt.online_link).toContain('https://teams.microsoft.com');
  });

  it('Criterion 5: India TRAI DLT Compliant SMS templates & notification delivery (§17.6)', async () => {
    // 1. Validate DLT Message Formatting
    const confirmMsg = smsProviderService.formatDltMessage(DltTemplateId.CONFIRM, {
      official: 'CEO',
      date: '25-09-2026',
      time: '11:00 AM',
      referenceNo: 'APT-2026-000184',
    });
    expect(confirmMsg).toBe(
      'Your appointment with CEO on 25-09-2026 at 11:00 AM is confirmed. Ref: APT-2026-000184 - OAMS',
    );

    const otpMsg = smsProviderService.formatDltMessage(DltTemplateId.OTP, {
      otp: '782910',
    });
    expect(otpMsg).toBe(
      '782910 is your verification code for OAMS login. Valid for 10 minutes. Do not share. - OAMS',
    );

    // 2. Test SMS Dispatch via Gateway
    const sendRes = await smsProviderService.sendSms({
      to: '+919876543210',
      templateId: DltTemplateId.CONFIRM,
      variables: {
        official: 'CEO',
        date: '25-09-2026',
        time: '11:00 AM',
        referenceNo: 'APT-2026-000184',
      },
    });

    expect(sendRes.status).toBe('SENT');
    expect(sendRes.dltTemplateId).toBe(DltTemplateId.CONFIRM);
    expect(sendRes.messageId).toContain('sms-');

    // 3. Test Provider Outage handling during notification delivery
    smsProviderService.setSimulateOutage(true);

    await routeNotificationEvent({
      id: 'event-confirm-sms-1',
      orgId,
      eventType: 'AppointmentConfirmed',
      aggregateType: 'appointment',
      aggregateId: 'apt-001',
      payload: {
        appointmentId: 'apt-001',
        referenceNo: 'APT-2026-000184',
        requesterUserId: paUserId,
        officialId,
        startAt: new Date().toISOString(),
      },
      occurredAt: new Date(),
    });

    // In-app was still delivered
    const notif = notificationsTable.find((n) => n.event_type === 'AppointmentConfirmed');
    expect(notif).toBeDefined();

    // SMS delivery failed gracefully without crashing
    const smsDelivery = notificationDeliveriesTable.find(
      (d) => d.channel === NotificationChannel.SMS,
    );
    expect(smsDelivery).toBeDefined();
    expect(smsDelivery.status).toBe('FAILED');
    expect(smsDelivery.last_error).toContain('outage');
  });
});
