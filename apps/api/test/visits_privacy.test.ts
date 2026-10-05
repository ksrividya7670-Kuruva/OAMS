import { describe, it, expect, vi } from 'vitest';
import { visitsRepo } from '../src/modules/visits/repo.js';
import { RoleCode, VisitStatus, type AuthUser } from '@oams/shared';

// Mock DB
const { mockVisitRow } = vi.hoisted(() => {
  const mockVisitRow = {
    id: 'visit-1',
    org_id: 'org-1',
    appointment_id: 'apt-1',
    reference_no: 'VIS-2026-000001',
    visitor_name: 'Dr. Sarah Connor',
    phone: '+91 98765 43210',
    email: 'sarah@skynet.com',
    organization: 'Cyberdyne Systems',
    id_type: 'PASSPORT',
    id_last4: '7890',
    vehicle_no: 'DL01AB1234',
    party_size: 1,
    status: 'CHECKED_IN',
    badge_no: 'B-104',
    arrived_at: new Date('2026-09-23T09:45:00Z'),
    checked_in_at: new Date('2026-09-23T09:50:00Z'),
    with_host_at: null,
    checked_out_at: null,
    denied_reason: null,
    created_at: new Date('2026-09-23T08:00:00Z'),
    updated_at: new Date('2026-09-23T09:50:00Z'),

    // Joined appointment & host fields
    scheduled_start_time: new Date('2026-09-23T10:00:00Z'),
    scheduled_end_time: new Date('2026-09-23T10:45:00Z'),
    subject: 'Highly Confidential Defence Acquisition Strategy',
    purpose: 'Reviewing classified autonomous surveillance tender documents',
    purpose_category: 'APPROVAL_REQUEST',
    description: 'Sensitive discussion on weaponization safeguards',
    host_official_id: 'off-1',
    host_official_name: 'Lt. Gen. Robert Brewster',
    host_official_title: 'Director of Advanced Projects',
    room_name: 'War Room 1',
    building: 'Headquarters Main Tower',
    floor: 'Floor 4',
  };

  return { mockVisitRow };
});

vi.mock('../src/core/db.js', () => {
  const qb: any = {
    join: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(mockVisitRow),
  };

  const dbFn: any = vi.fn().mockReturnValue(qb);
  dbFn.fn = { now: vi.fn().mockReturnValue(new Date()) };
  return { db: dbFn };
});

describe('Reception & Security Privacy Enforcement (§15, §22 Track 7 Done Criteria)', () => {
  const receptionUser = {
    id: 'user-rec-1',
    orgId: 'org-1',
    email: 'frontdesk@oams.gov',
    fullName: 'Front Desk Receptionist',
    roles: [RoleCode.RECEPTION],
  } as unknown as AuthUser;

  const securityUser = {
    id: 'user-sec-1',
    orgId: 'org-1',
    email: 'gate-security@oams.gov',
    fullName: 'Gate 2 Security Officer',
    roles: [RoleCode.SECURITY],
  } as unknown as AuthUser;

  const officialUser = {
    id: 'user-off-1',
    orgId: 'org-1',
    email: 'brewster@oams.gov',
    fullName: 'Lt. Gen. Robert Brewster',
    roles: [RoleCode.OFFICIAL],
    officialId: 'off-1',
  } as unknown as AuthUser;

  const paUser = {
    id: 'user-pa-1',
    orgId: 'org-1',
    email: 'pa.brewster@oams.gov',
    fullName: 'Executive PA to General',
    roles: [RoleCode.PA],
    assignedOfficialIds: ['off-1'],
  } as unknown as AuthUser;

  it('Reception role NEVER receives appointment subject, purpose, or description (§15.3, §22)', async () => {
    const visit = await visitsRepo.getById('visit-1', 'org-1', receptionUser);
    expect(visit).not.toBeNull();

    // Logistical details MUST be present for reception duties
    expect(visit?.visitorName).toBe('Dr. Sarah Connor');
    expect(visit?.referenceNo).toBe('VIS-2026-000001');
    expect(visit?.badgeNo).toBe('B-104');
    expect(visit?.hostOfficialName).toBe('Lt. Gen. Robert Brewster');
    expect(visit?.roomName).toBe('War Room 1');
    expect(visit?.building).toBe('Headquarters Main Tower');
    expect(visit?.floor).toBe('Floor 4');

    // SENSITIVE CONTENT MUST BE COMPLETELY REDACTED / UNDEFINED
    expect(visit?.subject).toBeUndefined();
    expect(visit?.purpose).toBeUndefined();
    expect(visit?.purposeCategory).toBeUndefined();
    expect(visit?.description).toBeUndefined();
  });

  it('Security role NEVER receives appointment subject, purpose, or description (§15.4, §22)', async () => {
    const visit = await visitsRepo.lookupByQrToken('valid-qr-token', 'org-1', securityUser);
    expect(visit).not.toBeNull();

    // Logistical details MUST be present for security badge verification
    expect(visit?.visitorName).toBe('Dr. Sarah Connor');
    expect(visit?.idType).toBe('PASSPORT');
    expect(visit?.idLast4).toBe('7890');
    expect(visit?.vehicleNo).toBe('DL01AB1234');

    // SENSITIVE PURPOSE & SUBJECT MUST NEVER BE DISCLOSED TO SECURITY
    expect(visit?.subject).toBeUndefined();
    expect(visit?.purpose).toBeUndefined();
    expect(visit?.purposeCategory).toBeUndefined();
    expect(visit?.description).toBeUndefined();
  });

  it('Official & PA roles DO receive full appointment subject and purpose (§15)', async () => {
    const officialVisit = await visitsRepo.getById('visit-1', 'org-1', officialUser);
    expect(officialVisit).not.toBeNull();
    expect(officialVisit?.subject).toBe('Highly Confidential Defence Acquisition Strategy');
    expect(officialVisit?.purpose).toBe(
      'Reviewing classified autonomous surveillance tender documents',
    );
    expect(officialVisit?.purposeCategory).toBe('APPROVAL_REQUEST');
    expect(officialVisit?.description).toBe('Sensitive discussion on weaponization safeguards');

    const paVisit = await visitsRepo.getById('visit-1', 'org-1', paUser);
    expect(paVisit).not.toBeNull();
    expect(paVisit?.subject).toBe('Highly Confidential Defence Acquisition Strategy');
    expect(paVisit?.purpose).toBe('Reviewing classified autonomous surveillance tender documents');
  });
});
