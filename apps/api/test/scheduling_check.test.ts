import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConflictCode,
  ConflictSeverity,
  Requirement,
  Priority,
  MeetingMode,
  EventKind,
  CalendarType,
  BlockStrength,
} from '@oams/shared';

// Use vi.hoisted for table query mocking
const { mockTableHandlers, mockDb } = vi.hoisted(() => {
  const handlers: Record<string, () => any> = {};

  const createQb = (tableName: string) => {
    const qb: any = {
      where: vi.fn().mockImplementation((...args: any[]) => {
        if (typeof args[0] === 'function') {
          args[0].call(qb);
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
          return handlers[tableName]();
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

vi.mock('../src/core/db.js', () => ({
  db: mockDb,
}));

import { schedulingEngine } from '../src/modules/scheduling/engine.js';

describe('Scheduling Conflict Check Engine (§11.2, Criterion #4)', () => {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const officialId = '00000000-0000-4000-8000-000000000010';
  const roomId = '00000000-0000-4000-8000-000000000050';

  const defaultOfficial = {
    id: officialId,
    org_id: orgId,
    title: 'Joint Secretary',
    minNoticeMin: 120,
    maxAdvanceDays: 90,
  };

  const defaultWorkingRule = {
    official_id: officialId,
    weekday: 4, // Thursday
    startLocal: '09:30',
    endLocal: '17:30',
  };

  beforeEach(() => {
    for (const key of Object.keys(mockTableHandlers)) {
      delete mockTableHandlers[key];
    }
    // Default official setup
    mockTableHandlers['officials'] = () => defaultOfficial;
    mockTableHandlers['availability_rules'] = () => defaultWorkingRule;
  });

  it('row 2: returns HOLIDAY conflict on non-optional org holidays', async () => {
    mockTableHandlers['holidays'] = () => ({
      id: 'h-1',
      name: 'Republic Day',
      date: '2026-01-26',
      is_optional: false,
    });

    const result = await schedulingEngine.checkConflicts(orgId, {
      officials: [{ officialId, requirement: Requirement.REQUIRED }],
      startAt: '2026-01-26T10:00:00.000Z',
      endAt: '2026-01-26T11:00:00.000Z',
      priority: Priority.MEDIUM,
      meetingMode: MeetingMode.IN_PERSON,
      respectMinNotice: false,
    });

    expect(result.bookable).toBe(false);
    const holidayConflict = result.conflicts.find((c) => c.code === ConflictCode.HOLIDAY);
    expect(holidayConflict).toBeDefined();
    expect(holidayConflict?.severity).toBe(ConflictSeverity.HARD);
    expect(holidayConflict?.message).toContain('Republic Day');
  });

  it('row 1: returns OUTSIDE_WORKING_HOURS when time is before or after standard hours', async () => {
    // 02:00 UTC is 07:30 IST, outside standard 09:30-17:30 IST hours
    const result = await schedulingEngine.checkConflicts(orgId, {
      officials: [{ officialId, requirement: Requirement.REQUIRED }],
      startAt: '2026-09-24T02:00:00.000Z',
      endAt: '2026-09-24T03:00:00.000Z',
      priority: Priority.MEDIUM,
      meetingMode: MeetingMode.IN_PERSON,
      respectMinNotice: false,
    });

    const hoursConflict = result.conflicts.find(
      (c) => c.code === ConflictCode.OUTSIDE_WORKING_HOURS,
    );
    expect(hoursConflict).toBeDefined();
    expect(hoursConflict?.severity).toBe(ConflictSeverity.HARD);
  });

  it('row 3: returns LEAVE conflict when official has scheduled leave', async () => {
    mockTableHandlers['calendar_events'] = () => ({
      id: 'ev-leave',
      kind: EventKind.LEAVE,
      title: 'Annual Leave',
    });

    const result = await schedulingEngine.checkConflicts(orgId, {
      officials: [{ officialId, requirement: Requirement.REQUIRED }],
      startAt: '2026-09-24T11:00:00.000Z',
      endAt: '2026-09-24T12:00:00.000Z',
      priority: Priority.MEDIUM,
      meetingMode: MeetingMode.IN_PERSON,
      respectMinNotice: false,
    });

    const leaveConflict = result.conflicts.find((c) => c.code === ConflictCode.LEAVE);
    expect(leaveConflict).toBeDefined();
    expect(leaveConflict?.severity).toBe(ConflictSeverity.HARD);
  });

  it('row 4: returns TRAVEL conflict when official has scheduled travel', async () => {
    mockTableHandlers['calendar_events'] = () => ({
      id: 'ev-travel',
      kind: EventKind.TRAVEL,
      title: 'Transit to Vigyan Bhawan',
    });

    const result = await schedulingEngine.checkConflicts(orgId, {
      officials: [{ officialId, requirement: Requirement.REQUIRED }],
      startAt: '2026-09-24T11:00:00.000Z',
      endAt: '2026-09-24T12:00:00.000Z',
      priority: Priority.MEDIUM,
      meetingMode: MeetingMode.IN_PERSON,
      respectMinNotice: false,
    });

    const travelConflict = result.conflicts.find((c) => c.code === ConflictCode.TRAVEL);
    expect(travelConflict).toBeDefined();
    expect(travelConflict?.severity).toBe(ConflictSeverity.HARD);
  });

  it('row 5: returns OFFICIAL_BUSY on existing hard org appointments', async () => {
    let call = 0;
    mockTableHandlers['calendar_events'] = () => {
      call++;
      // First call is leaveOrTravel check -> null, second call is orgBusy -> return event
      if (call >= 2) {
        return {
          id: 'ev-org-meeting',
          calendarType: CalendarType.ORG,
          blockStrength: BlockStrength.HARD,
          title: 'Parliamentary Committee Hearing',
        };
      }
      return null;
    };

    const result = await schedulingEngine.checkConflicts(orgId, {
      officials: [{ officialId, requirement: Requirement.REQUIRED }],
      startAt: '2026-09-24T14:00:00.000Z',
      endAt: '2026-09-24T15:00:00.000Z',
      priority: Priority.MEDIUM,
      meetingMode: MeetingMode.IN_PERSON,
      respectMinNotice: false,
    });

    const busyConflict = result.conflicts.find((c) => c.code === ConflictCode.OFFICIAL_BUSY);
    expect(busyConflict).toBeDefined();
    expect(busyConflict?.severity).toBe(ConflictSeverity.HARD);
  });

  it('row 6: returns PERSONAL_BUSY with scrubbed message (Privacy Invariant)', async () => {
    let call = 0;
    mockTableHandlers['calendar_events'] = () => {
      call++;
      // Call 1: leaveOrTravel (null), Call 2: orgBusy (null), Call 3: personalBusy
      if (call >= 3) {
        return {
          id: 'ev-personal',
          calendarType: CalendarType.PERSONAL,
          blockStrength: BlockStrength.HARD,
          title: 'CONFIDENTIAL MEDICAL DIAGNOSIS',
        };
      }
      return null;
    };

    const result = await schedulingEngine.checkConflicts(orgId, {
      officials: [{ officialId, requirement: Requirement.REQUIRED }],
      startAt: '2026-09-24T16:00:00.000Z',
      endAt: '2026-09-24T17:00:00.000Z',
      priority: Priority.MEDIUM,
      meetingMode: MeetingMode.IN_PERSON,
      respectMinNotice: false,
    });

    const personalConflict = result.conflicts.find((c) => c.code === ConflictCode.PERSONAL_BUSY);
    expect(personalConflict).toBeDefined();
    expect(personalConflict?.severity).toBe(ConflictSeverity.HARD);
    // §11.2 Privacy Invariant: NEVER include personal event title in message!
    expect(personalConflict?.message).not.toContain('CONFIDENTIAL MEDICAL DIAGNOSIS');
    expect(personalConflict?.message).toContain('personal block');
  });

  it('row 7: returns PROTECTED_TIME for protected executive blocks', async () => {
    mockTableHandlers['protected_blocks'] = () => ({
      id: 'pb-1',
      label: 'Daily File Clearance & Press Briefing',
      blockStrength: 'HARD',
    });

    const result = await schedulingEngine.checkConflicts(orgId, {
      officials: [{ officialId, requirement: Requirement.REQUIRED }],
      startAt: '2026-09-24T16:30:00.000Z',
      endAt: '2026-09-24T17:30:00.000Z',
      priority: Priority.MEDIUM,
      meetingMode: MeetingMode.IN_PERSON,
      respectMinNotice: false,
    });

    const protConflict = result.conflicts.find((c) => c.code === ConflictCode.PROTECTED_TIME);
    expect(protConflict).toBeDefined();
    expect(protConflict?.message).toContain('Daily File Clearance & Press Briefing');
  });

  it('row 8 & 9: returns ROOM_BUSY and ROOM_CAPACITY when venue is occupied or too small', async () => {
    mockTableHandlers['rooms'] = () => ({
      id: roomId,
      name: 'Committee Room 2',
      capacity: 6,
      is_active: true,
    });
    mockTableHandlers['room_bookings'] = () => ({
      id: 'rb-existing',
      room_id: roomId,
    });

    const result = await schedulingEngine.checkConflicts(orgId, {
      officials: [{ officialId, requirement: Requirement.REQUIRED }],
      roomId,
      minCapacity: 12, // requested 12, room only has 6
      startAt: '2026-09-24T10:00:00.000Z',
      endAt: '2026-09-24T11:00:00.000Z',
      priority: Priority.MEDIUM,
      meetingMode: MeetingMode.IN_PERSON,
      respectMinNotice: false,
    });

    const roomBusyConflict = result.conflicts.find((c) => c.code === ConflictCode.ROOM_BUSY);
    const roomCapConflict = result.conflicts.find((c) => c.code === ConflictCode.ROOM_CAPACITY);

    expect(roomBusyConflict).toBeDefined();
    expect(roomCapConflict).toBeDefined();
  });

  it('row 10: downgrades conflict to SOFT when official is OPTIONAL', async () => {
    mockTableHandlers['calendar_events'] = () => ({
      id: 'ev-leave',
      kind: EventKind.LEAVE,
      title: 'On Leave',
    });

    const result = await schedulingEngine.checkConflicts(orgId, {
      officials: [{ officialId, requirement: Requirement.OPTIONAL }],
      startAt: '2026-09-24T11:00:00.000Z',
      endAt: '2026-09-24T12:00:00.000Z',
      priority: Priority.MEDIUM,
      meetingMode: MeetingMode.IN_PERSON,
      respectMinNotice: false,
    });

    const leaveConflict = result.conflicts.find((c) => c.code === ConflictCode.LEAVE);
    expect(leaveConflict).toBeDefined();
    expect(leaveConflict?.severity).toBe(ConflictSeverity.SOFT);
    expect(leaveConflict?.optional).toBe(true);
    // Because only SOFT conflicts exist, bookable remains true
    expect(result.bookable).toBe(true);
  });
});
