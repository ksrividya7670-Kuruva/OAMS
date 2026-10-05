import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminOpsService } from '../src/modules/adminOps/service.js';

const {
  notificationDeliveriesTable,
  notificationsTable,
  usersTable,
  appointmentsTable,
  officialsTable,
} = vi.hoisted(() => ({
  notificationDeliveriesTable: [] as any[],
  notificationsTable: [] as any[],
  usersTable: [] as any[],
  appointmentsTable: [] as any[],
  officialsTable: [] as any[],
}));

// Mock mailer
vi.mock('../src/core/email/mailer.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

// Mock jobs
vi.mock('../src/jobs/autoCloseAppointments.js', () => ({
  processAutoCloseAppointmentsOnce: vi.fn().mockResolvedValue({ closedCount: 5 }),
}));
vi.mock('../src/jobs/noshowDetect.js', () => ({
  processNoShowDetectOnce: vi.fn().mockResolvedValue({ noShowCount: 2 }),
}));
vi.mock('../src/jobs/rerouteAssignments.js', () => ({
  processRerouteAssignmentsOnce: vi.fn().mockResolvedValue({ reroutedCount: 3 }),
}));
vi.mock('../src/jobs/quietHoursRelease.js', () => ({
  processQuietHoursReleaseOnce: vi.fn().mockResolvedValue({ releasedCount: 7 }),
}));
vi.mock('../src/jobs/dailyDigest.js', () => ({
  processDailyDigestOnce: vi.fn().mockResolvedValue({ digestsSent: 4 }),
}));
vi.mock('../src/jobs/taskOverdue.js', () => ({
  processTaskOverdueOnce: vi.fn().mockResolvedValue({ overdueCount: 1 }),
}));
vi.mock('../src/jobs/taskReminders.js', () => ({
  processTaskRemindersOnce: vi.fn().mockResolvedValue({ sentReminders: 3 }),
}));
vi.mock('../src/jobs/visitorAutoCheckout.js', () => ({
  processVisitorAutoCheckoutOnce: vi.fn().mockResolvedValue({ checkedOut: 2 }),
}));

vi.mock('../src/core/db.js', () => {
  const trxFn: any = vi.fn().mockImplementation((tableName: string) => {
    let whereClauses: Record<string, any> = {};
    const whereInClauses: Record<string, any[]> = {};

    const execute = () => {
      let source: any[] = [];
      if (tableName.includes('notification_deliveries')) {
        source = notificationDeliveriesTable.map((d) => {
          const notif = notificationsTable.find((n) => n.id === d.notification_id);
          const user = usersTable.find((u) => u.id === notif?.user_id);
          return {
            ...d,
            org_id: notif?.org_id,
            notificationId: d.notification_id,
            title: notif?.title,
            body: notif?.body,
            createdAt: notif?.created_at,
            email: user?.email,
            recipientEmail: user?.email,
            recipientName: user?.full_name,
            lastError: d.last_error,
          };
        });
      } else if (tableName.includes('notifications')) {
        source = notificationsTable;
      } else if (tableName.includes('users')) {
        source = usersTable;
      } else if (tableName.includes('appointments')) {
        source = appointmentsTable.map((a) => {
          const off = officialsTable.find((o) => o.id === a.primary_official_id);
          const ass = usersTable.find((u) => u.id === a.assigned_to_user_id);
          return {
            ...a,
            referenceNo: a.reference_no,
            officialTitle: off?.title,
            assignedToName: ass?.full_name,
          };
        });
      } else if (tableName.includes('officials')) {
        source = officialsTable;
      }

      const results = source.filter((row) => {
        for (const [k, v] of Object.entries(whereClauses)) {
          const cleanKey = k.includes('.') ? k.split('.')[1] : k;
          if (row[cleanKey] !== v) return false;
        }
        for (const [k, vals] of Object.entries(whereInClauses)) {
          const cleanKey = k.includes('.') ? k.split('.')[1] : k;
          if (!vals.includes(row[cleanKey])) return false;
        }
        return true;
      });

      return results;
    };

    const qb: any = {
      where: vi.fn().mockImplementation((col: any, opOrVal?: any, val?: any) => {
        if (typeof col === 'object') {
          whereClauses = { ...whereClauses, ...col };
        } else if (val !== undefined) {
          whereClauses[col] = val;
        } else {
          whereClauses[col] = opOrVal;
        }
        return qb;
      }),
      whereIn: vi.fn().mockImplementation((col: string, vals: any[]) => {
        whereInClauses[col] = vals;
        return qb;
      }),
      join: vi.fn().mockImplementation(() => qb),
      leftJoin: vi.fn().mockImplementation(() => qb),
      orderBy: vi.fn().mockImplementation(() => qb),
      limit: vi.fn().mockImplementation(() => qb),
      select: vi.fn().mockImplementation(() => qb),
      first: vi.fn().mockImplementation(async () => {
        const res = execute();
        return res[0] ? { ...res[0] } : undefined;
      }),
      update: vi.fn().mockImplementation(async (updates: any) => {
        const res = execute();
        for (const item of res) {
          if (tableName.includes('notification_deliveries')) {
            const orig = notificationDeliveriesTable.find((d) => d.id === item.id);
            if (orig) Object.assign(orig, updates);
          }
          Object.assign(item, updates);
        }
        return res.length;
      }),
    };

    qb.then = (resolve: any) => Promise.resolve(execute()).then(resolve);
    return qb;
  });

  trxFn.fn = { now: () => new Date().toISOString() };
  return { db: trxFn };
});

describe('Admin Ops Console (§17.4, §22 Track 10)', () => {
  const orgId = 'org-ops-test';

  beforeEach(() => {
    notificationDeliveriesTable.length = 0;
    notificationsTable.length = 0;
    usersTable.length = 0;
    appointmentsTable.length = 0;
    officialsTable.length = 0;

    usersTable.push({
      id: 'user-ops-1',
      org_id: orgId,
      full_name: 'Dr. John Watson',
      email: 'watson@baker.org',
    });

    notificationsTable.push({
      id: 'notif-1',
      org_id: orgId,
      user_id: 'user-ops-1',
      title: 'Appointment Confirmed',
      body: 'Your meeting with the Director has been confirmed.',
      created_at: new Date('2026-09-15T08:00:00.000Z'),
    });
  });

  it('should list failed deliveries and stuck appointments in ops overview', async () => {
    notificationDeliveriesTable.push({
      id: 'del-1',
      notification_id: 'notif-1',
      channel: 'EMAIL',
      status: 'FAILED',
      attempts: 3,
      last_error: 'SMTP 554 Transaction failed',
      sent_at: new Date('2026-09-15T08:01:00.000Z'),
    });

    appointmentsTable.push({
      id: 'apt-stuck-1',
      org_id: orgId,
      reference_no: 'REF-STUCK',
      subject: 'Review Pending',
      status: 'UNDER_REVIEW',
      submitted_at: new Date('2026-09-01T10:00:00.000Z'),
      sla_due_at: new Date('2026-09-03T10:00:00.000Z'), // Past SLA
      assigned_to_user_id: null, // Unassigned
    });

    const overview = await adminOpsService.getOpsOverview(orgId);

    // 1. Failed deliveries
    expect(overview.failedDeliveries).toHaveLength(1);
    expect(overview.failedDeliveries[0].id).toBe('del-1');
    expect(overview.failedDeliveries[0].recipientEmail).toBe('watson@baker.org');
    expect(overview.failedDeliveries[0].lastError).toBe('SMTP 554 Transaction failed');

    // 2. Background jobs registered
    expect(overview.jobsStatus.length).toBeGreaterThanOrEqual(5);
    expect(overview.jobsStatus.map((j) => j.name)).toContain('autoClose');
    expect(overview.jobsStatus.map((j) => j.name)).toContain('noshowDetect');
    expect(overview.jobsStatus.map((j) => j.name)).toContain('rerouteAssignments');
    expect(overview.jobsStatus.map((j) => j.name)).toContain('quietHoursRelease');
    expect(overview.jobsStatus.map((j) => j.name)).toContain('dailyDigest');

    // 3. Stuck appointments
    expect(overview.stuckAppointments).toHaveLength(1);
    expect(overview.stuckAppointments[0].id).toBe('apt-stuck-1');
  });

  it('should retry a failed notification delivery and update its status to SENT', async () => {
    notificationDeliveriesTable.push({
      id: 'del-retry-1',
      notification_id: 'notif-1',
      channel: 'EMAIL',
      status: 'FAILED',
      attempts: 2,
      last_error: 'Timeout connecting to mailer',
      sent_at: new Date('2026-09-15T08:01:00.000Z'),
    });

    const result = await adminOpsService.retryDelivery(orgId, 'del-retry-1');
    expect(result.success).toBe(true);

    const updated = notificationDeliveriesTable.find((d) => d.id === 'del-retry-1');
    expect(updated?.status).toBe('SENT');
    expect(updated?.last_error).toBeNull();
    expect(updated?.attempts).toBe(3);
  });

  it('should run background jobs on-demand and return job execution results', async () => {
    const resAutoClose = await adminOpsService.runJob('autoClose');
    expect(resAutoClose.jobName).toBe('autoClose');
    expect(resAutoClose.result).toEqual({ closedCount: 5 });

    const resNoShow = await adminOpsService.runJob('noshowDetect');
    expect(resNoShow.jobName).toBe('noshowDetect');
    expect(resNoShow.result).toEqual({ noShowCount: 2 });

    const resReroute = await adminOpsService.runJob('rerouteAssignments');
    expect(resReroute.jobName).toBe('rerouteAssignments');
    expect(resReroute.result).toEqual({ reroutedCount: 3 });

    const resQuiet = await adminOpsService.runJob('quietHoursRelease');
    expect(resQuiet.jobName).toBe('quietHoursRelease');
    expect(resQuiet.result).toEqual({ releasedCount: 7 });

    const resDigest = await adminOpsService.runJob('dailyDigest');
    expect(resDigest.jobName).toBe('dailyDigest');
    expect(resDigest.result).toEqual({ digestsSent: 4 });

    // Unknown job should reject
    await expect(adminOpsService.runJob('unknown-job')).rejects.toThrow('Unknown job name');
  });
});
