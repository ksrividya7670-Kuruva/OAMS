import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deliverInAppAndEmail, isUserInQuietHours } from '../src/core/notifications/router.js';
import { processQuietHoursReleaseOnce } from '../src/jobs/quietHoursRelease.js';
import { processDailyDigestOnce } from '../src/jobs/dailyDigest.js';
import { Priority } from '@oams/shared';

const { usersTable, notificationsTable, deliveriesTable, sentEmails, publishedRedis } = vi.hoisted(
  () => ({
    usersTable: [] as any[],
    notificationsTable: [] as any[],
    deliveriesTable: [] as any[],
    sentEmails: [] as any[],
    publishedRedis: [] as any[],
  }),
);

vi.mock('../src/core/db.js', () => {
  const trxFn: any = vi.fn().mockImplementation((tableName: string) => {
    let whereClauses: Record<string, any> = {};
    const whereInClauses: Record<string, any[]> = {};

    const qb: any = {
      where: vi.fn().mockImplementation((col: any, val?: any) => {
        if (typeof col === 'object') {
          whereClauses = { ...whereClauses, ...col };
        } else {
          whereClauses[col] = val;
        }
        return qb;
      }),
      whereIn: vi.fn().mockImplementation((col: string, values: any[]) => {
        whereInClauses[col] = values;
        return qb;
      }),
      join: vi.fn().mockReturnThis(),
      first: vi.fn().mockImplementation(async () => {
        if (tableName === 'users') {
          return usersTable.find((u) => u.id === whereClauses.id);
        }
        if (tableName === 'notifications') {
          return notificationsTable.find((n) => n.dedupe_key === whereClauses.dedupe_key);
        }
        return null;
      }),
      select: vi.fn().mockImplementation(async () => {
        if (tableName === 'notification_deliveries') {
          return deliveriesTable
            .filter((d) => {
              if (
                whereClauses['notification_deliveries.channel'] &&
                d.channel !== whereClauses['notification_deliveries.channel']
              ) {
                return false;
              }
              if (
                whereClauses['notification_deliveries.status'] &&
                d.status !== whereClauses['notification_deliveries.status']
              ) {
                return false;
              }
              return true;
            })
            .map((d) => {
              const notif = notificationsTable.find((n) => n.id === d.notification_id);
              const user = usersTable.find((u) => u.id === notif?.user_id);
              return {
                delivery_id: d.id,
                notification_id: d.notification_id,
                title: notif?.title,
                body: notif?.body,
                link: notif?.link,
                priority: notif?.priority,
                created_at: notif?.created_at,
                user_id: user?.id,
                email: user?.email,
                full_name: user?.full_name,
                quiet_hours_start: user?.quiet_hours_start,
                quiet_hours_end: user?.quiet_hours_end,
                timezone: user?.timezone,
              };
            });
        }
        return [];
      }),
      insert: vi.fn().mockImplementation((data: any) => {
        const id = data.id || `gen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const record = { ...data, id, created_at: new Date() };

        if (tableName === 'notifications') {
          notificationsTable.push(record);
        } else if (tableName === 'notification_deliveries') {
          deliveriesTable.push(record);
        }

        const promise: any = Promise.resolve([record]);
        promise.returning = vi.fn().mockResolvedValue([record]);
        return promise;
      }),
      update: vi.fn().mockImplementation((updates: any) => {
        if (tableName === 'notification_deliveries') {
          for (const d of deliveriesTable) {
            if (whereClauses.id && d.id === whereClauses.id) {
              Object.assign(d, updates);
            }
            if (whereInClauses.id && whereInClauses.id.includes(d.id)) {
              Object.assign(d, updates);
            }
          }
        }
        const promise: any = Promise.resolve([updates]);
        promise.returning = vi.fn().mockResolvedValue([updates]);
        return promise;
      }),
    };

    return qb;
  });

  trxFn.fn = { now: () => new Date() };
  trxFn.transaction = vi.fn().mockImplementation(async (cb: any) => cb(trxFn));

  return { db: trxFn };
});

vi.mock('../src/core/redis.js', () => ({
  redis: {
    publish: vi.fn().mockImplementation(async (channel: string, message: string) => {
      publishedRedis.push({ channel, message });
    }),
  },
}));

vi.mock('../src/core/email/mailer.js', () => ({
  sendEmail: vi.fn().mockImplementation(async (options: any) => {
    sentEmails.push(options);
    return { messageId: 'mock-msg-id' };
  }),
}));

describe('Track 9: Quiet Hours & Daily Digest (§14.3, §22 Track 9)', () => {
  beforeEach(() => {
    usersTable.length = 0;
    notificationsTable.length = 0;
    deliveriesTable.length = 0;
    sentEmails.length = 0;
    publishedRedis.length = 0;
  });

  describe('isUserInQuietHours helper', () => {
    it('detects time within midnight-crossing quiet hours (22:00 to 07:00)', () => {
      // 23:30 UTC in UTC
      const nightTime = new Date('2026-09-23T23:30:00Z');
      expect(isUserInQuietHours('22:00', '07:00', 'UTC', nightTime)).toBe(true);

      // 03:00 UTC
      const earlyMorning = new Date('2026-09-23T03:00:00Z');
      expect(isUserInQuietHours('22:00', '07:00', 'UTC', earlyMorning)).toBe(true);

      // 12:00 UTC (daytime)
      const midday = new Date('2026-09-23T12:00:00Z');
      expect(isUserInQuietHours('22:00', '07:00', 'UTC', midday)).toBe(false);
    });

    it('returns false when quiet hours are not configured', () => {
      expect(isUserInQuietHours(null, null, 'UTC', new Date())).toBe(false);
      expect(isUserInQuietHours('22:00', '22:00', 'UTC', new Date())).toBe(false);
    });
  });

  describe('Quiet hours holding and URGENT bypass (§14.3)', () => {
    it('holds non-urgent emails during quiet hours, while delivering in-app', async () => {
      usersTable.push({
        id: 'user-quiet',
        email: 'nightowl@apex.gov',
        full_name: 'Night Owl',
        quiet_hours_start: '00:00',
        quiet_hours_end: '23:59', // All-day quiet hours for deterministic testing
        timezone: 'UTC',
        digest_mode: 'OFF',
      });

      await deliverInAppAndEmail({
        orgId: 'org-1',
        userId: 'user-quiet',
        eventType: 'AppointmentSubmitted',
        title: 'New Request Received',
        body: 'A requester submitted request APT-100',
        link: '/app/appointments/apt-100',
        priority: Priority.MEDIUM,
        entityType: 'appointment',
        entityId: 'apt-100',
        dedupeKey: 'notif-quiet-medium-1',
      });

      // 1. IN_APP notification was inserted & delivered
      const inAppDelivery = deliveriesTable.find((d) => d.channel === 'IN_APP');
      expect(inAppDelivery).toBeDefined();
      expect(inAppDelivery.status).toBe('SENT');

      // 2. Published to Redis for live bell updates
      expect(publishedRedis.length).toBe(1);

      // 3. EMAIL delivery was held due to quiet hours
      const emailDelivery = deliveriesTable.find((d) => d.channel === 'EMAIL');
      expect(emailDelivery).toBeDefined();
      expect(emailDelivery.status).toBe('HELD_QUIET_HOURS');

      // 4. No email sent through Nodemailer
      expect(sentEmails.length).toBe(0);
    });

    it('bypasses quiet hours when priority is URGENT', async () => {
      usersTable.push({
        id: 'user-quiet-urgent',
        email: 'official@apex.gov',
        full_name: 'Official Lead',
        quiet_hours_start: '00:00',
        quiet_hours_end: '23:59',
        timezone: 'UTC',
        digest_mode: 'OFF',
      });

      await deliverInAppAndEmail({
        orgId: 'org-1',
        userId: 'user-quiet-urgent',
        eventType: 'UrgentRequest',
        title: 'URGENT: Emergency Meeting',
        body: 'Urgent meeting requested immediately',
        link: '/app/appointments/apt-urgent',
        priority: Priority.URGENT,
        entityType: 'appointment',
        entityId: 'apt-urgent',
        dedupeKey: 'notif-urgent-1',
      });

      // Email was NOT held; sent immediately!
      const emailDelivery = deliveriesTable.find((d) => d.channel === 'EMAIL');
      expect(emailDelivery).toBeDefined();
      expect(emailDelivery.status).toBe('SENT');
      expect(sentEmails.length).toBe(1);
    });
  });

  describe('Daily digest batching (§14.3)', () => {
    it('holds LOW and MEDIUM priority notifications for users with digest_mode = DAILY', async () => {
      usersTable.push({
        id: 'user-digest',
        email: 'digestuser@apex.gov',
        full_name: 'Digest Recipient',
        quiet_hours_start: null,
        quiet_hours_end: null,
        timezone: 'UTC',
        digest_mode: 'DAILY',
      });

      // Send a LOW priority notification
      await deliverInAppAndEmail({
        orgId: 'org-1',
        userId: 'user-digest',
        eventType: 'SupportStaffRemoved',
        title: 'Assignment Concluded',
        body: 'Assignment concluded for staff member',
        link: '/app/dashboard',
        priority: Priority.LOW,
        entityType: 'official',
        entityId: 'off-1',
        dedupeKey: 'notif-digest-low-1',
      });

      const emailDelivery = deliveriesTable.find((d) => d.channel === 'EMAIL');
      expect(emailDelivery).toBeDefined();
      expect(emailDelivery.status).toBe('HELD_DIGEST');
      expect(sentEmails.length).toBe(0);
    });

    it('processDailyDigestOnce batches multiple held notifications into one email', async () => {
      usersTable.push({
        id: 'user-digest-batch',
        email: 'batched@apex.gov',
        full_name: 'Batched User',
        timezone: 'UTC',
      });

      // Create two held digest notifications
      notificationsTable.push(
        {
          id: 'notif-d1',
          user_id: 'user-digest-batch',
          title: 'Update 1: Task completed',
          body: 'Sub-task finished',
          priority: 'LOW',
        },
        {
          id: 'notif-d2',
          user_id: 'user-digest-batch',
          title: 'Update 2: Note added',
          body: 'Note added to appointment',
          priority: 'MEDIUM',
        },
      );

      deliveriesTable.push(
        {
          id: 'del-d1',
          notification_id: 'notif-d1',
          channel: 'EMAIL',
          status: 'HELD_DIGEST',
        },
        {
          id: 'del-d2',
          notification_id: 'notif-d2',
          channel: 'EMAIL',
          status: 'HELD_DIGEST',
        },
      );

      const result = await processDailyDigestOnce();
      expect(result.usersCount).toBe(1);
      expect(result.deliveriesCount).toBe(2);

      // Exactly 1 consolidated digest email sent!
      expect(sentEmails.length).toBe(1);
      expect(sentEmails[0].to).toBe('batched@apex.gov');
      expect(sentEmails[0].subject).toContain('Daily Digest: 2 update(s)');

      // Deliveries updated to SENT
      expect(deliveriesTable.every((d) => d.status === 'SENT')).toBe(true);
    });
  });

  describe('Quiet hours release worker', () => {
    it('releases held emails when quiet hours window has concluded', async () => {
      usersTable.push({
        id: 'user-released',
        email: 'released@apex.gov',
        full_name: 'Released User',
        // Quiet hours window that is already over (e.g. 01:00 to 02:00 UTC)
        quiet_hours_start: '01:00',
        quiet_hours_end: '02:00',
        timezone: 'UTC',
      });

      notificationsTable.push({
        id: 'notif-held-1',
        user_id: 'user-released',
        title: 'Held Announcement',
        body: 'This was held overnight',
        priority: 'MEDIUM',
      });

      deliveriesTable.push({
        id: 'del-held-1',
        notification_id: 'notif-held-1',
        channel: 'EMAIL',
        status: 'HELD_QUIET_HOURS',
      });

      const releasedCount = await processQuietHoursReleaseOnce();
      expect(releasedCount).toBe(1);

      // Delivered email
      expect(sentEmails.length).toBe(1);
      expect(sentEmails[0].to).toBe('released@apex.gov');

      // Delivery updated to SENT
      const delivery = deliveriesTable.find((d) => d.id === 'del-held-1');
      expect(delivery.status).toBe('SENT');
    });
  });
});
