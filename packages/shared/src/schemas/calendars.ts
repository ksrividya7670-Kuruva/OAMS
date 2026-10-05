import { z } from 'zod';
import {
  CalendarType,
  calendarTypeSchema,
  EventKind,
  eventKindSchema,
  BlockStrength,
  blockStrengthSchema,
  Visibility,
  visibilitySchema,
  calendarEventStatusSchema,
  availabilityExceptionTypeSchema,
  CapacityPolicyOnExceed,
  capacityPolicyOnExceedSchema,
  conflictCodeSchema,
  conflictSeveritySchema,
  Priority,
  prioritySchema,
  MeetingMode,
  meetingModeSchema,
  Requirement,
  requirementSchema,
} from '../enums.js';

// --- Calendar Events ---

export const createCalendarEventSchema = z.object({
  officialId: z.string().uuid(),
  calendarType: calendarTypeSchema.default(CalendarType.ORG),
  kind: eventKindSchema.default(EventKind.MEETING),
  blockStrength: blockStrengthSchema.default(BlockStrength.HARD),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  allDay: z.boolean().default(false).optional(),
  visibility: visibilitySchema.default(Visibility.INTERNAL),
  roomId: z.string().uuid().nullable().optional(),
  recurrenceRule: z.string().nullable().optional(),
});
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;

export const updateCalendarEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  kind: eventKindSchema.optional(),
  blockStrength: blockStrengthSchema.optional(),
  visibility: visibilitySchema.optional(),
  roomId: z.string().uuid().nullable().optional(),
  recurrenceRule: z.string().nullable().optional(),
});
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;

export const calendarEventsQuerySchema = z.object({
  officialId: z.string().uuid(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  layers: z.string().optional(), // Comma separated: ORG,PERSONAL
});
export type CalendarEventsQueryInput = z.infer<typeof calendarEventsQuerySchema>;

export const calendarEventItemSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  calendarId: z.string().uuid(),
  calendarType: calendarTypeSchema,
  officialId: z.string().uuid(),
  kind: eventKindSchema,
  blockStrength: blockStrengthSchema,
  title: z.string(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  startAt: z.string(),
  endAt: z.string(),
  allDay: z.boolean(),
  visibility: visibilitySchema,
  appointmentId: z.string().uuid().nullable().optional(),
  roomBookingId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  roomName: z.string().nullable().optional(),
  holdExpiresAt: z.string().nullable().optional(),
  recurrenceRule: z.string().nullable().optional(),
  seriesId: z.string().uuid().nullable().optional(),
  status: calendarEventStatusSchema,
  isMasked: z.boolean().default(false), // true if personal event masked as "Busy"
});
export type CalendarEventItem = z.infer<typeof calendarEventItemSchema>;

// --- Availability Rules & Exceptions ---

export const availabilityRuleSchema = z.object({
  id: z.string().uuid().optional(),
  officialId: z.string().uuid(),
  weekday: z.number().int().min(1).max(7), // 1=Mon .. 7=Sun
  startLocal: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/), // HH:MM
  endLocal: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  effectiveFrom: z.string(), // YYYY-MM-DD
  effectiveTo: z.string().nullable().optional(),
});
export type AvailabilityRuleInput = z.infer<typeof availabilityRuleSchema>;

export const availabilityExceptionSchema = z.object({
  id: z.string().uuid().optional(),
  officialId: z.string().uuid(),
  date: z.string(), // YYYY-MM-DD
  startLocal: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .nullable()
    .optional(),
  endLocal: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .nullable()
    .optional(),
  type: availabilityExceptionTypeSchema,
  reason: z.string().max(200).nullable().optional(),
});
export type AvailabilityExceptionInput = z.infer<typeof availabilityExceptionSchema>;

// --- Protected Blocks ---

export const protectedBlockSchema = z.object({
  id: z.string().uuid().optional(),
  officialId: z.string().uuid(),
  weekday: z.number().int().min(1).max(7).nullable().optional(),
  date: z.string().nullable().optional(),
  startLocal: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  endLocal: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  label: z.string().min(1).max(100),
  blockStrength: blockStrengthSchema.default(BlockStrength.HARD),
});
export type ProtectedBlockInput = z.infer<typeof protectedBlockSchema>;

// --- Holidays ---

export const holidaySchema = z.object({
  id: z.string().uuid().optional(),
  date: z.string().optional(), // YYYY-MM-DD
  holidayDate: z.string().optional(),
  name: z.string().min(1).max(100),
  isOptional: z.boolean().default(false),
  isHalfDay: z.boolean().default(false),
  halfDayPeriod: z.enum(['MORNING', 'AFTERNOON']).nullable().optional(),
  description: z.string().nullable().optional(),
});
export type HolidayInput = z.infer<typeof holidaySchema>;

export const holidayItemSchema = holidaySchema.extend({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  holidayDate: z.string(),
});
export type HolidayItem = z.infer<typeof holidayItemSchema>;

// --- Rooms & Room Bookings ---

export const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().nullable().optional(),
  building: z.string().min(1).max(100),
  floor: z.string().min(1).max(20),
  capacity: z.number().int().positive(),
  equipment: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  setupMin: z.number().int().nonnegative().default(0),
  cleanupMin: z.number().int().nonnegative().default(0),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const roomItemSchema = createRoomSchema.extend({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
});
export type RoomItem = z.infer<typeof roomItemSchema>;

// --- Capacity Policies ---

export const capacityPolicySchema = z.object({
  officialId: z.string().uuid(),
  maxAppointmentsPerDay: z.number().int().positive().default(8),
  maxDurationMinutesPerDay: z.number().int().positive().default(360),
  maxConsecutiveMeetings: z.number().int().positive().default(3),
  minBreakMinutes: z.number().int().nonnegative().default(15),
  onExceed: capacityPolicyOnExceedSchema.default(CapacityPolicyOnExceed.WARN),
});
export type CapacityPolicyInput = z.infer<typeof capacityPolicySchema>;

// --- Personal Access Grants ---

export const personalAccessUpdateSchema = z.object({
  canViewPersonal: z.boolean(),
  canEditPersonal: z.boolean(),
});
export type PersonalAccessUpdateInput = z.infer<typeof personalAccessUpdateSchema>;

// --- Scheduling Conflict Engine (§11.2) ---

export const schedulingCheckOfficialSchema = z.object({
  id: z.string().uuid().optional(),
  officialId: z.string().uuid().optional(),
  requirement: requirementSchema.default(Requirement.REQUIRED),
});

export const schedulingCheckInputSchema = z.object({
  officials: z.array(schedulingCheckOfficialSchema).min(1),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  durationMin: z.number().int().positive().optional(),
  roomId: z.string().uuid().nullable().optional(),
  minCapacity: z.number().int().positive().optional(),
  equipment: z.array(z.string()).optional(),
  priority: prioritySchema.default(Priority.MEDIUM),
  meetingMode: meetingModeSchema.default(MeetingMode.IN_PERSON),
  excludeAppointmentId: z.string().uuid().optional(),
  respectMinNotice: z.boolean().default(true),
});
export type SchedulingCheckInput = z.infer<typeof schedulingCheckInputSchema>;

export const conflictDetailSchema = z.object({
  code: conflictCodeSchema,
  severity: conflictSeveritySchema,
  officialId: z.string().uuid().optional(),
  officialTitle: z.string().optional(),
  message: z.string(),
  optional: z.boolean().optional(),
});
export type ConflictDetail = z.infer<typeof conflictDetailSchema>;

export const schedulingCheckResponseSchema = z.object({
  bookable: z.boolean(),
  conflicts: z.array(conflictDetailSchema),
  canOverride: z.boolean(),
});
export type SchedulingCheckResponse = z.infer<typeof schedulingCheckResponseSchema>;
