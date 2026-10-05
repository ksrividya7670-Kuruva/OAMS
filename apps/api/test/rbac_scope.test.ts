import { describe, it, expect } from 'vitest';
import { can, assertCan } from '../src/core/rbac/can.js';
import { RoleCode, Permission, ApiError, type AuthUser } from '@oams/shared';

describe('RBAC & Scope Enforcement (§6, §17.2)', () => {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const otherOrgId = '00000000-0000-4000-8000-000000000099';

  const superAdmin: AuthUser = {
    id: 'user-admin',
    orgId,
    email: 'admin@apex.local',
    fullName: 'Admin',
    status: 'ACTIVE',
    authProvider: 'LOCAL',
    timezone: 'Asia/Kolkata',
    theme: 'SYSTEM',
    roles: [RoleCode.SUPER_ADMIN],
    assignedOfficialIds: [],
  };

  const paUser: AuthUser = {
    id: 'user-pa',
    orgId,
    email: 'pa.ceo@apex.local',
    fullName: 'Neha (PA to CEO)',
    status: 'ACTIVE',
    authProvider: 'EMAIL_OTP',
    timezone: 'Asia/Kolkata',
    theme: 'SYSTEM',
    roles: [RoleCode.PA],
    assignedOfficialIds: ['official-ceo-id'],
  };

  const employeeUser: AuthUser = {
    id: 'user-emp',
    orgId,
    email: 'emp@apex.local',
    fullName: 'Regular Employee',
    status: 'ACTIVE',
    authProvider: 'EMAIL_OTP',
    timezone: 'Asia/Kolkata',
    theme: 'SYSTEM',
    roles: [RoleCode.EMPLOYEE],
    assignedOfficialIds: [],
  };

  describe('ORG Scope (Super Admin)', () => {
    it('should grant access to all records within the same organization', () => {
      expect(
        can(superAdmin, Permission.APPOINTMENT_READ, {
          orgId,
          officialId: 'any-official',
          userId: 'any-user',
        }),
      ).toBe(true);
    });

    it('should deny access if record belongs to a different organization (Tenant Isolation)', () => {
      expect(
        can(superAdmin, Permission.APPOINTMENT_READ, {
          orgId: otherOrgId,
          officialId: 'any-official',
        }),
      ).toBe(false);
    });
  });

  describe('ASSIGNED Scope (PA / EA)', () => {
    it('should permit PA to access appointments for their assigned official', () => {
      expect(
        can(paUser, Permission.APPOINTMENT_READ, {
          orgId,
          officialId: 'official-ceo-id',
        }),
      ).toBe(true);
    });

    it('should deny PA access to appointments for an unassigned official', () => {
      expect(
        can(paUser, Permission.APPOINTMENT_READ, {
          orgId,
          officialId: 'official-cfo-id', // Not assigned to CFO
        }),
      ).toBe(false);
    });

    it('should permit PA to access their own submitted appointments', () => {
      expect(
        can(paUser, Permission.APPOINTMENT_READ, {
          orgId,
          userId: paUser.id,
        }),
      ).toBe(true);
    });
  });

  describe('OWN Scope (Employee / Guest)', () => {
    it('should allow employee to read their own appointments', () => {
      expect(
        can(employeeUser, Permission.APPOINTMENT_READ, {
          orgId,
          userId: employeeUser.id,
        }),
      ).toBe(true);
    });

    it('should forbid employee from reading appointments of other employees or officials', () => {
      expect(
        can(employeeUser, Permission.APPOINTMENT_READ, {
          orgId,
          userId: 'other-user-id',
          officialId: 'official-ceo-id',
        }),
      ).toBe(false);
    });
  });

  describe('Information Leakage Prevention (§17.2)', () => {
    it('assertCan should throw 404 (not 403) when user fails read authorization for a record', () => {
      try {
        assertCan(
          paUser,
          Permission.APPOINTMENT_READ,
          { orgId, officialId: 'official-cfo-id' },
          true, // isRead = true
        );
        expect.unreachable('Should have thrown 404');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.statusCode).toBe(404);
        expect(apiErr.code).toBe('NOT_FOUND');
      }
    });

    it('assertCan should throw 403 when user fails mutation authorization', () => {
      try {
        assertCan(
          employeeUser,
          Permission.OFFICIAL_MANAGE,
          { orgId },
          false, // isRead = false
        );
        expect.unreachable('Should have thrown 403');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.statusCode).toBe(403);
        expect(apiErr.code).toBe('FORBIDDEN');
      }
    });
  });
});
