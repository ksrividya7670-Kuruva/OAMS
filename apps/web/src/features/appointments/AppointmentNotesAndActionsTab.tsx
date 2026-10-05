import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '@/lib/api';
import type { MeetingNoteDto, ActionItemDto } from '@oams/shared';
import {
  FileText,
  CheckCircle,
  ListTodo,
  Plus,
  CalendarPlus,
  ArrowUpRight,
  Clock,
  User,
  CheckSquare,
  Square,
  Lock,
} from 'lucide-react';
import { CompleteMeetingModal } from '../meeting-day/CompleteMeetingModal';

interface AppointmentNotesAndActionsTabProps {
  appointmentId: string;
  referenceNo: string;
  subject: string;
  status: string;
  officialId: string;
  officialName?: string;
  canManage: boolean;
}

export const AppointmentNotesAndActionsTab: React.FC<AppointmentNotesAndActionsTabProps> = ({
  appointmentId,
  referenceNo,
  subject,
  status,
  officialId,
  officialName: _officialName,
  canManage,
}) => {
  const queryClient = useQueryClient();

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [newActionTitle, setNewActionTitle] = useState('');
  const [newActionDueDate, setNewActionDueDate] = useState('');
  const [isAddingAction, setIsAddingAction] = useState(false);

  // New Note state
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNoteBody, setNewNoteBody] = useState('');
  const [newNoteDecisions, setNewNoteDecisions] = useState('');

  // Fetch meeting notes
  const {
    data: notes = [],
    isLoading: loadingNotes,
    refetch: refetchNotes,
  } = useQuery<MeetingNoteDto[]>({
    queryKey: ['meeting-notes', appointmentId],
    queryFn: () =>
      api.get<MeetingNoteDto[]>(`/api/v1/meetings/appointments/${appointmentId}/notes`),
  });

  // Fetch action items
  const {
    data: actionItems = [],
    isLoading: loadingActions,
    refetch: refetchActions,
  } = useQuery<ActionItemDto[]>({
    queryKey: ['action-items', appointmentId],
    queryFn: () =>
      api.get<ActionItemDto[]>(`/api/v1/meetings/appointments/${appointmentId}/action-items`),
  });

  // Convert action item to task mutation
  const convertMutation = useMutation({
    mutationFn: (actionItemId: string) =>
      api.post(`/api/v1/meetings/action-items/${actionItemId}/convert-to-task`, {
        officialId,
        priority: 'MEDIUM',
      }),
    onSuccess: () => {
      refetchActions();
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] });
    },
  });

  // Toggle action item status mutation
  const toggleActionMutation = useMutation({
    mutationFn: ({ id, currentStatus }: { id: string; currentStatus: string }) =>
      api.patch(`/api/v1/meetings/action-items/${id}`, {
        status: currentStatus === 'DONE' ? 'OPEN' : 'DONE',
      }),
    onSuccess: () => {
      refetchActions();
    },
  });

  // Create action item mutation
  const createActionMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/meetings/appointments/${appointmentId}/action-items`, {
        title: newActionTitle.trim(),
        dueDate: newActionDueDate ? new Date(newActionDueDate).toISOString() : undefined,
      }),
    onSuccess: () => {
      setNewActionTitle('');
      setNewActionDueDate('');
      setIsAddingAction(false);
      refetchActions();
    },
  });

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/meetings/appointments/${appointmentId}/notes`, {
        body: newNoteBody.trim(),
        decisions: newNoteDecisions.trim() || null,
      }),
    onSuccess: () => {
      setNewNoteBody('');
      setNewNoteDecisions('');
      setIsAddingNote(false);
      refetchNotes();
    },
  });

  // Close appointment mutation
  const closeAppointmentMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/meetings/appointments/${appointmentId}/close`, {
        reason: 'All outcomes and actions fulfilled',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
    },
  });

  const canConclude = ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'].includes(status);
  const isCompleted = status === 'COMPLETED';
  const isClosed = status === 'CLOSED';

  return (
    <div className="space-y-8">
      {/* Top Banner & Fast Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-wider">
              Meeting Outcomes & Follow-up Workflow (§16)
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                isClosed
                  ? 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                  : isCompleted
                    ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20'
                    : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
              }`}
            >
              Status: {status}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Record minutes, extract agreed decisions, assign two-way linked tasks, and schedule
            recurring follow-up.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canManage && canConclude && (
            <button
              type="button"
              onClick={() => setShowCompleteModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 cursor-pointer shadow-xs transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              Conclude Meeting
            </button>
          )}

          {canManage && isCompleted && (
            <button
              type="button"
              onClick={() => closeAppointmentMutation.mutate()}
              disabled={closeAppointmentMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              {closeAppointmentMutation.isPending ? 'Closing...' : 'Close Appointment'}
            </button>
          )}

          <Link
            to={`/app/appointments/new?followUpTo=${appointmentId}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-[var(--brand-primary)] bg-[var(--brand-primary)]/10 hover:bg-[var(--brand-primary)]/20 border border-[var(--brand-primary)]/20 cursor-pointer transition-colors"
          >
            <CalendarPlus className="w-4 h-4" />
            Schedule Follow-up
          </Link>
        </div>
      </div>

      {/* Action Items Section (§16, §22 Track 8) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="w-5 h-5 text-blue-500" />
            <h4 className="text-base font-bold text-[var(--text-main)]">
              Action Items ({actionItems.length})
            </h4>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={() => setIsAddingAction(!isAddingAction)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {isAddingAction ? 'Cancel' : 'Add Action Item'}
            </button>
          )}
        </div>

        {/* Add Action Item Inline Form */}
        {isAddingAction && (
          <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-3">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <input
                type="text"
                value={newActionTitle}
                onChange={(e) => setNewActionTitle(e.target.value)}
                placeholder="Action item title or task required..."
                className="flex-1 w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-main)] focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="date"
                value={newActionDueDate}
                onChange={(e) => setNewActionDueDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-main)] focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => createActionMutation.mutate()}
                disabled={!newActionTitle.trim() || createActionMutation.isPending}
                className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Action Items List */}
        {loadingActions ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)] animate-pulse">
            Loading action items...
          </div>
        ) : actionItems.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-[var(--border-default)] text-center space-y-2">
            <ListTodo className="w-8 h-8 text-[var(--text-muted)] mx-auto opacity-50" />
            <p className="text-xs text-[var(--text-muted)]">
              No action items captured yet. Click "Add Action Item" or conclude the meeting to
              assign follow-ups.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-default)] border border-[var(--border-default)] rounded-xl overflow-hidden bg-[var(--bg-surface)] shadow-2xs">
            {actionItems.map((item) => {
              const isDone = item.status === 'DONE';
              const isCancelled = item.status === 'CANCELLED';

              return (
                <div
                  key={item.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                    isDone ? 'bg-emerald-500/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        toggleActionMutation.mutate({
                          id: item.id,
                          currentStatus: item.status,
                        })
                      }
                      className="mt-0.5 text-[var(--text-muted)] hover:text-emerald-600 cursor-pointer transition-colors"
                      title={isDone ? 'Mark as Open' : 'Mark as Done'}
                    >
                      {isDone ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs font-semibold ${
                            isDone
                              ? 'line-through text-[var(--text-muted)]'
                              : 'text-[var(--text-main)]'
                          }`}
                        >
                          {item.title}
                        </span>

                        <span
                          className={`px-2 py-0.2 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isDone
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                              : isCancelled
                                ? 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                                : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                          }`}
                        >
                          {item.status}
                        </span>

                        {item.convertedTaskId && (
                          <Link
                            to={`/todos?search=${item.convertedTaskRef || ''}`}
                            className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-purple-500/10 text-purple-600 border border-purple-500/20 hover:bg-purple-500/20"
                            title="Open linked official task in Todo management"
                          >
                            <span>Task: {item.convertedTaskRef || 'Linked'}</span>
                            <ArrowUpRight className="w-2.5 h-2.5" />
                          </Link>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-[11px] text-[var(--text-muted)]">
                        {item.dueDate && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-[var(--brand-primary)]" />
                            Due: {new Date(item.dueDate).toLocaleDateString()}
                          </span>
                        )}
                        {item.ownerName && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            Owner: {item.ownerName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {!item.convertedTaskId && !isDone && (
                      <button
                        type="button"
                        onClick={() => convertMutation.mutate(item.id)}
                        disabled={convertMutation.isPending}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-subtle)] hover:bg-[var(--border-default)] text-[var(--text-main)] border border-[var(--border-default)] cursor-pointer transition-colors shadow-2xs"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5 text-purple-500" />
                        Convert to Task
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Meeting Minutes & Notes Section */}
      <div className="space-y-4 border-t border-[var(--border-default)] pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-500" />
            <h4 className="text-base font-bold text-[var(--text-main)]">
              Meeting Notes & Decisions ({notes.length})
            </h4>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={() => setIsAddingNote(!isAddingNote)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {isAddingNote ? 'Cancel' : 'Add Note Entry'}
            </button>
          )}
        </div>

        {/* Add Note Form */}
        {isAddingNote && (
          <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-500/5 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                Notes (Markdown Supported)
              </label>
              <textarea
                value={newNoteBody}
                onChange={(e) => setNewNoteBody(e.target.value)}
                rows={4}
                placeholder="Discussion summary, discussion topics, recommendations..."
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-main)] font-mono focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                Agreed Decisions (Optional)
              </label>
              <input
                type="text"
                value={newNoteDecisions}
                onChange={(e) => setNewNoteDecisions(e.target.value)}
                placeholder="Agreed key resolutions..."
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-main)] focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => createNoteMutation.mutate()}
                disabled={!newNoteBody.trim() || createNoteMutation.isPending}
                className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 cursor-pointer transition-colors"
              >
                Save Note Entry
              </button>
            </div>
          </div>
        )}

        {/* Notes List */}
        {loadingNotes ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)] animate-pulse">
            Loading notes...
          </div>
        ) : notes.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-[var(--border-default)] text-center space-y-2">
            <FileText className="w-8 h-8 text-[var(--text-muted)] mx-auto opacity-50" />
            <p className="text-xs text-[var(--text-muted)]">
              No meeting notes captured yet. Notes are created automatically when concluding the
              meeting.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {notes.map((n) => (
              <div
                key={n.id}
                className="p-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-3 shadow-2xs"
              >
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)] border-b border-[var(--border-default)] pb-2.5">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-purple-500" />
                    <span>
                      Recorded by:{' '}
                      <strong className="text-[var(--text-main)]">{n.authorName || 'Staff'}</strong>
                    </span>
                  </div>
                  <span className="font-mono text-[11px]">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="text-xs text-[var(--text-main)] whitespace-pre-wrap font-sans leading-relaxed">
                  {n.body}
                </div>

                {n.decisions && (
                  <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                    <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      Agreed Decision:
                    </div>
                    <div className="text-xs text-[var(--text-main)] font-medium">{n.decisions}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conclude Meeting Modal */}
      {showCompleteModal && (
        <CompleteMeetingModal
          appointmentId={appointmentId}
          referenceNo={referenceNo}
          subject={subject}
          isOpen={true}
          onClose={() => setShowCompleteModal(false)}
          onSuccess={() => {
            refetchNotes();
            refetchActions();
            queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
          }}
        />
      )}
    </div>
  );
};
