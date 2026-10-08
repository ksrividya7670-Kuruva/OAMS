import { type FC, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthContext';
import { type TaskDetailDto, TaskStatus, Priority, TaskCategory, RoleCode } from '@oams/shared';
import {
  X,
  Play,
  CheckCircle2,
  ShieldCheck,
  Ban,
  RotateCcw,
  Trash2,
  Plus,
  Send,
  Bell,
  Clock,
  Calendar,
  Lock,
  Flag,
  User as UserIcon,
  Tag,
  CheckSquare,
} from 'lucide-react';
import {
  TASK_CATEGORY_LABELS,
  TASK_STATUS_LABELS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
} from './labels';
import { BlockReasonModal } from './BlockReasonModal';

interface TaskDetailDrawerProps {
  taskId: string | null;
  onClose: () => void;
}

export const TaskDetailDrawer: FC<TaskDetailDrawerProps> = ({ taskId, onClose }) => {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();

  const [newChecklistText, setNewChecklistText] = useState('');
  const [newCommentBody, setNewCommentBody] = useState('');
  const [newReminderTime, setNewReminderTime] = useState('');
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  // Fetch full task details
  const { data: task, isLoading } = useQuery<TaskDetailDto>({
    queryKey: ['task', taskId],
    queryFn: () => api.get<TaskDetailDto>(`/api/v1/tasks/${taskId}`),
    enabled: !!taskId,
  });

  // Action mutations
  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    queryClient.invalidateQueries({ queryKey: ['task-summary'] });
  };

  const startMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/tasks/${taskId}/start`),
    onSuccess: invalidateQueries,
  });

  const completeMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/tasks/${taskId}/complete`),
    onSuccess: invalidateQueries,
  });

  const verifyMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/tasks/${taskId}/verify`),
    onSuccess: invalidateQueries,
  });

  const blockMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/api/v1/tasks/${taskId}/block`, { reason }),
    onSuccess: invalidateQueries,
  });

  const unblockMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/tasks/${taskId}/unblock`),
    onSuccess: invalidateQueries,
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/api/v1/tasks/${taskId}/cancel`, { reason }),
    onSuccess: invalidateQueries,
  });

  const reopenMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/tasks/${taskId}/reopen`),
    onSuccess: invalidateQueries,
  });

  const addChecklistMutation = useMutation({
    mutationFn: (text: string) => api.post(`/api/v1/tasks/${taskId}/checklist`, { text }),
    onSuccess: () => {
      setNewChecklistText('');
      invalidateQueries();
    },
  });

  const toggleChecklistMutation = useMutation({
    mutationFn: ({ itemId, done }: { itemId: string; done: boolean }) =>
      api.patch(`/api/v1/tasks/${taskId}/checklist/${itemId}`, { done }),
    onSuccess: invalidateQueries,
  });

  const deleteChecklistMutation = useMutation({
    mutationFn: (itemId: string) => api.del(`/api/v1/tasks/${taskId}/checklist/${itemId}`),
    onSuccess: invalidateQueries,
  });

  const addCommentMutation = useMutation({
    mutationFn: (body: string) => api.post(`/api/v1/tasks/${taskId}/comments`, { body }),
    onSuccess: () => {
      setNewCommentBody('');
      invalidateQueries();
    },
  });

  const addReminderMutation = useMutation({
    mutationFn: (remindAt: string) => api.post(`/api/v1/tasks/${taskId}/reminders`, { remindAt }),
    onSuccess: () => {
      setNewReminderTime('');
      invalidateQueries();
    },
  });

  const deleteReminderMutation = useMutation({
    mutationFn: (reminderId: string) => api.del(`/api/v1/tasks/${taskId}/reminders/${reminderId}`),
    onSuccess: invalidateQueries,
  });

  if (!taskId) return null;

  const isOfficialUser = hasRole(RoleCode.OFFICIAL);
  const checklistItems = task?.checklistItems || (task as any)?.checklist || [];
  const checklistTotal = checklistItems.length;
  const checklistDone = checklistItems.filter((c: any) => c.done).length;
  const checklistPercent =
    checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs">
        <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
          <div className="w-screen max-w-2xl bg-[var(--bg-surface)] border-l border-[var(--border-default)] shadow-2xl flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border-default)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                  {task?.referenceNo || (task?.id ? `TSK-${String(task.id).toUpperCase().replace('TSK-', '')}` : 'TSK-2026-001')}
                </span>
                {task?.visibility === 'PERSONAL' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
                    <Lock className="w-3 h-3" /> Personal
                  </span>
                )}
                {task?.awaitingVerification && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                    <ShieldCheck className="w-3 h-3" /> Awaiting Verification
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            {isLoading || !task ? (
              <div className="flex-1 p-8 text-center text-sm text-[var(--text-muted)]">
                Loading task details...
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Title & Status */}
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-xl font-bold text-[var(--text-main)] leading-snug">
                      {task.title}
                    </h2>
                    <span
                      className={`px-2.5 py-1 text-xs font-semibold rounded-full shrink-0 ${
                        task.status === TaskStatus.DONE
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : task.status === TaskStatus.BLOCKED
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            : task.status === TaskStatus.IN_PROGRESS
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                              : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {TASK_STATUS_LABELS[task.status as TaskStatus]}
                    </span>
                  </div>

                  {(task.blockedReason || (task as any).blockReason) && (
                    <div className="mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-400">
                      <strong>Blocked reason:</strong> {task.blockedReason || (task as any).blockReason}
                    </div>
                  )}

                  {task.description && (
                    <div className="mt-3 text-sm text-[var(--text-muted)] whitespace-pre-wrap leading-relaxed">
                      {task.description}
                    </div>
                  )}
                </div>

                {/* Meta Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-default)] text-xs">
                  <div>
                    <span className="text-[var(--text-muted)] block mb-1 flex items-center gap-1">
                      <Flag className="w-3 h-3" /> Priority
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        PRIORITY_COLORS[task.priority as Priority]?.text
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          PRIORITY_COLORS[task.priority as Priority]?.dot
                        }`}
                      />
                      {PRIORITY_LABELS[task.priority as Priority]}
                    </span>
                  </div>

                  <div>
                    <span className="text-[var(--text-muted)] block mb-1 flex items-center gap-1">
                      <Tag className="w-3 h-3" /> Category
                    </span>
                    <span className="font-medium text-[var(--text-main)]">
                      {TASK_CATEGORY_LABELS[task.category as TaskCategory] || task.category}
                    </span>
                  </div>

                  <div>
                    <span className="text-[var(--text-muted)] block mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Due Date
                    </span>
                    <span
                      className={`font-medium ${
                        task.isOverdue
                          ? 'text-rose-600 dark:text-rose-400 font-bold'
                          : 'text-[var(--text-main)]'
                      }`}
                    >
                      {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : 'None'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[var(--text-muted)] block mb-1 flex items-center gap-1">
                      <UserIcon className="w-3 h-3" /> Assignee
                    </span>
                    <span className="font-medium text-[var(--text-main)] truncate block">
                      {task.assigneeName || 'Unassigned'}
                    </span>
                  </div>
                </div>

                {/* Checklist Section (§12.3) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                      <CheckSquare className="w-3.5 h-3.5" /> Checklist ({checklistDone}/
                      {checklistTotal})
                    </h3>
                    <span className="text-xs font-semibold text-[var(--brand-primary)]">
                      {checklistPercent}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1.5 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--brand-primary)] transition-all duration-300"
                      style={{ width: `${checklistPercent}%` }}
                    />
                  </div>

                  {/* Items list */}
                  <div className="space-y-1.5">
                    {checklistItems.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-[var(--bg-subtle)] group text-xs"
                      >
                        <label className="flex items-center gap-2.5 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={(e) =>
                              toggleChecklistMutation.mutate({
                                itemId: item.id,
                                done: e.target.checked,
                              })
                            }
                            className="rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                          />
                          <span
                            className={
                              item.done
                                ? 'line-through text-[var(--text-muted)]'
                                : 'text-[var(--text-main)] font-medium'
                            }
                          >
                            {item.text}
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => deleteChecklistMutation.mutate(item.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--text-muted)] hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add checklist input */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (newChecklistText.trim()) {
                        addChecklistMutation.mutate(newChecklistText.trim());
                      }
                    }}
                    className="flex items-center gap-2 mt-2"
                  >
                    <input
                      type="text"
                      placeholder="Add sub-task..."
                      value={newChecklistText}
                      onChange={(e) => setNewChecklistText(e.target.value)}
                      className="flex-1 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-1.5 text-[var(--text-main)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    />
                    <button
                      type="submit"
                      disabled={!newChecklistText.trim()}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-subtle)] text-[var(--text-main)] hover:bg-[var(--border-default)] cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>

                {/* Reminders Section (§12.3) */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5" /> Reminders
                  </h3>

                  <div className="space-y-1.5">
                    {task.reminders && task.reminders.length > 0 ? (
                      task.reminders.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-subtle)] text-xs"
                        >
                          <div className="flex items-center gap-2 text-[var(--text-main)]">
                            <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            <span>{new Date(r.remindAt).toLocaleString()}</span>
                            {r.sentAt && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                (Sent)
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteReminderMutation.mutate(r.id)}
                            className="p-1 text-[var(--text-muted)] hover:text-rose-500 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-[var(--text-muted)]">No reminders set</p>
                    )}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (newReminderTime) {
                        addReminderMutation.mutate(new Date(newReminderTime).toISOString());
                      }
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="datetime-local"
                      value={newReminderTime}
                      onChange={(e) => setNewReminderTime(e.target.value)}
                      className="text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-2.5 py-1 text-[var(--text-main)]"
                    />
                    <button
                      type="submit"
                      disabled={!newReminderTime}
                      className="px-3 py-1 text-xs font-semibold rounded-lg bg-[var(--bg-subtle)] text-[var(--text-main)] hover:bg-[var(--border-default)] cursor-pointer disabled:opacity-50"
                    >
                      Set Reminder
                    </button>
                  </form>
                </div>

                {/* Comments Section (§12.3) */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                    Comments ({task.comments?.length || 0})
                  </h3>

                  <div className="space-y-2">
                    {task.comments?.map((comment) => (
                      <div
                        key={comment.id}
                        className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-default)] space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                          <span className="font-semibold text-[var(--text-main)]">
                            {comment.authorName || 'User'}
                          </span>
                          <span>
                            {new Date(comment.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-main)] whitespace-pre-wrap">
                          {comment.body || (comment as any).text || ''}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Add comment box */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (newCommentBody.trim()) {
                        addCommentMutation.mutate(newCommentBody.trim());
                      }
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      placeholder="Write a comment..."
                      value={newCommentBody}
                      onChange={(e) => setNewCommentBody(e.target.value)}
                      className="flex-1 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-[var(--text-main)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    />
                    <button
                      type="submit"
                      disabled={!newCommentBody.trim()}
                      className="p-2 text-xs font-semibold rounded-lg bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)] cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Footer Action Buttons (§12.2) */}
            {task && (
              <div className="p-4 border-t border-[var(--border-default)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {task.status === TaskStatus.TODO && (
                    <button
                      type="button"
                      onClick={() => startMutation.mutate()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" /> Start Task
                    </button>
                  )}

                  {task.status !== TaskStatus.DONE && task.status !== TaskStatus.CANCELLED && (
                    <button
                      type="button"
                      onClick={() => completeMutation.mutate()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark Done
                    </button>
                  )}

                  {task.awaitingVerification && isOfficialUser && (
                    <button
                      type="button"
                      onClick={() => verifyMutation.mutate()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> Verify Completion
                    </button>
                  )}

                  {task.status === TaskStatus.IN_PROGRESS && (
                    <button
                      type="button"
                      onClick={() => setBlockModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" /> Block
                    </button>
                  )}

                  {task.status === TaskStatus.BLOCKED && (
                    <button
                      type="button"
                      onClick={() => unblockMutation.mutate()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" /> Unblock
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {(task.status === TaskStatus.DONE || task.status === TaskStatus.CANCELLED) && (
                    <button
                      type="button"
                      onClick={() => reopenMutation.mutate()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border-default)] text-[var(--text-main)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reopen
                    </button>
                  )}

                  {task.status !== TaskStatus.CANCELLED && task.status !== TaskStatus.DONE && (
                    <button
                      type="button"
                      onClick={() => setCancelModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Block reason modal */}
      <BlockReasonModal
        isOpen={blockModalOpen}
        title="Block Task"
        description="Explain what is currently blocking progress on this task."
        confirmLabel="Confirm Block"
        onConfirm={async (reason) => {
          await blockMutation.mutateAsync(reason);
        }}
        onClose={() => setBlockModalOpen(false)}
      />

      {/* Cancel reason modal */}
      <BlockReasonModal
        isOpen={cancelModalOpen}
        title="Cancel Task"
        description="Provide a reason for cancelling this task."
        confirmLabel="Confirm Cancellation"
        isDestructive
        onConfirm={async (reason) => {
          await cancelMutation.mutateAsync(reason);
        }}
        onClose={() => setCancelModalOpen(false)}
      />
    </>
  );
};
