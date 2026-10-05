import { describe, it, expect, vi, beforeEach } from 'vitest';
import { privacyService } from '../src/modules/privacy/service.js';

const { usersTable, appointmentsTable, visitsTable, notificationsTable, auditEventsTable } =
  vi.hoisted(() => ({
    usersTable: [] as any[],
    appointmentsTable: [] as any[],
    visitsTable: [] as any[],
    notificationsTable: [] as any[],
    auditEventsTable: [] as any[],
  }));

vi.mock('../src/core/db.js', () => {
  const createQb = (tableName: string) => {
    let whereClauses: Record<string, any> = {};
    const orWhereClauses: Array<{ col: string; val: any }> = [];

    const getSource = () => {
      if (tableName.includes('users')) return usersTable;
      if (tableName.includes('appointments')) return appointmentsTable;
      if (tableName.includes('visits')) return visitsTable;
      if (tableName.includes('notifications')) return notificationsTable;
      if (tableName.includes('audit_events')) return auditEventsTable;
      return [];
    };

    const filterSource = () => {
      const source = getSource();
      return source.filter((row) => {
        // Direct where conditions
        for (const [k, v] of Object.entries(whereClauses)) {
          const cleanKey = k.includes('.') ? k.split('.')[1] : k;
          if (row[cleanKey] !== v) return false;
        }
        // Sub-query / orWhere conditions
        if (orWhereClauses.length > 0) {
          const matchesAny = orWhereClauses.some((clause) => {
            const cleanKey = clause.col.includes('.') ? clause.col.split('.')[1] : clause.col;
            return row[cleanKey] === clause.val;
          });
          if (!matchesAny) return false;
        }
        return true;
      });
    };

    const qb: any = {
      where: vi.fn().mockImplementation((col: any, opOrVal?: any, val?: any) => {
        if (typeof col === 'function') {
          // Subquery builder (e.g. qb.where((builder) => { ... }))
          const subQb: any = {
            where: vi.fn().mockImplementation((scol: string, sval: any) => {
              orWhereClauses.push({ col: scol, val: sval });
              return subQb;
            }),
            orWhere: vi.fn().mockImplementation((scol: string, sval: any) => {
              orWhereClauses.push({ col: scol, val: sval });
              return subQb;
            }),
          };
          col(subQb);
        } else if (typeof col === 'object') {
          whereClauses = { ...whereClauses, ...col };
        } else if (val !== undefined) {
          whereClauses[col] = val;
        } else {
          whereClauses[col] = opOrVal;
        }
        return qb;
      }),
      orWhere: vi.fn().mockImplementation((col: string, val: any) => {
        orWhereClauses.push({ col, val });
        return qb;
      }),
      select: vi.fn().mockImplementation(() => qb),
      orderBy: vi.fn().mockImplementation(() => qb),
      first: vi.fn().mockImplementation(async () => {
        const matches = filterSource();
        return matches[0] ? { ...matches[0] } : undefined;
      }),
      update: vi.fn().mockImplementation(async (updates: any) => {
        const matches = filterSource();
        for (const item of matches) {
          Object.assign(item, updates);
        }
        return matches.length;
      }),
      delete: vi.fn().mockImplementation(async () => {
        const matches = filterSource();
        const source = getSource();
        for (const m of matches) {
          const idx = source.findIndex((s) => s.id === m.id);
          if (idx !== -1) source.splice(idx, 1);
        }
        return matches.length;
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

    qb.then = (resolve: any) => Promise.resolve(filterSource()).then(resolve);
    return qb;
  };

  const trxFn: any = vi.fn().mockImplementation((tableName: string) => createQb(tableName));
  trxFn.transaction = async (callback: any) => {
    return callback(trxFn);
  };
  trxFn.fn = { now: () => new Date().toISOString() };

  return { db: trxFn };
});

describe('DPDP Act 2023 Data Principal Privacy & Erasure (§17.6, §22 Track 10)', () => {
  const orgId = 'org-privacy-test';
  const principalUserId = 'user-principal-1';
  const principalEmail = 'citizen.principal@example.com';

  beforeEach(() => {
    usersTable.length = 0;
    appointmentsTable.length = 0;
    visitsTable.length = 0;
    notificationsTable.length = 0;
    auditEventsTable.length = 0;

    usersTable.push({
      id: principalUserId,
      org_id: orgId,
      full_name: 'Priya Sharma',
      email: principalEmail,
      phone: '+91-9876543210',
      status: 'ACTIVE',
    });

    appointmentsTable.push({
      id: 'apt-dpdp-1',
      org_id: orgId,
      requester_user_id: principalUserId,
      requester_name: 'Priya Sharma',
      requester_email: principalEmail,
      requester_phone: '+91-9876543210',
      subject: 'Land Registry Review',
      purpose: 'Grievance regarding land survey deed',
      status: 'CONFIRMED',
    });

    visitsTable.push({
      id: 'visit-dpdp-1',
      org_id: orgId,
      user_id: principalUserId,
      visitor_name: 'Priya Sharma',
      visitor_email: principalEmail,
      visitor_phone: '+91-9876543210',
      gov_id_last4: '4321',
      photo_url: 'https://storage.local/photos/priya.jpg',
      badge_number: 'B-108',
      status: 'CHECKED_OUT',
    });

    notificationsTable.push({
      id: 'notif-dpdp-1',
      user_id: principalUserId,
      title: 'Appointment Confirmed',
      body: 'Your land survey review has been scheduled.',
    });

    // Existing immutable audit log from earlier interaction
    auditEventsTable.push({
      id: 'audit-legacy-001',
      org_id: orgId,
      actor_id: principalUserId,
      actor_role: 'REQUESTER',
      action: 'appointment.create',
      entity_type: 'appointment',
      entity_id: 'apt-dpdp-1',
      changes: { subject: 'Land Registry Review' },
      prev_hash: '0'.repeat(64),
      hash: 'a'.repeat(64),
      occurred_at: '2026-09-01T10:00:00.000Z',
    });
  });

  it('should compile complete JSON data principal export bundle (§17.6)', async () => {
    const exportResult = await privacyService.exportDataPrincipal(orgId, {
      email: principalEmail,
    });

    expect(exportResult.dataPrincipal.id).toBe(principalUserId);
    expect(exportResult.dataPrincipal.fullName).toBe('Priya Sharma');
    expect(exportResult.dataPrincipal.email).toBe(principalEmail);

    expect(exportResult.appointments).toHaveLength(1);
    expect(exportResult.appointments[0].subject).toBe('Land Registry Review');

    expect(exportResult.visits).toHaveLength(1);
    expect(exportResult.visits[0].gov_id_last4).toBe('4321');

    expect(exportResult.notifications).toHaveLength(1);
    expect(exportResult.notifications[0].title).toBe('Appointment Confirmed');
  });

  it('should irreversibly anonymize personal records while strictly preserving audit row IDs (§17.6)', async () => {
    const eraseResult = await privacyService.eraseDataPrincipal(
      orgId,
      {
        email: principalEmail,
        reason: 'Right to Erasure under DPDP Act 2023 Section 12',
      },
      'admin-compliance-1',
      'SUPER_ADMIN',
    );

    expect(eraseResult.success).toBe(true);

    // 1. Appointments anonymized
    const apt = appointmentsTable.find((a) => a.id === 'apt-dpdp-1');
    expect(apt.requester_name).toBe('Anonymized User');
    expect(apt.requester_email).toBe('anonymized@dpdp.local');
    expect(apt.requester_phone).toBeNull();
    expect(apt.subject).toBe('[ANONYMIZED PER DPDP]');
    expect(apt.purpose).toBe('[ANONYMIZED PER DPDP]');

    // 2. Visits scrubbed of government ID and photo
    const visit = visitsTable.find((v) => v.id === 'visit-dpdp-1');
    expect(visit.visitor_name).toBe('Anonymized Visitor');
    expect(visit.visitor_email).toBe('anonymized@dpdp.local');
    expect(visit.gov_id_last4).toBeNull();
    expect(visit.photo_url).toBeNull();
    expect(visit.badge_number).toBeNull();

    // 3. User profile disabled
    const user = usersTable.find((u) => u.id === principalUserId);
    expect(user.status).toBe('DISABLED');
    expect(user.phone).toBeNull();
    expect(user.email).toContain('anonymized-');

    // 4. Notifications purged
    expect(notificationsTable).toHaveLength(0);

    // 5. CRITICAL PRIVACY INVARIANT: Existing audit row IDs are strictly preserved!
    expect(auditEventsTable.some((ae) => ae.id === 'audit-legacy-001')).toBe(true);

    // 6. Erasure action itself is audited
    const erasureAudit = auditEventsTable.find((ae) => ae.action === 'privacy.data_erasure');
    expect(erasureAudit).toBeDefined();
    expect(erasureAudit.reason).toContain('Right to Erasure');
  });
});
