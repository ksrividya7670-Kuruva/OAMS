import type { FC } from 'react';
import type { VisitDto } from '@oams/shared';
import { X, Printer, Shield } from 'lucide-react';

interface BadgePrintModalProps {
  visit: VisitDto | null;
  isOpen: boolean;
  onClose: () => void;
}

export const BadgePrintModal: FC<BadgePrintModalProps> = ({ visit, isOpen, onClose }) => {
  if (!isOpen || !visit) return null;

  const handlePrint = () => {
    window.print();
  };

  const visitDate = visit.scheduledStartTime
    ? new Date(visit.scheduledStartTime).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : new Date().toLocaleDateString();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[var(--border-default)] flex items-center justify-between bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-[var(--brand-primary)]" />
            <h3 className="text-base font-bold text-[var(--text-main)]">Print Visitor Badge</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-app)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Badge Preview */}
        <div className="p-6 overflow-y-auto max-h-[75vh]">
          <div
            id="oams-printable-badge"
            className="border-2 border-dashed border-[var(--brand-primary)] rounded-xl p-5 bg-white text-slate-900 shadow-md relative"
          >
            {/* Badge Top Header */}
            <div className="flex items-center justify-between border-b pb-3 border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-black tracking-wider text-blue-900 uppercase">
                    OAMS SECURITY PASS
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    Ref: {visit.referenceNo}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-green-100 text-green-800 border border-green-300">
                  AUTHORIZED
                </span>
              </div>
            </div>

            {/* Badge Number Banner */}
            <div className="my-4 text-center py-2 px-3 bg-slate-900 text-white rounded-lg shadow-inner">
              <span className="text-xs uppercase tracking-widest text-slate-400 block font-semibold">
                Badge Pass Number
              </span>
              <span className="text-3xl font-black tracking-wider font-mono text-emerald-400">
                {visit.badgeNo || 'B-000'}
              </span>
            </div>

            {/* Visitor Details */}
            <div className="space-y-2.5 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Visitor Name
                </span>
                <span className="text-base font-extrabold text-slate-900 block leading-tight">
                  {visit.visitorName}
                </span>
                {visit.organization && (
                  <span className="text-xs text-slate-600 font-medium block">
                    {visit.organization}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Host Official
                  </span>
                  <span className="font-semibold text-slate-800">
                    {visit.hostOfficialName || 'Office Host'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Room / Location
                  </span>
                  <span className="font-semibold text-slate-800">
                    {visit.roomName || 'Main Complex'}
                    {visit.floor ? ` (${visit.floor})` : ''}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    ID Verified
                  </span>
                  <span className="font-medium text-slate-700">
                    {visit.idType || 'GOVT_ID'} •••• {visit.idLast4 || 'XXXX'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Party Size
                  </span>
                  <span className="font-medium text-slate-700">
                    {visit.partySize || 1} Person(s)
                  </span>
                </div>
              </div>

              <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>Date: {visitDate}</span>
                <span>Vehicle: {visit.vehicleNo || 'None'}</span>
              </div>
            </div>

            {/* Simulated Barcode / QR Section */}
            <div className="mt-4 pt-3 border-t-2 border-dashed border-slate-200 flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                  Gate Scan Barcode
                </span>
                <div className="font-mono text-xs tracking-widest font-bold text-slate-700">
                  ||||| | |||| || ||| |||||||
                </div>
              </div>
              <div className="w-12 h-12 bg-slate-100 border border-slate-300 rounded flex items-center justify-center p-1">
                <div className="grid grid-cols-3 gap-0.5 w-full h-full opacity-80">
                  <div className="bg-slate-900 rounded-2xs" />
                  <div className="bg-slate-300 rounded-2xs" />
                  <div className="bg-slate-900 rounded-2xs" />
                  <div className="bg-slate-300 rounded-2xs" />
                  <div className="bg-slate-900 rounded-2xs" />
                  <div className="bg-slate-300 rounded-2xs" />
                  <div className="bg-slate-900 rounded-2xs" />
                  <div className="bg-slate-900 rounded-2xs" />
                  <div className="bg-slate-900 rounded-2xs" />
                </div>
              </div>
            </div>

            {/* Footer Notice */}
            <div className="mt-3 text-center text-[9px] text-slate-400 font-medium">
              Must be worn visibly at all times. Return to security upon exit.
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="px-6 py-4 border-t border-[var(--border-default)] flex items-center justify-end gap-3 bg-[var(--bg-subtle)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-[var(--border-default)] text-[var(--text-main)] hover:bg-[var(--bg-app)] cursor-pointer transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)] cursor-pointer transition-colors shadow-xs"
          >
            <Printer className="w-4 h-4" />
            Print Pass Now
          </button>
        </div>
      </div>
    </div>
  );
};
