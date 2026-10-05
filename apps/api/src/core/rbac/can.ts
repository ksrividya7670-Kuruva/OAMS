import {
  type Permission,
  type AuthUser,
  DEFAULT_ROLE_PERMISSIONS,
  Scope,
  ApiError,
} from '@oams/shared';

export interface ScopedRecord {
  orgId?: string;
  userId?: string;
  requesterId?: string;
  createdById?: string;
  officialId?: string;
  [key: string]: unknown;
}

export function can(user: AuthUser, permission: Permission, record?: ScopedRecord): boolean {
  if (!user || !user.roles || user.roles.length === 0) {
    return false;
  }

  // 1. Check if org matches when record has orgId
  if (record && record.orgId && record.orgId !== user.orgId) {
    return false;
  }

  // 2. Collect all scopes granted to user for this permission
  let highestScope: Scope | null = null;

  for (const roleCode of user.roles) {
    const rolePermissions = DEFAULT_ROLE_PERMISSIONS[roleCode] || [];
    const match = rolePermissions.find((p) => p.permission === permission);

    if (match) {
      if (match.scope === Scope.ORG) {
        highestScope = Scope.ORG;
        break; // ORG is highest possible scope
      } else if (match.scope === Scope.ASSIGNED) {
        highestScope = Scope.ASSIGNED;
      } else if (match.scope === Scope.OWN && highestScope !== Scope.ASSIGNED) {
        highestScope = Scope.OWN;
      }
    }
  }

  if (!highestScope) {
    return false;
  }

  // If no specific record is provided, having the permission at any scope is enough for general access
  if (!record) {
    return true;
  }

  // 3. Evaluate scope against the specific record
  if (highestScope === Scope.ORG) {
    return true;
  }

  if (highestScope === Scope.ASSIGNED) {
    // Staff assigned to official
    if (
      record.officialId &&
      user.assignedOfficialIds &&
      user.assignedOfficialIds.includes(record.officialId)
    ) {
      return true;
    }
    // Also allow own records for assigned staff
    if (
      record.userId === user.id ||
      record.requesterId === user.id ||
      record.createdById === user.id ||
      (user.officialId && record.officialId === user.officialId)
    ) {
      return true;
    }
    return false;
  }

  if (highestScope === Scope.OWN) {
    return Boolean(
      record.userId === user.id ||
      record.requesterId === user.id ||
      record.createdById === user.id ||
      (user.officialId && record.officialId === user.officialId),
    );
  }

  return false;
}

/**
 * Asserts permission, throwing 404 for unauthorized read (to prevent leaking existence per §17.2)
 * or 403 for mutations.
 */
export function assertCan(
  user: AuthUser,
  permission: Permission,
  record?: ScopedRecord,
  isRead = true,
): void {
  if (!can(user, permission, record)) {
    if (isRead && record) {
      // Per §17.2: Return 404 so unauthorized users cannot probe existence of records
      throw ApiError.notFound('Resource not found');
    }
    throw ApiError.forbidden('You do not have permission to perform this action');
  }
}
