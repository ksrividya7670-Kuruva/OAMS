import type { Request, Response, NextFunction } from 'express';
import { ApiError, type AuthUser, type Permission } from '@oams/shared';
import { verifyAccessToken } from './tokens.js';
import { db } from '../db.js';
import { can } from '../rbac/can.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthenticated('Authorization header missing or invalid');
    }

    const token = authHeader.substring(7).trim();
    const payload = await verifyAccessToken(token);

    // Fetch user from DB to verify active status and current version
    const userRow = await db('users').where({ id: payload.sub, orgId: payload.org }).first();

    if (!userRow || userRow.status !== 'ACTIVE' || userRow.deletedAt) {
      throw ApiError.unauthenticated('User account is disabled or deleted');
    }

    if (userRow.version !== payload.ver) {
      throw ApiError.unauthenticated('Token expired or invalidated by account change');
    }

    // Load roles
    const rolesRows = await db('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .where('user_roles.user_id', userRow.id)
      .select('roles.code');

    const roles = rolesRows.map((r) => r.code);

    // Check if user is an official
    const officialRow = await db('officials')
      .where({ userId: userRow.id, orgId: userRow.orgId, isActive: true })
      .first();

    // Check assigned officials
    const assignedRows = await db('official_support_staff')
      .where('user_id', userRow.id)
      .where(function () {
        this.whereNull('active_to').orWhere('active_to', '>', db.fn.now());
      })
      .select('official_id');

    const assignedOfficialIds = assignedRows.map((r) => r.officialId);

    req.user = {
      id: userRow.id,
      orgId: userRow.orgId,
      email: userRow.email,
      fullName: userRow.fullName,
      designation: userRow.designation,
      departmentId: userRow.departmentId,
      authProvider: userRow.authProvider,
      status: userRow.status,
      timezone: userRow.timezone,
      theme: userRow.theme,
      roles,
      officialId: officialRow ? officialRow.id : null,
      assignedOfficialIds,
    };

    next();
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      next(err);
      return;
    }
    next(ApiError.unauthenticated('Invalid or expired authentication token'));
  }
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw ApiError.unauthenticated();
      }

      if (!can(req.user, permission)) {
        throw ApiError.forbidden('You do not have permission for this resource');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  return requireAuth(req, res, next);
}
