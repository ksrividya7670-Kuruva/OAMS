import { db } from '../../core/db.js';
import {
  type TaskDetailDto,
  type TaskListItemDto,
  type TaskListQuery,
  type TaskSummaryDto,
  RoleCode,
  TaskStatus,
  Priority,
} from '@oams/shared';
import { DateTime } from 'luxon';

export class TasksRepo {
  /**
   * Basic lookup by ID
   */
  async getById(id: string, orgId?: string) {
    let q = db('tasks').where('id', id);
    if (orgId) {
      q = q.where('org_id', orgId);
    }
    return q.first();
  }

  /**
   * Full task detail with sub-items, comments, watchers, attachments, reminders, dependencies.
   * Strictly enforces §12.1 PERSONAL task privacy: if task is PERSONAL and viewer is not the official, returns null.
   */
  async getWithDetails(
    id: string,
    orgId: string,
    currentUserId: string,
    _userRoles: RoleCode[] = [],
  ): Promise<TaskDetailDto | null> {
    const task = await db('tasks')
      .where('tasks.id', id)
      .where('tasks.org_id', orgId)
      .leftJoin('officials', 'tasks.official_id', 'officials.id')
      .leftJoin('users as owner', 'tasks.owner_user_id', 'owner.id')
      .leftJoin('users as assignee', 'tasks.assignee_user_id', 'assignee.id')
      .leftJoin('users as creator', 'tasks.created_by', 'creator.id')
      .select(
        'tasks.*',
        'officials.title as official_name',
        'owner.full_name as owner_name',
        'assignee.full_name as assignee_name',
        'assignee.email as assignee_email',
        'creator.full_name as created_by_name',
      )
      .first();

    if (!task) return null;

    // §12.1 Privacy Rule: visibility = PERSONAL tasks are visible ONLY to the official.
    if (task.visibility === 'PERSONAL' && task.owner_user_id !== currentUserId) {
      return null;
    }

    const [checklistItems, comments, reminders, watchers, dependencies, attachments] =
      await Promise.all([
        db('task_checklist_items').where('task_id', id).orderBy('position', 'asc').select('*'),
        db('task_comments')
          .where('task_id', id)
          .leftJoin('users', 'task_comments.author_id', 'users.id')
          .select(
            'task_comments.*',
            'users.full_name as author_name',
            'users.email as author_email',
          )
          .orderBy('task_comments.created_at', 'asc'),
        db('task_reminders').where('task_id', id).orderBy('remind_at', 'asc').select('*'),
        db('task_watchers')
          .where('task_id', id)
          .leftJoin('users', 'task_watchers.user_id', 'users.id')
          .select(
            'task_watchers.task_id',
            'task_watchers.user_id',
            'users.full_name as user_name',
            'users.email as user_email',
          ),
        db('task_dependencies')
          .where('task_id', id)
          .leftJoin('tasks as dep', 'task_dependencies.depends_on_task_id', 'dep.id')
          .select(
            'task_dependencies.task_id',
            'task_dependencies.depends_on_task_id',
            'dep.title as depends_on_task_title',
            'dep.reference_no as depends_on_task_reference_no',
            'dep.status as depends_on_task_status',
          ),
        db('task_attachments').where('task_id', id).orderBy('created_at', 'desc').select('*'),
      ]);

    const isOverdue =
      task.status !== TaskStatus.DONE &&
      task.status !== TaskStatus.CANCELLED &&
      !!task.due_at &&
      new Date(task.due_at) < new Date();

    const awaitingVerification =
      !!task.requires_verification && task.status === TaskStatus.DONE && !task.verified_at;

    return {
      id: task.id,
      orgId: task.org_id,
      referenceNo: task.reference_no,
      officialId: task.official_id,
      officialName: task.official_name || undefined,
      title: task.title,
      description: task.description || null,
      category: task.category,
      priority: task.priority,
      status: task.status,
      blockedReason: task.blocked_reason || null,
      cancelReason: task.cancel_reason || null,
      visibility: task.visibility,
      startDate: task.start_date ? new Date(task.start_date).toISOString() : null,
      dueAt: task.due_at ? new Date(task.due_at).toISOString() : null,
      estimatedMin: task.estimated_min || null,
      ownerUserId: task.owner_user_id,
      ownerName: task.owner_name || undefined,
      assigneeUserId: task.assignee_user_id || null,
      assigneeName: task.assignee_name || null,
      assigneeEmail: task.assignee_email || null,
      createdBy: task.created_by || null,
      createdByName: task.created_by_name || null,
      requiresVerification: !!task.requires_verification,
      verifiedBy: task.verified_by || null,
      verifiedAt: task.verified_at ? new Date(task.verified_at).toISOString() : null,
      source: task.source,
      sourceId: task.source_id || null,
      seriesId: task.series_id || null,
      recurrenceRule: task.recurrence_rule || null,
      position: Number(task.position),
      completedAt: task.completed_at ? new Date(task.completed_at).toISOString() : null,
      cancelledAt: task.cancelled_at ? new Date(task.cancelled_at).toISOString() : null,
      version: task.version,
      createdAt: new Date(task.created_at).toISOString(),
      updatedAt: new Date(task.updated_at).toISOString(),
      isOverdue,
      awaitingVerification,
      checklistItems: checklistItems.map((c) => ({
        id: c.id,
        taskId: c.task_id,
        text: c.text,
        done: !!c.done,
        position: c.position,
        createdAt: new Date(c.created_at).toISOString(),
        updatedAt: new Date(c.updated_at).toISOString(),
      })),
      comments: comments.map((cm) => ({
        id: cm.id,
        taskId: cm.task_id,
        authorId: cm.author_id,
        authorName: cm.author_name || undefined,
        authorEmail: cm.author_email || undefined,
        body: cm.body,
        createdAt: new Date(cm.created_at).toISOString(),
        updatedAt: new Date(cm.updated_at).toISOString(),
      })),
      reminders: reminders.map((r) => ({
        id: r.id,
        taskId: r.task_id,
        remindAt: new Date(r.remind_at).toISOString(),
        channel: r.channel,
        sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
        createdAt: new Date(r.created_at).toISOString(),
      })),
      watchers: watchers.map((w) => ({
        taskId: w.task_id,
        userId: w.user_id,
        userName: w.user_name || undefined,
        userEmail: w.user_email || undefined,
      })),
      dependencies: dependencies.map((d) => ({
        taskId: d.task_id,
        dependsOnTaskId: d.depends_on_task_id,
        dependsOnTaskTitle: d.depends_on_task_title || undefined,
        dependsOnTaskReferenceNo: d.depends_on_task_reference_no || undefined,
        dependsOnTaskStatus: d.depends_on_task_status || undefined,
      })),
      attachments: attachments.map((a) => ({
        id: a.id,
        taskId: a.task_id,
        fileName: a.file_name,
        fileSize: a.file_size,
        mimeType: a.mime_type,
        filePath: a.file_path,
        uploadedBy: a.uploaded_by || null,
        createdAt: new Date(a.created_at).toISOString(),
      })),
    };
  }

  /**
   * Scoped task listing with full filtering, sorting and privacy boundaries (§6.1, §6.3, §12.1)
   */
  async list(
    params: TaskListQuery & {
      orgId: string;
      currentUserId: string;
      userRoles: RoleCode[];
      isOfficial: boolean;
      assignedOfficialIds: string[];
    },
  ): Promise<{ tasks: TaskListItemDto[]; total: number }> {
    const {
      orgId,
      currentUserId,
      isOfficial,
      assignedOfficialIds,
      officialId,
      status,
      priority,
      category,
      scope = 'ALL',
      source,
      recurringOnly,
      search,
      fromDate,
      toDate,
      page = 1,
      limit = 50,
    } = params;

    const baseQuery = db('tasks')
      .where('tasks.org_id', orgId)
      .leftJoin('officials', 'tasks.official_id', 'officials.id')
      .leftJoin('users as assignee', 'tasks.assignee_user_id', 'assignee.id');

    // Scope boundary (§6.1 & §12.1)
    baseQuery.where((builder) => {
      if (isOfficial) {
        // Official sees all tasks owned by them (including PERSONAL), plus any tasks assigned to them
        builder
          .where('tasks.owner_user_id', currentUserId)
          .orWhere('tasks.assignee_user_id', currentUserId);
      } else {
        // Non-official (PA, EA, Admin):
        // 1. MUST NEVER SEE visibility = PERSONAL
        // 2. Can see tasks for assigned officials OR tasks delegated to them
        builder.where('tasks.visibility', '!=', 'PERSONAL').andWhere((sub) => {
          if (assignedOfficialIds.length > 0) {
            sub.whereIn('tasks.official_id', assignedOfficialIds);
          }
          sub.orWhere('tasks.assignee_user_id', currentUserId);
        });
      }
    });

    // Explicit official filter
    if (officialId) {
      baseQuery.where('tasks.official_id', officialId);
    }

    // Status filter
    if (status) {
      const statuses = status.split(',').map((s) => s.trim());
      baseQuery.whereIn('tasks.status', statuses);
    }

    // Priority filter
    if (priority) {
      const priorities = priority.split(',').map((p) => p.trim());
      baseQuery.whereIn('tasks.priority', priorities);
    }

    // Category filter
    if (category) {
      const categories = category.split(',').map((c) => c.trim());
      baseQuery.whereIn('tasks.category', categories);
    }

    // Source filter
    if (source) {
      baseQuery.where('tasks.source', source);
    }

    // Recurring only
    if (recurringOnly) {
      baseQuery.whereNotNull('tasks.series_id');
    }

    // Scope tab filters (My tasks / Delegated to me / Delegated by me)
    if (scope === 'MY') {
      baseQuery.where((q) => {
        q.where('tasks.owner_user_id', currentUserId).orWhere(
          'tasks.assignee_user_id',
          currentUserId,
        );
      });
    } else if (scope === 'DELEGATED_TO_ME') {
      baseQuery.where('tasks.assignee_user_id', currentUserId);
    } else if (scope === 'DELEGATED_BY_ME') {
      baseQuery
        .where('tasks.owner_user_id', currentUserId)
        .whereNotNull('tasks.assignee_user_id')
        .where('tasks.assignee_user_id', '!=', currentUserId);
    }

    // Search query
    if (search) {
      const term = `%${search.toLowerCase()}%`;
      baseQuery.where((q) => {
        q.whereRaw('LOWER(tasks.title) LIKE ?', [term]).orWhereRaw(
          'LOWER(tasks.description) LIKE ?',
          [term],
        );
      });
    }

    // Date range
    if (fromDate) {
      baseQuery.where('tasks.due_at', '>=', fromDate);
    }
    if (toDate) {
      baseQuery.where('tasks.due_at', '<=', toDate);
    }

    // Count query
    const countResult = await baseQuery.clone().count('tasks.id as total').first();
    const total = Number(countResult?.total || 0);

    // Subqueries for checklist and comment counts
    const rows = await baseQuery
      .clone()
      .select(
        'tasks.*',
        'officials.title as official_name',
        'assignee.full_name as assignee_name',
        db.raw(
          '(SELECT COUNT(*) FROM task_checklist_items WHERE task_checklist_items.task_id = tasks.id)::int as checklist_item_count',
        ),
        db.raw(
          '(SELECT COUNT(*) FROM task_checklist_items WHERE task_checklist_items.task_id = tasks.id AND task_checklist_items.done = true)::int as checklist_done_count',
        ),
        db.raw(
          '(SELECT COUNT(*) FROM task_comments WHERE task_comments.task_id = tasks.id)::int as comment_count',
        ),
      )
      .orderBy('tasks.position', 'asc')
      .orderByRaw('tasks.due_at ASC NULLS LAST')
      .orderBy('tasks.created_at', 'desc')
      .offset((page - 1) * limit)
      .limit(limit);

    const now = new Date();
    const tasks: TaskListItemDto[] = rows.map((task: any) => {
      const isOverdue =
        task.status !== TaskStatus.DONE &&
        task.status !== TaskStatus.CANCELLED &&
        !!task.due_at &&
        new Date(task.due_at) < now;

      const awaitingVerification =
        !!task.requires_verification && task.status === TaskStatus.DONE && !task.verified_at;

      return {
        id: task.id,
        orgId: task.org_id,
        referenceNo: task.reference_no,
        officialId: task.official_id,
        officialName: task.official_name || undefined,
        title: task.title,
        category: task.category,
        priority: task.priority,
        status: task.status,
        visibility: task.visibility,
        dueAt: task.due_at ? new Date(task.due_at).toISOString() : null,
        estimatedMin: task.estimated_min || null,
        ownerUserId: task.owner_user_id,
        assigneeUserId: task.assignee_user_id || null,
        assigneeName: task.assignee_name || null,
        requiresVerification: !!task.requires_verification,
        verifiedAt: task.verified_at ? new Date(task.verified_at).toISOString() : null,
        source: task.source,
        sourceId: task.source_id || null,
        seriesId: task.series_id || null,
        recurrenceRule: task.recurrence_rule || null,
        position: Number(task.position),
        completedAt: task.completed_at ? new Date(task.completed_at).toISOString() : null,
        createdAt: new Date(task.created_at).toISOString(),
        updatedAt: new Date(task.updated_at).toISOString(),
        isOverdue,
        awaitingVerification,
        checklistItemCount: Number(task.checklist_item_count || 0),
        checklistDoneCount: Number(task.checklist_done_count || 0),
        commentCount: Number(task.comment_count || 0),
      };
    });

    return { tasks, total };
  }

  /**
   * Summary metrics for dashboard widget and header (§12.3)
   */
  async getSummary(
    officialId: string | undefined,
    orgId: string,
    currentUserId: string,
    isOfficial: boolean,
  ): Promise<TaskSummaryDto> {
    const q = db('tasks').where('org_id', orgId);

    if (officialId) {
      q.where('official_id', officialId);
    }

    if (!isOfficial) {
      // Exclude PERSONAL tasks for non-official viewers
      q.where('visibility', '!=', 'PERSONAL');
    } else {
      q.where('owner_user_id', currentUserId);
    }

    const now = DateTime.now();
    const startOfToday = now.startOf('day').toJSDate();
    const endOfToday = now.endOf('day').toJSDate();
    const next7Days = now.plus({ days: 7 }).endOf('day').toJSDate();

    const [overdue, today, upcoming, highPriority, doneToday, totalOpen] = await Promise.all([
      q
        .clone()
        .whereNotIn('status', [TaskStatus.DONE, TaskStatus.CANCELLED])
        .whereNotNull('due_at')
        .where('due_at', '<', now.toJSDate())
        .count('id as cnt')
        .first(),
      q
        .clone()
        .whereNotIn('status', [TaskStatus.DONE, TaskStatus.CANCELLED])
        .where('due_at', '>=', startOfToday)
        .where('due_at', '<=', endOfToday)
        .count('id as cnt')
        .first(),
      q
        .clone()
        .whereNotIn('status', [TaskStatus.DONE, TaskStatus.CANCELLED])
        .where('due_at', '>', endOfToday)
        .where('due_at', '<=', next7Days)
        .count('id as cnt')
        .first(),
      q
        .clone()
        .whereNotIn('status', [TaskStatus.DONE, TaskStatus.CANCELLED])
        .whereIn('priority', [Priority.HIGH, Priority.URGENT])
        .count('id as cnt')
        .first(),
      q
        .clone()
        .where('status', TaskStatus.DONE)
        .where('completed_at', '>=', startOfToday)
        .count('id as cnt')
        .first(),
      q
        .clone()
        .whereNotIn('status', [TaskStatus.DONE, TaskStatus.CANCELLED])
        .count('id as cnt')
        .first(),
    ]);

    return {
      overdueCount: Number(overdue?.cnt || 0),
      todayCount: Number(today?.cnt || 0),
      upcomingCount: Number(upcoming?.cnt || 0),
      highPriorityCount: Number(highPriority?.cnt || 0),
      doneTodayCount: Number(doneToday?.cnt || 0),
      totalOpenCount: Number(totalOpen?.cnt || 0),
    };
  }
}

export const tasksRepo = new TasksRepo();
