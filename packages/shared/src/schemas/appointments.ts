import { z } from 'zod';
import {
  Priority,
  prioritySchema,
  appointmentStatusSchema,
  MeetingMode,
  meetingModeSchema,
  Visibility,
  visibilitySchema,
  Requirement,
  requirementSchema,
  officialDecisionSchema,
  PurposeCategory,
  cancelReasonSchema,
  changeRequestStatusSchema,
} from '../enums.js';

export const preferredWindowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  from: z.string().regex(/^\d{2}:\d{2}$/, 'From time must be in HH:mm format'),
  to: z.string().regex(/^\d{2}:\d{2}$/, 'To time must be in HH:mm format'),
});
export type PreferredWindow = z.infer<typeof preferredWindowSchema>;

export const attendeeInputSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  organization: z.string().trim().max(100).optional().or(z.literal('')),
  isExternal: z.boolean().default(false),
  needs: z.string().trim().max(200).optional().or(z.literal('')),
});
export type AttendeeInput = z.infer<typeof attendeeInputSchema>;

export const officialRequirementInputSchema = z.object({
  officialId: z.string().uuid(),
  requirement: requirementSchema.default(Requirement.REQUIRED),
});
export type OfficialRequirementInput = z.infer<typeof officialRequirementInputSchema>;

export const requesterSnapshotSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  organization: z.string().optional(),
  designation: z.string().optional(),
});
export type RequesterSnapshot = z.infer<typeof requesterSnapshotSchema>;

// Draft Schema (allowing partial inputs for step-by-step autosave)
export const appointmentDraftSchema = z.object({
  id: z.string().uuid().optional(),
  officialId: z.string().uuid().optional(),
  additionalOfficials: z.array(officialRequirementInputSchema).optional().default([]),
  subject: z.string().max(120).optional().default(''),
  purpose: z.string().max(100).optional().default(PurposeCategory.BUSINESS_DISCUSSION),
  description: z.string().max(2000).optional().default(''),
  priority: prioritySchema.optional().default(Priority.MEDIUM),
  priorityReason: z.string().max(500).optional().default(''),
  meetingMode: meetingModeSchema.optional().default(MeetingMode.IN_PERSON),
  visibility: visibilitySchema.optional().default(Visibility.INTERNAL),
  durationMin: z.number().int().positive().optional().default(30),
  preferredWindows: z.array(preferredWindowSchema).max(3).optional().default([]),
  attendees: z.array(attendeeInputSchema).optional().default([]),
  attachmentIds: z.array(z.string().uuid()).optional().default([]),
  parentAppointmentId: z.string().uuid().optional().nullable(),
});
export type AppointmentDraftInput = z.infer<typeof appointmentDraftSchema>;

// Strict Submission Schema (§9 & §9.1)
export const submitAppointmentSchema = z
  .object({
    draftId: z.string().uuid().optional(),
    parentAppointmentId: z.string().uuid().optional().nullable(),
    officialId: z.string().uuid({ message: 'Primary official is required' }),
    additionalOfficials: z.array(officialRequirementInputSchema).optional().default([]),
    subject: z
      .string()
      .trim()
      .min(5, 'Subject must be at least 5 characters')
      .max(120, 'Subject must not exceed 120 characters'),
    purpose: z.string().min(1, 'Purpose is required').max(100),
    description: z
      .string()
      .trim()
      .min(20, 'Description must be at least 20 characters')
      .max(2000, 'Description must not exceed 2000 characters'),
    priority: prioritySchema.default(Priority.MEDIUM),
    priorityReason: z.string().trim().optional().or(z.literal('')),
    meetingMode: meetingModeSchema.default(MeetingMode.IN_PERSON),
    visibility: visibilitySchema.default(Visibility.INTERNAL),
    durationMin: z
      .union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90)])
      .default(30),
    preferredWindows: z
      .array(preferredWindowSchema)
      .min(1, 'At least 1 preferred window is required')
      .max(3, 'Maximum 3 preferred windows allowed'),
    attendees: z.array(attendeeInputSchema).default([]),
    attachmentIds: z.array(z.string().uuid()).optional().default([]),
    consentGiven: z.boolean({ required_error: 'DPDP consent is required' }),
    consentNoticeVersion: z.string().min(1, 'Consent notice version is required').default('2026.1'),
  })
  .superRefine((data, ctx) => {
    // DPDP consent check
    if (!data.consentGiven) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['consentGiven'],
        message: 'You must provide consent under DPDP Act 2023 to submit this request',
      });
    }

    // HIGH priority requires reason of 20–500 chars (§9)
    if (data.priority === Priority.HIGH) {
      const reason = data.priorityReason?.trim() || '';
      if (reason.length < 20 || reason.length > 500) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['priorityReason'],
          message: 'Reason for High Priority is required and must be between 20 and 500 characters',
        });
      }
    }
  });

export type SubmitAppointmentInput = z.input<typeof submitAppointmentSchema>;

// Duplicate Check Schema (§9.1)
export const duplicateCheckInputSchema = z.object({
  officialId: z.string().uuid(),
  subject: z.string().trim().min(1),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});
export type DuplicateCheckInput = z.infer<typeof duplicateCheckInputSchema>;

export const duplicateCheckResponseSchema = z.object({
  isDuplicate: z.boolean(),
  isBlocked: z.boolean(),
  isWarning: z.boolean(),
  message: z.string().optional(),
  existingAppointmentId: z.string().uuid().optional(),
  existingReferenceNo: z.string().optional(),
});
export type DuplicateCheckResponse = z.infer<typeof duplicateCheckResponseSchema>;

// Status History DTO
export const appointmentStatusHistoryDtoSchema = z.object({
  id: z.string().uuid(),
  fromStatus: appointmentStatusSchema.nullable(),
  toStatus: appointmentStatusSchema,
  action: z.string(),
  actorId: z.string().uuid().nullable(),
  actorName: z.string().optional(),
  note: z.string().nullable(),
  at: z.string(),
});
export type AppointmentStatusHistoryDto = z.infer<typeof appointmentStatusHistoryDtoSchema>;

// Requester Detail DTO (Strictly masked per §9.2 and §21)
export const appointmentDetailDtoSchema = z.object({
  id: z.string().uuid(),
  referenceNo: z.string(),
  subject: z.string(),
  purpose: z.string(),
  description: z.string(),
  priority: prioritySchema,
  priorityReason: z.string().nullable().optional(),
  meetingMode: meetingModeSchema,
  durationMin: z.number(),
  status: appointmentStatusSchema,
  statusChangedAt: z.string(),
  submittedAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  slaDueAt: z.string().nullable(),
  infoRequestNote: z.string().nullable().optional(),
  official: z.object({
    id: z.string().uuid(),
    title: z.string(),
    fullName: z.string(),
    departmentName: z.string().optional(),
  }),
  additionalOfficials: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      fullName: z.string(),
      requirement: requirementSchema,
      decision: officialDecisionSchema,
    }),
  ),
  preferredWindows: z.array(preferredWindowSchema),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  timezone: z.string(),
  onlineLink: z.string().nullable(),
  room: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      building: z.string(),
      floor: z.string(),
    })
    .nullable(),
  attendees: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      organization: z.string().nullable(),
      isExternal: z.boolean(),
    }),
  ),
  attachments: z.array(
    z.object({
      id: z.string().uuid(),
      fileName: z.string(),
      sizeBytes: z.number(),
      mime: z.string(),
    }),
  ),
  cancelReason: cancelReasonSchema.nullable().optional(),
  cancelNote: z.string().nullable().optional(),
  canCancel: z.boolean(),
  parentAppointmentId: z.string().uuid().nullable().optional(),
  parentAppointmentRef: z.string().nullable().optional(),
});
export type AppointmentDetailDto = z.infer<typeof appointmentDetailDtoSchema>;

// Requester List Item DTO
export const appointmentListItemDtoSchema = z.object({
  id: z.string().uuid(),
  referenceNo: z.string(),
  subject: z.string(),
  officialTitle: z.string(),
  officialName: z.string(),
  status: appointmentStatusSchema,
  priority: prioritySchema,
  submittedAt: z.string().nullable(),
  scheduledStartAt: z.string().nullable(),
  durationMin: z.number(),
  meetingMode: meetingModeSchema,
});
export type AppointmentListItemDto = z.infer<typeof appointmentListItemDtoSchema>;

// Staff Review Queue Inbox Item DTO (§19.1 /app/inbox)
export const appointmentInboxItemDtoSchema = z.object({
  id: z.string().uuid(),
  referenceNo: z.string(),
  subject: z.string(),
  purpose: z.string(),
  requesterName: z.string(),
  requesterEmail: z.string(),
  requesterType: z.string(),
  officialId: z.string().uuid(),
  officialTitle: z.string(),
  officialName: z.string(),
  status: appointmentStatusSchema,
  priority: prioritySchema,
  priorityReason: z.string().nullable().optional(),
  submittedAt: z.string().nullable(),
  slaDueAt: z.string().nullable(),
  escalationLevel: z.number().int().default(0),
  durationMin: z.number(),
  meetingMode: meetingModeSchema,
  assignedToUserId: z.string().uuid().nullable().optional(),
  assignedToName: z.string().nullable().optional(),
  preferredWindows: z.array(preferredWindowSchema).default([]),
  scheduledStartAt: z.string().nullable().optional(),
  scheduledEndAt: z.string().nullable().optional(),
  roomName: z.string().nullable().optional(),
});
export type AppointmentInboxItemDto = z.infer<typeof appointmentInboxItemDtoSchema>;

// --- Track 5: Change Requests & Rescheduling (§10.5, §10.6) ---

export const createChangeRequestSchema = z.object({
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(1000),
  preferredWindows: z
    .array(preferredWindowSchema)
    .min(1, 'At least 1 preferred window is required')
    .max(3, 'Maximum 3 preferred windows allowed'),
  newDurationMin: z
    .union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90)])
    .optional(),
});
export type CreateChangeRequestInput = z.infer<typeof createChangeRequestSchema>;

export const changeRequestProposalDtoSchema = z.object({
  id: z.string().uuid(),
  startAt: z.string(),
  endAt: z.string(),
  roomId: z.string().uuid().nullable().optional(),
  roomName: z.string().optional(),
  expiresAt: z.string(),
});
export type ChangeRequestProposalDto = z.infer<typeof changeRequestProposalDtoSchema>;

export const changeRequestDtoSchema = z.object({
  id: z.string().uuid(),
  appointmentId: z.string().uuid(),
  requestedBy: z.string().uuid(),
  requesterName: z.string().optional(),
  reason: z.string(),
  newDurationMin: z.number().nullable().optional(),
  preferredWindows: z.array(preferredWindowSchema),
  status: changeRequestStatusSchema,
  resolvedBy: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  proposals: z.array(changeRequestProposalDtoSchema).optional().default([]),
});
export type ChangeRequestDto = z.infer<typeof changeRequestDtoSchema>;

export const proposeChangeRequestSlotsSchema = z.object({
  slots: z
    .array(
      z.object({
        startAt: z.string().datetime(),
        endAt: z.string().datetime(),
        roomId: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1, 'At least 1 slot must be proposed')
    .max(3, 'Maximum 3 slots can be proposed'),
});
export type ProposeChangeRequestSlotsInput = z.infer<typeof proposeChangeRequestSlotsSchema>;

export const acceptChangeRequestProposalSchema = z.object({
  proposalId: z.string().uuid(),
});
export type AcceptChangeRequestProposalInput = z.infer<typeof acceptChangeRequestProposalSchema>;

export const rescheduleAppointmentSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  roomId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(500),
});
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;

export const removeOfficialInputSchema = z.object({
  reason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(500),
});
export type RemoveOfficialInput = z.infer<typeof removeOfficialInputSchema>;

export const cancelAppointmentStaffSchema = z.object({
  reason: cancelReasonSchema,
  note: z.string().trim().max(1000).optional(),
});
export type CancelAppointmentStaffInput = z.infer<typeof cancelAppointmentStaffSchema>;
