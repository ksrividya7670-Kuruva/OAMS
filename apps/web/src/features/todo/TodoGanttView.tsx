import React, { useState, useMemo } from 'react';
import { TaskStatus, type TaskListItemDto, type Priority } from '@oams/shared';
import {
  ChevronLeft,
  ChevronRight,
  Flag,
  Layers,
  ChevronDown,
} from 'lucide-react';
import { CLICKUP_STATUS_CONFIG } from './labels';

interface TodoGanttViewProps {
  tasks: TaskListItemDto[];
  onSelectTask: (id: string) => void;
  onUpdateStatus: (taskId: string, newStatus: TaskStatus, reason?: string) => Promise<void>;
}

export const TodoGanttView: React.FC<TodoGanttViewProps> = ({
  tasks,
  onSelectTask,
  onUpdateStatus,
}) => {
  // Navigation window anchor (Monday of current week)
  const [timelineStart, setTimelineStart] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - (day === 0 ? 6 : day - 1);
    const mon = new Date(d.setDate(diff));
    mon.setHours(0, 0, 0, 0);
    return mon;
  });

  const [daysCount, setDaysCount] = useState<14 | 21>(14);
  const [activeStatusMenuTaskId, setActiveStatusMenuTaskId] = useState<string | null>(null);

  const todayStr = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  // Compute days in view
  const timelineDays = useMemo(() => {
    const list: { date: Date; dateStr: string; dayName: string; dayNum: number; isToday: boolean; isWeekend: boolean }[] = [];
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(timelineStart);
      d.setDate(timelineStart.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayNum = d.getDate();
      const dayName = d.toLocaleDateString(undefined, { weekday: 'short' });
      const dayOfWeek = d.getDay();
      list.push({
        date: d,
        dateStr,
        dayName,
        dayNum,
        isToday: dateStr === todayStr,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      });
    }
    return list;
  }, [timelineStart, daysCount, todayStr]);

  const prevWindow = () => {
    setTimelineStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const nextWindow = () => {
    setTimelineStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const jumpToToday = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - (day === 0 ? 6 : day - 1);
    const mon = new Date(d.setDate(diff));
    mon.setHours(0, 0, 0, 0);
    setTimelineStart(mon);
  };

  // Calculate horizontal position for a task
  const getTaskBarSpan = (task: TaskListItemDto) => {
    const windowStartMs = timelineDays[0].date.getTime();
    const windowEndMs = timelineDays[timelineDays.length - 1].date.getTime() + 86400000;
    const totalSpanMs = windowEndMs - windowStartMs;

    // Use task createdAt or start date
    const createdDate = task.createdAt ? new Date(task.createdAt) : new Date(timelineDays[0].date);
    createdDate.setHours(0, 0, 0, 0);

    // Use task dueAt or default to createdDate + 2 days
    const dueDate = task.dueAt ? new Date(task.dueAt) : new Date(createdDate.getTime() + 2 * 86400000);
    dueDate.setHours(23, 59, 59, 999);

    // If task is outside window
    if (dueDate.getTime() < windowStartMs || createdDate.getTime() > windowEndMs) {
      return null;
    }

    const clampedStartMs = Math.max(createdDate.getTime(), windowStartMs);
    const clampedEndMs = Math.min(dueDate.getTime(), windowEndMs);

    const leftPercent = Math.max(0, ((clampedStartMs - windowStartMs) / totalSpanMs) * 100);
    const widthPercent = Math.max(4, Math.min(100 - leftPercent, ((clampedEndMs - clampedStartMs) / totalSpanMs) * 100));

    // Calculate duration in days
    const durationDays = Math.max(1, Math.round((dueDate.getTime() - createdDate.getTime()) / 86400000));

    // Progress percentage
    let progress = 20;
    if (task.status === TaskStatus.DONE) progress = 100;
    else if (task.status === TaskStatus.IN_PROGRESS) progress = 65;
    else if (task.status === TaskStatus.BLOCKED) progress = 40;

    return {
      left: `${leftPercent}%`,
      width: `${widthPercent}%`,
      durationDays,
      progress,
    };
  };

  const getPriorityFlagColor = (p?: Priority) => {
    if (p === 'URGENT') return 'text-rose-500';
    if (p === 'HIGH') return 'text-amber-500';
    if (p === 'MEDIUM') return 'text-blue-500';
    return 'text-slate-400';
  };

  return (
    <div className="bg-white border border-[#E4E2DC] rounded-2xl shadow-xs overflow-hidden flex flex-col">
      {/* ClickUp Gantt Header Bar */}
      <div className="p-3.5 sm:px-5 border-b border-[#E4E2DC] bg-[#FAF9F5] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#16181D]">
            <Layers className="w-4 h-4 text-[#2957D6]" />
            <span>Timeline / Gantt View</span>
          </div>

          <div className="h-4 w-px bg-[#E4E2DC]" />

          <span className="text-xs font-medium text-[#5B6070]">
            {timelineDays[0].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} –{' '}
            {timelineDays[timelineDays.length - 1].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom toggle */}
          <div className="flex items-center bg-[#ECEAE3] p-0.5 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => setDaysCount(14)}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                daysCount === 14 ? 'bg-white text-[#16181D] font-semibold shadow-2xs' : 'text-[#5B6070] hover:text-[#16181D]'
              }`}
            >
              2 Weeks
            </button>
            <button
              type="button"
              onClick={() => setDaysCount(21)}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                daysCount === 21 ? 'bg-white text-[#16181D] font-semibold shadow-2xs' : 'text-[#5B6070] hover:text-[#16181D]'
              }`}
            >
              3 Weeks
            </button>
          </div>

          {/* Today button */}
          <button
            type="button"
            onClick={jumpToToday}
            className="px-2.5 py-1 rounded-lg border border-[#D5D2CA] bg-white text-xs font-semibold text-[#16181D] hover:bg-[#F7F6F2] transition cursor-pointer shadow-2xs"
          >
            Today
          </button>

          {/* Nav arrows */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevWindow}
              aria-label="Previous timeline window"
              className="p-1 rounded-lg border border-[#D5D2CA] bg-white text-[#5B6070] hover:text-[#16181D] hover:bg-[#F7F6F2] transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={nextWindow}
              aria-label="Next timeline window"
              className="p-1 rounded-lg border border-[#D5D2CA] bg-white text-[#5B6070] hover:text-[#16181D] hover:bg-[#F7F6F2] transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Gantt Body */}
      <div className="flex min-h-[460px] overflow-x-auto select-none">
        {/* Left Column: Tasks Table (Width 360px) */}
        <div className="w-[340px] sm:w-[380px] shrink-0 border-r border-[#E4E2DC] flex flex-col bg-white z-10 shadow-xs">
          {/* Column Header */}
          <div className="h-11 px-4 border-b border-[#E4E2DC] bg-[#FAF9F5] flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#5B6070]">
            <span>Task & Assignee</span>
            <span>Status</span>
          </div>

          {/* Task Rows */}
          <div className="divide-y divide-[#F0EEE8] flex-1">
            {tasks.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#5B6070]">No tasks in this view</div>
            ) : (
              tasks.map((task) => {
                const statusCfg = CLICKUP_STATUS_CONFIG[task.status] || CLICKUP_STATUS_CONFIG[TaskStatus.TODO];
                const isDone = task.status === TaskStatus.DONE;

                return (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task.id)}
                    className="h-14 px-3 sm:px-4 flex items-center justify-between gap-2 hover:bg-[#FDFCF9] transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Priority Flag */}
                      <Flag className={`w-3.5 h-3.5 shrink-0 ${getPriorityFlagColor(task.priority)}`} />

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-[#5B6070] font-medium shrink-0">
                            {task.referenceNo || 'TSK'}
                          </span>
                          <span
                            className={`text-xs font-medium truncate max-w-[170px] ${
                              isDone ? 'line-through text-[#8C8A84]' : 'text-[#16181D] group-hover:text-[#2957D6]'
                            }`}
                          >
                            {task.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[10px] text-[#5B6070] mt-0.5">
                          <span className="truncate max-w-[100px]">
                            {task.assigneeName ? task.assigneeName.split(' ')[0] : 'Chamber'}
                          </span>
                          {task.dueAt && (
                            <>
                              <span>•</span>
                              <span>{new Date(task.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Status Pill */}
                    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveStatusMenuTaskId(activeStatusMenuTaskId === task.id ? null : task.id)
                        }
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 transition ${statusCfg.badgeClass}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotColor}`} />
                        <span>{statusCfg.label}</span>
                        <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                      </button>

                      {/* Dropdown menu */}
                      {activeStatusMenuTaskId === task.id && (
                        <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-[#E4E2DC] rounded-xl shadow-xl p-1 z-50 text-xs">
                          {Object.values(TaskStatus).map((s) => {
                            const cfg = CLICKUP_STATUS_CONFIG[s];
                            if (!cfg) return null;
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={async () => {
                                  setActiveStatusMenuTaskId(null);
                                  await onUpdateStatus(task.id, s);
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
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Timeline Calendar Grid */}
        <div className="flex-1 min-w-[700px] flex flex-col overflow-x-auto relative">
          {/* Header Row: Days of Week */}
          <div className="h-11 border-b border-[#E4E2DC] bg-[#FAF9F5] flex">
            {timelineDays.map((d) => (
              <div
                key={d.dateStr}
                className={`flex-1 min-w-[50px] border-r border-[#E4E2DC] flex flex-col items-center justify-center text-[10px] ${
                  d.isToday
                    ? 'bg-blue-50/70 text-[#2957D6] font-bold'
                    : d.isWeekend
                    ? 'bg-[#F7F6F2] text-[#8C8A84]'
                    : 'text-[#5B6070]'
                }`}
              >
                <span className="uppercase text-[9px] tracking-wider">{d.dayName}</span>
                <span className={`text-[12px] leading-tight ${d.isToday ? 'font-bold text-[#2957D6]' : 'font-semibold'}`}>
                  {d.dayNum}
                </span>
              </div>
            ))}
          </div>

          {/* Timeline Grid Background & Task Bars */}
          <div className="relative flex-1 divide-y divide-[#F0EEE8]">
            {/* Vertical grid lines */}
            <div className="absolute inset-0 flex pointer-events-none">
              {timelineDays.map((d) => (
                <div
                  key={d.dateStr}
                  className={`flex-1 min-w-[50px] border-r border-[#E4E2DC]/50 h-full ${
                    d.isToday ? 'bg-blue-500/5 border-r-blue-400' : d.isWeekend ? 'bg-slate-500/[0.02]' : ''
                  }`}
                >
                  {d.isToday && (
                    <div className="w-0.5 h-full bg-[#2957D6]/60 mx-auto" />
                  )}
                </div>
              ))}
            </div>

            {/* Task Row Bars */}
            {tasks.map((task) => {
              const span = getTaskBarSpan(task);
              const statusCfg = CLICKUP_STATUS_CONFIG[task.status] || CLICKUP_STATUS_CONFIG[TaskStatus.TODO];

              return (
                <div key={task.id} className="h-14 relative flex items-center px-1">
                  {span ? (
                    <div
                      onClick={() => onSelectTask(task.id)}
                      style={{
                        left: span.left,
                        width: span.width,
                      }}
                      title={`${task.title} (${span.durationDays}d)`}
                      className="absolute h-8 rounded-lg shadow-xs border transition-all cursor-pointer flex items-center px-2.5 overflow-hidden group hover:shadow-md hover:scale-[1.01]"
                    >
                      {/* Bar Background Color */}
                      <div
                        className="absolute inset-0 opacity-90 transition"
                        style={{ backgroundColor: statusCfg.barColor }}
                      />

                      {/* Progress Fill Indicator */}
                      <div
                        className="absolute inset-y-0 left-0 bg-white/20 transition-all"
                        style={{ width: `${span.progress}%` }}
                      />

                      {/* Content inside bar */}
                      <div className="relative z-10 flex items-center justify-between w-full text-white text-[11px] font-semibold gap-2">
                        <span className="truncate drop-shadow-xs">{task.title}</span>
                        <span className="text-[10px] opacity-85 shrink-0 font-mono">
                          {span.durationDays}d
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-[#8C8A84] italic px-4 select-none">
                      Scheduled outside timeline window
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
