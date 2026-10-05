import { z } from 'zod';

export const ActionItemStatus = {
  OPEN: 'OPEN',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
} as const;
export type ActionItemStatus = (typeof ActionItemStatus)[keyof typeof ActionItemStatus];

export const actionItemStatusSchema = z.enum(['OPEN', 'DONE', 'CANCELLED']);

export const meetingNoteDtoSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  body: z.string(),
  decisions: z.string().nullable().optional(),
  visibility: z.string(),
  authorId: z.string().uuid(),
  authorName: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MeetingNoteDto = z.infer<typeof meetingNoteDtoSchema>;

export const actionItemDtoSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  noteId: z.string().uuid().nullable().optional(),
  title: z.string(),
  ownerUserId: z.string().uuid().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  status: actionItemStatusSchema,
  convertedTaskId: z.string().uuid().nullable().optional(),
  convertedTaskRef: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ActionItemDto = z.infer<typeof actionItemDtoSchema>;

export const createMeetingNoteSchema = z.object({
  body: z.string().min(1, 'Meeting note text is required'),
  decisions: z.string().optional().nullable(),
});
export type CreateMeetingNoteInput = z.infer<typeof createMeetingNoteSchema>;

export const updateMeetingNoteSchema = z.object({
  body: z.string().min(1).optional(),
  decisions: z.string().optional().nullable(),
});
export type UpdateMeetingNoteInput = z.infer<typeof updateMeetingNoteSchema>;

export const createActionItemSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  ownerUserId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});
export type CreateActionItemInput = z.infer<typeof createActionItemSchema>;

export const updateActionItemSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  ownerUserId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  status: actionItemStatusSchema.optional(),
});
export type UpdateActionItemInput = z.infer<typeof updateActionItemSchema>;

export const convertActionItemToTaskSchema = z.object({
  officialId: z.string().uuid().optional(),
  priority: z.string().optional(),
  category: z.string().optional(),
});
export type ConvertActionItemToTaskInput = z.infer<typeof convertActionItemToTaskSchema>;

export const completeMeetingWithNotesSchema = z.object({
  notes: z.string().optional().default(''),
  decisions: z.string().optional().nullable(),
  actionItems: z.array(createActionItemSchema).optional().default([]),
  scheduleFollowUp: z.boolean().optional().default(false),
});
export type CompleteMeetingWithNotesInput = z.input<typeof completeMeetingWithNotesSchema>;
