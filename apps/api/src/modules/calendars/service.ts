import type { Knex } from 'knex';
import { db } from '../../core/db.js';
import { writeAuditEvent } from '../../core/audit/auditWriter.js';
import { writeOutboxEvent } from '../../core/outbox/outboxWriter.js';
import {
  ApiError,
  CalendarType,
  EventKind,
  BlockStrength,
  Visibility,
  type AuthUser,
  type CreateCalendarEventInput,
  type UpdateCalendarEventInput,
  type CalendarEventsQueryInput,
  type CalendarEventItem,
} from '@oams/shared';

export class CalendarsService {
  /**
   * List calendar events with strict privacy masking per §8.1 & §17.2
   */
  async listCalendarEvents(
    orgId: string,
    caller: AuthUser,
    query: CalendarEventsQueryInput,
  ): Promise<CalendarEventItem[]> {
    const { officialId, start, end, layers } = query;

    // 1. Fetch official
    const official = await db('officials').where({ id: officialId, orgId }).first();
    if (!official) {
      throw ApiError.notFound('Official not found');
    }

    // 2. Check caller privileges for this official
    const isOfficialHimself = caller.id === official.userId || caller.officialId === officialId;
    const isAssignedStaff = caller.assignedOfficialIds.includes(officialId);

    let canViewPersonal = isOfficialHimself;
    let canViewConfidential = isOfficialHimself;

    if (isAssignedStaff) {
      const staffRow = await db('official_support_staff')
        .where({ officialId, userId: caller.id })
        .where(function () {
          this.whereNull('active_to').orWhere('active_to', '>', db.fn.now());
        })
        .first();

      if (staffRow) {
        canViewPersonal = Boolean(staffRow.canViewPersonal);
        canViewConfidential = Boolean(staffRow.canViewConfidential);
      }
    }

    // 3. Query events
    let qb = db('calendar_events')
      .join('calendars', 'calendar_events.calendar_id', 'calendars.id')
      .leftJoin('rooms', 'calendar_events.room_id', 'rooms.id')
      .where('calendar_events.official_id', officialId)
      .where('calendar_events.status', 'ACTIVE')
      .where('calendar_events.end_at', '>=', start)
      .where('calendar_events.start_at', '<=', end)
      .select(
        'calendar_events.id',
        'calendar_events.org_id as orgId',
        'calendar_events.calendar_id as calendarId',
        'calendars.type as calendarType',
        'calendar_events.official_id as officialId',
        'calendar_events.kind',
        'calendar_events.block_strength as blockStrength',
        'calendar_events.title',
        'calendar_events.description',
        'calendar_events.location',
        'calendar_events.start_at as startAt',
        'calendar_events.end_at as endAt',
        'calendar_events.all_day as allDay',
        'calendar_events.visibility',
        'calendar_events.appointment_id as appointmentId',
        'calendar_events.room_booking_id as roomBookingId',
        'calendar_events.room_id as roomId',
        'rooms.name as roomName',
        'calendar_events.hold_expires_at as holdExpiresAt',
        'calendar_events.recurrence_rule as recurrenceRule',
        'calendar_events.series_id as seriesId',
        'calendar_events.status',
      );

    if (layers) {
      const requestedLayers = layers.split(',').map((l) => l.trim().toUpperCase());
      qb = qb.whereIn('calendars.type', requestedLayers);
    }

    const rows = await qb.orderBy('calendar_events.start_at', 'asc');

    // 4. Apply privacy masking per §8.1
    return rows.map((row: any) => maskEventForPrivacy(row, canViewPersonal, canViewConfidential));
  }

  /**
   * Create a new calendar event with double-booking check & buffers
   */
  async createCalendarEvent(
    orgId: string,
    caller: AuthUser,
    input: CreateCalendarEventInput,
    correlationId: string,
  ): Promise<CalendarEventItem> {
    const {
      officialId,
      calendarType,
      kind,
      blockStrength,
      title,
      description,
      location,
      startAt,
      endAt,
      allDay,
      visibility,
      roomId,
      recurrenceRule,
    } = input;

    // 1. Verify official exists
    const official = await db('officials').where({ id: officialId, orgId }).first();
    if (!official) {
      throw ApiError.notFound('Official not found');
    }

    // 2. Permission check for Personal calendar (§8.1)
    const isOfficialHimself = caller.id === official.userId || caller.officialId === officialId;
    if (calendarType === CalendarType.PERSONAL && !isOfficialHimself) {
      const staffRow = await db('official_support_staff')
        .where({ officialId, userId: caller.id })
        .where(function () {
          this.whereNull('active_to').orWhere('active_to', '>', db.fn.now());
        })
        .first();

      if (!staffRow || !staffRow.canEditPersonal) {
        throw ApiError.forbidden('You do not have permission to edit personal calendar entries');
      }
    }

    // 3. Find target calendar
    const calendar = await db('calendars').where({ officialId, type: calendarType }).first();
    if (!calendar) {
      throw ApiError.notFound(`Calendar of type ${calendarType} not found for official`);
    }

    // 4. Calculate buffered occupied_range
    const startDate = new Date(startAt);
    const endDate = new Date(endAt);
    if (endDate <= startDate) {
      throw ApiError.badRequest('endAt must be strictly after startAt');
    }

    // Add bufferAfterMin to occupied range if configured
    const bufferAfterMin = official.bufferAfterMin || 0;
    const bufferedEndDate = new Date(endDate.getTime() + bufferAfterMin * 60000);

    try {
      return await db.transaction(async (trx: Knex.Transaction) => {
        let roomBookingId: string | null = null;

        // Handle room booking if room specified
        if (roomId && calendarType === CalendarType.ORG) {
          const room = await trx('rooms').where({ id: roomId, orgId, isActive: true }).first();
          if (!room) {
            throw ApiError.badRequest('Selected room is not active or available');
          }

          const roomStart = new Date(startDate.getTime() - (room.setupMin || 0) * 60000);
          const roomEnd = new Date(endDate.getTime() + (room.cleanupMin || 0) * 60000);

          try {
            const [booking] = await trx('room_bookings')
              .insert({
                room_id: roomId,
                start_at: roomStart,
                end_at: roomEnd,
                occupied_range: trx.raw(`tstzrange(to_timestamp(?), to_timestamp(?), '[]')`, [
                  roomStart.getTime() / 1000,
                  roomEnd.getTime() / 1000,
                ]),
                status: 'ACTIVE',
              })
              .returning('*');
            roomBookingId = booking.id;
          } catch (err: any) {
            if (err.code === '23P01') {
              throw ApiError.conflict('The selected room is already booked for this time window');
            }
            throw err;
          }
        }

        // Insert calendar event with exclusion range
        const [event] = await trx('calendar_events')
          .insert({
            org_id: orgId,
            calendar_id: calendar.id,
            official_id: officialId,
            kind,
            block_strength: blockStrength,
            title,
            description,
            location,
            start_at: startDate,
            end_at: endDate,
            all_day: allDay,
            occupied_range: trx.raw(`tstzrange(to_timestamp(?), to_timestamp(?), '[]')`, [
              startDate.getTime() / 1000,
              bufferedEndDate.getTime() / 1000,
            ]),
            visibility,
            room_booking_id: roomBookingId,
            room_id: roomId || null,
            recurrence_rule: recurrenceRule || null,
            status: 'ACTIVE',
          })
          .returning('*');

        // Audit writing (§8.1: NEVER store personal titles or descriptions in audit log)
        const isPersonal = calendarType === CalendarType.PERSONAL;
        await writeAuditEvent(trx, {
          orgId,
          actorId: caller.id,
          actorRole: caller.roles[0],
          action: 'calendar.event.create',
          entityType: 'calendar_event',
          entityId: event.id,
          changes: {
            calendarType,
            kind,
            blockStrength,
            startAt,
            endAt,
            title: isPersonal ? '[PERSONAL]' : title,
            description: isPersonal ? null : description,
          },
          correlationId,
        });

        // Write outbox event for notifications (§14.4 T2)
        await writeOutboxEvent(trx, {
          orgId,
          eventType: 'CalendarEventCreated',
          aggregateType: 'calendar_event',
          aggregateId: event.id,
          payload: {
            eventId: event.id,
            officialId,
            calendarType,
            createdById: caller.id,
            isOfficial: isOfficialHimself,
            title: isPersonal ? 'Personal block' : title,
            startAt,
            endAt,
          },
        });

        return {
          ...event,
          calendarType,
          isMasked: false,
          startAt: new Date(event.startAt).toISOString(),
          endAt: new Date(event.endAt).toISOString(),
        };
      });
    } catch (err: any) {
      if (err.code === '23P01') {
        throw ApiError.conflict('Slot already booked or overlaps an active hard calendar block');
      }
      throw err;
    }
  }

  /**
   * Update a calendar event
   */
  async updateCalendarEvent(
    orgId: string,
    caller: AuthUser,
    eventId: string,
    input: UpdateCalendarEventInput,
    correlationId: string,
  ): Promise<CalendarEventItem> {
    const existing = await db('calendar_events')
      .join('calendars', 'calendar_events.calendar_id', 'calendars.id')
      .where('calendar_events.id', eventId)
      .where('calendar_events.org_id', orgId)
      .select('calendar_events.*', 'calendars.type as calendarType')
      .first();

    if (!existing) {
      throw ApiError.notFound('Calendar event not found');
    }

    // Permission check for personal
    const isOfficialHimself =
      caller.id === existing.officialId || caller.officialId === existing.officialId;
    if (existing.calendarType === CalendarType.PERSONAL && !isOfficialHimself) {
      const staffRow = await db('official_support_staff')
        .where({ officialId: existing.officialId, userId: caller.id })
        .first();
      if (!staffRow || !staffRow.canEditPersonal) {
        throw ApiError.forbidden('You do not have permission to edit personal calendar entries');
      }
    }

    const startDate = input.startAt ? new Date(input.startAt) : new Date(existing.startAt);
    const endDate = input.endAt ? new Date(input.endAt) : new Date(existing.endAt);
    if (endDate <= startDate) {
      throw ApiError.badRequest('endAt must be strictly after startAt');
    }

    return db.transaction(async (trx: Knex.Transaction) => {
      try {
        const [updated] = await trx('calendar_events')
          .where('id', eventId)
          .update({
            title: input.title !== undefined ? input.title : existing.title,
            description: input.description !== undefined ? input.description : existing.description,
            location: input.location !== undefined ? input.location : existing.location,
            start_at: startDate,
            end_at: endDate,
            all_day: input.allDay !== undefined ? input.allDay : existing.allDay,
            kind: input.kind !== undefined ? input.kind : existing.kind,
            block_strength:
              input.blockStrength !== undefined ? input.blockStrength : existing.blockStrength,
            visibility: input.visibility !== undefined ? input.visibility : existing.visibility,
            occupied_range: trx.raw(`tstzrange(to_timestamp(?), to_timestamp(?), '[]')`, [
              startDate.getTime() / 1000,
              endDate.getTime() / 1000,
            ]),
            updated_at: trx.fn.now(),
            updated_by: caller.id,
            version: existing.version + 1,
          })
          .returning('*');

        const isPersonal = existing.calendarType === CalendarType.PERSONAL;
        await writeAuditEvent(trx, {
          orgId,
          actorId: caller.id,
          actorRole: caller.roles[0],
          action: 'calendar.event.update',
          entityType: 'calendar_event',
          entityId: eventId,
          changes: {
            title: isPersonal ? '[PERSONAL]' : input.title,
            startAt: startDate.toISOString(),
            endAt: endDate.toISOString(),
          },
          correlationId,
        });

        await writeOutboxEvent(trx, {
          orgId,
          eventType: 'CalendarEventUpdated',
          aggregateType: 'calendar_event',
          aggregateId: eventId,
          payload: {
            eventId,
            officialId: existing.officialId,
            updatedById: caller.id,
            isOfficial: isOfficialHimself,
          },
        });

        return {
          ...updated,
          calendarType: existing.calendarType,
          isMasked: false,
          startAt: new Date(updated.startAt).toISOString(),
          endAt: new Date(updated.endAt).toISOString(),
        };
      } catch (err: any) {
        if (err.code === '23P01') {
          throw ApiError.conflict('Slot already booked or overlaps an active hard calendar block');
        }
        throw err;
      }
    });
  }

  /**
   * Cancel or delete a calendar event
   */
  async deleteCalendarEvent(
    orgId: string,
    caller: AuthUser,
    eventId: string,
    correlationId: string,
  ): Promise<{ success: boolean }> {
    const existing = await db('calendar_events')
      .join('calendars', 'calendar_events.calendar_id', 'calendars.id')
      .where('calendar_events.id', eventId)
      .where('calendar_events.org_id', orgId)
      .select('calendar_events.*', 'calendars.type as calendarType')
      .first();

    if (!existing) {
      throw ApiError.notFound('Calendar event not found');
    }

    const isOfficialHimself =
      caller.id === existing.officialId || caller.officialId === existing.officialId;
    if (existing.calendarType === CalendarType.PERSONAL && !isOfficialHimself) {
      const staffRow = await db('official_support_staff')
        .where({ officialId: existing.officialId, userId: caller.id })
        .first();
      if (!staffRow || !staffRow.canEditPersonal) {
        throw ApiError.forbidden('You do not have permission to delete personal calendar entries');
      }
    }

    return db.transaction(async (trx: Knex.Transaction) => {
      // Release room booking if any
      if (existing.roomBookingId) {
        await trx('room_bookings')
          .where('id', existing.roomBookingId)
          .update({ status: 'RELEASED', updated_at: trx.fn.now() });
      }

      await trx('calendar_events')
        .where('id', eventId)
        .update({ status: 'CANCELLED', updated_at: trx.fn.now() });

      await writeAuditEvent(trx, {
        orgId,
        actorId: caller.id,
        actorRole: caller.roles[0],
        action: 'calendar.event.cancel',
        entityType: 'calendar_event',
        entityId: eventId,
        changes: { status: 'CANCELLED' },
        correlationId,
      });

      await writeOutboxEvent(trx, {
        orgId,
        eventType: 'CalendarEventCancelled',
        aggregateType: 'calendar_event',
        aggregateId: eventId,
        payload: {
          eventId,
          officialId: existing.officialId,
          cancelledById: caller.id,
        },
      });

      return { success: true };
    });
  }

  /**
   * Update personal calendar view/edit grants for a staff member (§8.1, §14.4)
   */
  async updatePersonalAccess(
    orgId: string,
    officialId: string,
    staffId: string,
    canViewPersonal: boolean,
    canEditPersonal: boolean,
    actorId: string,
    actorRole: string,
    correlationId: string,
  ) {
    const staffRow = await db('official_support_staff').where({ id: staffId, officialId }).first();

    if (!staffRow) {
      throw ApiError.notFound('Support staff assignment not found');
    }

    return db.transaction(async (trx: Knex.Transaction) => {
      await trx('official_support_staff').where('id', staffId).update({
        can_view_personal: canViewPersonal,
        can_edit_personal: canEditPersonal,
        updated_at: trx.fn.now(),
      });

      await writeAuditEvent(trx, {
        orgId,
        actorId,
        actorRole,
        action: 'official.personal_access.update',
        entityType: 'official_support_staff',
        entityId: staffId,
        changes: { canViewPersonal, canEditPersonal },
        correlationId,
      });

      const eventType = canViewPersonal ? 'PersonalAccessGranted' : 'PersonalAccessRevoked';
      await writeOutboxEvent(trx, {
        orgId,
        eventType,
        aggregateType: 'official_support_staff',
        aggregateId: staffId,
        payload: {
          officialId,
          userId: staffRow.userId,
          canViewPersonal,
          canEditPersonal,
        },
      });

      return { success: true, canViewPersonal, canEditPersonal };
    });
  }
}

export function maskEventForPrivacy(
  row: any,
  canViewPersonal: boolean,
  canViewConfidential: boolean,
): CalendarEventItem {
  let isMasked = false;
  let title = row.title;
  let description = row.description;
  let location = row.location;

  if (row.calendarType === CalendarType.PERSONAL && !canViewPersonal) {
    // Privacy Invariant (§8.1, §17.2):
    // Raw personal titles/descriptions are NEVER leaked to staff without grant.
    title = 'Busy';
    description = null;
    location = null;
    isMasked = true;
  } else if (row.visibility === Visibility.CONFIDENTIAL && !canViewConfidential) {
    title = 'Confidential appointment';
    description = null;
    location = null;
    isMasked = true;
  }

  return {
    ...row,
    title,
    description,
    location,
    isMasked,
    startAt: new Date(row.startAt).toISOString(),
    endAt: new Date(row.endAt).toISOString(),
    holdExpiresAt: row.holdExpiresAt ? new Date(row.holdExpiresAt).toISOString() : null,
  };
}

export const calendarsService = new CalendarsService();
