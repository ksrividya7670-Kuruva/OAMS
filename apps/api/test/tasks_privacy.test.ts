import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tasksRepo } from '../src/modules/tasks/repo.js';
import { tasksService } from '../src/modules/tasks/service.js';
import { RoleCode, TaskStatus, Priority, type AuthUser } from '@oams/shared';

// Mock DB and outbox
const { mockDb, insertedAudit, insertedRows } = vi.hoisted(() => {
  const audit: any[] = [];
  const inserted: Record<string, any[]> = {};

  const createQb = (tableName: string) => {
    const whereConditions: any[] = [];
    const whereNotInConditions: any[] = [];
    let selectFields: any[] = [];

    const qb: any = {
      where: vi.fn().mockImplementation((...args: any[]) => {
        if (typeof args[0] === 'function') {
          args[0].call(qb, qb);
        } else {
          whereConditions.push(args);
        }
        return qb;
      }),
      whereIn: vi.fn().mockReturnThis(),
      whereNotIn: vi.fn().mockImplementation((...args: any[]) => {
        whereNotInConditions.push(args);
        return qb;
      }),
      whereNull: vi.fn().mockReturnThis(),
      whereNotNull: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orWhere: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      select: vi.fn().mockImplementation((...fields: any[]) => {
        selectFields = fields;
        return qb;
      }),
      max: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      orderByRaw: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      clone: vi.fn().mockImplementation(() => qb),
      count: vi.fn().mockImplementation(() => {
        return {
          first: vi.fn().mockResolvedValue({ total: 1, cnt: 1 }),
        };
      }),
      first: vi.fn().mockImplementation(async () => {
        if (tableName === 'tasks') {
          return {
            id: 'task-personal-1',
            org_id: 'org-1',
            reference_no: 'TSK-2026-000001',
            official_id: 'off-1',
            title: 'Private Medical Checkup',
            description: 'Confidential cardiologist report',
            category: 'PERSONAL',
            priority: 'HIGH',
            status: 'TODO',
            visibility: 'PERSONAL',
            owner_user_id: 'user-official-1',
            assignee_user_id: null,
            created_by: 'user-official-1',
            requires_verification: false,
            source: 'MANUAL',
            position: 1000,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }
        if (tableName === 'officials') {
          return { id: 'off-1', org_id: 'org-1', user_id: 'user-official-1', is_active: true };
        }
        if (tableName === 'official_support_staff') {
          return { official_id: 'off-1', user_id: 'user-pa-1', can_manage_tasks: true };
        }
        return null;
      }),
      insert: vi.fn().mockImplementation((data: any) => {
        if (tableName === 'audit_events') {
          audit.push(data);
        }
        if (!inserted[tableName]) inserted[tableName] = [];
        inserted[tableName].push(data);
        return {
          returning: vi.fn().mockResolvedValue([Array.isArray(data) ? data[0] : data]),
          then: vi.fn().mockImplementation((resolve) => resolve([1])),
        };
      }),
      update: vi.fn().mockResolvedValue(1),
      then: vi.fn().mockImplementation((resolve) => {
        if (tableName === 'tasks') {
          return Promise.resolve([
            {
              id: 'task-org-1',
              org_id: 'org-1',
              reference_no: 'TSK-2026-000002',
              official_id: 'off-1',
              title: 'Review Board Budget',
              category: 'FINANCE',
              priority: 'HIGH',
              status: 'TODO',
              visibility: 'ORG',
              owner_user_id: 'user-official-1',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              position: 1000,
            },
          ]).then(resolve);
        }
        return Promise.resolve([]).then(resolve);
      }),
    };
    return qb;
  };

  const dbFn: any = vi.fn().mockImplementation((tableName: string) => createQb(tableName));
  dbFn.fn = { now: () => new Date() };
  dbFn.raw = (str: string) => str;
  dbFn.transaction = vi.fn().mockImplementation(async (callback: any) => {
    const trx: any = vi.fn().mockImplementation((t: string) => createQb(t));
    trx.fn = { now: () => new Date() };
    trx.raw = (str: string) => str;
    trx.executionPromise = Promise.resolve();
    return callback(trx);
  });

  return { mockDb: dbFn, insertedAudit: audit, insertedRows: inserted };
});

vi.mock('../src/core/db.js', () => ({
  db: mockDb,
}));

vi.mock('../src/core/audit/auditWriter.js', () => ({
  writeAuditEvent: vi.fn().mockImplementation(async (_trx, params) => {
    insertedAudit.push(params);
    return 'audit-id-1';
  }),
}));

vi.mock('../src/core/outbox/outboxWriter.js', () => ({
  writeOutboxEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/core/notifications/router.js', () => ({
  routeNotificationEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('PERSONAL Task Privacy Enforcement (§12.1, §12.4, §8.1)', () => {
  const officialUser = {
    id: 'user-official-1',
    orgId: 'org-1',
    email: 'official@oams.gov',
    fullName: 'Chief Director',
    roles: [RoleCode.OFFICIAL],
  } as unknown as AuthUser;

  const paUser = {
    id: 'user-pa-1',
    orgId: 'org-1',
    email: 'pa@oams.gov',
    fullName: 'Primary PA',
    roles: [RoleCode.PA],
  } as unknown as AuthUser;

  beforeEach(() => {
    insertedAudit.length = 0;
  });

  it('Strictly hides PERSONAL tasks from PA when retrieving task details by ID (§12.1)', async () => {
    // 1. PA tries to fetch personal task
    const paResult = await tasksRepo.getWithDetails(
      'task-personal-1',
      'org-1',
      paUser.id,
      paUser.roles,
    );
    expect(paResult).toBeNull();

    // 2. Official fetches their own personal task
    const officialResult = await tasksRepo.getWithDetails(
      'task-personal-1',
      'org-1',
      officialUser.id,
      officialUser.roles,
    );
    expect(officialResult).not.toBeNull();
    expect(officialResult?.title).toBe('Private Medical Checkup');
    expect(officialResult?.visibility).toBe('PERSONAL');
  });

  it('Forbids PA from creating a PERSONAL task (§12.1)', async () => {
    await expect(
      tasksService.createTask(paUser, {
        officialId: 'off-1',
        title: 'Secret PA note',
        visibility: 'PERSONAL',
      } as any),
    ).rejects.toThrow('Only the official can create personal tasks');
  });

  it('Forbids delegating a PERSONAL task (§12.4)', async () => {
    await expect(
      tasksService.createTask(officialUser, {
        officialId: 'off-1',
        title: 'Personal appointment',
        visibility: 'PERSONAL',
        assigneeUserId: 'user-pa-1',
      } as any),
    ).rejects.toThrow('Personal tasks cannot be delegated');
  });

  it('Omits title and sensitive payload from audit log for PERSONAL tasks (§12.1)', async () => {
    await tasksService.createTask(officialUser, {
      officialId: 'off-1',
      title: 'Private Doctor Appointment',
      visibility: 'PERSONAL',
    } as any);

    const taskAudit = insertedAudit.find((a) => a.action === 'task.create');
    expect(taskAudit).toBeDefined();
    // Audit must NEVER record the personal title or sensitive description
    expect(taskAudit.changes).toBeNull();
  });
});
