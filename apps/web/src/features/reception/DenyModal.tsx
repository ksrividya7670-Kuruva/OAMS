import { type FC, useState } from 'react';
import type { VisitDto } from '@oams/shared';
import { api } from '@/lib/api';
import { X, ShieldAlert, AlertTriangle } from 'lucide-react';

interface DenyModalProps {
  visit: VisitDto | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedVisit: VisitDto) => void;
}

export const DenyModal: FC<DenyModalProps> = ({ visit, isOpen, onClose, onSuccess }) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !visit) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMsg('A valid reason is required to deny entry.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const updated = await api.post<VisitDto>(`/api/v1/visits/${visit.id}/deny`, {
        reason: reason.trim(),
      });
      onSuccess(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to deny visit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-default)] flex items-center justify-between bg-red-500/10">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            <div>
              <h3 className="text-base font-bold text-red-600">Deny Visitor Entry</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Security gate refusal / cancellation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-app)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-default)] text-xs">
            <div className="font-bold text-[var(--text-main)] text-sm">{visit.visitorName}</div>
            <div className="text-[var(--text-muted)]">
              Ref: {visit.referenceNo} • Host: {visit.hostOfficialName || 'Official'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
              Reason for Denial <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Identity verification failed, invalid documents, security advisory, or visitor refusal to comply..."
              required
              className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-2 focus:ring-red-500 resize-none"
            />
          </div>

          <div className="pt-2 border-t border-[var(--border-default)] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-[var(--border-default)] text-[var(--text-main)] hover:bg-[var(--bg-app)] cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer transition-colors shadow-xs"
            >
              <ShieldAlert className="w-4 h-4" />
              {isSubmitting ? 'Recording Denial...' : 'Confirm Denial'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
