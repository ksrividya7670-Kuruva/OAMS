import { describe, it, expect, vi, beforeEach } from 'vitest';
import { meetingsService } from '../src/modules/meetings/service.js';
import { tasksService } from '../src/modules/tasks/service.js';
import { appointmentsRepo } from '../src/modules/appointments/repo.js';
import { RoleCode, Permission, type AuthUser } from '@oams/shared';

const {
  appointmentsTable,
  meetingNotesTable,
  actionItemsTable,
  tasksTable,
  officialsTable,
  insertedAudit,
  writtenOutbox,
} = vi.hoisted(() => {
  return {
    appointmentsTable: [] as any[],
    meetingNotesTable: [] as any[],
    actionItemsTable: [] as any[],
    tasksTable: [] as any[],
    officialsTable: [] as any[],
    insertedAudit: [] as any[],
    writtenOutbox: [] as any[],
  };
});

vi.mock('../src/core/db.js', () => {
  const trxFn: any = vi.fn().mockImplementation((tableName: string) => {
    let whereClauses: Record<string, any> = {};

    const qb: any = {
      where: vi.fn().mockImplementation((col: any, val: any) => {
        if (typeof col === 'object') {
          whereClauses = { ...whereClauses, ...col };
        } else {
          whereClauses[col] = val;
        }
        return qb;
      }),
      andWhere: vi.fn().mockImplementation((col: any, val: any) => {
        if (typeof col === 'object') {
          whereClauses = { ...whereClauses, ...col };
        } else {
          whereClauses[col] = val;
        }
        return qb;
      }),
      orWhere: vi.fn().mockImplementation((callbackOrCol: any, val: any) => {
        if (typeof callbackOrCol === 'function') {
          callbackOrCol.call(qb);
        } else {
          whereClauses[callbackOrCol] = val;
        }
        return qb;
      }),
      whereIn: vi.fn().mockReturnThis(),
      whereNull: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      max: vi.fn().mockImplementation(() => ({
        first: vi.fn().mockResolvedValue({ max_p: 1000 }),
      })),
      first: vi.fn().mockImplementation(async () => {
        if (tableName === 'appointments') {
          return appointmentsTable.find((a) => {
            if (whereClauses.id && a.id !== whereClauses.id) return false;
            if (whereClauses.org_id && a.org_id !== whereClauses.org_id) return false;
            return true;
          });
        }
        if (tableName === 'officials') {
          return officialsTable.find((o) => {
            if (whereClauses.id && o.id !== whereClauses.id) return false;
            return true;
          });
        }
        if (tableName === 'meeting_notes') {
          return meetingNotesTable.find((n) => n.id === whereClauses.id);
        }
        if (tableName === 'action_items') {
          return actionItemsTable.find((ai) => {
            if (whereClauses.id && ai.id !== whereClauses.id) return false;
            if (
              whereClauses.converted_task_id &&
              ai.converted_task_id !== whereClauses.converted_task_id
            )
              return false;
            return true;
          });
        }
        if (tableName === 'tasks') {
          return tasksTable.find((t) => t.id === whereClauses.id);
        }
        if (tableName === 'support_staff_assignments') {
          return null;
        }
        return null;
      }),
      insert: vi.fn().mockImplementation((data: any) => {
        const rows = Array.isArray(data) ? data : [data];
        const inserted = rows.map((r, idx) => ({
          id: r.id || `gen-id-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
          created_at: new Date(),
          updated_at: new Date(),
          version: 1,
          ...r,
        }));

        if (tableName === 'meeting_notes') meetingNotesTable.push(...inserted);
        if (tableName === 'action_items') actionItemsTable.push(...inserted);
        if (tableName === 'tasks') tasksTable.push(...inserted);

        const insertPromise = Promise.resolve(inserted);
        (insertPromise as any).returning = vi.fn().mockResolvedValue(inserted);
        return insertPromise;
      }),
      update: vi.fn().mockImplementation((updates: any) => {
        let affected = 0;
        let returnedRows: any[] = [];
        if (tableName === 'appointments') {
          const a = appointmentsTable.find((row) => row.id === whereClauses.id);
          if (a) {
            Object.assign(a, updates);
            affected = 1;
            returnedRows = [a];
          }
        }
        if (tableName === 'meeting_notes') {
          const n = meetingNotesTable.find((row) => row.id === whereClauses.id);
          if (n) {
            Object.assign(n, updates);
            affected = 1;
            returnedRows = [n];
          }
        }
        if (tableName === 'action_items') {
          const matches = actionItemsTable.filter((row) => {
            if (whereClauses.id && row.id === whereClauses.id) return true;
            if (
              whereClauses.converted_task_id &&
              row.converted_task_id === whereClauses.converted_task_id
            )
              return true;
            return false;
          });
          matches.forEach((m) => Object.assign(m, updates));
          affected = matches.length;
          returnedRows = matches;
        }
        if (tableName === 'tasks') {
          const t = tasksTable.find((row) => row.id === whereClauses.id);
          if (t) {
            Object.assign(t, updates);
            affected = 1;
            returnedRows = [t];
          }
        }

        const updatePromise = Promise.resolve(affected);
        (updatePromise as any).returning = vi.fn().mockResolvedValue(returnedRows);
        return updatePromise;
      }),
    };

    return qb;
  });

  trxFn.transaction = vi.fn().mockImplementation(async (callback: any) => {
    return callback(trxFn);
  });

  trxFn.fn = {
    now: vi.fn().mockReturnValue(new Date()),
  };

  trxFn.raw = vi.fn().mockReturnValue('gen-uuid');

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

vi.mock('../src/core/utils/referenceNumber.js', () => ({
  generateReferenceNumber: vi.fn().mockImplementation(async (_db: any, prefix: string) => {
    return `${prefix}-2026-${Math.floor(100000 + Math.random() * 900000)}`;
  }),
}));

vi.mock('../src/modules/tasks/repo.js', () => ({
  tasksRepo: {
    getById: vi.fn().mockImplementation(async (id: string) => {
      return tasksTable.find((t) => t.id === id) || null;
    }),
    getWithDetails: vi.fn().mockImplementation(async (id: string) => {
      const t = tasksTable.find((task) => task.id === id);
      if (!t) return null;
      return {
        id: t.id,
        orgId: t.org_id,
        referenceNo: t.reference_no,
        officialId: t.official_id,
        title: t.title,
        description: t.description,
        category: t.category,
        priority: t.priority,
        status: t.status,
        visibility: t.visibility,
        source: t.source,
        sourceId: t.source_id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }),
  },
}));

describe('Track 8: Meeting Notes, Action Items & Follow-up', () => {
  const mockOfficialUser: AuthUser = {
    id: 'user-official-1',
    orgId: 'org-apex-1',
    email: 'official@apex.gov',
    fullName: 'Dr. Jane Official',
    authProvider: 'LOCAL',
    status: 'ACTIVE',
    timezone: 'Asia/Kolkata',
    theme: 'LIGHT',
    roles: [RoleCode.OFFICIAL],
    assignedOfficialIds: [],
  };

  const mockOfficial = {
    id: 'official-1',
    org_id: 'org-apex-1',
    user_id: 'user-official-1',
    full_name: 'Dr. Jane Official',
  };

  beforeEach(() => {
    appointmentsTable.length = 0;
    meetingNotesTable.length = 0;
    actionItemsTable.length = 0;
    tasksTable.length = 0;
    officialsTable.length = 0;
    insertedAudit.length = 0;
    writtenOutbox.length = 0;

    officialsTable.push(mockOfficial);

    appointmentsTable.push({
      id: 'apt-101',
      org_id: 'org-apex-1',
      reference_no: 'APT-2026-000101',
      subject: 'Policy Strategy Discussion',
      purpose: 'Annual roadmap review',
      description: 'Review Q4 deliverable milestones',
      primary_official_id: 'official-1',
      requester_user_id: 'user-guest-1',
      status: 'CONFIRMED',
      visibility: 'INTERNAL',
      version: 1,
    });
  });

  it('1. Completing a meeting captures notes and action items (§16, §22 Track 8)', async () => {
    const result = await meetingsService.completeMeetingWithNotes(mockOfficialUser, 'apt-101', {
      notes: '## Strategy Alignment\n\nReviewed progress and aligned on timelines.',
      decisions: 'Approved draft proposal v2.1 with minor edits.',
      actionItems: [
        {
          title: 'Prepare budget revision breakdown',
          ownerUserId: 'user-official-1',
          dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        },
        {
          title: 'Distribute summary deck to board',
          ownerUserId: null,
          dueDate: null,
        },
      ],
      scheduleFollowUp: true,
    });

    expect(result.appointment.status).toBe('COMPLETED');
    expect(result.note.body).toContain('Strategy Alignment');
    expect(result.note.decisions).toContain('Approved draft proposal');
    expect(result.actionItems).toHaveLength(2);
    expect(result.actionItems[0].title).toBe('Prepare budget revision breakdown');
    expect(result.actionItems[0].status).toBe('OPEN');
    expect(result.followUpRequested).toBe(true);

    // Verify audit log recorded appointment completion
    const audit = insertedAudit.find((a) => a.action === 'appointment.complete');
    expect(audit).toBeDefined();
    expect(audit.changes.toStatus).toBe('COMPLETED');

    // Verify domain outbox event
    const outbox = writtenOutbox.find((o) => o.eventType === 'MeetingCompleted');
    expect(outbox).toBeDefined();
    expect(outbox.payload.actionItemCount).toBe(2);
  });

  it('2. Convert-to-task links both ways (§16, §22 Track 8)', async () => {
    // Complete meeting to create an action item
    const completion = await meetingsService.completeMeetingWithNotes(mockOfficialUser, 'apt-101', {
      notes: 'Meeting completed',
      actionItems: [{ title: 'Implement security audit remediation' }],
    });

    const actionItem = completion.actionItems[0];
    expect(actionItem).toBeDefined();

    // Convert to task
    const convertResult = await meetingsService.convertActionItemToTask(
      mockOfficialUser,
      actionItem.id,
      {
        priority: 'HIGH',
        category: 'REVIEW',
      },
    );

    // Verify created task links to action item
    expect(convertResult.task).toBeDefined();
    expect(convertResult.task.title).toBe('Implement security audit remediation');
    expect(convertResult.task.source).toBe('ACTION_ITEM');
    expect(convertResult.task.sourceId).toBe(actionItem.id);

    // Verify action item links to task
    expect(convertResult.actionItem.convertedTaskId).toBe(convertResult.task.id);

    // Attempting to convert again should throw conflict
    await expect(
      meetingsService.convertActionItemToTask(mockOfficialUser, actionItem.id),
    ).rejects.toThrow(/already converted/i);
  });

  it('3. Completing the task closes the action item automatically (§16, §22 Track 8)', async () => {
    const completion = await meetingsService.completeMeetingWithNotes(mockOfficialUser, 'apt-101', {
      notes: 'Meeting completed',
      actionItems: [{ title: 'Review quarterly compliance report' }],
    });

    const actionItem = completion.actionItems[0];
    const convertResult = await meetingsService.convertActionItemToTask(
      mockOfficialUser,
      actionItem.id,
    );

    const taskId = convertResult.task.id;

    // Complete the task via tasksService
    await tasksService.completeTask(mockOfficialUser, taskId);

    // Verify task is DONE
    const updatedTask = tasksTable.find((t) => t.id === taskId);
    expect(updatedTask.status).toBe('DONE');

    // Verify linked action item is automatically DONE
    const updatedActionItem = actionItemsTable.find((ai) => ai.id === actionItem.id);
    expect(updatedActionItem.status).toBe('DONE');
  });

  it('4. Manual close appointment transitions COMPLETED to CLOSED (§10.2, §16)', async () => {
    // First complete
    await meetingsService.completeMeetingWithNotes(mockOfficialUser, 'apt-101', {
      notes: 'Final conclusion',
    });

    // Close appointment
    const closed = await meetingsService.closeAppointment(
      mockOfficialUser,
      'apt-101',
      'All follow-ups finished',
    );

    expect(closed.status).toBe('CLOSED');
  });
});
