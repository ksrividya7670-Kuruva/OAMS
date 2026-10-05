import { db } from '../../core/db.js';
import {
  ConflictCode,
  ConflictSeverity,
  CalendarType,
  EventKind,
  BlockStrength,
  Requirement,
  type SchedulingCheckInput,
  type SchedulingCheckResponse,
  type ConflictDetail,
} from '@oams/shared';

export class SchedulingEngine {
  /**
   * Evaluate proposed appointment window against all 14 canonical conflict checks (§11.2)
   */
  async checkConflicts(
    orgId: string,
    input: SchedulingCheckInput,
  ): Promise<SchedulingCheckResponse> {
    const conflicts: ConflictDetail[] = [];
    const proposedStart = new Date(input.startAt);
    const proposedEnd = new Date(input.endAt);
    const now = new Date();

    const formatLocal = (d: Date, tz: string = 'Asia/Kolkata') => {
      try {
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).formatToParts(d);
        const h = parts.find((p) => p.type === 'hour')?.value || '00';
        const m = parts.find((p) => p.type === 'minute')?.value || '00';
        return `${h}:${m}`;
      } catch {
        return d.toISOString().substring(11, 16);
      }
    };

    const startLocalTime = formatLocal(proposedStart);
    const endLocalTime = formatLocal(proposedEnd);
    const dateStr = proposedStart.toISOString().substring(0, 10); // YYYY-MM-DD
    const weekday = proposedStart.getDay() === 0 ? 7 : proposedStart.getDay(); // 1=Mon .. 7=Sun

    // Check 2: Holiday (non-optional) (§11.2)
    const holiday = await db('holidays')
      .where({ org_id: orgId, date: dateStr, is_optional: false })
      .first();

    if (holiday) {
      conflicts.push({
        code: ConflictCode.HOLIDAY,
        severity: ConflictSeverity.HARD,
        message: `Date is an official holiday: ${holiday.name}`,
      });
    }

    // Check 10: Room Check
    if (input.roomId) {
      const room = await db('rooms').where({ id: input.roomId, org_id: orgId }).first();
      if (!room || !room.is_active) {
        conflicts.push({
          code: ConflictCode.ROOM_BUSY,
          severity: ConflictSeverity.HARD,
          message: 'Selected meeting room is inactive or not found',
        });
      } else {
        if (input.minCapacity && room.capacity < input.minCapacity) {
          conflicts.push({
            code: ConflictCode.ROOM_CAPACITY,
            severity: ConflictSeverity.HARD,
            message: `Room capacity (${room.capacity}) is less than required (${input.minCapacity})`,
          });
        }

        // Room overlap
        const roomBooking = await db('room_bookings')
          .where('room_id', input.roomId)
          .where('status', 'ACTIVE')
          .where('start_at', '<', proposedEnd)
          .where('end_at', '>', proposedStart)
          .first();

        if (roomBooking) {
          conflicts.push({
            code: ConflictCode.ROOM_BUSY,
            severity: ConflictSeverity.HARD,
            message: `Room ${room.name} is already booked for this time window`,
          });
        }
      }
    }

    // Evaluate each official
    for (const offInput of input.officials) {
      const isRequired = offInput.requirement === Requirement.REQUIRED;
      const targetOfficialId = offInput.officialId || (offInput as any).id;
      const official = await db('officials').where({ id: targetOfficialId, org_id: orgId }).first();

      if (!official) {
        continue;
      }

      const officialTitle = official.title || 'Official';

      // Check 11 & 12: Notice & Window
      if (input.respectMinNotice) {
        const minNoticeMs = (official.minNoticeMin || 120) * 60000;
        if (proposedStart.getTime() < now.getTime() + minNoticeMs) {
          conflicts.push({
            code: ConflictCode.MIN_NOTICE,
            severity: ConflictSeverity.HARD,
            officialId: official.id,
            officialTitle,
            message: `Request does not meet minimum notice of ${official.minNoticeMin || 120} minutes`,
          });
        }
      }

      const maxAdvanceMs = (official.maxAdvanceDays || 90) * 86400000;
      if (proposedStart.getTime() > now.getTime() + maxAdvanceMs) {
        conflicts.push({
          code: ConflictCode.BOOKING_WINDOW,
          severity: ConflictSeverity.HARD,
          officialId: official.id,
          officialTitle,
          message: `Date is beyond maximum advance booking window of ${official.maxAdvanceDays || 90} days`,
        });
      }

      // Check 1: Working hours / availability rules
      const exception = await db('availability_exceptions')
        .where({ official_id: official.id, date: dateStr })
        .first();

      if (exception) {
        if (exception.type === 'UNAVAILABLE') {
          conflicts.push({
            code: ConflictCode.OUTSIDE_WORKING_HOURS,
            severity: isRequired ? ConflictSeverity.HARD : ConflictSeverity.SOFT,
            officialId: official.id,
            officialTitle,
            optional: !isRequired,
            message: `${officialTitle} is marked unavailable on this date (${exception.reason || 'Schedule exception'})`,
          });
        } else if (exception.type === 'EXTRA_AVAILABLE') {
          if (
            (exception.startLocal && startLocalTime < exception.startLocal) ||
            (exception.endLocal && endLocalTime > exception.endLocal)
          ) {
            conflicts.push({
              code: ConflictCode.OUTSIDE_WORKING_HOURS,
              severity: isRequired ? ConflictSeverity.HARD : ConflictSeverity.SOFT,
              officialId: official.id,
              officialTitle,
              optional: !isRequired,
              message: `Time is outside ${officialTitle}'s special availability window (${exception.startLocal}–${exception.endLocal})`,
            });
          }
        }
      } else {
        const rule = await db('availability_rules')
          .where({ official_id: official.id, weekday })
          .where('effective_from', '<=', dateStr)
          .where(function () {
            this.whereNull('effective_to').orWhere('effective_to', '>=', dateStr);
          })
          .first();

        if (!rule) {
          conflicts.push({
            code: ConflictCode.OUTSIDE_WORKING_HOURS,
            severity: isRequired ? ConflictSeverity.HARD : ConflictSeverity.SOFT,
            officialId: official.id,
            officialTitle,
            optional: !isRequired,
            message: `${officialTitle} does not have regular working hours scheduled on this day`,
          });
        } else if (startLocalTime < rule.startLocal || endLocalTime > rule.endLocal) {
          conflicts.push({
            code: ConflictCode.OUTSIDE_WORKING_HOURS,
            severity: isRequired ? ConflictSeverity.HARD : ConflictSeverity.SOFT,
            officialId: official.id,
            officialTitle,
            optional: !isRequired,
            message: `Time is outside ${officialTitle}'s regular working hours (${rule.startLocal}–${rule.endLocal})`,
          });
        }
      }

      // Check 3: LEAVE / TRAVEL events
      const leaveOrTravel = await db('calendar_events')
        .where('official_id', official.id)
        .where('status', 'ACTIVE')
        .whereIn('kind', [EventKind.LEAVE, EventKind.TRAVEL])
        .where('start_at', '<', proposedEnd)
        .where('end_at', '>', proposedStart)
        .first();

      if (leaveOrTravel) {
        const code =
          leaveOrTravel.kind === EventKind.LEAVE ? ConflictCode.LEAVE : ConflictCode.TRAVEL;
        conflicts.push({
          code,
          severity: isRequired ? ConflictSeverity.HARD : ConflictSeverity.SOFT,
          officialId: official.id,
          officialTitle,
          optional: !isRequired,
          message: `${officialTitle} has scheduled ${leaveOrTravel.kind.toLowerCase()}`,
        });
      }

      // Check 4 & 8 & 9: Official Busy (ORG Calendar or HOLD)
      let orgBusyQb = db('calendar_events')
        .join('calendars', 'calendar_events.calendar_id', 'calendars.id')
        .where('calendar_events.official_id', official.id)
        .where('calendar_events.status', 'ACTIVE')
        .where('calendars.type', CalendarType.ORG)
        .where('calendar_events.block_strength', BlockStrength.HARD)
        .where('calendar_events.start_at', '<', proposedEnd)
        .where('calendar_events.end_at', '>', proposedStart);

      if (input.excludeAppointmentId) {
        orgBusyQb = orgBusyQb.whereNot(
          'calendar_events.appointment_id',
          input.excludeAppointmentId,
        );
      }

      const orgBusy = await orgBusyQb.first();
      if (orgBusy) {
        const code = isRequired ? ConflictCode.OFFICIAL_BUSY : ConflictCode.REQUIRED_OFFICIAL_BUSY;
        conflicts.push({
          code,
          severity: isRequired ? ConflictSeverity.HARD : ConflictSeverity.SOFT,
          officialId: official.id,
          officialTitle,
          optional: !isRequired,
          message: `${officialTitle} has an existing commitment during this time`,
        });
      }

      // Check 5: Personal Busy (PERSONAL Calendar)
      // §11.2 Invariant: Message NEVER includes the personal event's title!
      const personalBusy = await db('calendar_events')
        .join('calendars', 'calendar_events.calendar_id', 'calendars.id')
        .where('calendar_events.official_id', official.id)
        .where('calendar_events.status', 'ACTIVE')
        .where('calendars.type', CalendarType.PERSONAL)
        .where('calendar_events.block_strength', BlockStrength.HARD)
        .where('calendar_events.start_at', '<', proposedEnd)
        .where('calendar_events.end_at', '>', proposedStart)
        .first();

      if (personalBusy) {
        conflicts.push({
          code: ConflictCode.PERSONAL_BUSY,
          severity: isRequired ? ConflictSeverity.HARD : ConflictSeverity.SOFT,
          officialId: official.id,
          officialTitle,
          optional: !isRequired,
          message: `${officialTitle} has a personal block (private commitment)`,
        });
      }

      // Check 6: Soft Protected Blocks
      const protectedBlock = await db('protected_blocks')
        .where('official_id', official.id)
        .where(function () {
          this.where('weekday', weekday).orWhere('date', dateStr);
        })
        .where('start_local', '<', endLocalTime)
        .where('end_local', '>', startLocalTime)
        .first();

      if (protectedBlock) {
        conflicts.push({
          code: ConflictCode.PROTECTED_TIME,
          severity:
            protectedBlock.blockStrength === 'HARD' ? ConflictSeverity.HARD : ConflictSeverity.SOFT,
          officialId: official.id,
          officialTitle,
          message: `${officialTitle} has protected time: ${protectedBlock.label}`,
        });
      }

      // Check 13: Daily Capacity Policy
      const policy = await db('capacity_policies').where({ official_id: official.id }).first();
      if (policy) {
        const dayMeetings = await db('calendar_events')
          .where('official_id', official.id)
          .where('status', 'ACTIVE')
          .where('start_at', '>=', `${dateStr}T00:00:00.000Z`)
          .where('start_at', '<=', `${dateStr}T23:59:59.999Z`);

        if (dayMeetings.length >= policy.maxAppointmentsPerDay) {
          conflicts.push({
            code: ConflictCode.DAILY_CAPACITY,
            severity: policy.onExceed === 'BLOCK' ? ConflictSeverity.HARD : ConflictSeverity.SOFT,
            officialId: official.id,
            officialTitle,
            message: `${officialTitle} has reached the daily limit of ${policy.maxAppointmentsPerDay} meetings`,
          });
        }
      }
    }

    const hasHardConflict = conflicts.some((c) => c.severity === ConflictSeverity.HARD);
    const bookable = !hasHardConflict;

    // Overridable only if hard conflicts are limited to MIN_NOTICE or PROTECTED_TIME per §11.2
    const nonOverridableHard = conflicts.some(
      (c) =>
        c.severity === ConflictSeverity.HARD &&
        c.code !== ConflictCode.MIN_NOTICE &&
        c.code !== ConflictCode.PROTECTED_TIME,
    );
    const canOverride = hasHardConflict && !nonOverridableHard;

    return {
      bookable,
      conflicts,
      canOverride,
    };
  }
}

export const schedulingEngine = new SchedulingEngine();
