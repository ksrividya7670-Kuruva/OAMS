import type { FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '@/lib/api';
import type { TaskSummaryDto } from '@oams/shared';
import { CheckSquare, ArrowRight } from 'lucide-react';

export const TodoWidget: FC = () => {
  const { data: summary, isLoading } = useQuery<TaskSummaryDto>({
    queryKey: ['task-summary'],
    queryFn: () => api.get<TaskSummaryDto>('/api/v1/tasks/summary'),
  });

  return (
    <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--text-main)]">To-Do Overview</h2>
            <p className="text-xs text-[var(--text-muted)]">Official tasks and delegated actions</p>
          </div>
        </div>

        <Link
          to="/app/todo"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-primary)] hover:underline"
        >
          View all tasks <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-xs text-[var(--text-muted)] animate-pulse">
          Loading tasks overview...
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Link
            to="/app/todo"
            className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] hover:border-rose-500/50 transition-colors"
          >
            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 block">
              Overdue
            </span>
            <span className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1 block">
              {summary.overdueCount}
            </span>
          </Link>

          <Link
            to="/app/todo"
            className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] hover:border-amber-500/50 transition-colors"
          >
            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 block">
              Today
            </span>
            <span className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1 block">
              {summary.todayCount}
            </span>
          </Link>

          <Link
            to="/app/todo"
            className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] hover:border-blue-500/50 transition-colors"
          >
            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 block">
              Upcoming (7d)
            </span>
            <span className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1 block">
              {summary.upcomingCount}
            </span>
          </Link>

          <Link
            to="/app/todo"
            className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] hover:border-orange-500/50 transition-colors"
          >
            <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 block">
              High Priority
            </span>
            <span className="text-xl font-bold text-orange-600 dark:text-orange-400 mt-1 block">
              {summary.highPriorityCount}
            </span>
          </Link>

          <Link
            to="/app/todo"
            className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] hover:border-emerald-500/50 transition-colors"
          >
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block">
              Done Today
            </span>
            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 block">
              {summary.doneTodayCount}
            </span>
          </Link>
        </div>
      ) : (
        <div className="text-xs text-[var(--text-muted)]">No tasks available</div>
      )}
    </div>
  );
};
