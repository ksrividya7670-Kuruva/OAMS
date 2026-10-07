import { type FC, useState } from 'react';
import type { TaskListItemDto } from '@oams/shared';
import { TaskStatus } from '@oams/shared';
import { Flag, Calendar, Lock, Repeat, Link as LinkIcon, Plus, ChevronDown } from 'lucide-react';
import { CLICKUP_STATUS_CONFIG } from './labels';
import { BlockReasonModal } from './BlockReasonModal';

interface TodoBoardViewProps {
  tasks: TaskListItemDto[];
  onSelectTask: (id: string) => void;
  onUpdateStatus: (taskId: string, newStatus: TaskStatus, reason?: string) => Promise<void>;
  onQuickAddTask?: (status: TaskStatus) => void;
}

export const TodoBoardView: FC<TodoBoardViewProps> = ({
  tasks,
  onSelectTask,
  onUpdateStatus,
  onQuickAddTask,
}) => {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [blockingTaskId, setBlockingTaskId] = useState<string | null>(null);
  const [activeStatusMenuTaskId, setActiveStatusMenuTaskId] = useState<string | null>(null);

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
      setBlockingTaskId(taskId);
    } else {
      onUpdateStatus(taskId, targetStatus);
    }

    setDraggedTaskId(null);
  };

  const now = new Date();

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
        {columns.map((colStatus) => {
          const colTasks = tasks.filter((t) => t.status === colStatus);
          const statusConfig = CLICKUP_STATUS_CONFIG[colStatus] || CLICKUP_STATUS_CONFIG[TaskStatus.TODO];

          return (
            <div
              key={colStatus}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDropOnColumn(e, colStatus)}
              className="rounded-2xl border border-[#E4E2DC] bg-[#FAF9F5] p-3 min-h-[520px] flex flex-col shadow-2xs"
            >
              {/* ClickUp Column Header */}
              <div className="flex items-center justify-between px-2 py-2 mb-3 border-b border-[#E4E2DC] pb-2.5">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${statusConfig.dotColor}`} />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#16181D]">
                    {statusConfig.label}
                  </span>
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-white text-[#5B6070] border border-[#D5D2CA]">
                    {colTasks.length}
                  </span>
                </div>

                {onQuickAddTask && (
                  <button
                    type="button"
                    onClick={() => onQuickAddTask(colStatus)}
                    aria-label={`Add new task to ${statusConfig.label}`}
                    className="p-1 rounded-md text-[#5B6070] hover:text-[#16181D] hover:bg-black/5 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Cards Container */}
              <div className="space-y-2.5 flex-1">
                {colTasks.map((task) => {
                  const isDone = task.status === TaskStatus.DONE;
                  const isOverdue = task.dueAt && new Date(task.dueAt) < now && !isDone;

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onClick={() => onSelectTask(task.id)}
                      className="p-3.5 rounded-xl border border-[#E4E2DC] bg-white shadow-2xs hover:border-[#2957D6]/50 hover:shadow-sm transition-all cursor-pointer space-y-2.5 group relative"
                    >
                      {/* Top Row: Ref & Indicators */}
                      <div className="flex items-center justify-between gap-2 text-[11px] text-[#5B6070]">
                        <span className="font-mono font-medium">{task.referenceNo || 'TSK'}</span>
                        <div className="flex items-center gap-1.5">
                          {task.visibility === 'PERSONAL' && (
                            <span title="Personal To-do" className="text-purple-600">
                              <Lock className="w-3 h-3" />
                            </span>
                          )}
                          {task.seriesId && (
                            <span title="Recurring" className="text-slate-400">
                              <Repeat className="w-3 h-3" />
                            </span>
                          )}
                          {(task.source === 'ACTION_ITEM' || task.source === 'APPOINTMENT') && (
                            <span title="Meeting Task" className="text-blue-500">
                              <LinkIcon className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title */}
                      <h4
                        className={`text-xs font-semibold leading-snug ${
                          isDone ? 'line-through text-[#8C8A84]' : 'text-[#16181D] group-hover:text-[#2957D6]'
                        }`}
                      >
                        {task.title}
                      </h4>

                      {/* ClickUp Status Pill & Priority */}
                      <div className="flex items-center justify-between pt-1 text-xs">
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveStatusMenuTaskId(
                                activeStatusMenuTaskId === task.id ? null : task.id,
                              )
                            }
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 transition ${statusConfig.badgeClass}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotColor}`} />
                            <span>{statusConfig.label}</span>
                            <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                          </button>

                          {activeStatusMenuTaskId === task.id && (
                            <div className="absolute left-0 top-full mt-1 w-36 bg-white border border-[#E4E2DC] rounded-xl shadow-xl p-1 z-50 text-xs">
                              {Object.values(TaskStatus).map((s) => {
                                const cfg = CLICKUP_STATUS_CONFIG[s];
                                if (!cfg) return null;
                                return (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={async () => {
                                      setActiveStatusMenuTaskId(null);
                                      if (s === TaskStatus.BLOCKED) {
                                        setBlockingTaskId(task.id);
                                      } else {
                                        await onUpdateStatus(task.id, s);
                                      }
                                    }}
                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-[11px] font-semibold hover:bg-[#F7F6F2] transition ${
                                      task.status === s ? 'bg-[#F0EEE8]' : ''
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

                        {/* Priority Flag */}
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-[#5B6070]">
                          <Flag
                            className={`w-3.5 h-3.5 ${
                              task.priority === 'URGENT'
                                ? 'text-rose-500 fill-rose-500'
                                : task.priority === 'HIGH'
                                ? 'text-amber-500 fill-amber-500'
                                : task.priority === 'MEDIUM'
                                ? 'text-blue-500'
                                : 'text-slate-400'
                            }`}
                          />
                          <span>{task.priority || 'Normal'}</span>
                        </div>
                      </div>

                      {/* Bottom Footer: Due Date & Assignee */}
                      <div className="pt-2 border-t border-[#F0EEE8] flex items-center justify-between text-[11px] text-[#5B6070]">
                        <div className="flex items-center gap-1">
                          <Calendar className={`w-3 h-3 ${isOverdue ? 'text-rose-600' : 'text-[#8C8A84]'}`} />
                          <span className={isOverdue ? 'text-rose-600 font-semibold' : ''}>
                            {task.dueAt
                              ? new Date(task.dueAt).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : 'No date'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-[#E8EEFC] text-[#1E4FC2] font-bold text-[10px] flex items-center justify-center shrink-0">
                            {task.assigneeName ? task.assigneeName.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <span className="truncate max-w-[70px]">
                            {task.assigneeName ? task.assigneeName.split(' ')[0] : 'You'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {colTasks.length === 0 && (
                  <div className="py-10 border-2 border-dashed border-[#D5D2CA]/60 rounded-xl flex flex-col items-center justify-center text-[#8C8A84] text-xs">
                    <span>Empty column</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Block reason modal if blocked status dragged */}
      {blockingTaskId && (
        <BlockReasonModal
          isOpen={true}
          title="Block Task"
          description="Specify a reason for blocking this task."
          confirmLabel="Block Task"
          onClose={() => setBlockingTaskId(null)}
          onConfirm={async (reason: string) => {
            await onUpdateStatus(blockingTaskId, TaskStatus.BLOCKED, reason);
            setBlockingTaskId(null);
          }}
        />
      )}
    </>
  );
};
