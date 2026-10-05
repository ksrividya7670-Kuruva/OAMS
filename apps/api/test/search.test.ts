import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchService } from '../src/modules/search/service.js';
import { RoleCode } from '@oams/shared';

const { appointmentsTable, usersTable, officialsTable, tasksTable, visitsTable } = vi.hoisted(
  () => ({
    appointmentsTable: [] as any[],
    usersTable: [] as any[],
    officialsTable: [] as any[],
    tasksTable: [] as any[],
    visitsTable: [] as any[],
  }),
);

vi.mock('../src/core/db.js', () => {
  const trxFn: any = vi.fn().mockImplementation((tableName: string) => {
    let whereClauses: Record<string, any> = {};
    const orGroups: Array<Array<(item: any) => boolean>> = [];
    const notClauses: Array<{ col: string; val: any }> = [];
    let limitCount: number = 20;

    const execute = () => {
      let source: any[] = [];
      if (tableName.includes('appointments')) source = appointmentsTable;
      else if (tableName.includes('users')) {
        source = usersTable.map((u) => {
          const off = officialsTable.find((o) => o.user_id === u.id);
          return {
            ...u,
            department: off?.department,
            designation: off?.designation,
          };
        });
      } else if (tableName.includes('tasks')) source = tasksTable;
      else if (tableName.includes('visits')) source = visitsTable;

      const results = source.filter((row) => {
        for (const [k, v] of Object.entries(whereClauses)) {
          const cleanKey = k.includes('.') ? k.split('.')[1] : k;
          if (row[cleanKey] !== v) return false;
        }
        for (const nc of notClauses) {
          const cleanKey = nc.col.includes('.') ? nc.col.split('.')[1] : nc.col;
          if (row[cleanKey] === nc.val) return false;
        }
        for (const group of orGroups) {
          const passesGroup = group.some((fn) => fn(row));
          if (!passesGroup) return false;
        }
        return true;
      });

      return results.slice(0, limitCount);
    };

    const qb: any = {
      where: vi.fn().mockImplementation((col: any, opOrVal?: any, val?: any) => {
        if (typeof col === 'function') {
          const group: Array<(item: any) => boolean> = [];
          const subQb: any = {
            whereILike: vi.fn().mockImplementation((c: string, pat: string) => {
              const rawPat = pat.replace(/%/g, '').toLowerCase();
              group.push((item: any) => {
                const cleanKey = c.includes('.') ? c.split('.')[1] : c;
                return (item[cleanKey] || '').toLowerCase().includes(rawPat);
              });
              return subQb;
            }),
            orWhereILike: vi.fn().mockImplementation((c: string, pat: string) => {
              const rawPat = pat.replace(/%/g, '').toLowerCase();
              group.push((item: any) => {
                const cleanKey = c.includes('.') ? c.split('.')[1] : c;
                return (item[cleanKey] || '').toLowerCase().includes(rawPat);
              });
              return subQb;
            }),
            whereNot: vi.fn().mockImplementation((c: string, v: any) => {
              group.push((item: any) => {
                const cleanKey = c.includes('.') ? c.split('.')[1] : c;
                return item[cleanKey] !== v;
              });
              return subQb;
            }),
            orWhere: vi.fn().mockImplementation((c: string, v: any) => {
              group.push((item: any) => {
                const cleanKey = c.includes('.') ? c.split('.')[1] : c;
                return item[cleanKey] === v;
              });
              return subQb;
            }),
            where: vi.fn().mockImplementation((c: string, v: any) => {
              group.push((item: any) => {
                const cleanKey = c.includes('.') ? c.split('.')[1] : c;
                return item[cleanKey] === v;
              });
              return subQb;
            }),
          };
          col(subQb);
          if (group.length > 0) {
            orGroups.push(group);
          }
        } else if (typeof col === 'object') {
          whereClauses = { ...whereClauses, ...col };
        } else if (val !== undefined) {
          whereClauses[col] = val;
        } else {
          whereClauses[col] = opOrVal;
        }
        return qb;
      }),
      leftJoin: vi.fn().mockImplementation(() => qb),
      limit: vi.fn().mockImplementation((n: number) => {
        limitCount = n;
        return qb;
      }),
      select: vi.fn().mockImplementation(() => qb),
    };

    qb.then = (resolve: any) => Promise.resolve(execute()).then(resolve);
    return qb;
  });

  return { db: trxFn };
});

describe('Unified Search Endpoint (§17.4, §22 Track 10)', () => {
  const orgId = 'org-search-test';
  const regularUserId = 'user-regular-1';

  beforeEach(() => {
    appointmentsTable.length = 0;
    usersTable.length = 0;
    officialsTable.length = 0;
    tasksTable.length = 0;
    visitsTable.length = 0;

    // 1. Appointments
    appointmentsTable.push(
      {
        id: 'apt-search-1',
        org_id: orgId,
        subject: 'Agriculture Policy Review',
        requester_name: 'Farmer Union',
        requester_email: 'agri@union.org',
        reference_number: 'REF-AGRI-100',
        visibility: 'PUBLIC',
        status: 'CONFIRMED',
      },
      {
        id: 'apt-search-secret',
        org_id: orgId,
        subject: 'Confidential Agriculture Briefing',
        requester_name: 'Minister Personal',
        requester_email: 'minister@gov.in',
        reference_number: 'REF-SECRET-999',
        visibility: 'PERSONAL',
        requester_user_id: 'other-user',
        official_user_id: 'other-official',
        status: 'CONFIRMED',
      },
    );

    // 2. Officials
    usersTable.push({
      id: 'off-user-1',
      org_id: orgId,
      full_name: 'Rajesh Agriculture Director',
      email: 'rajesh.agri@gov.in',
      status: 'ACTIVE',
    });
    officialsTable.push({
      user_id: 'off-user-1',
      department: 'Ministry of Agriculture',
      designation: 'Director General',
    });

    // 3. Tasks
    tasksTable.push(
      {
        id: 'task-agri-mine',
        org_id: orgId,
        title: 'Draft Agriculture Memo',
        description: 'Prepare notes for committee',
        priority: 'HIGH',
        status: 'TODO',
        assignee_id: regularUserId,
      },
      {
        id: 'task-agri-theirs',
        org_id: orgId,
        title: 'Review Agriculture Budget',
        description: 'Internal finance only',
        priority: 'LOW',
        status: 'TODO',
        assignee_id: 'someone-else',
        created_by: 'someone-else',
      },
    );

    // 4. Visits
    visitsTable.push({
      id: 'visit-agri-1',
      org_id: orgId,
      visitor_name: 'Dr. Swaminathan Agriculture Scientist',
      visitor_email: 'swaminathan@agri.res.in',
      purpose: 'Agriculture Council Consultation',
      badge_number: 'B-77',
      status: 'CHECKED_IN',
    });
  });

  it('should search multi-entity results respecting privacy boundaries for regular users (§17.4)', async () => {
    const regularUser = {
      id: regularUserId,
      roles: ['USER'],
    };

    const results = await searchService.search(orgId, { q: 'Agriculture', limit: 20 }, regularUser);

    expect(results.query).toBe('Agriculture');
    expect(results.results.length).toBeGreaterThan(0);

    // 1. Should include public appointment, but exclude PERSONAL appointment of another user
    const aptIds = results.results.filter((r) => r.type === 'appointment').map((r) => r.id);
    expect(aptIds).toContain('apt-search-1');
    expect(aptIds).not.toContain('apt-search-secret');

    // 2. Should find official
    const officialIds = results.results.filter((r) => r.type === 'official').map((r) => r.id);
    expect(officialIds).toContain('off-user-1');

    // 3. Should include regular user's own task, but exclude another user's task
    const taskIds = results.results.filter((r) => r.type === 'task').map((r) => r.id);
    expect(taskIds).toContain('task-agri-mine');
    expect(taskIds).not.toContain('task-agri-theirs');

    // 4. Regular user should not see visitor logs (reception/security only)
    const visitIds = results.results.filter((r) => r.type === 'visit').map((r) => r.id);
    expect(visitIds).toHaveLength(0);
  });

  it('should allow Super Admin or Receptionist to view visitor logs and all tasks', async () => {
    const adminUser = {
      id: 'admin-super',
      roles: [RoleCode.SUPER_ADMIN],
    };

    const results = await searchService.search(orgId, { q: 'Agriculture', limit: 20 }, adminUser);

    // Admin sees all matching tasks
    const taskIds = results.results.filter((r) => r.type === 'task').map((r) => r.id);
    expect(taskIds).toContain('task-agri-mine');
    expect(taskIds).toContain('task-agri-theirs');

    // Admin sees visitors
    const visitIds = results.results.filter((r) => r.type === 'visit').map((r) => r.id);
    expect(visitIds).toContain('visit-agri-1');
  });
});
