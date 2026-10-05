import { type FC, useState } from 'react';
import { type TaskListItemDto, type Priority, TaskStatus } from '@oams/shared';
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import { PRIORITY_COLORS } from './labels';

interface TodoCalendarViewProps {
  tasks: TaskListItemDto[];
  onSelectTask: (id: string) => void;
  onRescheduleDue: (taskId: string, newDueDate: string) => Promise<void>;
}

export const TodoCalendarView: FC<TodoCalendarViewProps> = ({
  tasks,
  onSelectTask,
  onRescheduleDue,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = () => setCurrentDate(new Date());

  const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

  // Previous month padding
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = month === 0 ? 12 : month;
    const y = month === 0 ? year - 1 : year;
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ dateStr, dayNum: d, isCurrentMonth: false });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ dateStr, dayNum: d, isCurrentMonth: true });
  }

  // Next month padding to fill 35 or 42 cells
  const remaining = (7 - (days.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const m = month + 2 > 12 ? 1 : month + 2;
    const y = month + 2 > 12 ? year + 1 : year;
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ dateStr, dayNum: d, isCurrentMonth: false });
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggedTaskId(id);
  };

  const handleDropOnDay = async (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (!taskId) return;

    // Reschedule due date to target date at 17:00
    const newDueDate = new Date(`${targetDateStr}T17:00:00`).toISOString();
    await onRescheduleDue(taskId, newDueDate);
    setDraggedTaskId(null);
  };

  const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-xs">
      {/* Month Navigation Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold text-[var(--text-main)]">
            {currentDate.toLocaleDateString([], { month: 'long', year: 'numeric' })}
          </h3>
          <button
            type="button"
            onClick={today}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[var(--bg-subtle)] text-[var(--text-main)] hover:bg-[var(--border-default)] cursor-pointer"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 rounded-lg border border-[var(--border-default)] hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="p-1.5 rounded-lg border border-[var(--border-default)] hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-px mb-1 text-center">
        {weekDayNames.map((d) => (
          <div
            key={d}
            className="py-1 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dayTasks = tasks.filter((t) => {
            if (!t.dueAt) return false;
            return t.dueAt.substring(0, 10) === day.dateStr;
          });

          const isToday = new Date().toISOString().substring(0, 10) === day.dateStr;

          return (
            <div
              key={day.dateStr}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDropOnDay(e, day.dateStr)}
              className={`min-h-[100px] p-1.5 rounded-xl border border-[var(--border-default)] flex flex-col transition-colors ${
                day.isCurrentMonth
                  ? isToday
                    ? 'bg-blue-500/5 border-blue-500/30'
                    : 'bg-[var(--bg-subtle)]/40 hover:bg-[var(--bg-subtle)]'
                  : 'bg-[var(--bg-app)]/50 opacity-40'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text-muted)] mb-1">
                <span className={isToday ? 'text-blue-600 dark:text-blue-400 font-extrabold' : ''}>
                  {day.dayNum}
                </span>
                {dayTasks.length > 0 && (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {dayTasks.length} {dayTasks.length === 1 ? 'task' : 'tasks'}
                  </span>
                )}
              </div>

              {/* Task Chips */}
              <div className="space-y-1 flex-1 overflow-y-auto max-h-[85px]">
                {dayTasks.map((t) => {
                  const isDone = t.status === TaskStatus.DONE;

                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, t.id)}
                      onClick={() => onSelectTask(t.id)}
                      className={`px-1.5 py-1 rounded text-[11px] font-medium border flex items-center justify-between gap-1 cursor-grab shadow-2xs ${
                        isDone
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400 line-through opacity-70'
                          : t.isOverdue
                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400'
                            : 'bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-main)]'
                      }`}
                    >
                      <span className="truncate">{t.title}</span>
                      <Flag
                        className={`w-2.5 h-2.5 shrink-0 ${PRIORITY_COLORS[t.priority as Priority]?.flag}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
