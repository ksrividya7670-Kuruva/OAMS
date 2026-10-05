import { type FC } from 'react';
import { TaskStatus, type TaskListItemDto, type Priority } from '@oams/shared';
import { Lock } from 'lucide-react';
import { TASK_CATEGORY_LABELS } from './labels';

interface TodoListViewProps {
  tasks: TaskListItemDto[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onToggleComplete: (id: string, currentStatus: TaskStatus) => void;
  onSelectTask: (id: string) => void;
  onReorder: (items: { id: string; position: number }[]) => void;
}

export const TodoListView: FC<TodoListViewProps> = ({
  tasks,
  onToggleComplete,
  onSelectTask,
}) => {
  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59);

  // Group tasks into buckets
  const overdue: TaskListItemDto[] = [];
  const today: TaskListItemDto[] = [];
  const thisWeek: TaskListItemDto[] = [];
  const otherTasks: TaskListItemDto[] = [];

  for (const t of tasks) {
    if (t.status === TaskStatus.DONE || t.status === TaskStatus.CANCELLED) {
      continue;
    }
    if (!t.dueAt) {
      thisWeek.push(t);
      continue;
    }
    const dueDate = new Date(t.dueAt);
    if (dueDate < now) {
      overdue.push(t);
    } else if (dueDate <= todayEnd) {
      today.push(t);
    } else if (dueDate <= weekEnd) {
      thisWeek.push(t);
    } else {
      otherTasks.push(t);
    }
  }

  const formatDueDisplay = (t: TaskListItemDto) => {
    if (!t.dueAt) return 'No date';
    const d = new Date(t.dueAt);
    if (t.isOverdue || d < now) {
      const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) return 'Yesterday';
      return `${diffDays + 1} days ago`;
    }
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return d.toLocaleDateString([], { weekday: 'short' });
  };

  const renderPriorityBadge = (p: Priority | string) => {
    if (p === 'HIGH' || p === 'URGENT') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FDEBDD] text-[#9A3F07] text-xs font-semibold shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"></path></svg>
          High
        </span>
      );
    }
    if (p === 'MEDIUM') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E8EEFC] text-[#1E4FC2] text-xs font-semibold shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"></path></svg>
          Medium
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EEF0F3] text-[#475467] text-xs font-semibold shrink-0">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"></path></svg>
        Low
      </span>
    );
  };

  const renderRow = (t: TaskListItemDto) => {
    const isOverdue = t.dueAt && new Date(t.dueAt) < now;
    const isPersonal = t.visibility === 'PERSONAL' || t.category === 'PERSONAL';
    const isDone = t.status === TaskStatus.DONE;
    const dueText = formatDueDisplay(t);

    const categoryLabel =
      TASK_CATEGORY_LABELS[t.category] ||
      (t.category === 'APPROVAL'
        ? 'Approval'
        : t.category === 'EMAIL'
        ? 'Email'
        : t.category === 'DOCUMENT'
        ? 'Document'
        : t.category === 'REVIEW'
        ? 'Review'
        : t.category === 'CALL'
        ? 'Call'
        : t.category === 'MEETING'
        ? 'Meeting'
        : t.category || 'General');

    return (
      <div
        key={t.id}
        onClick={() => onSelectTask(t.id)}
        className="flex items-center gap-3 px-4 py-2.5 border-t border-[#EFEDE7] hover:bg-[#FDFCF9] transition cursor-pointer"
      >
        <input
          type="checkbox"
          checked={isDone}
          onChange={(e) => {
            e.stopPropagation();
            onToggleComplete(t.id, t.status);
          }}
          aria-label={`Complete ${t.title}`}
          className="w-[18px] h-[18px] rounded border-[#D5D2CA] text-[#2957D6] accent-[#2957D6] cursor-pointer shrink-0"
        />

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span
            className={`text-sm ${
              isDone ? 'line-through text-[#5B6070]' : 'text-[#16181D]'
            }`}
          >
            {t.title}
          </span>
          {isPersonal && (
            <span className="inline-flex items-center text-[#7A4FD0]" title="Personal">
              <Lock className="w-3.5 h-3.5" />
            </span>
          )}
        </div>

        {/* Category Badge */}
        <span className="px-2 py-0.5 rounded-full bg-[#F0EEE8] text-[#3B4150] text-xs font-semibold whitespace-nowrap shrink-0">
          {categoryLabel}
        </span>

        {/* Priority Badge */}
        {renderPriorityBadge(t.priority)}

        {/* Due Date */}
        <span
          className={`w-[84px] text-right text-[13px] shrink-0 ${
            isOverdue ? 'text-[#A11C12] font-semibold' : 'text-[#5B6070] font-normal'
          }`}
        >
          {dueText}
        </span>

        {/* Assignee */}
        <span className="w-[64px] text-right text-[13px] text-[#5B6070] shrink-0 truncate">
          {t.assigneeName ? (t.assigneeName.startsWith('Mr.') || t.assigneeName.startsWith('Ms.') ? t.assigneeName : t.assigneeName.split(' ')[0]) : 'You'}
        </span>
      </div>
    );
  };

  return (
    <div>
      {/* Overdue Group */}
      {overdue.length > 0 && (
        <div>
          <div className="px-4 pt-3 pb-1.5 text-[13px] font-semibold text-[#A11C12] flex items-center gap-1.5">
            <span>Overdue</span>
            <span className="text-[#5B6070] font-normal">{overdue.length}</span>
          </div>
          {overdue.map(renderRow)}
        </div>
      )}

      {/* Today Group */}
      {today.length > 0 && (
        <div>
          <div className="px-4 pt-3 pb-1.5 text-[13px] font-semibold text-[#16181D] flex items-center gap-1.5">
            <span>Today</span>
            <span className="text-[#5B6070] font-normal">{today.length}</span>
          </div>
          {today.map(renderRow)}
        </div>
      )}

      {/* This Week Group */}
      {thisWeek.length > 0 && (
        <div>
          <div className="px-4 pt-3 pb-1.5 text-[13px] font-semibold text-[#16181D] flex items-center gap-1.5">
            <span>This week</span>
            <span className="text-[#5B6070] font-normal">{thisWeek.length}</span>
          </div>
          {thisWeek.map(renderRow)}
        </div>
      )}

      {/* Other Tasks */}
      {otherTasks.length > 0 && (
        <div>
          <div className="px-4 pt-3 pb-1.5 text-[13px] font-semibold text-[#5B6070] flex items-center gap-1.5">
            <span>Upcoming</span>
            <span className="text-[#5B6070] font-normal">{otherTasks.length}</span>
          </div>
          {otherTasks.map(renderRow)}
        </div>
      )}

      {tasks.length === 0 && (
        <div className="py-12 text-center text-sm text-[#5B6070]">
          No tasks found. Add a task above to get started.
        </div>
      )}
    </div>
  );
};
