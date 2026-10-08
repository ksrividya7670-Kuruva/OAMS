import { type FC, useState, useEffect } from 'react';
import type { VisitDto } from '@oams/shared';
import { api } from '@/lib/api';
import { X, CheckCircle2, ShieldCheck, AlertCircle, Phone, Mail, Users } from 'lucide-react';

interface CheckInModalProps {
  visit: VisitDto | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedVisit: VisitDto, shouldPrintBadge: boolean) => void;
}

const ID_TYPES = [
  { value: 'AADHAAR', label: 'Aadhaar Card' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'VOTER_ID', label: 'Voter ID' },
  { value: 'DRIVING_LICENSE', label: 'Driving License' },
  { value: 'GOVT_ID', label: 'Government Photo ID' },
  { value: 'OFFICE_ID', label: 'Corporate / Office ID' },
  { value: 'OTHER', label: 'Other Document' },
];

export const CheckInModal: FC<CheckInModalProps> = ({ visit, isOpen, onClose, onSuccess }) => {
  const [badgeNo, setBadgeNo] = useState('');
  const [idType, setIdType] = useState('AADHAAR');
  const [idLast4, setIdLast4] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [printBadgeImmediate, setPrintBadgeImmediate] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visit) {
      // Auto-suggest next badge number or use existing if any
      const randomSuggested = `B-${Math.floor(100 + Math.random() * 900)}`;
      setBadgeNo(visit.badgeNo || randomSuggested);
      setIdType(visit.idType || 'AADHAAR');
      setIdLast4(visit.idLast4 || '');
      setVehicleNo(visit.vehicleNo || '');
      setErrorMsg(null);
    }
  }, [visit]);

  if (!isOpen || !visit) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!badgeNo.trim()) {
      setErrorMsg('Badge number is required to complete check-in.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const updated = await api.post<VisitDto>(`/api/v1/visits/${visit.id}/check-in`, {
        badgeNo: badgeNo.trim(),
        idType,
        idLast4: idLast4.trim() || undefined,
        vehicleNo: vehicleNo.trim() || undefined,
      });

      onSuccess(updated, printBadgeImmediate);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to check in visitor. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-default)] flex items-center justify-between bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <div>
              <h3 className="text-base font-bold text-[var(--text-main)]">
                Check In Visitor & Issue Badge
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Verify identity, record vehicle and assign physical gate pass
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Visitor Card Summary */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-default)] space-y-2 text-xs">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold text-[var(--text-main)] text-sm">{visit.visitorName}</div>
                <div className="text-[var(--text-muted)] text-[11px]">
                  {visit.organization ? `${visit.organization} • ` : ''}Ref: <span className="font-mono font-semibold">{visit.referenceNo}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-[var(--brand-primary)]">
                  Host: {visit.hostOfficialName || 'Official'}
                </div>
                <div className="text-[var(--text-muted)] text-[11px]">{visit.roomName || 'Meeting Room'}</div>
              </div>
            </div>

            {(visit.phone || visit.email || ((visit as any).partySize && (visit as any).partySize > 1)) && (
              <div className="flex flex-wrap items-center gap-3 pt-1.5 border-t border-[var(--border-default)] text-[11px] text-[var(--text-muted)]">
                {visit.phone && (
                  <span className="flex items-center gap-1 font-mono">
                    <Phone className="w-3 h-3 text-blue-500" /> {visit.phone}
                  </span>
                )}
                {visit.email && (
                  <span className="flex items-center gap-1 truncate max-w-[200px]" title={visit.email}>
                    <Mail className="w-3 h-3 text-blue-500" /> {visit.email}
                  </span>
                )}
                {(visit as any).partySize && (visit as any).partySize > 1 && (
                  <span className="flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400">
                    <Users className="w-3 h-3" /> {(visit as any).partySize} Delegates
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Badge Number (Prominent Input) */}
          <div>
            <label className="block text-xs font-bold text-[var(--text-main)] uppercase tracking-wider mb-1">
              Badge / Pass Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={badgeNo}
                onChange={(e) => setBadgeNo(e.target.value)}
                placeholder="e.g. B-104"
                required
                className="w-full px-3 py-2 text-base font-mono font-bold rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand-primary)]"
              />
              <span className="absolute right-3 top-2.5 text-xs text-[var(--text-muted)]">
                Physical Card
              </span>
            </div>
          </div>

          {/* ID Type & Last 4 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                ID Document Type
              </label>
              <select
                value={idType}
                onChange={(e) => setIdType(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand-primary)]"
              >
                {ID_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                Last 4 Digits of ID
              </label>
              <input
                type="text"
                maxLength={4}
                value={idLast4}
                onChange={(e) => setIdLast4(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 7890"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand-primary)]"
              />
            </div>
          </div>

          {/* Vehicle Number & Party Size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                Vehicle Registration No. (Optional)
              </label>
              <input
                type="text"
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                placeholder="e.g. DL01AB1234"
                className="w-full px-3 py-2 text-xs font-mono uppercase rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                Party Size
              </label>
              <div className="px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-muted)] font-medium">
                {visit.partySize || 1} Person(s)
              </div>
            </div>
          </div>

          {/* Print Badge Checkbox */}
          <div className="pt-2">
            <label className="flex items-center gap-2 text-xs text-[var(--text-main)] cursor-pointer">
              <input
                type="checkbox"
                checked={printBadgeImmediate}
                onChange={(e) => setPrintBadgeImmediate(e.target.checked)}
                className="rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] cursor-pointer"
              />
              <span className="font-medium">
                Immediately open printable visitor pass upon confirmation
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-[var(--border-default)] flex items-center justify-end gap-3">
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
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer transition-colors shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? 'Checking In...' : 'Confirm Check-In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
