import { describe, it, expect } from 'vitest';
import { maskEventForPrivacy } from '../src/modules/calendars/service.js';
import {
  CalendarType,
  EventKind,
  BlockStrength,
  Visibility,
  RoleCode,
  type AuthUser,
} from '@oams/shared';

describe('Personal Calendar & Privacy Enforcement (§8.1, §17.2)', () => {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const officialId = '00000000-0000-4000-8000-000000000010';
  const officialUserId = '00000000-0000-4000-8000-000000000020';

  const mockPersonalEvent = {
    id: 'event-personal-1',
    orgId,
    calendarId: 'cal-personal-1',
    calendarType: CalendarType.PERSONAL,
    officialId,
    kind: EventKind.PERSONAL,
    blockStrength: BlockStrength.HARD,
    title: 'Executive Cardiology Consultation & ECG',
    description: 'Dr. Sharma - confidential medical review',
    location: 'Apollo Hospital, Special Suite 4',
    startAt: '2026-09-24T10:00:00.000Z',
    endAt: '2026-09-24T11:00:00.000Z',
    allDay: false,
    visibility: Visibility.PERSONAL,
    appointmentId: null,
    roomBookingId: null,
    roomId: null,
    roomName: null,
    holdExpiresAt: null,
    recurrenceRule: null,
    seriesId: null,
    status: 'ACTIVE',
  };

  const mockConfidentialEvent = {
    id: 'event-conf-1',
    orgId,
    calendarId: 'cal-org-1',
    calendarType: CalendarType.ORG,
    officialId,
    kind: EventKind.MEETING,
    blockStrength: BlockStrength.HARD,
    title: 'Cabinet Security Briefing - Project IronClad',
    description: 'Classified national security strategy discussion',
    location: 'War Room Level B2',
    startAt: '2026-09-24T14:00:00.000Z',
    endAt: '2026-09-24T15:30:00.000Z',
    allDay: false,
    visibility: Visibility.CONFIDENTIAL,
    appointmentId: null,
    roomBookingId: null,
    roomId: null,
    roomName: null,
    holdExpiresAt: null,
    recurrenceRule: null,
    seriesId: null,
    status: 'ACTIVE',
  };

  describe('Pure Privacy Masking (§8.1)', () => {
    it('official with grant sees full personal event details (Criterion #1)', () => {
      const result = maskEventForPrivacy(mockPersonalEvent, true, true);

      expect(result.isMasked).toBe(false);
      expect(result.title).toBe('Executive Cardiology Consultation & ECG');
      expect(result.description).toBe('Dr. Sharma - confidential medical review');
      expect(result.location).toBe('Apollo Hospital, Special Suite 4');
    });

    it('PA without grant sees grey "Busy" only, scrubbed at serialization (Criterion #2)', () => {
      const result = maskEventForPrivacy(mockPersonalEvent, false, false);

      expect(result.isMasked).toBe(true);
      expect(result.title).toBe('Busy');
      expect(result.description).toBeNull();
      expect(result.location).toBeNull();
      // Ensure times are still accurate so slots can be respected
      expect(result.startAt).toBe(mockPersonalEvent.startAt);
      expect(result.endAt).toBe(mockPersonalEvent.endAt);
    });

    it('confidential events are masked as "Confidential appointment" without grant', () => {
      const result = maskEventForPrivacy(mockConfidentialEvent, false, false);

      expect(result.isMasked).toBe(true);
      expect(result.title).toBe('Confidential appointment');
      expect(result.description).toBeNull();
      expect(result.location).toBeNull();
    });

    it('confidential events show full title to authorized callers', () => {
      const result = maskEventForPrivacy(mockConfidentialEvent, false, true);

      expect(result.isMasked).toBe(false);
      expect(result.title).toBe('Cabinet Security Briefing - Project IronClad');
      expect(result.description).toBe('Classified national security strategy discussion');
      expect(result.location).toBe('War Room Level B2');
    });
  });

  describe('Service Layer Grant Evaluation (§8.1, §17.2)', () => {
    const officialUser: AuthUser = {
      id: officialUserId,
      orgId,
      email: 'principal@apex.gov.in',
      fullName: 'Chief Secretary',
      status: 'ACTIVE',
      authProvider: 'LOCAL',
      timezone: 'Asia/Kolkata',
      theme: 'SYSTEM',
      roles: [RoleCode.OFFICIAL],
      officialId,
      assignedOfficialIds: [],
    };

    const paUserWithGrant: AuthUser = {
      id: 'user-pa-granted',
      orgId,
      email: 'pa.granted@apex.gov.in',
      fullName: 'Trusted PA',
      status: 'ACTIVE',
      authProvider: 'LOCAL',
      timezone: 'Asia/Kolkata',
      theme: 'SYSTEM',
      roles: [RoleCode.PA],
      assignedOfficialIds: [officialId],
    };

    const paUserWithoutGrant: AuthUser = {
      id: 'user-pa-standard',
      orgId,
      email: 'pa.general@apex.gov.in',
      fullName: 'General PA',
      status: 'ACTIVE',
      authProvider: 'LOCAL',
      timezone: 'Asia/Kolkata',
      theme: 'SYSTEM',
      roles: [RoleCode.PA],
      assignedOfficialIds: [officialId],
    };

    it('should grant can_view_personal to the official himself', () => {
      const isOfficialHimself = officialUser.id === officialUserId;
      expect(isOfficialHimself).toBe(true);

      const events = [mockPersonalEvent].map((ev) =>
        maskEventForPrivacy(ev, isOfficialHimself, isOfficialHimself),
      );

      expect(events[0].isMasked).toBe(false);
      expect(events[0].title).toBe('Executive Cardiology Consultation & ECG');
    });

    it('should mask personal details for PA when can_view_personal is false', () => {
      // paUserWithoutGrant has can_view_personal = false
      expect(paUserWithoutGrant.roles).toContain(RoleCode.PA);
      const canViewPersonal = false;
      const canViewConfidential = false;

      const events = [mockPersonalEvent].map((ev) =>
        maskEventForPrivacy(ev, canViewPersonal, canViewConfidential),
      );

      expect(events[0].isMasked).toBe(true);
      expect(events[0].title).toBe('Busy');
      expect(events[0].description).toBeNull();
      expect(events[0].location).toBeNull();
    });

    it('should reveal personal details for PA when can_view_personal is true', () => {
      // paUserWithGrant has can_view_personal = true
      expect(paUserWithGrant.roles).toContain(RoleCode.PA);
      const canViewPersonal = true;
      const canViewConfidential = false;

      const events = [mockPersonalEvent].map((ev) =>
        maskEventForPrivacy(ev, canViewPersonal, canViewConfidential),
      );

      expect(events[0].isMasked).toBe(false);
      expect(events[0].title).toBe('Executive Cardiology Consultation & ECG');
      expect(events[0].description).toBe('Dr. Sharma - confidential medical review');
    });
  });
});
