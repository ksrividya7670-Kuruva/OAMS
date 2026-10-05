import { useState, FC } from 'react';
import {
  ShieldAlert,
  FileDown,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Lock,
  UserCheck,
  RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api';

export const PrivacyRequestsPage: FC = () => {
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [exportData, setExportData] = useState<any | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Erase confirmation modal state
  const [showEraseModal, setShowEraseModal] = useState(false);
  const [eraseReason, setEraseReason] = useState('');
  const [erasing, setErasing] = useState(false);

  const handleExport = async () => {
    if (!email && !userId) {
      setActionMessage({ type: 'error', text: 'Please enter a valid email address or User ID' });
      return;
    }
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await api.post<any>('/api/v1/privacy/export', {
        email: email || undefined,
        userId: userId || undefined,
      });
      setExportData(res);
      setActionMessage({
        type: 'success',
        text: `Data Principal package successfully compiled. Found ${res.appointments?.length || 0} appointments and ${res.visits?.length || 0} visits.`,
      });

      // Trigger file download
      const jsonStr = JSON.stringify(res, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dpdp_export_${email || userId}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to export data principal package',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmErase = async () => {
    if (!eraseReason || eraseReason.trim().length < 3) {
      alert('A valid reason (minimum 3 characters) is required for compliance audit logging.');
      return;
    }

    setErasing(true);
    try {
      const res = await api.post<{ message?: string }>('/api/v1/privacy/erase', {
        email: email || undefined,
        userId: userId || undefined,
        reason: eraseReason,
      });
      setShowEraseModal(false);
      setEraseReason('');
      setExportData(null);
      setActionMessage({
        type: 'success',
        text:
          res.message ||
          'Personal data anonymized successfully while preserving immutable audit logs.',
      });
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to erase data principal records',
      });
    } finally {
      setErasing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-[var(--border-default)]">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2">
          <Lock className="w-6 h-6 text-[var(--brand-primary)]" />
          Data Privacy & DPDP Act 2023 Console
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Manage Data Principal rights: Right to Access/Portability (Export) and Right to
          Correction/Erasure (§17.6).
        </p>
      </div>

      {/* Statutory Guidance Banner */}
      <div className="p-4 rounded-xl border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/5 text-xs text-[var(--text-main)] space-y-2">
        <div className="font-semibold flex items-center gap-2 text-[var(--brand-primary)]">
          <UserCheck className="w-4 h-4" />
          Compliance Invariant (§17.6 & §22 Track 10)
        </div>
        <p className="text-[var(--text-muted)]">
          Under the Digital Personal Data Protection Act 2023, data principals have the right to
          obtain a summary of their personal data and request erasure. Erasing anonymizes all
          personal identifiers (names, contacts, government ID digits, photos) across appointments
          and visitor logs, while{' '}
          <strong>strictly preserving immutable audit row IDs and SHA-256 hash chains</strong> for
          regulatory integrity.
        </p>
      </div>

      {/* Status Alert */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 text-xs ${
            actionMessage.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
          )}
          <span className="font-medium">{actionMessage.text}</span>
        </div>
      )}

      {/* Lookup & Operations Box */}
      <div className="p-6 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs space-y-5">
        <h2 className="text-base font-bold text-[var(--text-main)]">Look Up Data Principal</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
              Data Principal Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. citizen@example.com"
              className="w-full bg-[var(--bg-subtle)] text-[var(--text-main)] border border-[var(--border-default)] px-3 py-2 rounded-lg text-xs outline-none focus:border-[var(--brand-primary)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
              Or User UUID (Optional)
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
              className="w-full bg-[var(--bg-subtle)] text-[var(--text-main)] border border-[var(--border-default)] px-3 py-2 rounded-lg text-xs outline-none focus:border-[var(--brand-primary)]"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[var(--border-default)]">
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || (!email && !userId)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)] transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            <FileDown className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Compiling Package...' : 'Export Data Package (JSON)'}
          </button>

          <button
            type="button"
            onClick={() => setShowEraseModal(true)}
            disabled={!email && !userId}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Erase Personal Data (Right to be Forgotten)
          </button>
        </div>
      </div>

      {/* Export Preview Area */}
      {exportData && (
        <div className="p-6 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[var(--text-main)]">Export Package Preview</h2>
            <span className="text-xs text-[var(--text-muted)]">
              Exported: {new Date(exportData.exportedAt).toLocaleString()}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-lg bg-[var(--bg-subtle)]">
              <span className="text-xs text-[var(--text-muted)] block">Appointments</span>
              <span className="text-lg font-bold text-[var(--text-main)]">
                {exportData.appointments?.length || 0}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-subtle)]">
              <span className="text-xs text-[var(--text-muted)] block">Visits</span>
              <span className="text-lg font-bold text-[var(--text-main)]">
                {exportData.visits?.length || 0}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-subtle)]">
              <span className="text-xs text-[var(--text-muted)] block">Notifications</span>
              <span className="text-lg font-bold text-[var(--text-main)]">
                {exportData.notifications?.length || 0}
              </span>
            </div>
          </div>

          <pre className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-default)] text-[11px] font-mono text-[var(--text-main)] overflow-x-auto max-h-60">
            {JSON.stringify(exportData, null, 2)}
          </pre>
        </div>
      )}

      {/* Erasure Confirmation Modal */}
      {showEraseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-[var(--bg-surface)] shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 rounded-full bg-red-500/10">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-main)]">
                  Confirm DPDP Data Erasure
                </h3>
                <p className="text-xs text-red-600 dark:text-red-400">
                  This action is irreversible and legally recorded.
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              All personal identifiers belonging to <strong>{email || userId}</strong> will be
              anonymized across appointment bookings and reception visitor registries. Their
              registered user profile will be disabled. Audit row IDs and timestamps will be
              preserved for statutory compliance.
            </p>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                Legal Reason / Statutory Basis <span className="text-red-500">*</span>
              </label>
              <textarea
                value={eraseReason}
                onChange={(e) => setEraseReason(e.target.value)}
                placeholder="e.g. Formal request under DPDP Act 2023 Section 12 / Right to Erasure"
                rows={3}
                className="w-full bg-[var(--bg-subtle)] text-[var(--text-main)] border border-[var(--border-default)] p-2.5 rounded-lg text-xs outline-none focus:border-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-default)]">
              <button
                type="button"
                onClick={() => setShowEraseModal(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmErase}
                disabled={erasing || eraseReason.trim().length < 3}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {erasing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Anonymizing Records...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" /> Execute Anonymization
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
