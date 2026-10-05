import { useState, type FC, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  Search,
  CheckCircle2,
  LogIn,
  Plus,
  Landmark,
  AlertCircle,
  ListFilter,
  FileCheck,
  ShieldCheck,
  Clock,
  QrCode,
} from 'lucide-react';
import { OFFICIAL_PORTFOLIOS } from './HomePage';

export const PublicHomePage: FC = () => {
  const navigate = useNavigate();
  const [referenceQuery, setReferenceQuery] = useState('');
  const [trackError, setTrackError] = useState('');

  const handleTrackSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = referenceQuery.trim();
    if (!cleaned) {
      setTrackError('Please enter an appointment reference code (e.g. OAMS-2026-00601).');
      return;
    }
    // Navigate directly to tracking docket
    navigate(`/my/appointments/${encodeURIComponent(cleaned)}`);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in duration-300 pb-16">
      {/* 1. Official Appointment Gateway Hero (Clean & Uncluttered) */}
      <div className="rounded-2xl border border-[#E2DFD7] dark:border-[#2D3342] bg-white dark:bg-[#1B1E26] p-8 sm:p-10 shadow-xs space-y-8">
        <div className="max-w-3xl space-y-4">
          {/* Overline with Institutional Seal */}
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] uppercase text-[#5B6070] dark:text-[#9DA4B5] font-mono">
            <Landmark className="w-4 h-4 text-[#1A3170] dark:text-blue-400 shrink-0" />
            <span>Apex Institutional Protocol Network &bull; Official Appointment Portal</span>
          </div>

          {/* Stately Serif Title */}
          <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-serif font-bold tracking-tight text-[#16181D] dark:text-white leading-[1.2]">
            Official Appointment Management System
          </h1>

          {/* Authoritative Subtitle */}
          <p className="text-sm sm:text-base text-[#5B6070] dark:text-[#9DA4B5] leading-relaxed max-w-2xl font-normal">
            The authoritative gateway for citizens, dignitaries, and institutional delegates to request official audiences, track protocol clearance, and receive digital entry credentials.
          </p>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              to="/request"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1A3170] hover:bg-[#12224D] text-white text-xs font-semibold tracking-wide shadow-xs transition active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Request Official Appointment</span>
            </Link>

            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] hover:bg-[#FAF9F6] dark:hover:bg-[#262C3A] text-[#16181D] dark:text-white text-xs font-semibold tracking-wide transition active:scale-[0.98]"
            >
              <LogIn className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
              <span>Staff &amp; Official Sign In</span>
            </Link>


            <Link
              to="/my/appointments"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] hover:bg-[#FAF9F6] dark:hover:bg-[#262C3A] text-[#5B6070] hover:text-[#16181D] dark:text-[#9DA4B5] dark:hover:text-white text-xs font-semibold tracking-wide transition"
            >
              <ListFilter className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
              <span>My Applications Ledger</span>
            </Link>
          </div>
        </div>

        {/* Clean Tracking Console */}
        <div className="border-t border-[#EAE8E2] dark:border-[#2D3342] pt-6 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#16181D] dark:text-white font-serif flex items-center gap-2">
              <Search className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
              <span>Track an Existing Application</span>
            </span>
            <span className="text-[11px] text-[#5B6070] dark:text-[#9DA4B5] flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Protocol Status</span>
            </span>
          </div>

          {/* Clean Search Input Form */}
          <form onSubmit={handleTrackSubmit} className="max-w-2xl">
            <div className="flex items-center border border-[#D5D2CA] dark:border-[#383E50] rounded-xl bg-[#FAF9F6] dark:bg-[#16181F] overflow-hidden focus-within:border-[#1A3170] focus-within:ring-1 focus-within:ring-[#1A3170] focus-within:bg-white dark:focus-within:bg-[#1E222B] transition shadow-2xs">
              <div className="pl-3.5 pr-2 text-[#8C909C]">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={referenceQuery}
                onChange={(e) => {
                  setReferenceQuery(e.target.value);
                  if (trackError) setTrackError('');
                }}
                placeholder="Enter Reference ID (e.g. OAMS-2026-00601)"
                className="py-2.5 text-xs text-[#16181D] dark:text-white bg-transparent outline-none flex-1 font-mono uppercase placeholder:normal-case placeholder:font-sans placeholder:text-[#8C909C]"
              />
              {referenceQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setReferenceQuery('');
                    if (trackError) setTrackError('');
                  }}
                  className="px-2 text-xs text-[#8C909C] hover:text-[#16181D] cursor-pointer"
                  title="Clear"
                >
                  &times;
                </button>
              )}
              <button
                type="submit"
                className="px-4 py-2.5 bg-[#1A3170] hover:bg-[#12224D] text-white text-xs font-semibold transition cursor-pointer shrink-0 inline-flex items-center gap-1.5 active:scale-[0.98]"
              >
                <span>Track</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>

          {/* Error Alert */}
          {trackError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2 max-w-2xl">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{trackError}</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Four-Stage Official Protocol Procedure */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-bold font-serif text-[#16181D] dark:text-white flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
            <span>Official Scheduling Protocol</span>
          </h2>
          <p className="text-xs text-[#5B6070] dark:text-[#9DA4B5]">
            Institutional clearance procedures followed for all official hearings and appointments.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl border border-[#E2DFD7] dark:border-[#2D3342] bg-white dark:bg-[#1B1E26] space-y-2 shadow-2xs">
            <div className="text-xs font-mono font-bold text-[#1A3170] dark:text-blue-400">
              01
            </div>
            <h3 className="text-xs font-bold text-[#16181D] dark:text-white">Submit Request</h3>
            <p className="text-[11px] text-[#5B6070] dark:text-[#9DA4B5] leading-relaxed">
              Designate the requested official chamber, specify meeting purpose, priority level, and participant details.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-[#E2DFD7] dark:border-[#2D3342] bg-white dark:bg-[#1B1E26] space-y-2 shadow-2xs">
            <div className="text-xs font-mono font-bold text-[#1A3170] dark:text-blue-400">
              02
            </div>
            <h3 className="text-xs font-bold text-[#16181D] dark:text-white">Secretariat Review</h3>
            <p className="text-[11px] text-[#5B6070] dark:text-[#9DA4B5] leading-relaxed">
              The Executive Secretariat conducts calendar availability screening and security protocol triage.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-[#E2DFD7] dark:border-[#2D3342] bg-white dark:bg-[#1B1E26] space-y-2 shadow-2xs">
            <div className="text-xs font-mono font-bold text-[#1A3170] dark:text-blue-400">
              03
            </div>
            <h3 className="text-xs font-bold text-[#16181D] dark:text-white">Pass Issuance</h3>
            <p className="text-[11px] text-[#5B6070] dark:text-[#9DA4B5] leading-relaxed">
              Upon authorization, an encrypted digital QR pass and official confirmation code are generated.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-[#E2DFD7] dark:border-[#2D3342] bg-white dark:bg-[#1B1E26] space-y-2 shadow-2xs">
            <div className="text-xs font-mono font-bold text-[#1A3170] dark:text-blue-400">
              04
            </div>
            <h3 className="text-xs font-bold text-[#16181D] dark:text-white">Chamber Hearing</h3>
            <p className="text-[11px] text-[#5B6070] dark:text-[#9DA4B5] leading-relaxed">
              Present your credentials at the security checkpoint and reception for guided chamber escort.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Leadership Chambers Portfolio */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold font-serif text-[#16181D] dark:text-white flex items-center gap-2">
              <Landmark className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
              <span>Institutional Leadership Chambers</span>
            </h2>
            <p className="text-xs text-[#5B6070] dark:text-[#9DA4B5]">
              Authorized offices open for official appointments and executive audiences.
            </p>
          </div>
          <Link
            to="/request"
            className="text-xs font-semibold text-[#1A3170] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            <span>Request audience</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {OFFICIAL_PORTFOLIOS.map((official) => {
            const Icon = official.icon;
            return (
              <div
                key={official.id}
                className="p-5 rounded-xl border border-[#E2DFD7] dark:border-[#2D3342] bg-white dark:bg-[#1B1E26] hover:border-[#1A3170]/40 transition-all flex items-start gap-3.5 shadow-2xs"
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${official.avatarBg} shadow-2xs`}
                >
                  <Icon className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <h3 className="font-bold text-xs text-[#16181D] dark:text-white truncate">
                      {official.name}
                    </h3>
                    <span className="text-[10px] font-medium text-[#1A3170] dark:text-blue-300 bg-[#1A3170]/5 dark:bg-blue-950/40 px-1.5 py-0.5 rounded shrink-0">
                      {official.tier}
                    </span>
                  </div>

                  <p className="text-[11px] font-medium text-[#1A3170] dark:text-blue-400 truncate mt-0.5">
                    {official.roleTitle}
                  </p>
                  <p className="text-[10px] text-[#5B6070] dark:text-[#9DA4B5] truncate">
                    {official.department}
                  </p>

                  <div className="mt-2.5 pt-2 border-t border-[#EAE8E2] dark:border-[#2D3342] flex items-center justify-between">
                    <Link
                      to={`/request?officialId=${official.id}`}
                      className="text-[11px] font-semibold text-[#1A3170] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                    >
                      <span>Book Slot</span> &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Campus Protocol & Security Directives */}
      <div className="p-6 rounded-2xl border border-[#E2DFD7] dark:border-[#2D3342] bg-white dark:bg-[#1B1E26] shadow-2xs space-y-4">
        <div>
          <h2 className="text-base font-bold font-serif text-[#16181D] dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
            <span>Campus Security &amp; Visitor Guidelines</span>
          </h2>
          <p className="text-xs text-[#5B6070] dark:text-[#9DA4B5]">
            Standard directives governing institutional premises and physical access clearance:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-[#16181D] dark:text-white">Government Photo ID</h4>
              <p className="text-[11px] text-[#5B6070] dark:text-[#9DA4B5] leading-relaxed">
                All visitors must produce an original government identity credential at perimeter checkpoints.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-[#1A3170] dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-[#16181D] dark:text-white">15-Minute Advance Arrival</h4>
              <p className="text-[11px] text-[#5B6070] dark:text-[#9DA4B5] leading-relaxed">
                Report to the main security reception 15 minutes before your slot for badge clearance.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <QrCode className="w-4 h-4 text-[#1A3170] dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-[#16181D] dark:text-white">Digital Pass Presentation</h4>
              <p className="text-[11px] text-[#5B6070] dark:text-[#9DA4B5] leading-relaxed">
                Ensure your confirmation pass barcode or reference number is accessible on arrival.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
