import { type FC, useState } from 'react';
import type { TaskListItemDto, Priority } from '@oams/shared';
import { TaskStatus } from '@oams/shared';
import { Flag, Calendar, Lock, Repeat, Link as LinkIcon, User } from 'lucide-react';
import { TASK_STATUS_LABELS, PRIORITY_LABELS, PRIORITY_COLORS } from './labels';
import { BlockReasonModal } from './BlockReasonModal';

interface TodoBoardViewProps {
  tasks: TaskListItemDto[];
  onSelectTask: (id: string) => void;
  onUpdateStatus: (taskId: string, newStatus: TaskStatus, reason?: string) => Promise<void>;
}

export const TodoBoardView: FC<TodoBoardViewProps> = ({ tasks, onSelectTask, onUpdateStatus }) => {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [blockingTaskId, setBlockingTaskId] = useState<string | null>(null);

  const columns: TaskStatus[] = [
    TaskStatus.TODO,
    TaskStatus.IN_PROGRESS,
    TaskStatus.BLOCKED,
    TaskStatus.DONE,
  ];

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggedTaskId(id);
  };

  const handleDropOnColumn = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (!taskId) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetStatus) return;

    if (targetStatus === TaskStatus.BLOCKED) {
      // Prompt for mandatory block reason (§12.2)
      setBlockingTaskId(taskId);
    } else {
      onUpdateStatus(taskId, targetStatus);
    }

    setDraggedTaskId(null);
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
        {columns.map((colStatus) => {
          const colTasks = tasks.filter((t) => t.status === colStatus);

          return (
            <div
              key={colStatus}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDropOnColumn(e, colStatus)}
              className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-3 min-h-[500px] flex flex-col"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-2 py-1.5 mb-3 border-b border-[var(--border-default)] pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">
                  {TASK_STATUS_LABELS[colStatus]}
                </span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-default)]">
                  {colTasks.length}
                </span>
              </div>

              {/* Cards Container */}
              <div className="space-y-2.5 flex-1">
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onClick={() => onSelectTask(task.id)}
                    className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs hover:border-[var(--brand-primary)]/40 transition-all cursor-pointer space-y-2 group"
                  >
                    {/* Header: Reference & Icons */}
                    <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                      <span className="font-mono font-medium">{task.referenceNo}</span>
                      <div className="flex items-center gap-1">
                        {task.visibility === 'PERSONAL' && (
                          <span title="Personal">
                            <Lock className="w-3 h-3 text-purple-500" />
                          </span>
                        )}
                        {task.seriesId && (
                          <span title="Recurring">
                            <Repeat className="w-3 h-3 text-slate-400" />
                          </span>
                        )}
                        {(task.source === 'ACTION_ITEM' || task.source === 'APPOINTMENT') && (
                          <span title="Meeting Task">
                            <LinkIcon className="w-3 h-3 text-blue-500" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    <h4 className="text-xs font-semibold text-[var(--text-main)] leading-snug line-clamp-2">
                      {task.title}
                    </h4>

                    {/* Footer: Priority & Due & Assignee */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border-default)]/60 text-[11px]">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          PRIORITY_COLORS[task.priority as Priority]?.text
                        }`}
                      >
                        <Flag className="w-3 h-3" />
                        {PRIORITY_LABELS[task.priority as Priority]}
                      </span>

                      <div className="flex items-center gap-2">
                        {task.dueAt && (
                          <span
                            className={`flex items-center gap-1 ${
                              task.isOverdue
                                ? 'text-rose-600 dark:text-rose-400 font-bold'
                                : 'text-[var(--text-muted)]'
                            }`}
                          >
                            <Calendar className="w-3 h-3" />
                            {new Date(task.dueAt).toLocaleDateString([], {
                              month: 'numeric',
                              day: 'numeric',
                            })}
                          </span>
                        )}

                        <div
                          title={task.assigneeName || 'Unassigned'}
                          className="w-5 h-5 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-default)] flex items-center justify-center text-[9px] font-bold text-[var(--text-muted)]"
                        >
                          {task.assigneeName ? (
                            task.assigneeName.charAt(0).toUpperCase()
                          ) : (
                            <User className="w-2.5 h-2.5 opacity-40" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Block Reason Prompt Modal */}
      <BlockReasonModal
        isOpen={!!blockingTaskId}
        title="Block Task Reason"
        description="A reason is required to move this task to the BLOCKED column."
        confirmLabel="Move to Blocked"
        onConfirm={async (reason) => {
          if (blockingTaskId) {
            await onUpdateStatus(blockingTaskId, TaskStatus.BLOCKED, reason);
            setBlockingTaskId(null);
          }
        }}
        onClose={() => setBlockingTaskId(null)}
      />
    </>
  );
};
