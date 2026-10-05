import { z } from 'zod';
import { visitStatusSchema, purposeCategorySchema, PurposeCategory } from '../enums.js';

export const visitDtoSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  referenceNo: z.string(),
  visitorName: z.string(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  organization: z.string().nullable().optional(),
  idType: z.string().nullable().optional(),
  idLast4: z.string().nullable().optional(),
  vehicleNo: z.string().nullable().optional(),
  partySize: z.number().int().default(1),
  status: visitStatusSchema,
  badgeNo: z.string().nullable().optional(),
  arrivedAt: z.string().nullable().optional(),
  checkedInAt: z.string().nullable().optional(),
  withHostAt: z.string().nullable().optional(),
  checkedOutAt: z.string().nullable().optional(),
  deniedReason: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),

  // Enriched host & schedule info
  hostOfficialId: z.string().uuid().optional(),
  hostOfficialName: z.string().optional(),
  hostOfficialTitle: z.string().optional(),
  scheduledStartTime: z.string().optional(),
  scheduledEndTime: z.string().optional(),
  roomName: z.string().nullable().optional(),
  building: z.string().nullable().optional(),
  floor: z.string().nullable().optional(),
  waitingMinutes: z.number().optional(),

  // Staff-only fields (§15: strictly excluded for Reception & Security)
  subject: z.string().optional(),
  purpose: z.string().optional(),
  purposeCategory: z.string().optional(),
  description: z.string().nullable().optional(),
});
export type VisitDto = z.infer<typeof visitDtoSchema>;

export const checkInVisitSchema = z.object({
  badgeNo: z.string().min(1, 'Badge number is required'),
  idType: z.string().optional(),
  idLast4: z.string().max(4).optional(),
  vehicleNo: z.string().optional(),
});
export type CheckInVisitInput = z.infer<typeof checkInVisitSchema>;

export const denyVisitSchema = z.object({
  reason: z.string().min(1, 'Denial reason is required'),
});
export type DenyVisitInput = z.infer<typeof denyVisitSchema>;

export const walkInVisitSchema = z.object({
  officialId: z.string().uuid('Official ID is required'),
  visitorName: z.string().min(1, 'Visitor name is required').max(255),
  phone: z.string().min(1, 'Phone is required').max(50),
  email: z.string().email('Invalid email address').optional().nullable(),
  organization: z.string().max(255).optional().nullable(),
  idType: z.string().max(50).optional().nullable(),
  idLast4: z.string().max(4).optional().nullable(),
  vehicleNo: z.string().max(50).optional().nullable(),
  partySize: z.coerce.number().int().positive().default(1),
  purpose: z.string().min(1, 'Purpose is required'),
  purposeCategory: purposeCategorySchema.optional().default(PurposeCategory.OTHER),
});
export type WalkInVisitInput = z.input<typeof walkInVisitSchema>;

export const preRegisterVisitSchema = z.object({
  vehicleNo: z.string().max(50).optional().nullable(),
  idType: z.string().max(50).optional().nullable(),
  idLast4: z.string().max(4).optional().nullable(),
});
export type PreRegisterVisitInput = z.infer<typeof preRegisterVisitSchema>;

export const visitQuerySchema = z.object({
  date: z.string().optional(),
  status: z.string().optional(),
  officialId: z.string().uuid().optional(),
  search: z.string().optional(),
  nextHours: z.coerce.number().int().positive().optional(),
});
export type VisitQuery = z.infer<typeof visitQuerySchema>;

export const qrLookupSchema = z.object({
  qrToken: z.string().optional(),
  query: z.string().optional(),
});
export type QrLookupInput = z.infer<typeof qrLookupSchema>;

export const emergencyVisitorDtoSchema = z.object({
  id: z.string().uuid(),
  referenceNo: z.string(),
  visitorName: z.string(),
  phone: z.string().nullable().optional(),
  organization: z.string().nullable().optional(),
  badgeNo: z.string().nullable().optional(),
  checkedInAt: z.string().nullable().optional(),
  status: visitStatusSchema,
  hostOfficialName: z.string().optional(),
  roomName: z.string().nullable().optional(),
  building: z.string().nullable().optional(),
  floor: z.string().nullable().optional(),
});
export type EmergencyVisitorDto = z.infer<typeof emergencyVisitorDtoSchema>;

export const emergencyGroupDtoSchema = z.object({
  building: z.string(),
  floor: z.string(),
  visitors: z.array(emergencyVisitorDtoSchema),
  count: z.number().int(),
});
export type EmergencyGroupDto = z.infer<typeof emergencyGroupDtoSchema>;
