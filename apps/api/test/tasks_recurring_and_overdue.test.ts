import { describe, it, expect, vi } from 'vitest';
import { tasksService } from '../src/modules/tasks/service.js';
import { TaskStatus } from '@oams/shared';
import { DateTime } from 'luxon';

const { mockDb, insertedOccurrences } = vi.hoisted(() => {
  const occurrences: any[] = [];

  const template = {
    id: 'series-tpl-1',
    org_id: 'org-1',
    reference_no: 'TSK-2026-000050',
    official_id: 'off-1',
    title: 'Daily Standup Sync',
    description: 'Check team updates',
    category: 'MEETING',
    priority: 'MEDIUM',
    status: 'TODO',
    visibility: 'ORG',
    owner_user_id: 'user-official-1',
    assignee_user_id: null,
    created_by: 'user-official-1',
    requires_verification: false,
    source: 'MANUAL',
    series_id: 'series-uuid-1',
    recurrence_rule: 'RRULE:FREQ=DAILY;INTERVAL=1',
    position: 1000,
    version: 1,
  };

  const createQb = (tableName: string) => {
    const whereConditions: any = {};

    const qb: any = {
      where: vi.fn().mockImplementation((col: any, val: any) => {
        if (typeof col === 'string') {
          whereConditions[col] = val;
        }
        return qb;
      }),
      whereNotNull: vi.fn().mockReturnThis(),
      first: vi.fn().mockImplementation(async () => {
        if (tableName === 'tasks' && whereConditions.due_at) {
          // Check if already in insertedOccurrences
          const exists = occurrences.find((o) => o.due_at === whereConditions.due_at);
          return exists || null;
        }
        return null;
      }),
      insert: vi.fn().mockImplementation((data: any) => {
        occurrences.push(data);
        return {
          then: vi.fn().mockImplementation((resolve) => resolve([1])),
        };
      }),
      then: vi.fn().mockImplementation((resolve) => {
        if (tableName === 'tasks') {
          return Promise.resolve([template]).then(resolve);
        }
        return Promise.resolve([]).then(resolve);
      }),
    };
    return qb;
  };

  const dbFn: any = vi.fn().mockImplementation((tableName: string) => createQb(tableName));
  dbFn.fn = { now: () => new Date() };
  dbFn.raw = (str: string) => str;

  return { mockDb: dbFn, insertedOccurrences: occurrences };
});

vi.mock('../src/core/db.js', () => ({
  db: mockDb,
}));

vi.mock('../src/core/utils/referenceNumber.js', () => ({
  generateReferenceNumber: vi.fn().mockResolvedValue('TSK-2026-OCCURRENCE'),
}));

describe('Derived Overdue & Recurring Task Generator (§12.1, §12.6)', () => {
  it('Correctly derives isOverdue based on due_at < now() and status (§12.1)', () => {
    const pastDue = DateTime.now().minus({ days: 2 }).toISO();
    const futureDue = DateTime.now().plus({ days: 2 }).toISO();

    const deriveOverdue = (status: TaskStatus, dueAt: string | null) => {
      return (
        status !== TaskStatus.DONE &&
        status !== TaskStatus.CANCELLED &&
        !!dueAt &&
        new Date(dueAt) < new Date()
      );
    };

    // Past due in TODO -> Overdue
    expect(deriveOverdue(TaskStatus.TODO, pastDue)).toBe(true);

    // Past due in IN_PROGRESS -> Overdue
    expect(deriveOverdue(TaskStatus.IN_PROGRESS, pastDue)).toBe(true);

    // Past due in BLOCKED -> Overdue
    expect(deriveOverdue(TaskStatus.BLOCKED, pastDue)).toBe(true);

    // Past due in DONE -> NOT Overdue
    expect(deriveOverdue(TaskStatus.DONE, pastDue)).toBe(false);

    // Past due in CANCELLED -> NOT Overdue
    expect(deriveOverdue(TaskStatus.CANCELLED, pastDue)).toBe(false);

    // Future due -> NOT Overdue
    expect(deriveOverdue(TaskStatus.TODO, futureDue)).toBe(false);

    // No due date -> NOT Overdue
    expect(deriveOverdue(TaskStatus.TODO, null)).toBe(false);
  });

  it('Generates daily occurrences up to 14 days ahead for recurring series (§12.6)', async () => {
    insertedOccurrences.length = 0;

    const count = await tasksService.generateRecurringOccurrences('org-1', 14);

    expect(count).toBeGreaterThanOrEqual(13);
    expect(insertedOccurrences.length).toBe(count);

    // Check that occurrences belong to the series
    expect(insertedOccurrences[0].series_id).toBe('series-uuid-1');
    expect(insertedOccurrences[0].title).toBe('Daily Standup Sync');
    expect(insertedOccurrences[0].status).toBe(TaskStatus.TODO);
  });
});
