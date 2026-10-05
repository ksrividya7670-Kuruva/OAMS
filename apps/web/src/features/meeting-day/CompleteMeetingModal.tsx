import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '@/lib/api';
import { X, CheckCircle, FileText, ListTodo, Plus, Trash2, CalendarPlus } from 'lucide-react';

interface CompleteMeetingModalProps {
  appointmentId: string;
  referenceNo: string;
  subject: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ActionItemDraft {
  title: string;
  ownerUserId?: string;
  dueDate?: string;
}

export const CompleteMeetingModal: React.FC<CompleteMeetingModalProps> = ({
  appointmentId,
  referenceNo,
  subject,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [notes, setNotes] = useState('');
  const [decisions, setDecisions] = useState('');
  const [scheduleFollowUp, setScheduleFollowUp] = useState(false);
  const [actionItems, setActionItems] = useState<ActionItemDraft[]>([
    { title: '', ownerUserId: '', dueDate: '' },
  ]);
  const [previewMode, setPreviewMode] = useState(false);

  const completeMutation = useMutation({
    mutationFn: async () => {
      const filteredActionItems = actionItems
        .filter((ai) => ai.title.trim().length > 0)
        .map((ai) => ({
          title: ai.title.trim(),
          ownerUserId: ai.ownerUserId || undefined,
          dueDate: ai.dueDate ? new Date(ai.dueDate).toISOString() : undefined,
        }));

      return api.post<{
        appointment: any;
        note: any;
        actionItems: any[];
        followUpRequested: boolean;
      }>(`/api/v1/meetings/appointments/${appointmentId}/complete`, {
        notes: notes.trim() || 'Meeting concluded.',
        decisions: decisions.trim() || null,
        actionItems: filteredActionItems,
        scheduleFollowUp,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['today-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['meeting-notes', appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['action-items', appointmentId] });

      onClose();
      if (onSuccess) onSuccess();

      if (data.followUpRequested) {
        navigate(`/app/appointments/new?followUpTo=${appointmentId}`);
      }
    },
  });

  if (!isOpen) return null;

  const handleAddActionItem = () => {
    setActionItems([...actionItems, { title: '', ownerUserId: '', dueDate: '' }]);
  };

  const handleRemoveActionItem = (index: number) => {
    setActionItems(actionItems.filter((_, i) => i !== index));
  };

  const handleActionItemChange = (index: number, field: keyof ActionItemDraft, value: string) => {
    const updated = [...actionItems];
    updated[index] = { ...updated[index], [field]: value };
    setActionItems(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)] bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 border border-purple-500/20">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[var(--text-main)]">
                Conclude Meeting & Capture Outcomes
              </h2>
              <p className="text-xs text-[var(--text-muted)] font-mono">
                {referenceNo} • {subject}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Notes Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                <FileText className="w-4 h-4 text-purple-500" />
                Meeting Minutes & Notes (Markdown)
              </label>
              <button
                type="button"
                onClick={() => setPreviewMode(!previewMode)}
                className="text-xs font-semibold text-[var(--brand-primary)] hover:underline cursor-pointer"
              >
                {previewMode ? 'Edit Markdown' : 'Preview'}
              </button>
            </div>

            {previewMode ? (
              <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] min-h-[140px] text-xs text-[var(--text-main)] whitespace-pre-wrap font-sans">
                {notes.trim() || (
                  <span className="italic text-[var(--text-muted)]">No notes entered yet.</span>
                )}
              </div>
            ) : (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                placeholder="## Discussion Summary&#10;&#10;- Key points discussed...&#10;- Deliverables agreed..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-main)] text-[var(--text-main)] text-xs font-mono placeholder:text-[var(--text-muted)] focus:outline-hidden focus:ring-2 focus:ring-purple-500 shadow-2xs"
              />
            )}
          </div>

          {/* Agreed Decisions Section */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              Agreed Decisions & Resolutions
            </label>
            <textarea
              value={decisions}
              onChange={(e) => setDecisions(e.target.value)}
              rows={3}
              placeholder="e.g. Approved proposal v2.1 with revised budget allocation..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-main)] text-[var(--text-main)] text-xs placeholder:text-[var(--text-muted)] focus:outline-hidden focus:ring-2 focus:ring-emerald-500 shadow-2xs"
            />
          </div>

          {/* Action Items Builder (§16, §22 Track 8) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                <ListTodo className="w-4 h-4 text-blue-500" />
                Action Items ({actionItems.filter((i) => i.title.trim()).length})
              </label>
              <button
                type="button"
                onClick={handleAddActionItem}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Action Item
              </button>
            </div>

            <div className="space-y-2">
              {actionItems.map((item, index) => (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row items-center gap-2 p-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)]"
                >
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) => handleActionItemChange(index, 'title', e.target.value)}
                    placeholder="Action item title or task description..."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-main)] text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <input
                      type="date"
                      value={item.dueDate || ''}
                      onChange={(e) => handleActionItemChange(index, 'dueDate', e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-main)] text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      title="Due Date"
                    />

                    <button
                      type="button"
                      onClick={() => handleRemoveActionItem(index)}
                      className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors"
                      title="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] italic">
              Action items can be converted to official tasks directly from the appointment dossier
              with bidirectional completion tracking.
            </p>
          </div>

          {/* Schedule Follow-up Option */}
          <div className="p-4 rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/5 flex items-start gap-3">
            <input
              type="checkbox"
              id="scheduleFollowUp"
              checked={scheduleFollowUp}
              onChange={(e) => setScheduleFollowUp(e.target.checked)}
              className="mt-1 h-4 w-4 rounded-sm border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] cursor-pointer"
            />
            <label
              htmlFor="scheduleFollowUp"
              className="text-xs text-[var(--text-main)] cursor-pointer"
            >
              <strong className="font-bold flex items-center gap-1.5">
                <CalendarPlus className="w-4 h-4 text-[var(--brand-primary)]" />
                Schedule Follow-up Appointment Immediately
              </strong>
              <span className="text-[var(--text-muted)] block mt-0.5">
                Carries over host official, attendees, and linked reference into the appointment
                booking wizard.
              </span>
            </label>
          </div>

          {completeMutation.isError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 font-semibold">
              {(completeMutation.error as any)?.message || 'Failed to complete meeting'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-default)] bg-[var(--bg-subtle)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] border border-[var(--border-default)] cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 cursor-pointer shadow-md transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            {completeMutation.isPending ? 'Concluding...' : 'Conclude & Save Outcomes'}
          </button>
        </div>
      </div>
    </div>
  );
};
