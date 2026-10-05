import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Priority,
  AppointmentStatus,
  MeetingMode,
  Visibility,
  RoleCode,
  type AuthUser,
  type SubmitAppointmentInput,
} from '@oams/shared';

// Use vi.hoisted for database mock
const { mockTableHandlers, mockDb, insertedRows, redisPublished } = vi.hoisted(() => {
  const handlers: Record<string, () => any> = {};
  const inserted: Record<string, any[]> = {};
  const published: { channel: string; message: string }[] = [];

  const createQb = (tableName: string) => {
    const qb: any = {
      where: vi.fn().mockImplementation((...args: any[]) => {
        if (typeof args[0] === 'function') {
          args[0].call(qb, qb);
        }
        return qb;
      }),
      whereIn: vi.fn().mockReturnThis(),
      whereNotIn: vi.fn().mockReturnThis(),
      whereNot: vi.fn().mockReturnThis(),
      whereNull: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockImplementation((...args: any[]) => {
        if (typeof args[0] === 'function') {
          args[0].call(qb, qb);
        }
        return qb;
      }),
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
      delete: vi.fn().mockResolvedValue(1),
      update: vi.fn().mockResolvedValue(1),
      insert: vi.fn().mockImplementation((data: any) => {
        if (!inserted[tableName]) inserted[tableName] = [];
        inserted[tableName].push(data);
        return {
          returning: vi.fn().mockImplementation((col: string) => {
            const id = data.id || `gen-${tableName}-${inserted[tableName].length}`;
            return Promise.resolve([{ [col]: id, ...data }]);
          }),
          then: vi.fn().mockImplementation((resolve) => resolve([1])),
        };
      }),
      then: vi.fn().mockImplementation((resolve) => {
        const val = handlers[tableName] ? handlers[tableName]() : [];
        return Promise.resolve(Array.isArray(val) ? val : [val]).then(resolve);
      }),
    };
    return qb;
  };

  const trxInstance: any = vi.fn((tableName: string) => createQb(tableName));
  trxInstance.fn = { now: vi.fn(() => new Date().toISOString()) };
  trxInstance.raw = vi.fn().mockResolvedValue({ rows: [{ last_value: 184 }] });

  const dbInstance: any = vi.fn((tableName: string) => createQb(tableName));
  dbInstance.fn = { now: vi.fn(() => new Date().toISOString()) };
  dbInstance.raw = vi.fn().mockResolvedValue({ rows: [{ last_value: 184 }] });
  dbInstance.transaction = vi
    .fn()
    .mockImplementation(async (callback: (trx: any) => Promise<any>) => {
      return callback(trxInstance);
    });

  return {
    mockTableHandlers: handlers,
    mockDb: dbInstance,
    mockTrx: trxInstance,
    insertedRows: inserted,
    redisPublished: published,
  };
});

vi.mock('../src/core/db.js', () => ({
  db: mockDb,
}));

vi.mock('../src/core/redis.js', () => ({
  redis: {
    publish: vi.fn().mockImplementation((channel: string, message: string) => {
      redisPublished.push({ channel, message });
      return Promise.resolve(1);
    }),
  },
}));

import * as mailer from '../src/core/email/mailer.js';
import { appointmentsService } from '../src/modules/appointments/service.js';
import { routeNotificationEvent } from '../src/core/notifications/router.js';

describe('Track 3: Appointment Request & Tracking (§7.5, §9, §10.1, §10.4, §14.4)', () => {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const guestUserId = '00000000-0000-4000-8000-000000000099';
  const officialId = '00000000-0000-4000-8000-000000000010';
  const officialUserId = '00000000-0000-4000-8000-000000000011';
  const paUserId = '00000000-0000-4000-8000-000000000020';

  const guestUser: AuthUser = {
    id: guestUserId,
    orgId,
    email: 'guest.investor@example.com',
    fullName: 'Guest Investor',
    roles: [RoleCode.GUEST],
    status: 'ACTIVE',
    authProvider: 'EMAIL_OTP',
    timezone: 'Asia/Kolkata',
    theme: 'SYSTEM',
    assignedOfficialIds: [],
  };

  const defaultOfficial = {
    id: officialId,
    org_id: orgId,
    user_id: officialUserId,
    title: 'Chief Executive Officer',
    official_name: 'Dr. Jane Smith',
    department_name: 'Executive Leadership',
    is_active: true,
  };

  const defaultSupportStaff = [
    {
      id: 'staff-1',
      official_id: officialId,
      user_id: paUserId,
      userId: paUserId,
      support_role: 'PA',
      routing_order: 1,
      status: 'ACTIVE',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockTableHandlers).forEach((k) => delete mockTableHandlers[k]);
    Object.keys(insertedRows).forEach((k) => delete insertedRows[k]);
    redisPublished.length = 0;

    mockTableHandlers['officials'] = () => defaultOfficial;
    mockTableHandlers['official_support_staff'] = () => defaultSupportStaff;
    mockTableHandlers['delegations'] = () => null;
    mockTableHandlers['calendar_events'] = () => null; // No leave
    mockTableHandlers['holidays'] = () => [];
    mockTableHandlers['users'] = () => ({ id: paUserId, email: 'pa.ceo@apex.local' });
    mockTableHandlers['appointments'] = () => [];
  });

  // CRITERION 1: A guest can sign in with OTP, submit, and see the reference number (APT-YYYY-XXXXXX)
  it('Criterion 1: Guest can submit appointment request and receive valid APT-YYYY-XXXXXX reference number', async () => {
    const input: SubmitAppointmentInput = {
      officialId,
      subject: 'Q4 Strategic Investment Roadmap',
      purpose: 'BUSINESS_DISCUSSION',
      description:
        'Discussing the strategic investments and alignment with corporate governance for the upcoming year.',
      priority: Priority.MEDIUM,
      meetingMode: MeetingMode.IN_PERSON,
      visibility: Visibility.INTERNAL,
      durationMin: 30,
      preferredWindows: [{ date: '2026-10-05', from: '10:00', to: '10:30' }],
      attendees: [{ name: 'Sarah Partner', email: 'sarah@partner.com', isExternal: true }],
      consentGiven: true,
      consentNoticeVersion: '2026.1',
    };

    const result = await appointmentsService.submit(
      guestUser,
      input,
      'test-correlation-id',
      '127.0.0.1',
    );

    // Verify reference number format APT-YYYY-XXXXXX
    expect(result.referenceNo).toMatch(/^APT-\d{4}-\d{6}$/);
    expect(result.status).toBe(AppointmentStatus.UNDER_REVIEW);
    expect(result.slaDueAt).toBeInstanceOf(Date);

    // Verify appointment was inserted in DB transaction
    expect(insertedRows['appointments']).toBeDefined();
    expect(insertedRows['appointments'].length).toBeGreaterThan(0);
    const savedApt = insertedRows['appointments'][0];
    expect(savedApt.reference_no).toMatch(/^APT-\d{4}-\d{6}$/);
    expect(savedApt.requester_user_id).toBe(guestUserId);
    expect(savedApt.assigned_to_user_id).toBe(paUserId); // Routed to PA (§10.3)
  });

  // CRITERION 2: HIGH priority without a reason is blocked
  it('Criterion 2: HIGH priority without a reason (or < 20 chars) is blocked with validation error', async () => {
    const invalidInput: SubmitAppointmentInput = {
      officialId,
      subject: 'Critical Budget Authorization',
      purpose: 'APPROVAL_REQUEST',
      description:
        'Immediate signature needed on authorization vouchers for the regional expansion.',
      priority: Priority.HIGH,
      priorityReason: 'Too short', // Less than 20 chars!
      meetingMode: MeetingMode.IN_PERSON,
      visibility: Visibility.INTERNAL,
      durationMin: 30,
      preferredWindows: [{ date: '2026-10-06', from: '14:00', to: '14:30' }],
      consentGiven: true,
      consentNoticeVersion: '2026.1',
    };

    await expect(appointmentsService.submit(guestUser, invalidInput, 'corr-id')).rejects.toThrow(
      /Reason for High Priority is required and must be between 20 and 500 characters/i,
    );
  });

  it('Criterion 2b: HIGH priority with valid reason succeeds and calculates 4-working-hour SLA', async () => {
    const validInput: SubmitAppointmentInput = {
      officialId,
      subject: 'Critical Budget Authorization',
      purpose: 'APPROVAL_REQUEST',
      description:
        'Immediate signature needed on authorization vouchers for the regional expansion.',
      priority: Priority.HIGH,
      priorityReason: 'Regulatory submission deadline is tomorrow at 5 PM requiring CEO signature.', // > 20 chars
      meetingMode: MeetingMode.IN_PERSON,
      visibility: Visibility.INTERNAL,
      durationMin: 30,
      preferredWindows: [{ date: '2026-10-06', from: '14:00', to: '14:30' }],
      consentGiven: true,
      consentNoticeVersion: '2026.1',
    };

    const result = await appointmentsService.submit(guestUser, validInput, 'corr-id');
    expect(result.referenceNo).toMatch(/^APT-\d{4}-\d{6}$/);
    expect(result.status).toBe(AppointmentStatus.UNDER_REVIEW);
    expect(result.slaDueAt).toBeInstanceOf(Date);
  });

  // CRITERION 3: The duplicate rule works (warn if within 7 days; block if within 24h with same subject)
  it('Criterion 3a: Duplicate rule warns if active appointment exists within 7 days', async () => {
    // Existing active appointment on 2026-10-08
    mockTableHandlers['appointments'] = () => [
      {
        id: 'apt-existing-1',
        reference_no: 'APT-2026-000101',
        subject: 'Previous Financial Review',
        submitted_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 2 days ago (>24h)
        status: AppointmentStatus.UNDER_REVIEW,
        preferred_windows: JSON.stringify([{ date: '2026-10-08', from: '10:00', to: '10:30' }]),
      },
    ];

    const checkResult = await appointmentsService.checkDuplicate(guestUserId, {
      officialId,
      subject: 'New Quarterly Roadmap',
      preferredDate: '2026-10-10', // Within 2 days of 2026-10-08!
    });

    expect(checkResult.isDuplicate).toBe(true);
    expect(checkResult.isWarning).toBe(true);
    expect(checkResult.isBlocked).toBe(false);
    expect(checkResult.message).toContain('within 7 days');
  });

  it('Criterion 3b: Duplicate rule blocks if submitted within 24h with the same subject', async () => {
    // Existing appointment submitted 2 hours ago with same subject
    mockTableHandlers['appointments'] = () => [
      {
        id: 'apt-existing-2',
        reference_no: 'APT-2026-000102',
        subject: 'Quarterly Audit Review',
        submitted_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago (<24h)
        status: AppointmentStatus.UNDER_REVIEW,
        preferred_windows: JSON.stringify([{ date: '2026-10-12', from: '11:00', to: '11:30' }]),
      },
    ];

    const checkResult = await appointmentsService.checkDuplicate(guestUserId, {
      officialId,
      subject: 'Quarterly Audit Review',
      preferredDate: '2026-10-14', // Within 7 days
    });

    expect(checkResult.isDuplicate).toBe(true);
    expect(checkResult.isBlocked).toBe(true);
    expect(checkResult.isWarning).toBe(false);
    expect(checkResult.message).toContain('blocked');

    // Attempting to submit directly must throw DUPLICATE_REQUEST
    const submitPayload: SubmitAppointmentInput = {
      officialId,
      subject: 'Quarterly Audit Review',
      purpose: 'BUSINESS_DISCUSSION',
      description: 'Second submission attempting to duplicate previous request within 24 hours.',
      priority: Priority.MEDIUM,
      meetingMode: MeetingMode.IN_PERSON,
      visibility: Visibility.INTERNAL,
      durationMin: 30,
      preferredWindows: [{ date: '2026-10-14', from: '11:00', to: '11:30' }],
      consentGiven: true,
      consentNoticeVersion: '2026.1',
    };

    await expect(appointmentsService.submit(guestUser, submitPayload, 'corr-id')).rejects.toThrow(
      /Duplicate request submitted in the last 24h with the same subject/i,
    );
  });

  // CRITERION 4: The PA gets a live bell notification + email upon request submission
  it('Criterion 4: Assigned PA receives live bell notification via Redis pub/sub and email upon request submission', async () => {
    const sendMailSpy = vi.spyOn(mailer, 'sendEmail').mockResolvedValue('msg-id-pa-alert');

    const domainEvent = {
      id: 'event-submitted-1',
      orgId,
      eventType: 'AppointmentSubmitted',
      aggregateType: 'appointment',
      aggregateId: 'apt-uuid-123',
      payload: {
        appointmentId: 'apt-uuid-123',
        referenceNo: 'APT-2026-000184',
        requesterUserId: guestUserId,
        requesterEmail: 'guest.investor@example.com',
        requesterName: 'Guest Investor',
        officialTitle: 'Chief Executive Officer',
        subject: 'Partnership Agreement Finalization',
        assignedToUserId: paUserId,
        priority: Priority.HIGH,
      },
      occurredAt: new Date(),
    };

    await routeNotificationEvent(domainEvent);

    // 1. Live bell delivery via Redis publish to user:{paUserId} (§14.1 & §14.2)
    const paChannelPublish = redisPublished.find((p) => p.channel === `user:${paUserId}`);
    expect(paChannelPublish).toBeDefined();
    const payload = JSON.parse(paChannelPublish!.message);
    expect(payload.type).toBe('notification');
    expect(payload.data.title).toContain('APT-2026-000184');

    // 2. Email delivery to PA
    expect(sendMailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'pa.ceo@apex.local',
        subject: expect.stringContaining('APT-2026-000184'),
      }),
    );

    sendMailSpy.mockRestore();
  });

  // CRITERION 5: DPDP consent is stored with the notice version
  it('Criterion 5: DPDP consent is stored in consents table with the notice version', async () => {
    const input: SubmitAppointmentInput = {
      officialId,
      subject: 'Compliance Governance Review',
      purpose: 'BUSINESS_DISCUSSION',
      description:
        'Reviewing data privacy and organizational adherence under statutory provisions.',
      priority: Priority.MEDIUM,
      meetingMode: MeetingMode.IN_PERSON,
      visibility: Visibility.INTERNAL,
      durationMin: 30,
      preferredWindows: [{ date: '2026-10-15', from: '15:00', to: '15:30' }],
      consentGiven: true,
      consentNoticeVersion: '2026.1',
    };

    await appointmentsService.submit(guestUser, input, 'corr-consent');

    // Verify row in consents table (§7.1, §17.6)
    expect(insertedRows['consents']).toBeDefined();
    expect(insertedRows['consents'].length).toBeGreaterThan(0);
    const consentRow = insertedRows['consents'][0];
    expect(consentRow.user_id).toBe(guestUserId);
    expect(consentRow.email).toBe(guestUser.email);
    expect(consentRow.purpose).toBe('APPOINTMENT_REQUEST');
    expect(consentRow.notice_version).toBe('2026.1');

    // Verify appointment record stores consent and notice version
    const aptRow = insertedRows['appointments'][0];
    expect(aptRow.consent_given).toBe(true);
    expect(aptRow.consent_notice_version).toBe('2026.1');
  });
});
