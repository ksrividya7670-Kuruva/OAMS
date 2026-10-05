import { AppointmentStatus, type Permission, Permission as Perm, ApiError } from '@oams/shared';

export type LifecycleAction =
  | 'submit'
  | 'autoCheck'
  | 'requestInfo'
  | 'respondInfo'
  | 'expireInfo'
  | 'proposeTimes'
  | 'acceptProposal'
  | 'declineAll'
  | 'expireProposals'
  | 'schedule'
  | 'approve'
  | 'reject'
  | 'suggestOther'
  | 'cancel'
  | 'complete'
  | 'close';

export interface TransitionRule {
  from: AppointmentStatus[];
  action: LifecycleAction;
  to: AppointmentStatus | ((context: TransitionContext) => AppointmentStatus);
  requiredPermission?: Permission;
  allowedRoles?: string[];
  isRequesterAction?: boolean;
  isSystemAction?: boolean;
  guard?: (context: TransitionContext) => void | Promise<void>;
}

export interface TransitionContext {
  isRoutine?: boolean;
  hasAllRequiredApprovals?: boolean;
  autoCheckPassed?: boolean;
  reason?: string;
  note?: string;
  slotsCount?: number;
  [key: string]: unknown;
}

/**
 * Authoritative Canonical Transition Table (§10.2)
 */
export const LIFECYCLE_TRANSITIONS: TransitionRule[] = [
  // 1. DRAFT -> SUBMITTED
  {
    from: [AppointmentStatus.DRAFT],
    action: 'submit',
    to: AppointmentStatus.SUBMITTED,
    isRequesterAction: true,
  },
  // 2. SUBMITTED -> UNDER_REVIEW / REJECTED (System auto-checks §10.4)
  {
    from: [AppointmentStatus.SUBMITTED],
    action: 'autoCheck',
    to: (ctx) =>
      ctx.autoCheckPassed ? AppointmentStatus.UNDER_REVIEW : AppointmentStatus.REJECTED,
    isSystemAction: true,
  },
  // 3. UNDER_REVIEW -> INFO_REQUESTED (review permission, note required, pauses SLA)
  {
    from: [AppointmentStatus.UNDER_REVIEW],
    action: 'requestInfo',
    to: AppointmentStatus.INFO_REQUESTED,
    requiredPermission: Perm.APPOINTMENT_REVIEW,
    guard: (ctx) => {
      if (!ctx.note || ctx.note.trim().length < 5) {
        throw ApiError.badRequest(
          'A note explaining what information is requested is required (min 5 characters)',
        );
      }
    },
  },
  // 4. INFO_REQUESTED -> UNDER_REVIEW (requester responds, resumes SLA)
  {
    from: [AppointmentStatus.INFO_REQUESTED],
    action: 'respondInfo',
    to: AppointmentStatus.UNDER_REVIEW,
    isRequesterAction: true,
    guard: (ctx) => {
      if (!ctx.note || ctx.note.trim().length < 5) {
        throw ApiError.badRequest('Response note is required (min 5 characters)');
      }
    },
  },
  // 5. INFO_REQUESTED -> EXPIRED (system expiry job after info_response_days)
  {
    from: [AppointmentStatus.INFO_REQUESTED],
    action: 'expireInfo',
    to: AppointmentStatus.EXPIRED,
    isSystemAction: true,
  },
  // 6. UNDER_REVIEW -> AWAITING_REQUESTER (propose 1-3 slots, 24h holds)
  {
    from: [AppointmentStatus.UNDER_REVIEW],
    action: 'proposeTimes',
    to: AppointmentStatus.AWAITING_REQUESTER,
    requiredPermission: Perm.APPOINTMENT_REVIEW,
    guard: (ctx) => {
      const count = ctx.slotsCount ?? 0;
      if (count < 1 || count > 3) {
        throw ApiError.badRequest('Must propose between 1 and 3 candidate slots');
      }
    },
  },
  // 7. AWAITING_REQUESTER -> PENDING_APPROVAL / CONFIRMED (requester accepts 1)
  {
    from: [AppointmentStatus.AWAITING_REQUESTER],
    action: 'acceptProposal',
    to: (ctx) => (ctx.isRoutine ? AppointmentStatus.CONFIRMED : AppointmentStatus.PENDING_APPROVAL),
    isRequesterAction: true,
  },
  // 8. AWAITING_REQUESTER -> UNDER_REVIEW (requester declines all)
  {
    from: [AppointmentStatus.AWAITING_REQUESTER],
    action: 'declineAll',
    to: AppointmentStatus.UNDER_REVIEW,
    isRequesterAction: true,
  },
  // 9. AWAITING_REQUESTER -> UNDER_REVIEW (job expires all proposals, PA notified)
  {
    from: [AppointmentStatus.AWAITING_REQUESTER],
    action: 'expireProposals',
    to: AppointmentStatus.UNDER_REVIEW,
    isSystemAction: true,
  },
  // 10. UNDER_REVIEW -> PENDING_APPROVAL / CONFIRMED (direct schedule)
  {
    from: [AppointmentStatus.UNDER_REVIEW],
    action: 'schedule',
    to: (ctx) => (ctx.isRoutine ? AppointmentStatus.CONFIRMED : AppointmentStatus.PENDING_APPROVAL),
    requiredPermission: Perm.APPOINTMENT_REVIEW,
  },
  // 11. UNDER_REVIEW -> REJECTED (review permission, reason required)
  {
    from: [AppointmentStatus.UNDER_REVIEW],
    action: 'reject',
    to: AppointmentStatus.REJECTED,
    requiredPermission: Perm.APPOINTMENT_REVIEW,
    guard: (ctx) => {
      if (!ctx.reason || ctx.reason.trim().length < 5) {
        throw ApiError.badRequest('Rejection reason is required (min 5 characters)');
      }
    },
  },
  // 12. PENDING_APPROVAL -> CONFIRMED (approval permission, all REQUIRED approved)
  {
    from: [AppointmentStatus.PENDING_APPROVAL],
    action: 'approve',
    to: (ctx) =>
      ctx.hasAllRequiredApprovals !== false
        ? AppointmentStatus.CONFIRMED
        : AppointmentStatus.PENDING_APPROVAL,
    requiredPermission: Perm.APPOINTMENT_APPROVE,
  },
  // 13. PENDING_APPROVAL -> REJECTED (official or authorized staff rejects)
  {
    from: [AppointmentStatus.PENDING_APPROVAL],
    action: 'reject',
    to: AppointmentStatus.REJECTED,
    requiredPermission: Perm.APPOINTMENT_APPROVE,
    guard: (ctx) => {
      if (!ctx.reason || ctx.reason.trim().length < 5) {
        throw ApiError.badRequest('Rejection reason is required (min 5 characters)');
      }
    },
  },
  // 14. PENDING_APPROVAL -> AWAITING_REQUESTER (suggest other 1-3 slots)
  {
    from: [AppointmentStatus.PENDING_APPROVAL],
    action: 'suggestOther',
    to: AppointmentStatus.AWAITING_REQUESTER,
    requiredPermission: Perm.APPOINTMENT_APPROVE,
    guard: (ctx) => {
      const count = ctx.slotsCount ?? 0;
      if (count < 1 || count > 3) {
        throw ApiError.badRequest('Must suggest between 1 and 3 candidate slots');
      }
    },
  },
  // 15. Any non-terminal -> CANCELLED
  {
    from: [
      AppointmentStatus.DRAFT,
      AppointmentStatus.SUBMITTED,
      AppointmentStatus.UNDER_REVIEW,
      AppointmentStatus.INFO_REQUESTED,
      AppointmentStatus.AWAITING_REQUESTER,
      AppointmentStatus.PENDING_APPROVAL,
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.CHECKED_IN,
    ],
    action: 'cancel',
    to: AppointmentStatus.CANCELLED,
    requiredPermission: Perm.APPOINTMENT_CANCEL,
    guard: (ctx) => {
      if (!ctx.reason || ctx.reason.trim().length < 5) {
        throw ApiError.badRequest('Cancellation reason is required (min 5 characters)');
      }
    },
  },
  // 16. CONFIRMED / CHECKED_IN / IN_PROGRESS -> COMPLETED (Meeting concluded with notes & actions)
  {
    from: [
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.CHECKED_IN,
      AppointmentStatus.IN_PROGRESS,
    ],
    action: 'complete',
    to: AppointmentStatus.COMPLETED,
  },
  // 17. COMPLETED -> CLOSED (Manual close or auto-close after 14 days)
  {
    from: [AppointmentStatus.COMPLETED],
    action: 'close',
    to: AppointmentStatus.CLOSED,
  },
];

export function validateTransition(
  fromStatus: AppointmentStatus,
  action: LifecycleAction,
  context: TransitionContext = {},
): { rule: TransitionRule; nextStatus: AppointmentStatus } {
  const rule = LIFECYCLE_TRANSITIONS.find(
    (t) => t.from.includes(fromStatus) && t.action === action,
  );

  if (!rule) {
    throw ApiError.badRequest(
      `Invalid appointment state transition: cannot perform action '${action}' from status '${fromStatus}' (§10.2)`,
    );
  }

  if (rule.guard) {
    rule.guard(context);
  }

  const nextStatus = typeof rule.to === 'function' ? rule.to(context) : rule.to;
  return { rule, nextStatus };
}
