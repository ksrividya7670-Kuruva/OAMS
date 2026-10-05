import { describe, it, expect, vi, beforeEach } from 'vitest';
import { officialsService } from '../src/modules/officials/service.js';
import { SupportRole, SupportRank } from '@oams/shared';

const { officialsTable, usersTable, supportStaffTable, outboxTable, auditTable } = vi.hoisted(
  () => ({
    officialsTable: [] as any[],
    usersTable: [] as any[],
    supportStaffTable: [] as any[],
    outboxTable: [] as any[],
    auditTable: [] as any[],
  }),
);

vi.mock('../src/core/db.js', () => {
  const trxFn: any = vi.fn().mockImplementation((tableName: string) => {
    let whereClauses: Record<string, any> = {};

    const qb: any = {
      where: vi.fn().mockImplementation((col: any, val?: any) => {
        if (typeof col === 'object') {
          whereClauses = { ...whereClauses, ...col };
        } else {
          whereClauses[col] = val;
        }
        return qb;
      }),
      join: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      first: vi.fn().mockImplementation(async () => {
        if (tableName === 'officials') {
          return officialsTable.find((o) => {
            if (whereClauses.id && o.id !== whereClauses.id) return false;
            return true;
          });
        }
        if (tableName === 'users') {
          return usersTable.find((u) => {
            if (whereClauses.id && u.id !== whereClauses.id) return false;
            return true;
          });
        }
        if (tableName === 'official_support_staff') {
          const s = supportStaffTable.find((item) => {
            if (whereClauses.id && item.id !== whereClauses.id) return false;
            if (whereClauses.official_id && item.official_id !== whereClauses.official_id)
              return false;
            if (whereClauses.user_id && item.user_id !== whereClauses.user_id) return false;
            return true;
          });
          return s ? { ...s } : null;
        }
        return null;
      }),
      select: vi.fn().mockImplementation(async () => {
        if (tableName === 'official_support_staff') {
          return supportStaffTable.filter((s) => {
            if (
              whereClauses['official_support_staff.official_id'] &&
              s.official_id !== whereClauses['official_support_staff.official_id']
            ) {
              return false;
            }
            return true;
          });
        }
        return [];
      }),
      insert: vi.fn().mockImplementation((data: any) => {
        const id = data.id || `staff-${Date.now()}`;
        const record = { ...data, id, created_at: new Date(), updated_at: new Date() };
        if (tableName === 'official_support_staff') {
          supportStaffTable.push(record);
        }
        const promise: any = Promise.resolve([record]);
        promise.returning = vi.fn().mockResolvedValue([record]);
        return promise;
      }),
      update: vi.fn().mockImplementation((updates: any) => {
        let updatedRecord = updates;
        if (tableName === 'official_support_staff') {
          const s = supportStaffTable.find((item) => item.id === whereClauses.id);
          if (s) {
            Object.assign(s, updates);
            updatedRecord = { ...s };
          }
        }
        const promise: any = Promise.resolve([updatedRecord]);
        promise.returning = vi.fn().mockResolvedValue([updatedRecord]);
        return promise;
      }),
    };

    return qb;
  });

  trxFn.fn = { now: () => new Date() };
  trxFn.transaction = vi.fn().mockImplementation(async (cb: any) => cb(trxFn));

  return { db: trxFn };
});

vi.mock('../src/core/outbox/outboxWriter.js', () => ({
  writeOutboxEvent: vi.fn().mockImplementation(async (_trx: any, event: any) => {
    outboxTable.push(event);
  }),
}));

vi.mock('../src/core/audit/auditWriter.js', () => ({
  writeAuditEvent: vi.fn().mockImplementation(async (_trx: any, event: any) => {
    auditTable.push(event);
  }),
}));

describe('Track 9: Personal Calendar & Task Access (§8.1, §14.4 T2, §22 Track 9)', () => {
  const official = {
    id: 'off-1',
    org_id: 'org-1',
    user_id: 'user-official',
    title: 'Executive Director',
  };

  const staffUser = {
    id: 'user-staff',
    org_id: 'org-1',
    full_name: 'Alex Assistant',
    email: 'alex@org.gov',
    status: 'ACTIVE',
  };

  beforeEach(() => {
    officialsTable.length = 0;
    usersTable.length = 0;
    supportStaffTable.length = 0;
    outboxTable.length = 0;
    auditTable.length = 0;

    officialsTable.push(official);
    usersTable.push(staffUser);
  });

  it('1. grants personal viewing and task management permissions and emits PersonalAccessGranted event', async () => {
    // Initial assignment without personal calendar viewing
    const created = await officialsService.assignSupportStaff(
      'org-1',
      'off-1',
      {
        userId: 'user-staff',
        supportRole: SupportRole.PA,
        rank: SupportRank.PRIMARY,
        routingOrder: 1,
        canApprove: false,
        canViewConfidential: false,
        canViewPersonal: false,
        canEditPersonal: false,
        canManageTasks: false,
      },
      'user-official',
      'OFFICIAL',
    );

    expect(created.can_view_personal).toBe(false);

    // Official now grants can_view_personal and can_manage_tasks with immediate effect
    outboxTable.length = 0;
    const updated = await officialsService.assignSupportStaff(
      'org-1',
      'off-1',
      {
        userId: 'user-staff',
        supportRole: SupportRole.PA,
        rank: SupportRank.PRIMARY,
        routingOrder: 1,
        canApprove: false,
        canViewConfidential: false,
        canViewPersonal: true,
        canEditPersonal: false,
        canManageTasks: true,
      },
      'user-official',
      'OFFICIAL',
    );

    expect(updated.can_view_personal).toBe(true);
    expect(updated.can_manage_tasks).toBe(true);

    // Outbox should contain PersonalAccessGranted event (§14.4 T2)
    const grantedEvent = outboxTable.find((e) => e.eventType === 'PersonalAccessGranted');
    expect(grantedEvent).toBeDefined();
    expect(grantedEvent.payload.staffUserId).toBe('user-staff');
    expect(grantedEvent.payload.permissions).toContain('VIEW_PERSONAL');
    expect(grantedEvent.payload.permissions).toContain('MANAGE_TASKS');
  });

  it('2. revokes personal access with immediate effect and emits PersonalAccessRevoked event', async () => {
    // Staff member currently has personal edit and view rights
    supportStaffTable.push({
      id: 'staff-active',
      official_id: 'off-1',
      user_id: 'user-staff',
      support_role: SupportRole.PA,
      rank: SupportRank.PRIMARY,
      routing_order: 1,
      can_view_personal: true,
      can_edit_personal: true,
      can_manage_tasks: true,
    });

    outboxTable.length = 0;

    // Official revokes edit permission immediately
    const updated = await officialsService.assignSupportStaff(
      'org-1',
      'off-1',
      {
        userId: 'user-staff',
        supportRole: SupportRole.PA,
        rank: SupportRank.PRIMARY,
        routingOrder: 1,
        canApprove: false,
        canViewConfidential: false,
        canViewPersonal: true,
        canEditPersonal: false, // Revoked
        canManageTasks: true,
      },
      'user-official',
      'OFFICIAL',
    );

    expect(updated.can_edit_personal).toBe(false);

    // Outbox should contain PersonalAccessRevoked event (§14.4 T2)
    const revokedEvent = outboxTable.find((e) => e.eventType === 'PersonalAccessRevoked');
    expect(revokedEvent).toBeDefined();
    expect(revokedEvent.payload.staffUserId).toBe('user-staff');
    expect(revokedEvent.payload.permissions).toContain('EDIT_PERSONAL');
  });
});
