import { TaskCategory, TaskStatus, Priority } from '@oams/shared';

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  [TaskCategory.MEETING]: 'Meeting',
  [TaskCategory.APPROVAL]: 'Approval',
  [TaskCategory.REVIEW]: 'Review',
  [TaskCategory.CALL]: 'Call',
  [TaskCategory.EMAIL]: 'Email',
  [TaskCategory.DOCUMENT]: 'Document',
  [TaskCategory.FOLLOW_UP]: 'Follow-up',
  [TaskCategory.FINANCE]: 'Finance',
  [TaskCategory.HR]: 'HR',
  [TaskCategory.OPERATIONS]: 'Operations',
  [TaskCategory.ADMIN]: 'Admin',
  [TaskCategory.PERSONAL]: 'Personal',
  [TaskCategory.OTHER]: 'Other',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: 'To Do',
  [TaskStatus.IN_PROGRESS]: 'In Progress',
  [TaskStatus.BLOCKED]: 'Blocked',
  [TaskStatus.DONE]: 'Completed',
  [TaskStatus.CANCELLED]: 'Cancelled',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  [Priority.LOW]: 'Low',
  [Priority.MEDIUM]: 'Medium',
  [Priority.HIGH]: 'High',
  [Priority.URGENT]: 'Urgent',
};

export const PRIORITY_COLORS: Record<
  Priority,
  { bg: string; text: string; dot: string; flag: string }
> = {
  [Priority.LOW]: {
    bg: 'bg-slate-500/10 dark:bg-slate-400/10',
    text: 'text-slate-600 dark:text-slate-400',
    dot: 'bg-slate-400',
    flag: 'text-slate-400',
  },
  [Priority.MEDIUM]: {
    bg: 'bg-blue-500/10 dark:bg-blue-400/10',
    text: 'text-blue-700 dark:text-blue-400',
    dot: 'bg-blue-500',
    flag: 'text-blue-500',
  },
  [Priority.HIGH]: {
    bg: 'bg-amber-500/10 dark:bg-amber-400/10',
    text: 'text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-500',
    flag: 'text-amber-500',
  },
  [Priority.URGENT]: {
    bg: 'bg-rose-500/10 dark:bg-rose-400/10',
    text: 'text-rose-700 dark:text-rose-400',
    dot: 'bg-rose-500',
    flag: 'text-rose-500',
  },
};
