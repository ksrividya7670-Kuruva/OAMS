import { z } from 'zod';
import { RoleCode } from '../permissions.js';

export const requestOtpSchema = z.object({
  email: z.string().email(),
  purpose: z.string().default('GUEST_LOGIN'),
});
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const breakGlassLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  totpCode: z.string().length(6).optional(),
});
export type BreakGlassLoginInput = z.infer<typeof breakGlassLoginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().optional(),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const authUserSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  designation: z.string().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  authProvider: z.enum(['MICROSOFT', 'EMAIL_OTP', 'LOCAL']),
  status: z.enum(['ACTIVE', 'DISABLED']),
  timezone: z.string(),
  theme: z.enum(['LIGHT', 'DARK', 'SYSTEM']),
  roles: z.array(z.nativeEnum(RoleCode)),
  officialId: z.string().uuid().nullable().optional(),
  assignedOfficialIds: z.array(z.string().uuid()).default([]),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authResponseSchema = z.object({
  user: authUserSchema,
  accessToken: z.string(),
  expiresInSec: z.number(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
