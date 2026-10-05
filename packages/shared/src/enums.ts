import { z } from 'zod';

export const Priority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];
export const prioritySchema = z.nativeEnum(Priority);

export const AppointmentStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  INFO_REQUESTED: 'INFO_REQUESTED',
  AWAITING_REQUESTER: 'AWAITING_REQUESTER',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CLOSED: 'CLOSED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
  EXPIRED: 'EXPIRED',
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];
export const appointmentStatusSchema = z.nativeEnum(AppointmentStatus);

export const TerminalStatuses: readonly AppointmentStatus[] = [
  AppointmentStatus.CLOSED,
  AppointmentStatus.REJECTED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.EXPIRED,
] as const;

export const ChangeRequestStatus = {
  PENDING: 'PENDING',
  AWAITING_REQUESTER: 'AWAITING_REQUESTER',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
  EXPIRED: 'EXPIRED',
} as const;
export type ChangeRequestStatus = (typeof ChangeRequestStatus)[keyof typeof ChangeRequestStatus];
export const changeRequestStatusSchema = z.nativeEnum(ChangeRequestStatus);

export const VisitStatus = {
  EXPECTED: 'EXPECTED',
  ARRIVED: 'ARRIVED',
  CHECKED_IN: 'CHECKED_IN',
  WITH_HOST: 'WITH_HOST',
  CHECKED_OUT: 'CHECKED_OUT',
  NO_SHOW: 'NO_SHOW',
  DENIED: 'DENIED',
  CANCELLED: 'CANCELLED',
} as const;
export type VisitStatus = (typeof VisitStatus)[keyof typeof VisitStatus];
export const visitStatusSchema = z.nativeEnum(VisitStatus);

export const TaskStatus = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  BLOCKED: 'BLOCKED',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];
export const taskStatusSchema = z.nativeEnum(TaskStatus);

export const TaskCategory = {
  MEETING: 'MEETING',
  APPROVAL: 'APPROVAL',
  REVIEW: 'REVIEW',
  CALL: 'CALL',
  EMAIL: 'EMAIL',
  DOCUMENT: 'DOCUMENT',
  FOLLOW_UP: 'FOLLOW_UP',
  FINANCE: 'FINANCE',
  HR: 'HR',
  OPERATIONS: 'OPERATIONS',
  ADMIN: 'ADMIN',
  PERSONAL: 'PERSONAL',
  OTHER: 'OTHER',
} as const;
export type TaskCategory = (typeof TaskCategory)[keyof typeof TaskCategory];
export const taskCategorySchema = z.nativeEnum(TaskCategory);

export const TaskSource = {
  MANUAL: 'MANUAL',
  ACTION_ITEM: 'ACTION_ITEM',
  APPOINTMENT: 'APPOINTMENT',
} as const;
export type TaskSource = (typeof TaskSource)[keyof typeof TaskSource];
export const taskSourceSchema = z.nativeEnum(TaskSource);

export const CalendarType = {
  ORG: 'ORG',
  PERSONAL: 'PERSONAL',
} as const;
export type CalendarType = (typeof CalendarType)[keyof typeof CalendarType];
export const calendarTypeSchema = z.nativeEnum(CalendarType);

export const EventKind = {
  APPOINTMENT: 'APPOINTMENT',
  MEETING: 'MEETING',
  BLOCK: 'BLOCK',
  TRAVEL: 'TRAVEL',
  LEAVE: 'LEAVE',
  PERSONAL: 'PERSONAL',
  HOLD: 'HOLD',
} as const;
export type EventKind = (typeof EventKind)[keyof typeof EventKind];
export const eventKindSchema = z.nativeEnum(EventKind);

export const BlockStrength = {
  HARD: 'HARD',
  SOFT: 'SOFT',
  NONE: 'NONE',
} as const;
export type BlockStrength = (typeof BlockStrength)[keyof typeof BlockStrength];
export const blockStrengthSchema = z.nativeEnum(BlockStrength);

export const Visibility = {
  PUBLIC: 'PUBLIC',
  INTERNAL: 'INTERNAL',
  CONFIDENTIAL: 'CONFIDENTIAL',
  PERSONAL: 'PERSONAL',
} as const;
export type Visibility = (typeof Visibility)[keyof typeof Visibility];
export const visibilitySchema = z.nativeEnum(Visibility);

export const MeetingMode = {
  IN_PERSON: 'IN_PERSON',
  ONLINE: 'ONLINE',
  PHONE: 'PHONE',
} as const;
export type MeetingMode = (typeof MeetingMode)[keyof typeof MeetingMode];
export const meetingModeSchema = z.nativeEnum(MeetingMode);

export const RequesterType = {
  EMPLOYEE: 'EMPLOYEE',
  CUSTOMER: 'CUSTOMER',
  VENDOR: 'VENDOR',
  PARTNER: 'PARTNER',
  GOVERNMENT: 'GOVERNMENT',
  VISITOR: 'VISITOR',
  OTHER: 'OTHER',
} as const;
export type RequesterType = (typeof RequesterType)[keyof typeof RequesterType];
export const requesterTypeSchema = z.nativeEnum(RequesterType);

export const SupportRole = {
  PA: 'PA',
  EA: 'EA',
  OFFICE_ADMIN: 'OFFICE_ADMIN',
} as const;
export type SupportRole = (typeof SupportRole)[keyof typeof SupportRole];
export const supportRoleSchema = z.nativeEnum(SupportRole);

export const SupportRank = {
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
} as const;
export type SupportRank = (typeof SupportRank)[keyof typeof SupportRank];
export const supportRankSchema = z.nativeEnum(SupportRank);

export const Requirement = {
  REQUIRED: 'REQUIRED',
  OPTIONAL: 'OPTIONAL',
} as const;
export type Requirement = (typeof Requirement)[keyof typeof Requirement];
export const requirementSchema = z.nativeEnum(Requirement);

export const OfficialDecision = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type OfficialDecision = (typeof OfficialDecision)[keyof typeof OfficialDecision];
export const officialDecisionSchema = z.nativeEnum(OfficialDecision);

export const ApprovalMode = {
  OFFICIAL_APPROVES_ALL: 'OFFICIAL_APPROVES_ALL',
  STAFF_CONFIRMS_ROUTINE: 'STAFF_CONFIRMS_ROUTINE',
} as const;
export type ApprovalMode = (typeof ApprovalMode)[keyof typeof ApprovalMode];
export const approvalModeSchema = z.nativeEnum(ApprovalMode);

export const BookingMode = {
  SHOW_SLOTS: 'SHOW_SLOTS',
  REQUEST_ONLY: 'REQUEST_ONLY',
} as const;
export type BookingMode = (typeof BookingMode)[keyof typeof BookingMode];
export const bookingModeSchema = z.nativeEnum(BookingMode);

export const CancelReason = {
  REQUESTER_CANCELLED: 'REQUESTER_CANCELLED',
  OFFICIAL_UNAVAILABLE: 'OFFICIAL_UNAVAILABLE',
  SCHEDULE_CONFLICT: 'SCHEDULE_CONFLICT',
  EMERGENCY: 'EMERGENCY',
  DUPLICATE: 'DUPLICATE',
  NO_LONGER_REQUIRED: 'NO_LONGER_REQUIRED',
  OTHER: 'OTHER',
} as const;
export type CancelReason = (typeof CancelReason)[keyof typeof CancelReason];
export const cancelReasonSchema = z.nativeEnum(CancelReason);

export const ConflictCode = {
  OFFICIAL_BUSY: 'OFFICIAL_BUSY',
  PERSONAL_BUSY: 'PERSONAL_BUSY',
  OUTSIDE_WORKING_HOURS: 'OUTSIDE_WORKING_HOURS',
  HOLIDAY: 'HOLIDAY',
  LEAVE: 'LEAVE',
  TRAVEL: 'TRAVEL',
  PROTECTED_TIME: 'PROTECTED_TIME',
  BUFFER: 'BUFFER',
  ROOM_BUSY: 'ROOM_BUSY',
  ROOM_CAPACITY: 'ROOM_CAPACITY',
  MIN_NOTICE: 'MIN_NOTICE',
  BOOKING_WINDOW: 'BOOKING_WINDOW',
  DAILY_CAPACITY: 'DAILY_CAPACITY',
  CONSECUTIVE_LIMIT: 'CONSECUTIVE_LIMIT',
  REQUIRED_OFFICIAL_BUSY: 'REQUIRED_OFFICIAL_BUSY',
  DUPLICATE_REQUEST: 'DUPLICATE_REQUEST',
  SLOT_TAKEN: 'SLOT_TAKEN',
} as const;

export type ConflictCode = (typeof ConflictCode)[keyof typeof ConflictCode];
export const conflictCodeSchema = z.nativeEnum(ConflictCode);

export const ConflictSeverity = {
  HARD: 'HARD',
  SOFT: 'SOFT',
} as const;
export type ConflictSeverity = (typeof ConflictSeverity)[keyof typeof ConflictSeverity];
export const conflictSeveritySchema = z.nativeEnum(ConflictSeverity);

export const NotificationChannel = {
  IN_APP: 'IN_APP',
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  PUSH: 'PUSH',
  POWER_AUTOMATE: 'POWER_AUTOMATE',
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];
export const notificationChannelSchema = z.nativeEnum(NotificationChannel);

export const AvailabilityExceptionType = {
  EXTRA_AVAILABLE: 'EXTRA_AVAILABLE',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;
export type AvailabilityExceptionType =
  (typeof AvailabilityExceptionType)[keyof typeof AvailabilityExceptionType];
export const availabilityExceptionTypeSchema = z.nativeEnum(AvailabilityExceptionType);

export const CapacityPolicyOnExceed = {
  WARN: 'WARN',
  BLOCK: 'BLOCK',
} as const;
export type CapacityPolicyOnExceed =
  (typeof CapacityPolicyOnExceed)[keyof typeof CapacityPolicyOnExceed];
export const capacityPolicyOnExceedSchema = z.nativeEnum(CapacityPolicyOnExceed);

export const RecurrenceScope = {
  THIS_EVENT: 'THIS_EVENT',
  THIS_AND_FOLLOWING: 'THIS_AND_FOLLOWING',
  ALL_EVENTS: 'ALL_EVENTS',
} as const;
export type RecurrenceScope = (typeof RecurrenceScope)[keyof typeof RecurrenceScope];
export const recurrenceScopeSchema = z.nativeEnum(RecurrenceScope);

export const CalendarEventStatus = {
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
} as const;
export type CalendarEventStatus = (typeof CalendarEventStatus)[keyof typeof CalendarEventStatus];
export const calendarEventStatusSchema = z.nativeEnum(CalendarEventStatus);

export const RoomBookingStatus = {
  ACTIVE: 'ACTIVE',
  RELEASED: 'RELEASED',
} as const;
export type RoomBookingStatus = (typeof RoomBookingStatus)[keyof typeof RoomBookingStatus];
export const roomBookingStatusSchema = z.nativeEnum(RoomBookingStatus);

export const ScanStatus = {
  PENDING: 'PENDING',
  CLEAN: 'CLEAN',
  INFECTED: 'INFECTED',
  SKIPPED: 'SKIPPED',
} as const;
export type ScanStatus = (typeof ScanStatus)[keyof typeof ScanStatus];
export const scanStatusSchema = z.nativeEnum(ScanStatus);

export const AttachmentOwnerType = {
  APPOINTMENT: 'APPOINTMENT',
  TASK: 'TASK',
  NOTE: 'NOTE',
} as const;
export type AttachmentOwnerType = (typeof AttachmentOwnerType)[keyof typeof AttachmentOwnerType];
export const attachmentOwnerTypeSchema = z.nativeEnum(AttachmentOwnerType);

export const PurposeCategory = {
  BUSINESS_DISCUSSION: 'BUSINESS_DISCUSSION',
  APPROVAL_REQUEST: 'APPROVAL_REQUEST',
  GRIEVANCE: 'GRIEVANCE',
  PROPOSAL: 'PROPOSAL',
  COURTESY_VISIT: 'COURTESY_VISIT',
  OTHER: 'OTHER',
} as const;
export type PurposeCategory = (typeof PurposeCategory)[keyof typeof PurposeCategory];
export const purposeCategorySchema = z.nativeEnum(PurposeCategory);

export const CalendarSyncStatus = {
  NONE: 'NONE',
  PENDING: 'PENDING',
  SYNCED: 'SYNCED',
  FAILED: 'FAILED',
  MISMATCH: 'MISMATCH',
} as const;
export type CalendarSyncStatus = (typeof CalendarSyncStatus)[keyof typeof CalendarSyncStatus];
export const calendarSyncStatusSchema = z.nativeEnum(CalendarSyncStatus);

export const SyncDirection = {
  EXPORT: 'EXPORT',
  IMPORT: 'IMPORT',
} as const;
export type SyncDirection = (typeof SyncDirection)[keyof typeof SyncDirection];
export const syncDirectionSchema = z.nativeEnum(SyncDirection);

export const DltTemplateId = {
  CONFIRM: 'DLT-TE-1001',
  REMINDER: 'DLT-TE-1002',
  OTP: 'DLT-TE-1003',
} as const;
export type DltTemplateId = (typeof DltTemplateId)[keyof typeof DltTemplateId];
