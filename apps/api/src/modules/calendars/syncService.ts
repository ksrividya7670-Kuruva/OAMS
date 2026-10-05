import { db } from '../../core/db.js';
import { logger } from '../../core/logger.js';
import {
  microsoftGraphService,
  OutlookEventItem,
  OutlookFreeBusyItem,
} from '../../core/integrations/microsoftGraph.js';
import { routeNotificationEvent } from '../../core/notifications/router.js';
import {
  CalendarSyncStatus,
  SyncDirection,
  EventKind,
  BlockStrength,
  Visibility,
  CalendarType,
} from '@oams/shared';

export interface CalendarSyncOptions {
  orgId: string;
  officialId: string;
  from?: Date;
  to?: Date;
}

export interface SyncRunResult {
  officialId: string;
  calendarType: CalendarType;
  exportedCount: number;
  importedCount: number;
  mismatchesCount: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  errorMessage?: string;
}

/**
 * Calendar Sync Service (§8.4)
 * - Org calendar: Two-way sync with Outlook work calendar.
 * - Personal calendar: Read-only free/busy from Outlook (never write, never import titles).
 * - OAMS Authoritative Rule: If Outlook modifies/deletes an OAMS appointment,
 *   OAMS does NOT change the appointment; it raises a CalendarSyncMismatch event.
 * - Idempotent: safe to run multiple times without duplicating events.
 */
export class CalendarSyncService {
  /**
   * Run sync for an official's calendars
   */
  async syncOfficialCalendars(options: CalendarSyncOptions): Promise<SyncRunResult[]> {
    const { orgId, officialId } = options;
    const now = new Date();
    const from = options.from || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const to = options.to || new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const calendars = await db('calendars').where({ official_id: officialId }).select('*');

    const results: SyncRunResult[] = [];

    for (const cal of calendars) {
      if (!cal.sync_enabled && !options.from) {
        // Skip disabled unless explicitly triggered with range
        continue;
      }

      if (cal.type === CalendarType.ORG) {
        const orgRes = await this.syncOrgCalendar(orgId, officialId, cal, from, to);
        results.push(orgRes);
      } else if (cal.type === CalendarType.PERSONAL) {
        const personalRes = await this.syncPersonalCalendar(orgId, officialId, cal, from, to);
        results.push(personalRes);
      }
    }

    return results;
  }

  /**
   * Two-Way Sync for ORG calendar (§8.4)
   */
  private async syncOrgCalendar(
    orgId: string,
    officialId: string,
    calendar: any,
    from: Date,
    to: Date,
  ): Promise<SyncRunResult> {
    let exportedCount = 0;
    let importedCount = 0;
    let mismatchesCount = 0;

    const externalCalId = calendar.external_calendar_id || 'primary';

    try {
      // 1. Export OAMS events to Outlook work calendar
      const oamsEvents = await db('calendar_events')
        .where('calendar_id', calendar.id)
        .where('start_at', '>=', from)
        .where('end_at', '<=', to)
        .where('status', 'ACTIVE')
        .where('external_source', 'NONE')
        .select('*');

      for (const ev of oamsEvents) {
        // Check if sync record already exists
        const existingRecord = await db('calendar_sync_records')
          .where({ event_id: ev.id, direction: SyncDirection.EXPORT })
          .first();

        if (existingRecord && existingRecord.status === 'SUCCESS') {
          continue; // Idempotent: already exported
        }

        try {
          const exportRes = await microsoftGraphService.exportEventToOutlook(externalCalId, {
            subject: ev.title,
            startAt: new Date(ev.start_at),
            endAt: new Date(ev.end_at),
            isAllDay: ev.all_day,
            location: ev.location || undefined,
            oamsAppointmentId: ev.appointment_id || undefined,
          });

          await db('calendar_events').where('id', ev.id).update({
            external_id: exportRes.externalId,
            updated_at: db.fn.now(),
          });

          await db('calendar_sync_records').insert({
            org_id: orgId,
            official_id: officialId,
            calendar_id: calendar.id,
            event_id: ev.id,
            appointment_id: ev.appointment_id || null,
            direction: SyncDirection.EXPORT,
            external_event_id: exportRes.externalId,
            status: 'SUCCESS',
            details: JSON.stringify({ subject: ev.title }),
          });

          exportedCount++;
        } catch (err: any) {
          logger.warn({ err, eventId: ev.id }, 'Failed to export event to Outlook');
          await db('calendar_sync_records').insert({
            org_id: orgId,
            official_id: officialId,
            calendar_id: calendar.id,
            event_id: ev.id,
            appointment_id: ev.appointment_id || null,
            direction: SyncDirection.EXPORT,
            status: 'FAILED',
            error_message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // 2. Fetch Outlook events and handle diff / import
      const outlookEvents: OutlookEventItem[] = await microsoftGraphService.fetchOutlookEvents(
        externalCalId,
        { from, to },
      );

      for (const outEv of outlookEvents) {
        // If event was created from an OAMS appointment: check authority rule (§8.4)
        if (outEv.oamsAppointmentId) {
          const apt = await db('appointments').where('id', outEv.oamsAppointmentId).first();

          if (apt) {
            const oamsStart = new Date(apt.start_at).getTime();
            const outlookStart = new Date(outEv.startAt).getTime();
            const isTimeChanged = Math.abs(oamsStart - outlookStart) > 60000; // > 1 min difference
            const isCancelled = outEv.isCancelled;

            if (isTimeChanged || isCancelled) {
              // OAMS is authoritative! Do NOT alter appointment date or cancel it.
              // Raise CalendarSyncMismatch notification to PA and Admin.
              mismatchesCount++;

              await db('appointments')
                .where('id', apt.id)
                .update({
                  calendar_sync_status: CalendarSyncStatus.MISMATCH,
                  calendar_sync_error: isCancelled
                    ? 'Appointment was deleted or cancelled in external Outlook calendar'
                    : `Appointment start time was changed in Outlook to ${outEv.startAt.toISOString()}`,
                  updated_at: db.fn.now(),
                });

              await db('calendar_sync_records').insert({
                org_id: orgId,
                official_id: officialId,
                calendar_id: calendar.id,
                appointment_id: apt.id,
                direction: SyncDirection.IMPORT,
                external_event_id: outEv.id,
                status: 'MISMATCH',
                error_message: isCancelled
                  ? 'External cancellation detected'
                  : 'External reschedule detected',
                details: JSON.stringify({
                  oamsStart: apt.start_at,
                  outlookStart: outEv.startAt,
                }),
              });

              // Dispatch CalendarSyncMismatch event
              try {
                await routeNotificationEvent({
                  id: `sync-mismatch-${Date.now()}-${apt.id}`,
                  orgId,
                  eventType: 'CalendarSyncMismatch',
                  aggregateType: 'appointment',
                  aggregateId: apt.id,
                  payload: {
                    officialId,
                    appointmentId: apt.id,
                    referenceNo: apt.reference_no,
                    externalEventId: outEv.id,
                    description: isCancelled
                      ? `Appointment ${apt.reference_no} was cancelled in Outlook. OAMS remains confirmed.`
                      : `Appointment ${apt.reference_no} was moved in Outlook. OAMS schedule remains authoritative.`,
                  },
                  occurredAt: new Date(),
                });
              } catch (notifErr) {
                logger.warn({ notifErr }, 'Failed to dispatch CalendarSyncMismatch notification');
              }

              continue;
            }
          }
        }

        // Non-OAMS external event: import as MEETING or BLOCK
        const existingImport = await db('calendar_events')
          .where({ calendar_id: calendar.id, external_id: outEv.id })
          .first();

        if (!existingImport) {
          // Idempotent insert
          await db('calendar_events').insert({
            org_id: orgId,
            calendar_id: calendar.id,
            official_id: officialId,
            kind: EventKind.MEETING,
            block_strength: BlockStrength.HARD,
            title: outEv.subject || 'External Meeting',
            start_at: outEv.startAt,
            end_at: outEv.endAt,
            occupied_range: db.raw(`tstzrange(?, ?, '[)')`, [outEv.startAt, outEv.endAt]),
            visibility: Visibility.INTERNAL,
            external_source: 'OUTLOOK',
            external_id: outEv.id,
            status: 'ACTIVE',
          });
          importedCount++;
        }
      }

      await db('calendars')
        .where('id', calendar.id)
        .update({
          last_synced_at: db.fn.now(),
          sync_status: mismatchesCount > 0 ? 'WARNING' : 'IDLE',
          last_sync_error: mismatchesCount > 0 ? `${mismatchesCount} mismatch(es) detected` : null,
          updated_at: db.fn.now(),
        });

      return {
        officialId,
        calendarType: CalendarType.ORG,
        exportedCount,
        importedCount,
        mismatchesCount,
        status: mismatchesCount > 0 ? 'PARTIAL' : 'SUCCESS',
      };
    } catch (err: any) {
      logger.error({ err, officialId }, 'Error during Org calendar sync');

      await db('calendars')
        .where('id', calendar.id)
        .update({
          sync_status: 'ERROR',
          last_sync_error: err instanceof Error ? err.message : String(err),
          updated_at: db.fn.now(),
        });

      try {
        await routeNotificationEvent({
          id: `sync-failed-${Date.now()}-${officialId}`,
          orgId,
          eventType: 'SyncFailed',
          aggregateType: 'calendar',
          aggregateId: calendar.id,
          payload: {
            officialId,
            syncType: 'ORG',
            errorMessage: err instanceof Error ? err.message : String(err),
          },
          occurredAt: new Date(),
        });
      } catch (e) {
        logger.warn({ err: e }, 'Failed to route SyncFailed event');
      }

      return {
        officialId,
        calendarType: CalendarType.ORG,
        exportedCount,
        importedCount,
        mismatchesCount,
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Read-Only Free/Busy Sync for PERSONAL calendar (§8.4)
   * Privacy rule: Never writes to Outlook, never imports titles or subject details.
   */
  private async syncPersonalCalendar(
    orgId: string,
    officialId: string,
    calendar: any,
    from: Date,
    to: Date,
  ): Promise<SyncRunResult> {
    let importedCount = 0;
    const externalCalId = calendar.external_calendar_id || 'personal';

    try {
      const freeBusySlots: OutlookFreeBusyItem[] = await microsoftGraphService.fetchOutlookFreeBusy(
        externalCalId,
        { from, to },
      );

      for (const slot of freeBusySlots) {
        if (slot.status === 'BUSY' || slot.status === 'OOF') {
          const externalSlotId = `fb-${slot.startAt.getTime()}-${slot.endAt.getTime()}`;

          const existing = await db('calendar_events')
            .where({ calendar_id: calendar.id, external_id: externalSlotId })
            .first();

          if (!existing) {
            // Must be titled "Busy" only (§8.1 & §8.4: NEVER import titles)
            await db('calendar_events').insert({
              org_id: orgId,
              calendar_id: calendar.id,
              official_id: officialId,
              kind: EventKind.PERSONAL,
              block_strength: BlockStrength.HARD,
              title: 'Busy',
              start_at: slot.startAt,
              end_at: slot.endAt,
              occupied_range: db.raw(`tstzrange(?, ?, '[)')`, [slot.startAt, slot.endAt]),
              visibility: Visibility.PERSONAL,
              external_source: 'OUTLOOK',
              external_id: externalSlotId,
              status: 'ACTIVE',
            });
            importedCount++;
          }
        }
      }

      await db('calendars').where('id', calendar.id).update({
        last_synced_at: db.fn.now(),
        sync_status: 'IDLE',
        last_sync_error: null,
        updated_at: db.fn.now(),
      });

      return {
        officialId,
        calendarType: CalendarType.PERSONAL,
        exportedCount: 0,
        importedCount,
        mismatchesCount: 0,
        status: 'SUCCESS',
      };
    } catch (err: any) {
      logger.error({ err, officialId }, 'Error during Personal free/busy sync');

      await db('calendars')
        .where('id', calendar.id)
        .update({
          sync_status: 'ERROR',
          last_sync_error: err instanceof Error ? err.message : String(err),
          updated_at: db.fn.now(),
        });

      return {
        officialId,
        calendarType: CalendarType.PERSONAL,
        exportedCount: 0,
        importedCount: 0,
        mismatchesCount: 0,
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Helper to generate a Teams meeting link for an appointment (§8.4)
   * Non-blocking: failures set calendar_sync_status to PENDING and do not throw.
   */
  async ensureTeamsMeetingLink(
    appointmentId: string,
  ): Promise<{ success: boolean; onlineLink?: string }> {
    const apt = await db('appointments').where('id', appointmentId).first();
    if (!apt || apt.meeting_mode !== 'ONLINE') {
      return { success: true };
    }

    if (apt.online_link && apt.calendar_sync_status === CalendarSyncStatus.SYNCED) {
      return { success: true, onlineLink: apt.online_link };
    }

    try {
      const teamsRes = await microsoftGraphService.createTeamsMeeting({
        subject: apt.subject,
        startAt: new Date(apt.start_at || Date.now()),
        endAt: new Date(apt.end_at || Date.now() + 30 * 60 * 1000),
      });

      await db('appointments').where('id', appointmentId).update({
        online_link: teamsRes.joinUrl,
        online_meeting_id: teamsRes.meetingId,
        calendar_sync_status: CalendarSyncStatus.SYNCED,
        calendar_sync_error: null,
        updated_at: db.fn.now(),
      });

      return { success: true, onlineLink: teamsRes.joinUrl };
    } catch (err: any) {
      logger.warn(
        { err, appointmentId },
        'Teams meeting link generation failed; setting calendar_sync_status to PENDING for background retry',
      );

      await db('appointments')
        .where('id', appointmentId)
        .update({
          calendar_sync_status: CalendarSyncStatus.PENDING,
          calendar_sync_error: err instanceof Error ? err.message : String(err),
          updated_at: db.fn.now(),
        });

      return { success: false };
    }
  }
}

export const calendarSyncService = new CalendarSyncService();
