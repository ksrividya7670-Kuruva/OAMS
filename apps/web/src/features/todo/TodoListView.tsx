import { type FC, useState } from 'react';
import { TaskStatus, type TaskListItemDto, type Priority } from '@oams/shared';
import {
  Lock,
  ChevronDown,
  ChevronRight,
  Flag,
  Calendar,
  Plus,
  Repeat,
  Link as LinkIcon,
} from 'lucide-react';
import { CLICKUP_STATUS_CONFIG } from './labels';

interface TodoListViewProps {
  tasks: TaskListItemDto[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onToggleComplete: (id: string, currentStatus: TaskStatus) => void;
  onSelectTask: (id: string) => void;
  onReorder: (items: { id: string; position: number }[]) => void;
  onUpdateStatus?: (taskId: string, newStatus: TaskStatus, reason?: string) => Promise<void>;
  onQuickAddTask?: (status: TaskStatus) => void;
}

export const TodoListView: FC<TodoListViewProps> = ({
  tasks,
  selectedIds,
  onToggleSelect,
  onToggleComplete,
  onSelectTask,
  onUpdateStatus,
  onQuickAddTask,
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [activeStatusMenuTaskId, setActiveStatusMenuTaskId] = useState<string | null>(null);

  const toggleGroup = (status: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [status]: !prev[status],
    }));
  };

  const statusGroups: TaskStatus[] = [
    TaskStatus.TODO,
    TaskStatus.IN_PROGRESS,
    TaskStatus.BLOCKED,
    TaskStatus.DONE,
  ];

  const now = new Date();

  const renderPriorityBadge = (p: Priority | string) => {
    if (p === 'URGENT') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold shrink-0">
          <Flag className="w-3 h-3 text-rose-500 fill-rose-500" />
          Urgent
        </span>
      );
    }
    if (p === 'HIGH') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold shrink-0">
          <Flag className="w-3 h-3 text-amber-500 fill-amber-500" />
          High
        </span>
      );
    }
    if (p === 'MEDIUM') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold shrink-0">
          <Flag className="w-3 h-3 text-blue-500" />
          Medium
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200 text-xs font-semibold shrink-0">
        <Flag className="w-3 h-3 text-slate-400" />
        Low
      </span>
    );
  };

  const formatDueDisplay = (t: TaskListItemDto) => {
    if (!t.dueAt) return null;
    const d = new Date(t.dueAt);
    const isOverdue = d < now && t.status !== TaskStatus.DONE;
    const dateFormatted = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return {
      text: dateFormatted,
      isOverdue,
    };
  };

  return (
    <div className="space-y-6">
      {statusGroups.map((status) => {
        const groupTasks = tasks.filter((t) => t.status === status);
        const statusConfig = CLICKUP_STATUS_CONFIG[status] || CLICKUP_STATUS_CONFIG[TaskStatus.TODO];
        const isCollapsed = collapsedGroups[status];

        return (
          <div
            key={status}
            className="rounded-2xl border border-[#E4E2DC] bg-white overflow-hidden shadow-2xs"
          >
            {/* ClickUp Section Header */}
            <div
              onClick={() => toggleGroup(status)}
              className={`px-4 py-2.5 flex items-center justify-between border-b border-[#E4E2DC] transition cursor-pointer select-none ${statusConfig.headerBg}`}
            >
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  aria-label={isCollapsed ? `Expand ${statusConfig.label} tasks` : `Collapse ${statusConfig.label} tasks`}
                  className="text-[#5B6070] hover:text-[#16181D] transition"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>

                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${statusConfig.dotColor}`} />
                  <span className={`text-xs font-bold tracking-wider uppercase ${statusConfig.headerText}`}>
                    {statusConfig.label}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/80 border border-[#D5D2CA] text-[11px] font-semibold text-[#5B6070]">
                    {groupTasks.length}
                  </span>
                </div>
              </div>

              {onQuickAddTask && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickAddTask(status);
                  }}
                  className="p-1 rounded-md text-[#5B6070] hover:text-[#16181D] hover:bg-black/5 text-xs font-semibold flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Add Task</span>
                </button>
              )}
            </div>

            {/* Tasks Table */}
            {!isCollapsed && (
              <div className="divide-y divide-[#F0EEE8]">
                {/* Column Titles Bar */}
                {groupTasks.length > 0 && (
                  <div className="px-4 py-2 bg-[#FAF9F5] flex items-center text-[11px] font-bold uppercase tracking-wider text-[#5B6070] border-b border-[#E4E2DC]">
                    <span className="w-8 shrink-0" />
                    <span className="w-24 shrink-0">Ref</span>
                    <span className="flex-1 min-w-0">Task Name</span>
                    <span className="w-32 shrink-0 text-center">Status</span>
                    <span className="w-28 shrink-0 text-center">Priority</span>
                    <span className="w-28 shrink-0 text-right pr-2">Due Date</span>
                    <span className="w-24 shrink-0 text-right">Assignee</span>
                  </div>
                )}

                {groupTasks.length === 0 ? (
                  <div className="p-5 text-center text-xs text-[#8C8A84] italic">
                    No tasks in {statusConfig.label.toLowerCase()}
                  </div>
                ) : (
                  groupTasks.map((t) => {
                    const isDone = t.status === TaskStatus.DONE;
                    const dueInfo = formatDueDisplay(t);
                    const isSelected = selectedIds.includes(t.id);

                    return (
                      <div
                        key={t.id}
                        onClick={() => onSelectTask(t.id)}
                        className={`px-4 py-2.5 flex items-center hover:bg-[#FDFCF9] transition cursor-pointer group ${
                          isSelected ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        {/* Checkbox (ClickUp circle check) */}
                        <div
                          className="w-12 shrink-0 flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect(t.id)}
                            aria-label={`Select ${t.title}`}
                            className="w-3.5 h-3.5 rounded border-[#D5D2CA] text-[#2957D6] accent-[#2957D6] cursor-pointer"
                          />
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => onToggleComplete(t.id, t.status)}
                            aria-label={`Toggle complete ${t.title}`}
                            className="w-4 h-4 rounded-full border-[#D5D2CA] text-[#2957D6] accent-[#2957D6] cursor-pointer"
                          />
                        </div>

                        {/* Ref chip */}
                        <span className="w-24 shrink-0 font-mono text-[11px] text-[#5B6070] font-medium">
                          {t.referenceNo || 'TSK'}
                        </span>

                        {/* Task Title & Tags */}
                        <div className="flex-1 min-w-0 flex items-center gap-2 pr-3">
                          <span
                            className={`text-xs font-medium truncate ${
                              isDone ? 'line-through text-[#8C8A84]' : 'text-[#16181D] group-hover:text-[#2957D6]'
                            }`}
                          >
                            {t.title}
                          </span>

                          {t.visibility === 'PERSONAL' && (
                            <span title="Personal To-do" className="text-purple-600 shrink-0">
                              <Lock className="w-3 h-3" />
                            </span>
                          )}
                          {t.seriesId && (
                            <span title="Recurring" className="text-slate-400 shrink-0">
                              <Repeat className="w-3 h-3" />
                            </span>
                          )}
                          {(t.source === 'ACTION_ITEM' || t.source === 'APPOINTMENT') && (
                            <span title="Meeting Action Item" className="text-blue-500 shrink-0">
                              <LinkIcon className="w-3 h-3" />
                            </span>
                          )}
                        </div>

                        {/* ClickUp Quick Status Dropdown */}
                        <div
                          className="w-32 shrink-0 flex justify-center relative"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setActiveStatusMenuTaskId(
                                activeStatusMenuTaskId === t.id ? null : t.id,
                              )
                            }
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5 transition ${statusConfig.badgeClass}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotColor}`} />
                            <span>{statusConfig.label}</span>
                            <ChevronDown className="w-3 h-3 opacity-60" />
                          </button>

                          {activeStatusMenuTaskId === t.id && onUpdateStatus && (
                            <div className="absolute top-full mt-1 w-36 bg-white border border-[#E4E2DC] rounded-xl shadow-xl p-1 z-50 text-xs">
                              {Object.values(TaskStatus).map((s) => {
                                const cfg = CLICKUP_STATUS_CONFIG[s];
                                if (!cfg) return null;
                                return (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={async () => {
                                      setActiveStatusMenuTaskId(null);
                                      await onUpdateStatus(t.id, s);
                                    }}
                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-[11px] font-semibold hover:bg-[#F7F6F2] transition ${
                                      t.status === s ? 'bg-[#F0EEE8]' : ''
                                    }`}
                                  >
                                    <span className={`w-2 h-2 rounded-full ${cfg.dotColor}`} />
                                    <span>{cfg.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Priority Badge */}
                        <div className="w-28 shrink-0 flex justify-center">
                          {renderPriorityBadge(t.priority)}
                        </div>

                        {/* Due Date */}
                        <div className="w-28 shrink-0 text-right pr-2">
                          {dueInfo ? (
                            <span
                              className={`text-xs inline-flex items-center gap-1 ${
                                dueInfo.isOverdue
                                  ? 'text-rose-600 font-semibold'
                                  : 'text-[#5B6070]'
                              }`}
                            >
                              <Calendar className="w-3 h-3" />
                              {dueInfo.text}
                            </span>
                          ) : (
                            <span className="text-xs text-[#8C8A84] italic">—</span>
                          )}
                        </div>

                        {/* Assignee */}
                        <div className="w-24 shrink-0 text-right flex items-center justify-end gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-[#E8EEFC] text-[#1E4FC2] font-bold text-[10px] flex items-center justify-center shrink-0">
                            {t.assigneeName ? t.assigneeName.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <span className="text-xs text-[#5B6070] truncate max-w-[65px]">
                            {t.assigneeName ? t.assigneeName.split(' ')[0] : 'You'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
