import { db } from '../core/db.js';
import { logger } from '../core/logger.js';
import { calendarSyncService } from '../modules/calendars/syncService.js';
import { CalendarSyncStatus, MeetingMode } from '@oams/shared';

let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Calendar Sync & Retry Worker (§8.4, §20)
 * 1. Retries pending Teams meeting links for ONLINE appointments.
 * 2. Runs two-way synchronization for enabled official calendars.
 */
export async function processCalendarSyncOnce(orgId?: string): Promise<{
  teamsLinksRetried: number;
  calendarsSynced: number;
}> {
  let teamsLinksRetried = 0;
  let calendarsSynced = 0;

  // 1. Retry pending Teams meeting links
  const pendingAppointmentsQuery = db('appointments')
    .where('calendar_sync_status', CalendarSyncStatus.PENDING)
    .where('meeting_mode', MeetingMode.ONLINE)
    .whereIn('status', ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS']);

  if (orgId) {
    pendingAppointmentsQuery.where('org_id', orgId);
  }

  const pendingAppointments = await pendingAppointmentsQuery.select('id', 'reference_no');

  for (const apt of pendingAppointments) {
    try {
      const res = await calendarSyncService.ensureTeamsMeetingLink(apt.id);
      if (res.success && res.onlineLink) {
        teamsLinksRetried++;
        logger.info(
          { appointmentId: apt.id, referenceNo: apt.reference_no },
          'Successfully resolved pending Teams meeting link during background job',
        );
      }
    } catch (err) {
      logger.warn({ err, appointmentId: apt.id }, 'Background retry for Teams meeting link failed');
    }
  }

  // 2. Sync enabled official calendars
  const enabledOfficialsQuery = db('calendars')
    .where('sync_enabled', true)
    .join('officials', 'calendars.official_id', 'officials.id')
    .select('calendars.official_id as officialId', 'officials.org_id as orgId')
    .distinct();

  if (orgId) {
    enabledOfficialsQuery.where('officials.org_id', orgId);
  }

  const enabledOfficials = await enabledOfficialsQuery;

  for (const row of enabledOfficials) {
    try {
      await calendarSyncService.syncOfficialCalendars({
        orgId: row.orgId,
        officialId: row.officialId,
      });
      calendarsSynced++;
    } catch (err) {
      logger.error({ err, officialId: row.officialId }, 'Error running scheduled calendar sync');
    }
  }

  return { teamsLinksRetried, calendarsSynced };
}

/**
 * Start recurring calendar-sync job (runs every 5 minutes per §20)
 */
export function startCalendarSyncJob(intervalMs = 5 * 60 * 1000): void {
  if (intervalHandle) return;

  logger.info({ intervalMs }, 'Starting calendar-sync background worker (§20)');

  intervalHandle = setInterval(async () => {
    try {
      await processCalendarSyncOnce();
    } catch (err) {
      logger.error({ err }, 'Unhandled error in calendar-sync interval worker');
    }
  }, intervalMs);
}

export function stopCalendarSyncJob(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('Stopped calendar-sync background worker');
  }
}
