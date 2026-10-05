import { z } from 'zod';
import {
  Priority,
  prioritySchema,
  taskStatusSchema,
  TaskCategory,
  taskCategorySchema,
  TaskSource,
  taskSourceSchema,
} from '../enums.js';

export const taskChecklistItemDtoSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  text: z.string(),
  done: z.boolean(),
  position: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaskChecklistItemDto = z.infer<typeof taskChecklistItemDtoSchema>;

export const taskCommentDtoSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  authorId: z.string().uuid(),
  authorName: z.string().optional(),
  authorEmail: z.string().optional(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaskCommentDto = z.infer<typeof taskCommentDtoSchema>;

export const taskReminderDtoSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  remindAt: z.string(),
  channel: z.string(),
  sentAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type TaskReminderDto = z.infer<typeof taskReminderDtoSchema>;

export const taskWatcherDtoSchema = z.object({
  taskId: z.string().uuid(),
  userId: z.string().uuid(),
  userName: z.string().optional(),
  userEmail: z.string().optional(),
});
export type TaskWatcherDto = z.infer<typeof taskWatcherDtoSchema>;

export const taskDependencyDtoSchema = z.object({
  taskId: z.string().uuid(),
  dependsOnTaskId: z.string().uuid(),
  dependsOnTaskTitle: z.string().optional(),
  dependsOnTaskReferenceNo: z.string().optional(),
  dependsOnTaskStatus: z.string().optional(),
});
export type TaskDependencyDto = z.infer<typeof taskDependencyDtoSchema>;

export const taskAttachmentDtoSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  fileName: z.string(),
  fileSize: z.number(),
  mimeType: z.string(),
  filePath: z.string(),
  uploadedBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
});
export type TaskAttachmentDto = z.infer<typeof taskAttachmentDtoSchema>;

export const taskDetailDtoSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  referenceNo: z.string(),
  officialId: z.string().uuid(),
  officialName: z.string().optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  category: taskCategorySchema,
  priority: prioritySchema,
  status: taskStatusSchema,
  blockedReason: z.string().nullable().optional(),
  cancelReason: z.string().nullable().optional(),
  visibility: z.enum(['ORG', 'PERSONAL']),
  startDate: z.string().nullable().optional(),
  dueAt: z.string().nullable().optional(),
  estimatedMin: z.number().nullable().optional(),
  ownerUserId: z.string().uuid(),
  ownerName: z.string().optional(),
  assigneeUserId: z.string().uuid().nullable().optional(),
  assigneeName: z.string().nullable().optional(),
  assigneeEmail: z.string().nullable().optional(),
  createdBy: z.string().uuid().nullable().optional(),
  createdByName: z.string().nullable().optional(),
  requiresVerification: z.boolean(),
  verifiedBy: z.string().uuid().nullable().optional(),
  verifiedAt: z.string().nullable().optional(),
  source: taskSourceSchema,
  sourceId: z.string().uuid().nullable().optional(),
  seriesId: z.string().uuid().nullable().optional(),
  recurrenceRule: z.string().nullable().optional(),
  position: z.number(),
  completedAt: z.string().nullable().optional(),
  cancelledAt: z.string().nullable().optional(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Derived fields (§12.1, §12.2)
  isOverdue: z.boolean(),
  awaitingVerification: z.boolean(),
  // Nested relations
  checklistItems: z.array(taskChecklistItemDtoSchema).optional().default([]),
  comments: z.array(taskCommentDtoSchema).optional().default([]),
  reminders: z.array(taskReminderDtoSchema).optional().default([]),
  watchers: z.array(taskWatcherDtoSchema).optional().default([]),
  dependencies: z.array(taskDependencyDtoSchema).optional().default([]),
  attachments: z.array(taskAttachmentDtoSchema).optional().default([]),
});
export type TaskDetailDto = z.infer<typeof taskDetailDtoSchema>;

export const taskListItemDtoSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  referenceNo: z.string(),
  officialId: z.string().uuid(),
  officialName: z.string().optional(),
  title: z.string(),
  category: taskCategorySchema,
  priority: prioritySchema,
  status: taskStatusSchema,
  visibility: z.enum(['ORG', 'PERSONAL']),
  dueAt: z.string().nullable().optional(),
  estimatedMin: z.number().nullable().optional(),
  ownerUserId: z.string().uuid(),
  assigneeUserId: z.string().uuid().nullable().optional(),
  assigneeName: z.string().nullable().optional(),
  requiresVerification: z.boolean(),
  verifiedAt: z.string().nullable().optional(),
  source: taskSourceSchema,
  sourceId: z.string().uuid().nullable().optional(),
  seriesId: z.string().uuid().nullable().optional(),
  recurrenceRule: z.string().nullable().optional(),
  position: z.number(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isOverdue: z.boolean(),
  awaitingVerification: z.boolean(),
  checklistItemCount: z.number().int().default(0),
  checklistDoneCount: z.number().int().default(0),
  commentCount: z.number().int().default(0),
});
export type TaskListItemDto = z.infer<typeof taskListItemDtoSchema>;

export const createTaskSchema = z.object({
  officialId: z.string().uuid(),
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional().nullable(),
  category: taskCategorySchema.optional().default(TaskCategory.OTHER),
  priority: prioritySchema.optional().default(Priority.MEDIUM),
  visibility: z.enum(['ORG', 'PERSONAL']).optional().default('ORG'),
  startDate: z.string().optional().nullable(),
  dueAt: z.string().optional().nullable(),
  estimatedMin: z.number().int().positive().optional().nullable(),
  assigneeUserId: z.string().uuid().optional().nullable(),
  requiresVerification: z.boolean().optional().default(false),
  source: taskSourceSchema.optional().default(TaskSource.MANUAL),
  sourceId: z.string().uuid().optional().nullable(),
  recurrenceRule: z.string().optional().nullable(),
  checklist: z.array(z.string().min(1)).optional(),
  reminders: z.array(z.string()).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  category: taskCategorySchema.optional(),
  priority: prioritySchema.optional(),
  visibility: z.enum(['ORG', 'PERSONAL']).optional(),
  startDate: z.string().optional().nullable(),
  dueAt: z.string().optional().nullable(),
  estimatedMin: z.number().int().positive().optional().nullable(),
  assigneeUserId: z.string().uuid().optional().nullable(),
  requiresVerification: z.boolean().optional(),
  recurrenceRule: z.string().optional().nullable(),
  position: z.number().optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const blockTaskSchema = z.object({
  reason: z.string().min(1, 'Reason is required to block a task'),
});
export type BlockTaskInput = z.infer<typeof blockTaskSchema>;

export const cancelTaskSchema = z.object({
  reason: z.string().min(1, 'Reason is required to cancel a task'),
});
export type CancelTaskInput = z.infer<typeof cancelTaskSchema>;

export const reorderTaskSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        position: z.number(),
      }),
    )
    .min(1),
});
export type ReorderTaskInput = z.infer<typeof reorderTaskSchema>;

export const bulkTaskActionSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1, 'Select at least one task'),
  action: z.enum(['COMPLETE', 'CHANGE_PRIORITY', 'CHANGE_DUE_DATE', 'ASSIGN', 'CANCEL']),
  priority: prioritySchema.optional(),
  dueAt: z.string().nullable().optional(),
  assigneeUserId: z.string().uuid().nullable().optional(),
  reason: z.string().optional(),
});
export type BulkTaskActionInput = z.infer<typeof bulkTaskActionSchema>;

export const createChecklistItemSchema = z.object({
  text: z.string().min(1, 'Text is required'),
});
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemSchema>;

export const updateChecklistItemSchema = z.object({
  text: z.string().min(1).optional(),
  done: z.boolean().optional(),
  position: z.number().int().optional(),
});
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;

export const createTaskCommentSchema = z.object({
  body: z.string().min(1, 'Comment body cannot be empty'),
});
export type CreateTaskCommentInput = z.infer<typeof createTaskCommentSchema>;

export const createTaskReminderSchema = z.object({
  remindAt: z.string(),
  channel: z.enum(['IN_APP', 'EMAIL']).default('IN_APP'),
});
export type CreateTaskReminderInput = z.infer<typeof createTaskReminderSchema>;

export const taskListQuerySchema = z.object({
  officialId: z.string().uuid().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  category: z.string().optional(),
  scope: z.enum(['ALL', 'MY', 'DELEGATED_TO_ME', 'DELEGATED_BY_ME']).optional().default('ALL'),
  source: z.string().optional(),
  recurringOnly: z.coerce.boolean().optional(),
  search: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

export const taskExportQuerySchema = z.object({
  officialId: z.string().uuid().optional(),
  format: z.enum(['CSV', 'XLSX', 'PDF']),
  status: z.string().optional(),
  priority: z.string().optional(),
  category: z.string().optional(),
  scope: z.enum(['ALL', 'MY', 'DELEGATED_TO_ME', 'DELEGATED_BY_ME']).optional().default('ALL'),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  selectedIds: z.string().optional(), // comma-separated task UUIDs
});
export type TaskExportQuery = z.infer<typeof taskExportQuerySchema>;

export const taskSummaryDtoSchema = z.object({
  overdueCount: z.number().int(),
  todayCount: z.number().int(),
  upcomingCount: z.number().int(),
  highPriorityCount: z.number().int(),
  doneTodayCount: z.number().int(),
  totalOpenCount: z.number().int(),
});
export type TaskSummaryDto = z.infer<typeof taskSummaryDtoSchema>;
