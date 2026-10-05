import { Priority, AppointmentStatus } from '@oams/shared';

export const PRIORITY_LABELS: Record<
  Priority,
  { label: string; slaText: string; colorClass: string; badgeClass: string }
> = {
  [Priority.LOW]: {
    label: 'Low',
    slaText: 'Routine / FYI · Reply ≤ 3 work days',
    colorClass: 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  [Priority.MEDIUM]: {
    label: 'Medium',
    slaText: 'Standard business · Reply ≤ 1 work day',
    colorClass: 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  },
  [Priority.HIGH]: {
    label: 'High',
    slaText: 'Time-sensitive · Reply ≤ 4 work hours',
    colorClass: 'border-amber-400 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-950/20',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
  [Priority.URGENT]: {
    label: 'Urgent',
    slaText: 'Immediate attention · Staff only',
    colorClass: 'border-red-400 dark:border-red-600 bg-red-50/50 dark:bg-red-950/20',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  },
};

export const STATUS_LABELS: Record<
  AppointmentStatus,
  { label: string; requesterLabel: string; badgeClass: string; stepIndex: number }
> = {
  [AppointmentStatus.DRAFT]: {
    label: 'Draft',
    requesterLabel: 'Draft',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    stepIndex: 0,
  },
  [AppointmentStatus.SUBMITTED]: {
    label: 'Submitted',
    requesterLabel: 'Submitted',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    stepIndex: 0,
  },
  [AppointmentStatus.UNDER_REVIEW]: {
    label: 'Under Review',
    requesterLabel: 'Under Review by Office',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
    stepIndex: 1,
  },
  [AppointmentStatus.INFO_REQUESTED]: {
    label: 'Info Requested',
    requesterLabel: 'More Details Needed from You',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    stepIndex: 1,
  },
  [AppointmentStatus.AWAITING_REQUESTER]: {
    label: 'Awaiting Requester',
    requesterLabel: 'Times Proposed – Action Required',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    stepIndex: 2,
  },
  [AppointmentStatus.PENDING_APPROVAL]: {
    label: 'Pending Approval',
    requesterLabel: 'Slot Reserved – Awaiting Official Sign-off',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    stepIndex: 2,
  },
  [AppointmentStatus.CONFIRMED]: {
    label: 'Confirmed',
    requesterLabel: 'Confirmed',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    stepIndex: 3,
  },
  [AppointmentStatus.CHECKED_IN]: {
    label: 'Checked In',
    requesterLabel: 'Arrived at Reception',
    badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
    stepIndex: 4,
  },
  [AppointmentStatus.IN_PROGRESS]: {
    label: 'In Progress',
    requesterLabel: 'Meeting in Progress',
    badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    stepIndex: 4,
  },
  [AppointmentStatus.COMPLETED]: {
    label: 'Completed',
    requesterLabel: 'Meeting Concluded',
    badgeClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
    stepIndex: 5,
  },
  [AppointmentStatus.CLOSED]: {
    label: 'Closed',
    requesterLabel: 'Closed',
    badgeClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    stepIndex: 5,
  },
  [AppointmentStatus.REJECTED]: {
    label: 'Rejected',
    requesterLabel: 'Unable to Accommodate',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    stepIndex: -1,
  },
  [AppointmentStatus.CANCELLED]: {
    label: 'Cancelled',
    requesterLabel: 'Cancelled',
    badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
    stepIndex: -1,
  },
  [AppointmentStatus.NO_SHOW]: {
    label: 'No Show',
    requesterLabel: 'Did Not Attend',
    badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    stepIndex: -1,
  },
  [AppointmentStatus.EXPIRED]: {
    label: 'Expired',
    requesterLabel: 'Expired',
    badgeClass: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    stepIndex: -1,
  },
};
