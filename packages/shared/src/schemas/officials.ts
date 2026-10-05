import { z } from 'zod';
import { BookingMode, ApprovalMode, Visibility, SupportRole, SupportRank } from '../enums.js';

export const createOfficialSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().min(2).max(100),
  departmentId: z.string().uuid().optional(),
  isVip: z.boolean().default(false),
  timezone: z.string().default('Asia/Kolkata'),
  defaultDurationMin: z.number().int().min(10).max(480).default(30),
  bufferBeforeMin: z.number().int().min(0).max(120).default(0),
  bufferAfterMin: z.number().int().min(0).max(120).default(15),
  minNoticeMin: z.number().int().min(0).default(120),
  maxAdvanceDays: z.number().int().min(1).max(365).default(90),
  slotGranularityMin: z.number().int().min(5).max(60).default(15),
  bookingMode: z.nativeEnum(BookingMode).default(BookingMode.SHOW_SLOTS),
  approvalMode: z.nativeEnum(ApprovalMode).default(ApprovalMode.OFFICIAL_APPROVES_ALL),
  defaultVisibility: z.nativeEnum(Visibility).default(Visibility.INTERNAL),
});
export type CreateOfficialInput = z.infer<typeof createOfficialSchema>;

export const updateOfficialSchema = createOfficialSchema.partial().omit({ userId: true });
export type UpdateOfficialInput = z.infer<typeof updateOfficialSchema>;

export const assignSupportStaffSchema = z.object({
  userId: z.string().uuid(),
  supportRole: z.nativeEnum(SupportRole).default(SupportRole.PA),
  rank: z.nativeEnum(SupportRank).default(SupportRank.PRIMARY),
  routingOrder: z.number().int().default(1),
  canApprove: z.boolean().default(false),
  canViewConfidential: z.boolean().default(false),
  canViewPersonal: z.boolean().default(false),
  canEditPersonal: z.boolean().default(false),
  canManageTasks: z.boolean().default(true),
  activeFrom: z.string().datetime().optional(),
  activeTo: z.string().datetime().nullable().optional(),
});
export type AssignSupportStaffInput = z.infer<typeof assignSupportStaffSchema>;

export const updateSupportStaffSchema = assignSupportStaffSchema.partial().omit({ userId: true });
export type UpdateSupportStaffInput = z.infer<typeof updateSupportStaffSchema>;

export const DelegationScope = {
  ALL: 'ALL',
  APPOINTMENTS: 'APPOINTMENTS',
  TASKS: 'TASKS',
} as const;
export type DelegationScope = (typeof DelegationScope)[keyof typeof DelegationScope];
export const delegationScopeSchema = z.enum(['ALL', 'APPOINTMENTS', 'TASKS']);

export const createDelegationSchema = z.object({
  toUserId: z.string().uuid(),
  scope: delegationScopeSchema.default('ALL'),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().max(500).optional().nullable(),
});
export type CreateDelegationInput = z.infer<typeof createDelegationSchema>;

export const delegationDtoSchema = z.object({
  id: z.string().uuid(),
  officialId: z.string().uuid(),
  fromUserId: z.string().uuid(),
  fromUserName: z.string().optional(),
  toUserId: z.string().uuid(),
  toUserName: z.string().optional(),
  toUserEmail: z.string().optional(),
  scope: delegationScopeSchema,
  startsAt: z.string(),
  endsAt: z.string(),
  reason: z.string().nullable().optional(),
  revokedAt: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DelegationDto = z.infer<typeof delegationDtoSchema>;

export const togglePersonalAccessSchema = z.object({
  canViewPersonal: z.boolean().optional(),
  canEditPersonal: z.boolean().optional(),
  canManageTasks: z.boolean().optional(),
});
export type TogglePersonalAccessInput = z.infer<typeof togglePersonalAccessSchema>;
