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

export const CLICKUP_STATUS_CONFIG: Record<
  TaskStatus,
  {
    label: string;
    badgeClass: string;
    headerBg: string;
    headerBorder: string;
    headerText: string;
    dotColor: string;
    barColor: string;
  }
> = {
  [TaskStatus.TODO]: {
    label: 'TO DO',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    headerBg: 'bg-slate-100 dark:bg-slate-800/60',
    headerBorder: 'border-slate-300 dark:border-slate-700',
    headerText: 'text-slate-700 dark:text-slate-300',
    dotColor: 'bg-slate-500',
    barColor: '#64748B',
  },
  [TaskStatus.IN_PROGRESS]: {
    label: 'IN PROGRESS',
    badgeClass: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700',
    headerBg: 'bg-blue-50 dark:bg-blue-900/30',
    headerBorder: 'border-blue-300 dark:border-blue-700',
    headerText: 'text-blue-700 dark:text-blue-300',
    dotColor: 'bg-blue-500',
    barColor: '#3B82F6',
  },
  [TaskStatus.BLOCKED]: {
    label: 'BLOCKED',
    badgeClass: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700',
    headerBg: 'bg-rose-50 dark:bg-rose-900/30',
    headerBorder: 'border-rose-300 dark:border-rose-700',
    headerText: 'text-rose-700 dark:text-rose-300',
    dotColor: 'bg-rose-500',
    barColor: '#EF4444',
  },
  [TaskStatus.DONE]: {
    label: 'COMPLETE',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700',
    headerBg: 'bg-emerald-50 dark:bg-emerald-900/30',
    headerBorder: 'border-emerald-300 dark:border-emerald-700',
    headerText: 'text-emerald-700 dark:text-emerald-300',
    dotColor: 'bg-emerald-500',
    barColor: '#10B981',
  },
  [TaskStatus.CANCELLED]: {
    label: 'CANCELLED',
    badgeClass: 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700',
    headerBg: 'bg-zinc-100 dark:bg-zinc-800/40',
    headerBorder: 'border-zinc-300 dark:border-zinc-700',
    headerText: 'text-zinc-600 dark:text-zinc-400',
    dotColor: 'bg-zinc-400',
    barColor: '#94A3B8',
  },
};
