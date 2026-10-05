import { z } from 'zod';
import {
  Priority,
  prioritySchema,
  MeetingMode,
  meetingModeSchema,
  Requirement,
  requirementSchema,
} from '../enums.js';
import { preferredWindowSchema } from './appointments.js';

// --- Smart Slot Recommendation Engine (§11.3) ---

export const smartSlotOfficialSchema = z.object({
  officialId: z.string().uuid(),
  requirement: requirementSchema.default(Requirement.REQUIRED),
});

export const smartSlotInputSchema = z.object({
  officials: z.array(smartSlotOfficialSchema).min(1, 'At least one official is required'),
  durationMin: z
    .union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90)])
    .default(30),
  preferredWindows: z.array(preferredWindowSchema).optional().default([]),
  rangeStart: z.string().optional(),
  rangeEnd: z.string().optional(),
  roomRequired: z.boolean().default(false),
  minCapacity: z.number().int().positive().optional(),
  equipment: z.array(z.string()).optional(),
  priority: prioritySchema.default(Priority.MEDIUM),
  meetingMode: meetingModeSchema.default(MeetingMode.IN_PERSON),
  excludeAppointmentId: z.string().uuid().optional(),
  respectMinNotice: z.boolean().default(true),
});
export type SmartSlotInput = z.infer<typeof smartSlotInputSchema>;

export const smartSlotResultSchema = z.object({
  start: z.string(),
  end: z.string(),
  roomId: z.string().uuid().nullable().optional(),
  roomName: z.string().nullable().optional(),
  score: z.number(),
  reasons: z.array(z.string()),
});
export type SmartSlotResult = z.infer<typeof smartSlotResultSchema>;

export const smartSlotResponseSchema = z.object({
  slots: z.array(smartSlotResultSchema),
});
export type SmartSlotResponse = z.infer<typeof smartSlotResponseSchema>;

// --- Candidate Slots & Proposals (§10.2, §10.7) ---

export const candidateSlotSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  roomId: z.string().uuid().nullable().optional(),
});
export type CandidateSlot = z.infer<typeof candidateSlotSchema>;

export const proposeTimesInputSchema = z.object({
  slots: z
    .array(candidateSlotSchema)
    .min(1, 'Must propose at least 1 slot')
    .max(3, 'Cannot propose more than 3 slots'),
});
export type ProposeTimesInput = z.infer<typeof proposeTimesInputSchema>;

export const acceptProposalInputSchema = z.object({
  proposalId: z.string().uuid(),
});
export type AcceptProposalInput = z.infer<typeof acceptProposalInputSchema>;

export const declineProposalsInputSchema = z.object({
  note: z.string().max(500).optional(),
});
export type DeclineProposalsInput = z.infer<typeof declineProposalsInputSchema>;

export const scheduleAppointmentInputSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  roomId: z.string().uuid().nullable().optional(),
});
export type ScheduleAppointmentInput = z.infer<typeof scheduleAppointmentInputSchema>;

export const approveAppointmentInputSchema = z.object({
  note: z.string().max(500).optional(),
  officialId: z.string().uuid().optional(),
});
export type ApproveAppointmentInput = z.infer<typeof approveAppointmentInputSchema>;

export const rejectAppointmentInputSchema = z.object({
  reason: z.string().trim().min(5, 'Rejection reason must be at least 5 characters').max(500),
  officialId: z.string().uuid().optional(),
});
export type RejectAppointmentInput = z.infer<typeof rejectAppointmentInputSchema>;

export const suggestOtherInputSchema = z.object({
  slots: z
    .array(candidateSlotSchema)
    .min(1, 'Must propose at least 1 slot')
    .max(3, 'Cannot propose more than 3 slots'),
  note: z.string().max(500).optional(),
});
export type SuggestOtherInput = z.infer<typeof suggestOtherInputSchema>;

export const changePriorityInputSchema = z.object({
  priority: prioritySchema,
  reason: z
    .string()
    .trim()
    .min(10, 'Reason for priority change must be at least 10 characters')
    .max(500),
});
export type ChangePriorityInput = z.infer<typeof changePriorityInputSchema>;

export const requestInfoInputSchema = z.object({
  note: z
    .string()
    .trim()
    .min(5, 'Information request note must be at least 5 characters')
    .max(1000),
});
export type RequestInfoInput = z.infer<typeof requestInfoInputSchema>;

export const respondInfoInputSchema = z.object({
  note: z.string().trim().min(5, 'Response note must be at least 5 characters').max(2000),
  attachmentIds: z.array(z.string().uuid()).optional().default([]),
});
export type RespondInfoInput = z.infer<typeof respondInfoInputSchema>;

export const appointmentProposalDtoSchema = z.object({
  id: z.string().uuid(),
  appointmentId: z.string().uuid(),
  startAt: z.string(),
  endAt: z.string(),
  roomId: z.string().uuid().nullable().optional(),
  roomName: z.string().nullable().optional(),
  expiresAt: z.string(),
  chosen: z.boolean(),
  proposedBy: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type AppointmentProposalDto = z.infer<typeof appointmentProposalDtoSchema>;
