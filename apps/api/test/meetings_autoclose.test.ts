import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processAutoCloseAppointmentsOnce } from '../src/jobs/autoCloseAppointments.js';

const { appointmentsTable, statusHistoryTable, insertedAudit, writtenOutbox } = vi.hoisted(() => {
  return {
    appointmentsTable: [] as any[],
    statusHistoryTable: [] as any[],
    insertedAudit: [] as any[],
    writtenOutbox: [] as any[],
  };
});

vi.mock('../src/core/db.js', () => {
  const trxFn: any = vi.fn().mockImplementation((tableName: string) => {
    let whereClauses: Record<string, any> = {};
    let whereStatus: string | null = null;
    let thresholdDate: Date | null = null;

    const qb: any = {
      where: vi.fn().mockImplementation((col: any, val: any) => {
        if (typeof col === 'object') {
          whereClauses = { ...whereClauses, ...col };
        } else if (col === 'status') {
          whereStatus = val;
        } else {
          whereClauses[col] = val;
        }
        return qb;
      }),
      andWhere: vi.fn().mockImplementation((predicate: any) => {
        if (typeof predicate === 'function') {
          // nested builder for completed_at < threshold
          const innerBuilder: any = {
            where: vi.fn().mockImplementation((_c: any, _op: any, val: any) => {
              thresholdDate = val;
              return innerBuilder;
            }),
            orWhere: vi.fn().mockReturnThis(),
          };
          predicate(innerBuilder);
        }
        return qb;
      }),
      select: vi.fn().mockImplementation(async () => {
        if (tableName === 'appointments') {
          return appointmentsTable.filter((apt) => {
            if (whereStatus && apt.status !== whereStatus) return false;
            if (thresholdDate) {
              const compDate = apt.completed_at || apt.status_changed_at;
              if (!compDate || compDate >= thresholdDate) return false;
            }
            return true;
          });
        }
        return [];
      }),
      insert: vi.fn().mockImplementation(async (data: any) => {
        if (tableName === 'appointment_status_history') {
          statusHistoryTable.push(data);
        }
        return [data];
      }),
      update: vi.fn().mockImplementation(async (updates: any) => {
        if (tableName === 'appointments') {
          const apt = appointmentsTable.find((row) => row.id === whereClauses.id);
          if (apt) Object.assign(apt, updates);
        }
        return 1;
      }),
    };

    return qb;
  });

  trxFn.transaction = vi.fn().mockImplementation(async (callback: any) => {
    return callback(trxFn);
  });

  return { db: trxFn };
});

vi.mock('../src/core/audit/auditWriter.js', () => ({
  writeAuditEvent: vi.fn().mockImplementation(async (_trx: any, event: any) => {
    insertedAudit.push(event);
  }),
}));

vi.mock('../src/core/outbox/outboxWriter.js', () => ({
  writeOutboxEvent: vi.fn().mockImplementation(async (_trx: any, event: any) => {
    writtenOutbox.push(event);
  }),
}));

vi.mock('../src/core/notifications/router.js', () => ({
  routeNotificationEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('Track 8: Auto-close appointments (§16, §22 Track 8)', () => {
  beforeEach(() => {
    appointmentsTable.length = 0;
    statusHistoryTable.length = 0;
    insertedAudit.length = 0;
    writtenOutbox.length = 0;
  });

  it('automatically closes COMPLETED appointments older than 14 days', async () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    // 1. Should be auto-closed (completed 15 days ago)
    appointmentsTable.push({
      id: 'apt-old-completed',
      org_id: 'org-apex-1',
      reference_no: 'APT-2026-000001',
      status: 'COMPLETED',
      completed_at: fifteenDaysAgo,
      primary_official_id: 'official-1',
    });

    // 2. Should NOT be auto-closed (completed 2 days ago)
    appointmentsTable.push({
      id: 'apt-recent-completed',
      org_id: 'org-apex-1',
      reference_no: 'APT-2026-000002',
      status: 'COMPLETED',
      completed_at: twoDaysAgo,
      primary_official_id: 'official-1',
    });

    // 3. Should NOT be auto-closed (CONFIRMED status, even if older)
    appointmentsTable.push({
      id: 'apt-confirmed',
      org_id: 'org-apex-1',
      reference_no: 'APT-2026-000003',
      status: 'CONFIRMED',
      completed_at: null,
      primary_official_id: 'official-1',
    });

    const closedCount = await processAutoCloseAppointmentsOnce(14);
    expect(closedCount).toBe(1);

    const oldApt = appointmentsTable.find((a) => a.id === 'apt-old-completed');
    expect(oldApt.status).toBe('CLOSED');
    expect(oldApt.closed_at).toBeDefined();

    const recentApt = appointmentsTable.find((a) => a.id === 'apt-recent-completed');
    expect(recentApt.status).toBe('COMPLETED');

    const confirmedApt = appointmentsTable.find((a) => a.id === 'apt-confirmed');
    expect(confirmedApt.status).toBe('CONFIRMED');

    // Verify audit log
    const audit = insertedAudit.find((a) => a.action === 'appointment.auto_close');
    expect(audit).toBeDefined();
    expect(audit.entityId).toBe('apt-old-completed');
    expect(audit.changes.toStatus).toBe('CLOSED');

    // Verify outbox domain event
    const outbox = writtenOutbox.find((o) => o.eventType === 'AppointmentClosed');
    expect(outbox).toBeDefined();
    expect(outbox.payload.autoClosed).toBe(true);
  });
});
