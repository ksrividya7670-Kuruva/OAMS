import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveAssignee } from '../src/modules/appointments/routing.js';
import { delegationsService } from '../src/modules/delegations/service.js';
import {
  rerouteAppointmentsForOfficial,
  processRerouteAssignmentsOnce,
} from '../src/jobs/rerouteAssignments.js';
import { AppointmentStatus, Permission } from '@oams/shared';

const {
  officialsTable,
  usersTable,
  delegationsTable,
  supportStaffTable,
  calendarEventsTable,
  calendarsTable,
  appointmentsTable,
  outboxTable,
  auditTable,
} = vi.hoisted(() => ({
  officialsTable: [] as any[],
  usersTable: [] as any[],
  delegationsTable: [] as any[],
  supportStaffTable: [] as any[],
  calendarEventsTable: [] as any[],
  calendarsTable: [] as any[],
  appointmentsTable: [] as any[],
  outboxTable: [] as any[],
  auditTable: [] as any[],
}));

vi.mock('../src/core/db.js', () => {
  const trxFn: any = vi.fn().mockImplementation((tableName: string) => {
    let whereClauses: Record<string, any> = {};
    const whereInClauses: Record<string, any[]> = {};
    const whereNullClauses: string[] = [];
    const lessEqualClauses: Record<string, any> = {};
    const greaterEqualClauses: Record<string, any> = {};

    const qb: any = {
      where: vi.fn().mockImplementation((col: any, opOrVal?: any, val?: any) => {
        if (typeof col === 'object') {
          whereClauses = { ...whereClauses, ...col };
        } else if (val !== undefined) {
          if (opOrVal === '<=') lessEqualClauses[col] = val;
          else if (opOrVal === '>=') greaterEqualClauses[col] = val;
          else whereClauses[col] = val;
        } else {
          whereClauses[col] = opOrVal;
        }
        return qb;
      }),
      andWhere: vi.fn().mockImplementation((predicate: any) => {
        if (typeof predicate === 'function') {
          predicate(qb);
        }
        return qb;
      }),
      whereIn: vi.fn().mockImplementation((col: string, values: any[]) => {
        whereInClauses[col] = values;
        return qb;
      }),
      whereNull: vi.fn().mockImplementation((col: string) => {
        whereNullClauses.push(col);
        return qb;
      }),
      orWhere: vi.fn().mockImplementation(() => qb),
      orderBy: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      select: vi.fn().mockImplementation(async () => {
        if (tableName === 'appointments') {
          return appointmentsTable.filter((apt) => {
            if (
              whereClauses.primary_official_id &&
              apt.primary_official_id !== whereClauses.primary_official_id
            ) {
              return false;
            }
            if (whereInClauses.status && !whereInClauses.status.includes(apt.status)) {
              return false;
            }
            return true;
          });
        }
        if (tableName === 'official_support_staff') {
          return supportStaffTable
            .filter(
              (s) =>
                s.official_id === whereClauses['official_support_staff.official_id'] ||
                s.official_id === whereClauses.official_id,
            )
            .map((s) => ({
              ...s,
              userId: s.user_id,
            }));
        }
        if (tableName === 'delegations') {
          return delegationsTable.map((d) => {
            const fromUser = usersTable.find((u) => u.id === d.from_user_id);
            const toUser = usersTable.find((u) => u.id === d.to_user_id);
            return {
              ...d,
              from_user_name: fromUser?.full_name,
              to_user_name: toUser?.full_name,
              to_user_email: toUser?.email,
            };
          });
        }
        return [];
      }),
      first: vi.fn().mockImplementation(async () => {
        if (tableName === 'officials') {
          const o = officialsTable.find((item) => {
            if (whereClauses.id && item.id !== whereClauses.id) return false;
            return true;
          });
          return o ? { ...o } : null;
        }
        if (tableName === 'users') {
          const u = usersTable.find((item) => {
            if (whereClauses.id && item.id !== whereClauses.id) return false;
            return true;
          });
          return u ? { ...u } : null;
        }
        if (tableName === 'delegations') {
          const d = delegationsTable.find((item) => {
            if (whereClauses.id && item.id !== whereClauses.id) return false;
            if (whereClauses['delegations.id'] && item.id !== whereClauses['delegations.id'])
              return false;
            if (whereClauses.official_id && item.official_id !== whereClauses.official_id)
              return false;
            if (
              whereClauses['delegations.official_id'] &&
              item.official_id !== whereClauses['delegations.official_id']
            )
              return false;
            if (whereNullClauses.includes('revoked_at') && item.revoked_at !== null) return false;
            if (whereInClauses.scope && !whereInClauses.scope.includes(item.scope)) return false;
            if (lessEqualClauses.starts_at && new Date(item.starts_at) > lessEqualClauses.starts_at)
              return false;
            if (greaterEqualClauses.ends_at && new Date(item.ends_at) < greaterEqualClauses.ends_at)
              return false;
            return true;
          });
          if (!d) return null;
          const fromUser = usersTable.find((u) => u.id === d.from_user_id);
          const toUser = usersTable.find((u) => u.id === d.to_user_id);
          return {
            ...d,
            from_user_name: fromUser?.full_name,
            to_user_name: toUser?.full_name,
            to_user_email: toUser?.email,
          };
        }
        if (tableName === 'calendar_events') {
          return calendarEventsTable.find((ev) => ev.kind === 'LEAVE');
        }
        return null;
      }),
      then: (resolve: any) => Promise.resolve(qb.select()).then(resolve),
      insert: vi.fn().mockImplementation((data: any) => {
        const id = data.id || `gen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const record = {
          ...data,
          id,
          created_at: new Date(),
          updated_at: new Date(),
          revoked_at: data.revoked_at || null,
        };
        if (tableName === 'delegations') {
          delegationsTable.push(record);
        } else if (tableName === 'appointments') {
          appointmentsTable.push(record);
        }
        const promise: any = Promise.resolve([record]);
        promise.returning = vi.fn().mockResolvedValue([record]);
        return promise;
      }),
      update: vi.fn().mockImplementation((updates: any) => {
        if (tableName === 'appointments') {
          const apt = appointmentsTable.find((a) => a.id === whereClauses.id);
          if (apt) Object.assign(apt, updates);
        } else if (tableName === 'delegations') {
          const del = delegationsTable.find((d) => d.id === whereClauses.id);
          if (del) Object.assign(del, updates);
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

vi.mock('../src/core/notifications/router.js', () => ({
  routeNotificationEvent: vi.fn().mockResolvedValue(undefined),
  isUserInQuietHours: vi.fn().mockReturnValue(false),
}));

describe('Track 9: Delegation & Automatic Rerouting (§7.2, §10.3, §22 Track 9)', () => {
  const officialUser = {
    id: 'user-official-1',
    org_id: 'org-1',
    full_name: 'Hon. Minister',
    email: 'minister@gov.in',
    status: 'ACTIVE',
  };

  const delegateUser = {
    id: 'user-delegate-1',
    org_id: 'org-1',
    full_name: 'Dr. Delegate',
    email: 'delegate@gov.in',
    status: 'ACTIVE',
  };

  const staffUser = {
    id: 'user-staff-1',
    org_id: 'org-1',
    full_name: 'Mr. Staff PA',
    email: 'staff@gov.in',
    status: 'ACTIVE',
  };

  const officialRecord = {
    id: 'official-1',
    org_id: 'org-1',
    user_id: 'user-official-1',
    title: 'Minister of Tech',
    is_active: true,
  };

  beforeEach(() => {
    officialsTable.length = 0;
    usersTable.length = 0;
    delegationsTable.length = 0;
    supportStaffTable.length = 0;
    calendarEventsTable.length = 0;
    calendarsTable.length = 0;
    appointmentsTable.length = 0;
    outboxTable.length = 0;
    auditTable.length = 0;

    officialsTable.push(officialRecord);
    usersTable.push(officialUser, delegateUser, staffUser);
  });

  describe('Routing resolution order (§10.3)', () => {
    it('1. routes to active support staff when no delegation exists', async () => {
      supportStaffTable.push({
        id: 'staff-1',
        official_id: 'official-1',
        user_id: 'user-staff-1',
        support_role: 'PA',
        routing_order: 1,
        active_from: new Date('2020-01-01'),
        active_to: null,
      });

      const assignee = await resolveAssignee('official-1');
      expect(assignee).toBe('user-staff-1');
    });

    it('2. routes to active delegation when window is effective', async () => {
      supportStaffTable.push({
        id: 'staff-1',
        official_id: 'official-1',
        user_id: 'user-staff-1',
        support_role: 'PA',
        routing_order: 1,
        active_from: new Date('2020-01-01'),
        active_to: null,
      });

      const now = new Date();
      delegationsTable.push({
        id: 'del-1',
        official_id: 'official-1',
        from_user_id: 'user-official-1',
        to_user_id: 'user-delegate-1',
        scope: 'ALL',
        starts_at: new Date(now.getTime() - 3600000),
        ends_at: new Date(now.getTime() + 3600000),
        revoked_at: null,
      });

      const assignee = await resolveAssignee('official-1', now);
      expect(assignee).toBe('user-delegate-1');
    });

    it('3. falls back to official when no support staff or delegation exists', async () => {
      const assignee = await resolveAssignee('official-1');
      expect(assignee).toBe('user-official-1');
    });
  });

  describe('Delegation creation and immediate appointment re-routing (§7.2, §22 Track 9)', () => {
    it('creates delegation, emits DelegationStarted, and immediately re-routes review-stage appointments', async () => {
      // Pending review-stage appointment currently assigned to staff PA
      appointmentsTable.push({
        id: 'apt-1',
        org_id: 'org-1',
        reference_no: 'APT-2026-00099',
        primary_official_id: 'official-1',
        assigned_to_user_id: 'user-staff-1',
        status: AppointmentStatus.UNDER_REVIEW,
      });

      const now = new Date();
      const startsAt = new Date(now.getTime() - 60000).toISOString();
      const endsAt = new Date(now.getTime() + 86400000).toISOString();

      const delegation = await delegationsService.createDelegation(
        'org-1',
        'official-1',
        {
          toUserId: 'user-delegate-1',
          scope: 'ALL',
          startsAt,
          endsAt,
          reason: 'Diplomatic delegation abroad',
        },
        'user-official-1',
        'OFFICIAL',
        [Permission.OFFICIAL_MANAGE],
      );

      expect(delegation).toBeDefined();
      expect(delegation.toUserId).toBe('user-delegate-1');
      expect(delegation.scope).toBe('ALL');

      // Outbox should contain DelegationStarted
      const delStartedEvent = outboxTable.find((e) => e.eventType === 'DelegationStarted');
      expect(delStartedEvent).toBeDefined();
      expect(delStartedEvent.payload.toUserId).toBe('user-delegate-1');

      // The appointment must have been re-assigned to the delegate immediately
      const updatedApt = appointmentsTable.find((a) => a.id === 'apt-1');
      expect(updatedApt.assigned_to_user_id).toBe('user-delegate-1');

      // Outbox should contain AppointmentAssigned
      const aptAssignedEvent = outboxTable.find((e) => e.eventType === 'AppointmentAssigned');
      expect(aptAssignedEvent).toBeDefined();
      expect(aptAssignedEvent.payload.assignedToUserId).toBe('user-delegate-1');
    });

    it('rejects delegation if startsAt >= endsAt', async () => {
      const now = new Date();
      await expect(
        delegationsService.createDelegation(
          'org-1',
          'official-1',
          {
            toUserId: 'user-delegate-1',
            scope: 'ALL',
            startsAt: new Date(now.getTime() + 100000).toISOString(),
            endsAt: new Date(now.getTime()).toISOString(),
          },
          'user-official-1',
        ),
      ).rejects.toThrow('Invalid delegation date range');
    });
  });

  describe('Revoking delegation & re-routing (§7.2, §22 Track 9)', () => {
    it('revokes delegation, emits DelegationEnded, and immediately re-routes appointments back to official/staff', async () => {
      const now = new Date();
      const delegationRecord = {
        id: 'del-active',
        official_id: 'official-1',
        from_user_id: 'user-official-1',
        to_user_id: 'user-delegate-1',
        scope: 'ALL',
        starts_at: new Date(now.getTime() - 3600000),
        ends_at: new Date(now.getTime() + 86400000),
        revoked_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      delegationsTable.push(delegationRecord);

      appointmentsTable.push({
        id: 'apt-under-del',
        org_id: 'org-1',
        reference_no: 'APT-2026-00088',
        primary_official_id: 'official-1',
        assigned_to_user_id: 'user-delegate-1',
        status: AppointmentStatus.UNDER_REVIEW,
      });

      const revoked = await delegationsService.revokeDelegation(
        'org-1',
        'official-1',
        'del-active',
        'user-official-1',
        'OFFICIAL',
        [Permission.OFFICIAL_MANAGE],
      );

      expect(revoked.revokedAt).toBeDefined();

      // DelegationEnded event emitted
      const endedEvent = outboxTable.find((e) => e.eventType === 'DelegationEnded');
      expect(endedEvent).toBeDefined();
      expect(endedEvent.payload.toUserId).toBe('user-delegate-1');

      // The appointment should be re-routed back to official
      const apt = appointmentsTable.find((a) => a.id === 'apt-under-del');
      expect(apt.assigned_to_user_id).toBe('user-official-1');
    });
  });

  describe('Background reroute-assignments job', () => {
    it('scans and reroutes appointments whose routing has changed', async () => {
      // Appointment assigned to obsolete user
      appointmentsTable.push({
        id: 'apt-stale',
        org_id: 'org-1',
        reference_no: 'APT-STALE-1',
        primary_official_id: 'official-1',
        assigned_to_user_id: 'obsolete-user-id',
        status: AppointmentStatus.INFO_REQUESTED,
      });

      const count = await processRerouteAssignmentsOnce();
      expect(count).toBe(1);

      const apt = appointmentsTable.find((a) => a.id === 'apt-stale');
      expect(apt.assigned_to_user_id).toBe('user-official-1');
    });
  });
});
