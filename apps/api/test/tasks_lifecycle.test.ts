import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tasksService } from '../src/modules/tasks/service.js';
import { tasksRepo } from '../src/modules/tasks/repo.js';
import { RoleCode, TaskStatus, Priority, type AuthUser } from '@oams/shared';

const { mockDb, writtenOutbox, insertedAudit, setTaskState, getTaskState } = vi.hoisted(() => {
  const outbox: any[] = [];
  const audit: any[] = [];

  let currentTaskState: any = {
    id: 'task-life-1',
    org_id: 'org-1',
    reference_no: 'TSK-2026-000100',
    official_id: 'off-1',
    title: 'Prepare Quarterly Report',
    description: 'Q3 financial analysis',
    category: 'FINANCE',
    priority: 'HIGH',
    status: 'TODO',
    visibility: 'ORG',
    owner_user_id: 'user-official-1',
    assignee_user_id: 'user-pa-1',
    created_by: 'user-official-1',
    requires_verification: true,
    verified_by: null,
    verified_at: null,
    source: 'MANUAL',
    position: 1000,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const createQb = (tableName: string) => {
    const whereConditions: Record<string, any> = {};
    const qb: any = {
      where: vi.fn().mockImplementation((...args: any[]) => {
        if (typeof args[0] === 'function') {
          args[0].call(qb, qb);
        } else if (typeof args[0] === 'string') {
          whereConditions[args[0]] = args[1];
        }
        return qb;
      }),
      whereIn: vi.fn().mockReturnThis(),
      whereNotIn: vi.fn().mockReturnThis(),
      whereNull: vi.fn().mockReturnThis(),
      whereNotNull: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orWhere: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      max: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      first: vi.fn().mockImplementation(async () => {
        if (tableName === 'tasks') {
          return { ...currentTaskState };
        }
        if (tableName === 'officials') {
          return { id: 'off-1', org_id: 'org-1', user_id: 'user-official-1', is_active: true };
        }
        if (tableName === 'official_support_staff') {
          if (whereConditions['user_id'] && whereConditions['user_id'] !== 'user-pa-1') {
            return null;
          }
          return { official_id: 'off-1', user_id: 'user-pa-1', can_manage_tasks: true };
        }
        return null;
      }),
      update: vi.fn().mockImplementation((updates: any) => {
        if (tableName === 'tasks') {
          Object.assign(currentTaskState, updates);
        }
        return Promise.resolve(1);
      }),
      insert: vi.fn().mockImplementation((data: any) => {
        return {
          returning: vi.fn().mockResolvedValue([Array.isArray(data) ? data[0] : data]),
          then: vi.fn().mockImplementation((resolve) => resolve([1])),
        };
      }),
      then: vi.fn().mockImplementation((resolve) => {
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

  return {
    mockDb: dbFn,
    writtenOutbox: outbox,
    insertedAudit: audit,
    setTaskState: (s: any) => {
      currentTaskState = { ...currentTaskState, ...s };
    },
    getTaskState: () => currentTaskState,
  };
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
  writeOutboxEvent: vi.fn().mockImplementation(async (_trx, event) => {
    writtenOutbox.push(event);
  }),
}));

vi.mock('../src/core/notifications/router.js', () => ({
  routeNotificationEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('Task Lifecycle & Delegation Rules (§12.2, §12.4, §14.4 T6)', () => {
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

  const otherAssignee = {
    id: 'user-emp-1',
    orgId: 'org-1',
    email: 'analyst@oams.gov',
    fullName: 'Research Analyst',
    roles: [RoleCode.EMPLOYEE],
  } as unknown as AuthUser;

  beforeEach(() => {
    writtenOutbox.length = 0;
    insertedAudit.length = 0;
    mockDb.fn.now();
  });

  it('Executes TODO -> IN_PROGRESS -> BLOCKED -> IN_PROGRESS cycle (§12.2)', async () => {
    // 1. Start task
    await tasksService.startTask(paUser, 'task-life-1');
    expect(getTaskState().status).toBe(TaskStatus.IN_PROGRESS);

    // 2. Block task with reason
    await tasksService.blockTask(paUser, 'task-life-1', { reason: 'Awaiting Q3 revenue figures' });
    expect(getTaskState().status).toBe(TaskStatus.BLOCKED);
    expect(getTaskState().blocked_reason).toBe('Awaiting Q3 revenue figures');

    // 3. Unblock task
    await tasksService.unblockTask(paUser, 'task-life-1');
    expect(getTaskState().status).toBe(TaskStatus.IN_PROGRESS);
    expect(getTaskState().blocked_reason).toBeNull();
  });

  it('Requires reason to cancel a task and sets CANCELLED status (§12.2)', async () => {
    setTaskState({ status: TaskStatus.IN_PROGRESS });

    await tasksService.cancelTask(officialUser, 'task-life-1', { reason: 'Project de-scoped' });
    expect(getTaskState().status).toBe(TaskStatus.CANCELLED);
    expect(getTaskState().cancel_reason).toBe('Project de-scoped');

    // Reopen back to TODO
    await tasksService.reopenTask(officialUser, 'task-life-1');
    expect(getTaskState().status).toBe(TaskStatus.TODO);
    expect(getTaskState().cancel_reason).toBeNull();
  });

  it('Delegated completion emits TaskCompleted and TaskVerificationNeeded to official (§12.4, §14.4 T6)', async () => {
    setTaskState({
      status: TaskStatus.IN_PROGRESS,
      requires_verification: true,
      verified_at: null,
      assignee_user_id: otherAssignee.id,
    });

    await tasksService.completeTask(otherAssignee, 'task-life-1');

    expect(getTaskState().status).toBe(TaskStatus.DONE);
    expect(getTaskState().verified_at).toBeNull(); // Remains unverified

    // Verify outbox events
    const completedEvt = writtenOutbox.find((e) => e.eventType === 'TaskCompleted');
    expect(completedEvt).toBeDefined();
    expect(completedEvt.payload.ownerUserId).toBe(officialUser.id);

    const verifyEvt = writtenOutbox.find((e) => e.eventType === 'TaskVerificationNeeded');
    expect(verifyEvt).toBeDefined();
    expect(verifyEvt.payload.ownerUserId).toBe(officialUser.id);
  });

  it('Official verifies completed task, setting verified_by and verified_at (§12.2)', async () => {
    setTaskState({
      status: TaskStatus.DONE,
      requires_verification: true,
      verified_at: null,
    });

    await tasksService.verifyTask(officialUser, 'task-life-1');

    expect(getTaskState().verified_by).toBe(officialUser.id);
    expect(getTaskState().verified_at).toBeDefined();
  });

  it('Restricts assignees without can_manage_tasks from changing title, priority or due date (§12.4)', async () => {
    setTaskState({
      status: TaskStatus.IN_PROGRESS,
      assignee_user_id: otherAssignee.id,
    });

    await expect(
      tasksService.updateTask(otherAssignee, 'task-life-1', {
        title: 'Tampered Title',
      }),
    ).rejects.toThrow('Assignees cannot change the title, priority, or due date');

    await expect(
      tasksService.updateTask(otherAssignee, 'task-life-1', {
        priority: Priority.URGENT,
      }),
    ).rejects.toThrow('Assignees cannot change the title, priority, or due date');
  });
});
