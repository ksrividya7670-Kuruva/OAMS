import { type FC, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { VisitDto } from '@oams/shared';
import { PurposeCategory } from '@oams/shared';
import { api } from '@/lib/api';
import { X, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react';

interface WalkInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newVisit: VisitDto) => void;
  defaultOfficialId?: string;
}

const PURPOSE_OPTIONS = [
  { value: PurposeCategory.COURTESY_VISIT, label: 'Courtesy Visit' },
  { value: PurposeCategory.BUSINESS_DISCUSSION, label: 'Official / Business Discussion' },
  { value: PurposeCategory.APPROVAL_REQUEST, label: 'Approval Request / Sanction File' },
  { value: PurposeCategory.GRIEVANCE, label: 'Grievance / Public Hearing' },
  { value: PurposeCategory.PROPOSAL, label: 'Project / Initiative Proposal' },
  { value: PurposeCategory.OTHER, label: 'Other Official Engagement' },
];

const ID_TYPES = [
  { value: 'AADHAAR', label: 'Aadhaar Card' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'VOTER_ID', label: 'Voter ID' },
  { value: 'DRIVING_LICENSE', label: 'Driving License' },
  { value: 'GOVT_ID', label: 'Government Photo ID' },
  { value: 'OFFICE_ID', label: 'Corporate / Office ID' },
  { value: 'OTHER', label: 'Other Document' },
];

export const WalkInModal: FC<WalkInModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultOfficialId,
}) => {
  const [officialId, setOfficialId] = useState(defaultOfficialId || '');
  const [visitorName, setVisitorName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [purposeCategory, setPurposeCategory] = useState<string>(PurposeCategory.COURTESY_VISIT);
  const [purpose, setPurpose] = useState('');
  const [idType, setIdType] = useState('AADHAAR');
  const [idLast4, setIdLast4] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [partySize, setPartySize] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch officials
  const { data: officialsData } = useQuery<{ officials: any[] }>({
    queryKey: ['officials-list-walkin'],
    queryFn: () => api.get<{ officials: any[] }>('/api/v1/officials'),
    enabled: isOpen,
  });

  const officials = officialsData?.officials || [];

  useEffect(() => {
    if (isOpen) {
      if (defaultOfficialId) {
        setOfficialId(defaultOfficialId);
      } else if (officials.length > 0 && !officialId) {
        setOfficialId(officials[0].id);
      }
      setErrorMsg(null);
    }
  }, [isOpen, defaultOfficialId, officials]);

  if (!isOpen) return null;

  const handleRegister = async (immediateCheckIn: boolean = false) => {
    if (!officialId) {
      setErrorMsg('Please select a host official for this walk-in appointment.');
      return;
    }
    if (!visitorName.trim()) {
      setErrorMsg('Visitor name is required.');
      return;
    }
    if (!phone.trim()) {
      setErrorMsg('Visitor phone number is required.');
      return;
    }
    if (!purpose.trim()) {
      setErrorMsg('Please specify the meeting purpose or reason.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const created = await api.post<VisitDto>('/api/v1/visits/walk-in', {
        officialId,
        visitorName: visitorName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        organization: organization.trim() || undefined,
        purposeCategory,
        purpose: purpose.trim(),
        idType,
        idLast4: idLast4.trim() || undefined,
        vehicleNo: vehicleNo.trim() || undefined,
        partySize: Number(partySize) || 1,
      });

      if (immediateCheckIn && created?.id) {
        const badgeSuggested = `B-${Math.floor(100 + Math.random() * 900)}`;
        const checkedIn = await api.post<VisitDto>(`/api/v1/visits/${created.id}/check-in`, {
          badgeNo: badgeSuggested,
          idType,
          idLast4: idLast4.trim() || undefined,
          vehicleNo: vehicleNo.trim() || undefined,
        });
        onSuccess(checkedIn || created);
      } else {
        onSuccess(created);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to register walk-in visitor. Please check fields.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleRegister(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-default)] flex items-center justify-between bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[var(--brand-primary)]" />
            <div>
              <h3 className="text-base font-bold text-[var(--text-main)]">
                Register Walk-in Visitor
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Creates an urgent under-review meeting and notifies the host's PA immediately
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Host Official Select */}
          <div>
            <label className="block text-xs font-bold text-[var(--text-main)] uppercase tracking-wider mb-1">
              Host Official <span className="text-red-500">*</span>
            </label>
            <select
              value={officialId}
              onChange={(e) => setOfficialId(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand-primary)] font-medium"
            >
              <option value="">-- Select Host Official --</option>
              {officials.map((off) => (
                <option key={off.id} value={off.id}>
                  {off.fullName} — {off.title || 'Official'} ({off.department || 'Office'})
                </option>
              ))}
            </select>
          </div>

          {/* Visitor Name & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                Visitor Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={visitorName}
                onChange={(e) => setVisitorName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                required
                className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                Mobile Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                required
                className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand-primary)]"
              />
            </div>
          </div>

          {/* Email & Organization */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                Email Address (Optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. visitor@example.com"
                className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                Organization / Delegation (Optional)
              </label>
              <input
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="e.g. National Trade Council"
                className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand-primary)]"
              />
            </div>
          </div>

          {/* Purpose Category & Purpose Details */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
              Purpose Category <span className="text-red-500">*</span>
            </label>
            <select
              value={purposeCategory}
              onChange={(e) => setPurposeCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand-primary)]"
            >
              {PURPOSE_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
              Purpose of Visit / Brief Notes <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="State the brief subject or urgent requirement..."
              required
              className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand-primary)] resize-none"
            />
          </div>

          {/* ID Type, Last 4, Vehicle, Party Size */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[var(--border-default)]">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-main)] mb-1">
                ID Type
              </label>
              <select
                value={idType}
                onChange={(e) => setIdType(e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)]"
              >
                {ID_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-main)] mb-1">
                Last 4 ID
              </label>
              <input
                type="text"
                maxLength={4}
                value={idLast4}
                onChange={(e) => setIdLast4(e.target.value.replace(/\D/g, ''))}
                placeholder="1234"
                className="w-full px-2 py-1.5 text-xs font-mono rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-main)] mb-1">
                Vehicle No.
              </label>
              <input
                type="text"
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                placeholder="DL01..."
                className="w-full px-2 py-1.5 text-xs font-mono uppercase rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-main)] mb-1">
                Party Size
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={partySize}
                onChange={(e) => setPartySize(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-2 py-1.5 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)]"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-[var(--border-default)] flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-[#D5D2CA] dark:border-slate-700 text-[#16181D] dark:text-slate-200 hover:bg-[#F7F6F2] dark:hover:bg-slate-800 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleRegister(false)}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#1A3170] hover:bg-[#132554] text-white disabled:opacity-50 cursor-pointer transition-colors shadow-xs"
            >
              <UserPlus className="w-4 h-4" />
              <span>{isSubmitting ? 'Registering...' : 'Register at Gate'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleRegister(true)}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#059669] hover:bg-[#047857] text-white disabled:opacity-50 cursor-pointer transition-colors shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Checking In...' : 'Direct Check In & Issue Badge'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
