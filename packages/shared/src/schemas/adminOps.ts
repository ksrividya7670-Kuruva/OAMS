import { z } from 'zod';

export const failedDeliveryItemSchema = z.object({
  id: z.string().uuid(),
  notificationId: z.string().uuid(),
  channel: z.string(),
  status: z.string(),
  attempts: z.number().int(),
  lastError: z.string().nullable().optional(),
  title: z.string(),
  recipientEmail: z.string().optional(),
  recipientName: z.string().optional(),
  createdAt: z.string(),
});
export type FailedDeliveryItem = z.infer<typeof failedDeliveryItemSchema>;

export const backgroundJobStatusSchema = z.object({
  name: z.string(),
  description: z.string(),
  interval: z.string(),
  status: z.enum(['RUNNING', 'IDLE', 'ERROR']),
  lastRunAt: z.string().optional(),
});
export type BackgroundJobStatus = z.infer<typeof backgroundJobStatusSchema>;

export const stuckAppointmentItemSchema = z.object({
  id: z.string().uuid(),
  referenceNo: z.string(),
  subject: z.string(),
  status: z.string(),
  officialTitle: z.string(),
  submittedAt: z.string(),
  assignedToName: z.string().nullable().optional(),
  reason: z.string(),
});
export type StuckAppointmentItem = z.infer<typeof stuckAppointmentItemSchema>;

export const syncErrorItemSchema = z.object({
  id: z.string().uuid(),
  referenceNo: z.string(),
  subject: z.string(),
  syncStatus: z.string(),
  syncError: z.string(),
  officialTitle: z.string(),
  updatedAt: z.string(),
});
export type SyncErrorItem = z.infer<typeof syncErrorItemSchema>;

export const adminOpsOverviewSchema = z.object({
  failedDeliveries: z.array(failedDeliveryItemSchema),
  jobsStatus: z.array(backgroundJobStatusSchema),
  stuckAppointments: z.array(stuckAppointmentItemSchema),
  syncErrors: z.array(syncErrorItemSchema).optional().default([]),
});
export type AdminOpsOverviewDto = z.infer<typeof adminOpsOverviewSchema>;

export const retryDeliverySchema = z.object({
  deliveryId: z.string().uuid(),
});
export type RetryDeliveryInput = z.infer<typeof retryDeliverySchema>;

export const runJobSchema = z.object({
  jobName: z.enum([
    'autoClose',
    'noshowDetect',
    'rerouteAssignments',
    'quietHoursRelease',
    'dailyDigest',
    'taskOverdue',
    'taskReminders',
    'visitorAutoCheckout',
    'calendarSync',
  ]),
});
export type RunJobInput = z.infer<typeof runJobSchema>;
