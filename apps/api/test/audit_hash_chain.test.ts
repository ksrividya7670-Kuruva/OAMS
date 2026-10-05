import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditService } from '../src/modules/audit/service.js';
import { writeAuditEvent } from '../src/core/audit/auditWriter.js';
import { db } from '../src/core/db.js';

const { auditEventsTable, usersTable } = vi.hoisted(() => ({
  auditEventsTable: [] as any[],
  usersTable: [] as any[],
}));

vi.mock('../src/core/db.js', () => {
  const trxFn: any = vi.fn().mockImplementation((tableName: string) => {
    let whereClauses: Record<string, any> = {};
    const greaterEqualClauses: Record<string, any> = {};
    const lessEqualClauses: Record<string, any> = {};
    const lessClauses: Record<string, any> = {};
    let orderCol: string | null = null;
    let orderDir: 'asc' | 'desc' = 'asc';
    let queryLimit: number | null = null;

    const execute = () => {
      let source: any[] = [];
      if (tableName.includes('audit_events')) source = auditEventsTable;
      else if (tableName.includes('users')) source = usersTable;

      let results = source.filter((row) => {
        for (const [k, v] of Object.entries(whereClauses)) {
          const cleanKey = k.includes('.') ? k.split('.')[1] : k;
          if (row[cleanKey] !== v) return false;
        }
        for (const [k, v] of Object.entries(greaterEqualClauses)) {
          const cleanKey = k.includes('.') ? k.split('.')[1] : k;
          if (new Date(row[cleanKey]).getTime() < new Date(v).getTime()) return false;
        }
        for (const [k, v] of Object.entries(lessEqualClauses)) {
          const cleanKey = k.includes('.') ? k.split('.')[1] : k;
          if (new Date(row[cleanKey]).getTime() > new Date(v).getTime()) return false;
        }
        for (const [k, v] of Object.entries(lessClauses)) {
          const cleanKey = k.includes('.') ? k.split('.')[1] : k;
          if (new Date(row[cleanKey]).getTime() >= new Date(v).getTime()) return false;
        }
        return true;
      });

      if (orderCol) {
        results.sort((a, b) => {
          const cleanKey = orderCol!.includes('.') ? orderCol!.split('.')[1] : orderCol!;
          const tA = new Date(a[cleanKey]).getTime();
          const tB = new Date(b[cleanKey]).getTime();
          return orderDir === 'desc' ? tB - tA : tA - tB;
        });
      }

      if (queryLimit != null) {
        results = results.slice(0, queryLimit);
      }

      // Left join users
      if (tableName.includes('audit_events')) {
        results = results.map((r) => {
          const user = usersTable.find((u) => u.id === r.actor_id);
          return {
            ...r,
            actor_name: user?.full_name,
            actor_email: user?.email,
          };
        });
      }

      return results;
    };

    const qb: any = {
      where: vi.fn().mockImplementation((col: any, opOrVal?: any, val?: any) => {
        if (typeof col === 'object') {
          whereClauses = { ...whereClauses, ...col };
        } else if (val !== undefined) {
          if (opOrVal === '<=') lessEqualClauses[col] = val;
          else if (opOrVal === '>=') greaterEqualClauses[col] = val;
          else if (opOrVal === '<') lessClauses[col] = val;
          else whereClauses[col] = val;
        } else {
          whereClauses[col] = opOrVal;
        }
        return qb;
      }),
      andWhere: vi.fn().mockImplementation((col: any, opOrVal?: any, val?: any) => {
        return qb.where(col, opOrVal, val);
      }),
      leftJoin: vi.fn().mockImplementation(() => qb),
      orderBy: vi.fn().mockImplementation((col: string, dir: 'asc' | 'desc' = 'asc') => {
        orderCol = col;
        orderDir = dir;
        return qb;
      }),
      limit: vi.fn().mockImplementation((n: number) => {
        queryLimit = n;
        return qb;
      }),
      select: vi.fn().mockImplementation(() => qb),
      first: vi.fn().mockImplementation(async () => {
        const res = execute();
        return res[0] ? { ...res[0] } : undefined;
      }),
      insert: vi.fn().mockImplementation((data: any) => {
        const id = data.id || 'ae-' + Math.random().toString(36).slice(2);
        const row = { id, ...data };
        if (tableName.includes('audit_events')) {
          auditEventsTable.push(row);
        }
        return {
          returning: vi.fn().mockImplementation(async () => [{ id, ...row }]),
          then: (resolve: any) => Promise.resolve([{ id, ...row }]).then(resolve),
        };
      }),
    };

    qb.then = (resolve: any) => Promise.resolve(execute()).then(resolve);
    return qb;
  });

  return { db: trxFn };
});

describe('Cryptographic Audit Trail & SHA-256 Hash Chain (§19.1, §22 Track 10)', () => {
  const orgId = 'org-audit-test';

  beforeEach(() => {
    auditEventsTable.length = 0;
    usersTable.length = 0;
  });

  it('should verify an unbroken continuous hash chain from genesis to tip', async () => {
    // Write 3 sequential audit events using writeAuditEvent
    const e1 = await writeAuditEvent(db as any, {
      orgId,
      actorId: 'admin-1',
      actorRole: 'SUPER_ADMIN',
      action: 'appointment.create',
      entityType: 'appointment',
      entityId: 'apt-001',
      changes: { status: 'DRAFT', subject: 'Budget Meeting' },
      correlationId: 'corr-test-1',
    });

    const e2 = await writeAuditEvent(db as any, {
      orgId,
      actorId: 'official-1',
      actorRole: 'OFFICIAL',
      action: 'appointment.confirm',
      entityType: 'appointment',
      entityId: 'apt-001',
      changes: { status: 'CONFIRMED' },
      correlationId: 'corr-test-2',
    });

    const e3 = await writeAuditEvent(db as any, {
      orgId,
      actorId: 'admin-1',
      actorRole: 'SUPER_ADMIN',
      action: 'room.assigned',
      entityType: 'appointment',
      entityId: 'apt-001',
      changes: { roomId: 'room-1' },
      correlationId: 'corr-test-3',
    });

    expect(auditEventsTable[0].prev_hash).toBe('0'.repeat(64)); // Genesis
    expect(auditEventsTable[1].prev_hash).toBe(auditEventsTable[0].hash);
    expect(auditEventsTable[2].prev_hash).toBe(auditEventsTable[1].hash);

    // Verify chain via AuditService
    const verification = await auditService.verifyHashChain(orgId);
    expect(verification.valid).toBe(true);
    expect(verification.verifiedCount).toBe(3);
    expect(verification.tipHash).toBe(auditEventsTable[2].hash);
  });

  it('should detect tamper if payload changes are modified', async () => {
    await writeAuditEvent(db as any, {
      orgId,
      actorId: 'admin-1',
      actorRole: 'SUPER_ADMIN',
      action: 'appointment.create',
      entityType: 'appointment',
      entityId: 'apt-001',
      changes: { subject: 'Original Subject' },
      correlationId: 'corr-test-4',
    });

    await writeAuditEvent(db as any, {
      orgId,
      actorId: 'official-1',
      actorRole: 'OFFICIAL',
      action: 'appointment.confirm',
      entityType: 'appointment',
      entityId: 'apt-001',
      changes: { status: 'CONFIRMED' },
      correlationId: 'corr-test-5',
    });

    // Tamper with the first row's payload directly
    auditEventsTable[0].changes = { subject: 'MALICIOUS_ALTERATION' };

    const verification = await auditService.verifyHashChain(orgId);
    expect(verification.valid).toBe(false);
    expect(verification.verifiedCount).toBe(0);
    expect(verification.breachedEventId).toBe(auditEventsTable[0].id);
    expect(verification.error).toContain('Hash mismatch');
  });

  it('should detect tamper if a previous hash link is severed', async () => {
    await writeAuditEvent(db as any, {
      orgId,
      actorId: 'admin-1',
      actorRole: 'SUPER_ADMIN',
      action: 'appointment.create',
      entityType: 'appointment',
      entityId: 'apt-001',
      changes: { subject: 'Event 1' },
      correlationId: 'corr-test-6',
    });

    await writeAuditEvent(db as any, {
      orgId,
      actorId: 'official-1',
      actorRole: 'OFFICIAL',
      action: 'appointment.confirm',
      entityType: 'appointment',
      entityId: 'apt-001',
      changes: { status: 'Event 2' },
      correlationId: 'corr-test-7',
    });

    // Sever chain link on row 2
    auditEventsTable[1].prev_hash = 'f'.repeat(64);

    const verification = await auditService.verifyHashChain(orgId);
    expect(verification.valid).toBe(false);
    expect(verification.verifiedCount).toBe(1);
    expect(verification.breachedEventId).toBe(auditEventsTable[1].id);
    expect(verification.error).toContain('Broken chain link');
  });

  it('should list and filter audit events by entityType and action', async () => {
    usersTable.push({
      id: 'admin-1',
      full_name: 'System Administrator',
      email: 'admin@gov.in',
    });

    await writeAuditEvent(db as any, {
      orgId,
      actorId: 'admin-1',
      actorRole: 'SUPER_ADMIN',
      action: 'appointment.create',
      entityType: 'appointment',
      entityId: 'apt-001',
      changes: {},
      correlationId: 'corr-test-8',
    });

    await writeAuditEvent(db as any, {
      orgId,
      actorId: 'admin-1',
      actorRole: 'SUPER_ADMIN',
      action: 'task.create',
      entityType: 'task',
      entityId: 'task-100',
      changes: {},
      correlationId: 'corr-test-9',
    });

    const appointmentsOnly = await auditService.listEvents(orgId, { entityType: 'appointment' });
    expect(appointmentsOnly).toHaveLength(1);
    expect(appointmentsOnly[0].entityType).toBe('appointment');
    expect(appointmentsOnly[0].actorName).toBe('System Administrator');

    const tasksOnly = await auditService.listEvents(orgId, { entityType: 'task' });
    expect(tasksOnly).toHaveLength(1);
    expect(tasksOnly[0].entityType).toBe('task');
  });
});
