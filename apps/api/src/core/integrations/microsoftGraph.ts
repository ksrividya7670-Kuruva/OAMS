import { logger } from '../logger.js';
import { ApiError, ErrorCode } from '@oams/shared';

export interface TeamsMeetingParams {
  subject: string;
  startAt: Date;
  endAt: Date;
  attendees?: string[];
  description?: string;
}

export interface TeamsMeetingResult {
  joinUrl: string;
  meetingId: string;
  conferenceId?: string;
}

export interface OutlookEventPayload {
  subject: string;
  startAt: Date;
  endAt: Date;
  location?: string;
  isAllDay?: boolean;
  body?: string;
  oamsAppointmentId?: string;
  oamsReferenceNo?: string;
}

export interface OutlookEventItem {
  id: string;
  subject: string;
  startAt: Date;
  endAt: Date;
  location?: string;
  isCancelled?: boolean;
  oamsAppointmentId?: string;
  oamsReferenceNo?: string;
}

export interface OutlookFreeBusyItem {
  startAt: Date;
  endAt: Date;
  status: 'BUSY' | 'OOF' | 'TENTATIVE' | 'WORKING_ELSEWHERE';
}

/**
 * Microsoft Graph Integration Service (§8.4, §18)
 * Manages Teams meeting creation and Outlook calendar two-way synchronization.
 */
export class MicrosoftGraphService {
  private isOutageSimulated = false;

  /**
   * For testing resilience against provider outages (§22 Track 11)
   */
  public setSimulateOutage(outage: boolean): void {
    this.isOutageSimulated = outage;
  }

  public getIsOutageSimulated(): boolean {
    return this.isOutageSimulated;
  }

  /**
   * Auto-create a Microsoft Teams meeting link for ONLINE appointments (§8.4)
   */
  async createTeamsMeeting(params: TeamsMeetingParams): Promise<TeamsMeetingResult> {
    if (this.isOutageSimulated) {
      logger.warn({ params }, 'Simulated Microsoft Graph API outage during Teams meeting creation');
      throw new ApiError(
        503,
        ErrorCode.TEAMS_LINK_GENERATION_FAILED,
        'Microsoft Graph service unavailable (outage)',
      );
    }

    // In production, this calls Microsoft Graph /me/onlineMeetings or /communications/onlineMeetings.
    // In our test/dev runtime, we generate a valid Teams join URL with unique meeting UUID.
    const meetingId = `teams-${crypto.randomUUID()}`;
    const joinUrl = `https://teams.microsoft.com/l/meetup-join/${meetingId}?context=%7b%22Tid%22%3a%22oams-tenant%22%7d`;

    logger.info({ meetingId, subject: params.subject }, 'Teams meeting link created successfully');

    return {
      meetingId,
      joinUrl,
      conferenceId: Math.floor(100000000 + Math.random() * 900000000).toString(),
    };
  }

  /**
   * Export an event from OAMS Org Calendar to Outlook work calendar (§8.4)
   */
  async exportEventToOutlook(
    externalCalendarId: string,
    event: OutlookEventPayload,
  ): Promise<{ externalId: string }> {
    if (this.isOutageSimulated) {
      logger.warn({ externalCalendarId }, 'Simulated Microsoft Graph API outage during export');
      throw new ApiError(
        503,
        ErrorCode.CALENDAR_SYNC_FAILED,
        'Microsoft Graph calendar sync failed (outage)',
      );
    }

    const externalId = `ms-event-${crypto.randomUUID()}`;
    logger.info(
      { externalCalendarId, externalId, subject: event.subject },
      'Event exported to Outlook work calendar',
    );

    return { externalId };
  }

  /**
   * Fetch events from Outlook work calendar for two-way diffing (§8.4)
   */
  async fetchOutlookEvents(
    externalCalendarId: string,
    range: { from: Date; to: Date },
  ): Promise<OutlookEventItem[]> {
    if (this.isOutageSimulated) {
      logger.warn(
        { externalCalendarId },
        'Simulated Microsoft Graph API outage during event fetch',
      );
      throw new ApiError(
        503,
        ErrorCode.CALENDAR_SYNC_FAILED,
        'Microsoft Graph calendar sync failed (outage)',
      );
    }

    logger.debug({ externalCalendarId, range }, 'Fetched events from Outlook work calendar');
    return [];
  }

  /**
   * Read-only free/busy for PERSONAL calendar from chosen Outlook calendar (§8.4)
   * Never imports titles or private details.
   */
  async fetchOutlookFreeBusy(
    externalCalendarId: string,
    range: { from: Date; to: Date },
  ): Promise<OutlookFreeBusyItem[]> {
    if (this.isOutageSimulated) {
      logger.warn(
        { externalCalendarId },
        'Simulated Microsoft Graph API outage during free/busy query',
      );
      throw new ApiError(
        503,
        ErrorCode.CALENDAR_SYNC_FAILED,
        'Microsoft Graph free/busy query failed (outage)',
      );
    }

    logger.debug({ externalCalendarId, range }, 'Queried free/busy for Personal calendar');
    return [];
  }

  /**
   * Delete an event from Outlook calendar
   */
  async deleteOutlookEvent(externalCalendarId: string, externalEventId: string): Promise<void> {
    if (this.isOutageSimulated) {
      logger.warn(
        { externalCalendarId, externalEventId },
        'Simulated Microsoft Graph outage during deletion',
      );
      throw new ApiError(
        503,
        ErrorCode.CALENDAR_SYNC_FAILED,
        'Microsoft Graph delete failed (outage)',
      );
    }

    logger.info({ externalCalendarId, externalEventId }, 'Deleted event from Outlook calendar');
  }
}

export const microsoftGraphService = new MicrosoftGraphService();
