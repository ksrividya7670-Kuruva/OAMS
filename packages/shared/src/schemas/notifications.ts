import { z } from 'zod';
import { Priority, NotificationChannel } from '../enums.js';

export const notificationQuerySchema = z.object({
  unread: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
export type NotificationQueryInput = z.infer<typeof notificationQuerySchema>;

export const notificationPreferenceSchema = z.object({
  eventType: z.string(),
  channel: z.nativeEnum(NotificationChannel),
  enabled: z.boolean(),
});
export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>;

export const updateNotificationPreferencesSchema = z.object({
  preferences: z.array(notificationPreferenceSchema),
});
export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;

export const notificationItemSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  type: z.string().optional(),
  eventType: z.string().optional(),
  title: z.string(),
  message: z.string().optional(),
  body: z.string().optional(),
  link: z.string().optional(),
  priority: z.nativeEnum(Priority).optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  appointmentId: z.string().nullable().optional(),
  isRead: z.boolean().optional(),
  readAt: z.string().nullable().optional(),
  targetRoles: z.array(z.string()).optional(),
  officialId: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const NotificationDeliveryStatus = {
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  HELD_QUIET_HOURS: 'HELD_QUIET_HOURS',
  HELD_DIGEST: 'HELD_DIGEST',
} as const;
export type NotificationDeliveryStatus =
  (typeof NotificationDeliveryStatus)[keyof typeof NotificationDeliveryStatus];

export const NotificationType = {
  APPOINTMENT_BOOKED: 'APPOINTMENT_BOOKED',
  APPOINTMENT_CONFIRMED: 'APPOINTMENT_CONFIRMED',
  APPOINTMENT_RESCHEDULED: 'APPOINTMENT_RESCHEDULED',
  APPOINTMENT_CANCELLED: 'APPOINTMENT_CANCELLED',
  APPOINTMENT_COMPLETED: 'APPOINTMENT_COMPLETED',
  APPOINTMENT_REJECTED: 'APPOINTMENT_REJECTED',
  APPOINTMENT_REMINDER: 'APPOINTMENT_REMINDER',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  SLOT_CHANGED: 'SLOT_CHANGED',
  SYSTEM_ALERT: 'SYSTEM_ALERT',
  ADMIN_NOTIFICATION: 'ADMIN_NOTIFICATION',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const notificationDtoSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.string(),
  title: z.string(),
  message: z.string(),
  appointmentId: z.string().nullable().optional(),
  isRead: z.boolean(),
  createdAt: z.string(),
  readAt: z.string().nullable().optional(),
  // Backward compatibility fields
  eventType: z.string().optional(),
  body: z.string().optional(),
  link: z.string().optional(),
  priority: z.nativeEnum(Priority).optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  targetRoles: z.array(z.string()).optional(),
  officialId: z.string().nullable().optional(),
});
export type NotificationDto = z.infer<typeof notificationDtoSchema>;

export const notificationPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  unread: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
});
export type NotificationPaginationInput = z.infer<typeof notificationPaginationSchema>;

export const createNotificationSchema = z.object({
  userId: z.string().uuid(),
  type: z.string(),
  title: z.string().min(1).max(255),
  message: z.string().min(1),
  appointmentId: z.string().uuid().nullable().optional(),
  priority: z.nativeEnum(Priority).optional().default(Priority.MEDIUM),
  link: z.string().optional(),
  targetRoles: z.array(z.string()).optional(),
  officialId: z.string().uuid().nullable().optional(),
});
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
