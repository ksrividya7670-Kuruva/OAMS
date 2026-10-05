import { z } from 'zod';
import { RoleCode } from '../permissions.js';

export const createUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(100),
  phone: z.string().optional(),
  designation: z.string().optional(),
  departmentId: z.string().uuid().optional(),
  timezone: z.string().default('Asia/Kolkata'),
  roleCodes: z.array(z.nativeEnum(RoleCode)).default([RoleCode.EMPLOYEE]),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  phone: z.string().optional(),
  designation: z.string().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  timezone: z.string().optional(),
  theme: z.enum(['LIGHT', 'DARK', 'SYSTEM']).optional(),
  quietHoursStart: z.string().nullable().optional(),
  quietHoursEnd: z.string().nullable().optional(),
  digestMode: z.enum(['OFF', 'DAILY']).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const assignRolesSchema = z.object({
  roleCodes: z.array(z.nativeEnum(RoleCode)).min(1),
});
export type AssignRolesInput = z.infer<typeof assignRolesSchema>;

export const userQuerySchema = z.object({
  q: z.string().optional(),
  departmentId: z.string().uuid().optional(),
  role: z.nativeEnum(RoleCode).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
export type UserQueryInput = z.infer<typeof userQuerySchema>;
