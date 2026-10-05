import { type FC, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { VisitDto } from '@oams/shared';
import { api } from '@/lib/api';
import { X, QrCode, Search, CheckCircle2, User, Building, AlertCircle } from 'lucide-react';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVisit: (visit: VisitDto) => void;
  onCheckInDirect: (visit: VisitDto) => void;
}

export const QrScannerModal: FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  onSelectVisit,
  onCheckInDirect,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [matchedVisit, setMatchedVisit] = useState<VisitDto | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLookup = async (e?: React.FormEvent, overrideTerm?: string) => {
    if (e) e.preventDefault();
    const termToUse = (overrideTerm !== undefined ? overrideTerm : searchTerm).trim();
    if (!termToUse) return;

    if (overrideTerm !== undefined) {
      setSearchTerm(overrideTerm);
    }

    setIsSearching(true);
    setErrorMsg(null);
    setMatchedVisit(null);

    try {
      // Lookup accepts either qrToken or general search query (ref no, phone, name)
      const isHexToken = /^[a-f0-9]{32,64}$/i.test(termToUse);
      const queryParam = isHexToken
        ? `qrToken=${encodeURIComponent(termToUse)}`
        : `query=${encodeURIComponent(termToUse)}`;

      const res = await api.get<{ visit: VisitDto; visits?: VisitDto[] }>(`/api/v1/visits/lookup?${queryParam}`);
      const found = res?.visit || res?.visits?.[0] || (Array.isArray(res) ? (res as any)[0] : null);

      if (found) {
        setMatchedVisit(found);
      } else {
        setErrorMsg(`No matching visitor pass found for "${termToUse}". Please verify the code or select a quick test pass below.`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Pass lookup failed or visitor not found.');
    } finally {
      setIsSearching(false);
    }
  };

  // Fetch dynamic active passes for the Quick Test Passes section
  const { data: visitsData } = useQuery<{ visits: VisitDto[] }>({
    queryKey: ['visits-quick-passes'],
    queryFn: () => api.get<{ visits: VisitDto[] }>('/api/v1/visits'),
    staleTime: 1000 * 60, // 1 minute
  });

  const QUICK_PASSES = useMemo(() => {
    const allVisits = visitsData?.visits || [];
    // Prioritize EXPECTED and ARRIVED visits, then grab up to 4
    const relevantVisits = allVisits
      .filter((v) => v.status === 'EXPECTED' || v.status === 'ARRIVED')
      .slice(0, 4);

    return relevantVisits.map((v: any) => ({
      code: v.qrToken || v.referenceNo || 'UNKNOWN',
      label: `${v.qrToken || v.referenceNo} · ${v.visitorName}`,
      sub: `${v.organization || 'Individual'} (${v.status === 'EXPECTED' ? 'Expected' : 'Arrived'})`,
    }));
  }, [visitsData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-default)] flex items-center justify-between bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[var(--brand-primary)]" />
            <div>
              <h3 className="text-base font-bold text-[var(--text-main)]">Scan Pass / QR Lookup</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Scan barcode or enter pass reference number
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

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Simulated Scanner Viewport */}
          <div className="relative rounded-xl border-2 border-dashed border-[var(--brand-primary)]/50 bg-slate-950 p-6 text-center text-white overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
              <QrCode className="w-48 h-48 text-white" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-[var(--brand-primary)]/20 border border-[var(--brand-primary)]/40 flex items-center justify-center text-[var(--brand-primary)] animate-pulse">
                <QrCode className="w-6 h-6" />
              </div>
              <span className="text-xs font-semibold tracking-wide text-slate-300">
                Gate 1 Camera Scanner / Optical Reader
              </span>
              <p className="text-[11px] text-slate-400 max-w-xs">
                Position visitor pass QR in front of the gate camera or type the pass code below
              </p>

              <button
                type="button"
                onClick={() => handleLookup(undefined, QUICK_PASSES[0]?.code || '00156')}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white text-xs font-semibold shadow-md cursor-pointer transition-all hover:scale-105"
                disabled={QUICK_PASSES.length === 0}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Simulate QR Scan: {QUICK_PASSES[0] ? `Pass #${QUICK_PASSES[0].code}` : 'No passes available'}</span>
              </button>
            </div>
          </div>

          {/* Quick Test Pass Chips */}
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1.5 flex items-center justify-between">
              <span>Quick Test Passes:</span>
              <span className="text-[10px] text-[var(--brand-primary)]">Click to auto-lookup</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_PASSES.length > 0 ? (
                QUICK_PASSES.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => handleLookup(undefined, p.code)}
                    className="px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] hover:border-[var(--brand-primary)] hover:bg-[var(--bg-subtle)] text-left cursor-pointer transition-all text-xs"
                  >
                    <div className="font-bold text-[var(--text-main)] truncate">{p.label}</div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate">{p.sub}</div>
                  </button>
                ))
              ) : (
                <div className="col-span-2 text-center text-xs text-[var(--text-muted)] py-4 bg-[var(--bg-app)] rounded-lg border border-dashed border-[var(--border-default)]">
                  No pending visitors found for quick scan.
                </div>
              )}
            </div>
          </div>

          {/* Search Input Bar */}
          <form onSubmit={(e) => handleLookup(e)} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                autoFocus
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`Scan QR token, enter ${QUICK_PASSES[0]?.code || '00156'}, phone, or visitor name...`}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand-primary)]"
              />
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-2.5" />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)] disabled:opacity-50 cursor-pointer transition-colors shadow-xs"
            >
              {isSearching ? 'Looking up...' : 'Lookup'}
            </button>
          </form>

          {/* Feedback & Result Card */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {matchedVisit && (
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[var(--text-main)]">
                      {matchedVisit.visitorName}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                      {matchedVisit.status}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">
                    {matchedVisit.organization ? `${matchedVisit.organization} • ` : ''}
                    Ref: {matchedVisit.referenceNo}
                  </div>
                </div>

                {matchedVisit.badgeNo && (
                  <div className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-default)] text-right">
                    <span className="text-[10px] text-[var(--text-muted)] block uppercase font-bold">
                      Badge
                    </span>
                    <span className="font-mono font-bold text-xs text-[var(--brand-primary)]">
                      {matchedVisit.badgeNo}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs border-t border-[var(--border-default)]/60 pt-2">
                <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                  <User className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                  <span>Host: {matchedVisit.hostOfficialName || 'Official'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                  <Building className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                  <span>Room: {matchedVisit.roomName || 'Main Complex'}</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelectVisit(matchedVisit);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border-default)] text-[var(--text-main)] hover:bg-[var(--bg-app)] cursor-pointer"
                >
                  View Details
                </button>

                {matchedVisit.status !== 'CHECKED_IN' && matchedVisit.status !== 'WITH_HOST' && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onCheckInDirect(matchedVisit);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Proceed to Check-In
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--border-default)] flex items-center justify-end bg-[var(--bg-subtle)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-[var(--border-default)] text-[var(--text-main)] hover:bg-[var(--bg-app)] cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
