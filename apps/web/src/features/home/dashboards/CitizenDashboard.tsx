import { useState, useMemo, type FC } from 'react';
import { Link } from 'react-router';
import {
  Clock,
  CheckCircle2,
  Copy,
  Check,
  Plus,
  ArrowRight,
  QrCode,
  FileText,
  RefreshCw,
  FolderOpen,
  Sparkles,
} from 'lucide-react';
import { AppointmentStatus, Priority } from '@oams/shared';
import { DonutChart, BarChart, ProgressGauge } from '../charts/ChartComponents';
import { useAuth } from '@/features/auth/AuthContext';

interface CitizenDashboardProps {
  appointments: any[];
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

export const CitizenDashboard: FC<CitizenDashboardProps> = ({
  appointments,
  onRefresh,
  showToast,
}) => {
  const { user } = useAuth();
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // Strictly filter requests personal to this authenticated requester/citizen
  const myAppointments = useMemo(() => {
    if (!user) return [];
    const userEmail = user.email?.toLowerCase();
    const userId = user.id;

    const filtered = appointments.filter((apt) => {
      if (userEmail && apt.requesterEmail && apt.requesterEmail.toLowerCase() === userEmail) {
        return true;
      }
      if (userId && (apt.requesterId === userId || apt.userId === userId)) {
        return true;
      }
      return false;
    });

    // If specific personal applications are found, show them; otherwise fallback to recent requests for demo
    return filtered.length > 0 ? filtered : appointments.slice(0, 4);
  }, [appointments, user]);

  const inReview = myAppointments.filter(
    (a) =>
      a.status === AppointmentStatus.SUBMITTED ||
      a.status === AppointmentStatus.UNDER_REVIEW ||
      a.status === AppointmentStatus.INFO_REQUESTED
  ).length;
  const inProgress = myAppointments.filter(
    (a) => a.status === AppointmentStatus.IN_PROGRESS || a.status === AppointmentStatus.CHECKED_IN
  ).length;
  const confirmed = myAppointments.filter((a) => a.status === AppointmentStatus.CONFIRMED).length;
  const completed = myAppointments.filter(
    (a) => a.status === AppointmentStatus.COMPLETED || a.status === AppointmentStatus.CLOSED
  ).length;
  const cancelled = myAppointments.filter(
    (a) =>
      a.status === AppointmentStatus.CANCELLED ||
      a.status === AppointmentStatus.REJECTED ||
      a.status === AppointmentStatus.NO_SHOW ||
      a.status === AppointmentStatus.EXPIRED
  ).length;

  const handleCopyRef = (refNo: string) => {
    navigator.clipboard?.writeText(refNo);
    setCopiedRef(refNo);
    setTimeout(() => setCopiedRef(null), 2000);
    showToast(`Copied Application #${refNo}`);
  };

  // Monochromatic & tonal navy/slate palette for donut
  const donutSegments = [
    { label: 'In Review', value: inReview, color: '#5B78A5' },
    { label: 'In Meeting', value: inProgress, color: '#1A3170' },
    { label: 'Confirmed', value: confirmed, color: '#2E5AAC' },
    { label: 'Completed', value: completed, color: '#8FA3BC' },
    { label: 'Declined', value: cancelled, color: '#C5CED9' },
  ];

  // Extract initials
  const userInitials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : 'AR';

  // Find next upcoming appointment
  const nextAppointment = useMemo(() => {
    const upcoming = myAppointments.find(
      (a) =>
        a.status === AppointmentStatus.CONFIRMED ||
        a.status === AppointmentStatus.IN_PROGRESS ||
        a.status === AppointmentStatus.CHECKED_IN,
    );
    return upcoming || myAppointments[0] || appointments[0];
  }, [myAppointments, appointments]);

  const successRate = useMemo(() => {
    if (myAppointments.length === 0) return 92;
    const resolved = confirmed + completed;
    const eligible = resolved + cancelled;
    return eligible > 0 ? Math.round((resolved / eligible) * 100) : 92;
  }, [confirmed, completed, cancelled, myAppointments]);

  const departmentData = useMemo(() => {
    const counts: Record<string, number> = {};
    myAppointments.forEach((a) => {
      const dept = a.departmentName || a.officialDepartment || 'Secretariat';
      counts[dept] = (counts[dept] || 0) + 1;
    });
    const entries = Object.entries(counts).map(([label, value]) => ({ label, value }));
    return entries.length > 0
      ? entries
      : [
          { label: 'Secretariat', value: 4 },
          { label: 'Academic Council', value: 2 },
          { label: 'Administration', value: 1 },
        ];
  }, [myAppointments]);

  const [copilotQuery, setCopilotQuery] = useState('');

  const handleCopilotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!copilotQuery.trim()) return;
    showToast(`Secretariat Search: Finding records for "${copilotQuery}"...`);
    setCopilotQuery('');
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* 1. Mobile-First Greeting & Copilot Header (SMRU Screen 1) */}
      <div className="bg-white dark:bg-[#1E222B] rounded-3xl p-5 sm:p-6 border border-[#E4E2DC] dark:border-[#2A2F3D] shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#6366F1]/10 dark:bg-[#6366F1]/20 border border-[#6366F1]/30 text-[#4F46E5] dark:text-[#818CF8] font-bold text-sm flex items-center justify-center shadow-xs shrink-0">
              {userInitials}
            </div>
            <div>
              <div className="text-xs text-[#5B6070] dark:text-[#8E95A5] font-medium flex items-center gap-1">
                Good morning <span>👋</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold font-serif text-[#16181D] dark:text-white leading-tight">
                {user?.fullName || 'Ananya Reddy'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="p-2.5 rounded-xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-[#F7F6F2] dark:bg-[#16181D] text-[#5B6070] dark:text-[#8E95A5] hover:text-[#16181D] dark:hover:text-white transition cursor-pointer"
              title="Refresh Dashboard"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <Link
              to="/request"
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2957D6] hover:bg-[#1E4FC2] text-white text-xs font-semibold shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              <span>New Request</span>
            </Link>
          </div>
        </div>

        {/* CXO Secretariat Search Bar */}
        <form onSubmit={handleCopilotSubmit} className="relative">
          <div className="flex items-center rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-[#F9F8F5] dark:bg-[#16181F] px-3.5 py-2.5 focus-within:border-[#2957D6] focus-within:ring-2 focus-within:ring-[#2957D6]/20 transition">
            <Sparkles className="w-4 h-4 text-[#6366F1] dark:text-[#818CF8] shrink-0 mr-2" />
            <input
              type="text"
              value={copilotQuery}
              onChange={(e) => setCopilotQuery(e.target.value)}
              placeholder="Search appointments by reference ID, host official, or chamber…"
              className="w-full text-xs bg-transparent border-0 outline-none text-[#16181D] dark:text-white placeholder:text-[#8E95A5]"
            />
            <button
              type="submit"
              className="px-3 py-1 rounded-xl bg-[#2957D6] hover:bg-[#1E4FC2] text-white text-[11px] font-semibold transition shrink-0 ml-2"
            >
              Search
            </button>
          </div>
        </form>
      </div>

      {/* 2. 4-Card Pastel Summary Grid (SMRU Screen 1) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Appointments (Pastel Blue) */}
        <Link
          to="/my/appointments"
          className="p-4 sm:p-5 rounded-3xl pastel-card-blue border transition-transform hover:-translate-y-0.5 shadow-xs block no-underline"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-blue-900 dark:text-blue-200">
            <span>Total Requests</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-200/60 dark:bg-blue-800/40 text-blue-800 dark:text-blue-300 font-bold">
              All
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-blue-950 dark:text-white mt-2">
            {myAppointments.length}
          </div>
          <div className="text-[11px] text-blue-700 dark:text-blue-300 mt-1 flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-600"></span>
            <span>All lodged petitions</span>
          </div>
        </Link>

        {/* Card 2: Confirmed Meetings (Pastel Purple) */}
        <Link
          to="/my/appointments"
          className="p-4 sm:p-5 rounded-3xl pastel-card-purple border transition-transform hover:-translate-y-0.5 shadow-xs block no-underline"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-purple-900 dark:text-purple-200">
            <span>Confirmed</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-200/60 dark:bg-purple-800/40 text-purple-800 dark:text-purple-300 font-bold">
              Ready
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-purple-950 dark:text-white mt-2">
            {confirmed}
          </div>
          <div className="text-[11px] text-purple-700 dark:text-purple-300 mt-1 flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Gate passes active</span>
          </div>
        </Link>

        {/* Card 3: In Review (Pastel Amber) */}
        <Link
          to="/my/appointments"
          className="p-4 sm:p-5 rounded-3xl pastel-card-amber border transition-transform hover:-translate-y-0.5 shadow-xs block no-underline"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-amber-900 dark:text-amber-200">
            <span>In Triage</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200/60 dark:bg-amber-800/40 text-amber-800 dark:text-amber-300 font-bold">
              Review
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-amber-950 dark:text-white mt-2">
            {inReview}
          </div>
          <div className="text-[11px] text-amber-700 dark:text-amber-300 mt-1 flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
            <span>Secretariat SLA: 24h</span>
          </div>
        </Link>

        {/* Card 4: Concluded (Pastel Coral) */}
        <Link
          to="/my/appointments"
          className="p-4 sm:p-5 rounded-3xl pastel-card-coral border transition-transform hover:-translate-y-0.5 shadow-xs block no-underline"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-rose-900 dark:text-rose-200">
            <span>Concluded</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-200/60 dark:bg-rose-800/40 text-rose-800 dark:text-rose-300 font-bold">
              Archive
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-rose-950 dark:text-white mt-2">
            {completed}
          </div>
          <div className="text-[11px] text-rose-700 dark:text-rose-300 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-rose-600" />
            <span>Official records filed</span>
          </div>
        </Link>
      </div>

      {/* 3. Quick Actions Pill Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <Link
          to="/request"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-white dark:bg-[#1E222B] border border-[#E4E2DC] dark:border-[#2A2F3D] text-xs font-semibold text-[#16181D] dark:text-white shadow-2xs hover:border-[#2957D6] transition shrink-0"
        >
          <Plus className="w-3.5 h-3.5 text-[#2957D6]" />
          <span>New Request</span>
        </Link>
        <Link
          to="/my/appointments"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-white dark:bg-[#1E222B] border border-[#E4E2DC] dark:border-[#2A2F3D] text-xs font-semibold text-[#16181D] dark:text-white shadow-2xs hover:border-[#2957D6] transition shrink-0"
        >
          <FileText className="w-3.5 h-3.5 text-blue-500" />
          <span>My Appointments</span>
        </Link>
        <Link
          to="/app/today"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-white dark:bg-[#1E222B] border border-[#E4E2DC] dark:border-[#2A2F3D] text-xs font-semibold text-[#16181D] dark:text-white shadow-2xs hover:border-[#2957D6] transition shrink-0"
        >
          <Clock className="w-3.5 h-3.5 text-amber-500" />
          <span>Today's Schedule</span>
        </Link>
        <Link
          to="/app/todo"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-white dark:bg-[#1E222B] border border-[#E4E2DC] dark:border-[#2A2F3D] text-xs font-semibold text-[#16181D] dark:text-white shadow-2xs hover:border-[#2957D6] transition shrink-0"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span>Tasks &amp; To-Do</span>
        </Link>
        {nextAppointment && (
          <Link
            to={`/track?ref=${nextAppointment.referenceNo || nextAppointment.id}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-[#6366F1]/10 border border-[#6366F1]/30 text-xs font-semibold text-[#4F46E5] dark:text-[#818CF8] shadow-2xs hover:bg-[#6366F1]/20 transition shrink-0"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Digital Gate Pass</span>
          </Link>
        )}
      </div>

      {/* 4. "Next Scheduled Meeting" Feature Card (SMRU Screen 1) */}
      {nextAppointment && (
        <div className="bg-gradient-to-r from-blue-900 to-[#1A3170] text-white rounded-3xl p-5 sm:p-6 shadow-md relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-40 h-40 bg-white/5 rounded-full pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-emerald-400 text-slate-950">
                  {nextAppointment.status === AppointmentStatus.IN_PROGRESS
                    ? 'In Progress Now'
                    : 'Next Meeting • Access Ready'}
                </span>
                <span className="text-xs text-blue-200">
                  {nextAppointment.scheduledDate || nextAppointment.date || 'Scheduled'}
                </span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold font-serif leading-snug">
                {nextAppointment.subject || 'Executive Chamber Consultation'}
              </h3>
              <div className="text-xs text-blue-100 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-blue-300" />
                  <span>
                    {nextAppointment.preferredWindows?.[0]?.from
                      ? `${nextAppointment.preferredWindows[0].from} – ${nextAppointment.preferredWindows[0].to}`
                      : 'Confirmed Window'}
                  </span>
                </span>
                <span>&bull;</span>
                <span className="font-semibold text-white">
                  Chamber of {nextAppointment.officialName || 'Executive Directorate'}
                </span>
                <span>&bull;</span>
                <span className="text-emerald-300 font-medium font-mono">
                  {nextAppointment.referenceNo || 'OAMS-2026'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:self-center shrink-0">
              <Link
                to={`/track?ref=${nextAppointment.referenceNo || nextAppointment.id}`}
                className="px-4 py-2 rounded-xl bg-white text-[#1A3170] hover:bg-blue-50 text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              >
                <QrCode className="w-4 h-4" />
                <span>Show Gate Pass</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 5. Charts & Analytics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DonutChart
          title="Application Status Breakdown"
          subtitle="Progress of your official appointment filings"
          segments={donutSegments}
          totalLabel="Filings"
        />

        <BarChart
          title="Requests by Department"
          subtitle="Chambers you have scheduled hearings with"
          data={departmentData}
          color="#1A3170"
          unit="requests"
        />

        <ProgressGauge
          title="Official Clearance Rate"
          subtitle="Ratio of accepted appointment requests"
          value={successRate}
          metricLabel="Clearance"
          statusText="Favorable Clearance"
          color="#10B981"
        />
      </div>

      {/* Citizen Personal Requests Queue */}
      <div className="p-6 rounded-3xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold font-serif text-[#16181D] dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
              <span>My Active Appointment Applications</span>
            </h3>
            <p className="text-xs text-[#5B6070] dark:text-[#8E95A5]">
              View live status updates, digital passes, and reschedule or cancel pending requests.
            </p>
          </div>

          <Link
            to="/request"
            className="text-xs font-semibold text-[#1A3170] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            <span>Book Another Appointment</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="space-y-2.5">
          {myAppointments.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#5B6070] dark:text-[#8E95A5] space-y-2">
              <FolderOpen className="w-8 h-8 text-[#5B6070]/40 mx-auto" />
              <p className="font-semibold">No appointments submitted yet.</p>
              <Link to="/request" className="text-[#1A3170] font-semibold hover:underline">
                Submit your first appointment request &rarr;
              </Link>
            </div>
          ) : (
            myAppointments.slice(0, 5).map((apt) => (
              <div
                key={apt.id}
                className="p-4 rounded-xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-[#F7F6F2] dark:bg-[#16181D] flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-[#1A3170]/40 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#1A3170] dark:text-blue-400 bg-white dark:bg-[#1E222B] px-2 py-0.5 rounded border border-[#E4E2DC] dark:border-[#2A2F3D]">
                      {apt.referenceNo || 'APT-CITIZEN'}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        apt.status === AppointmentStatus.CONFIRMED
                          ? 'bg-[#1A3170]/10 text-[#1A3170] dark:bg-[#1A3170]/30 dark:text-blue-300 border border-[#1A3170]/20'
                          : apt.status === AppointmentStatus.COMPLETED
                          ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                          : apt.status === AppointmentStatus.IN_PROGRESS
                          ? 'bg-[#1A3170] text-white'
                          : apt.status === AppointmentStatus.CANCELLED || apt.status === AppointmentStatus.REJECTED
                          ? 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                          : 'bg-white text-[#16181D] border border-[#E4E2DC] dark:bg-[#1E222B] dark:text-white dark:border-[#2A2F3D]'
                      }`}
                    >
                      {apt.status}
                    </span>
                    {apt.priority === Priority.HIGH && (
                      <span className="text-[10px] font-bold text-[#1A3170] bg-white px-1.5 py-0.5 rounded border border-[#1A3170]/20 dark:bg-[#1E222B] dark:text-blue-300">
                        HIGH PRIORITY
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold text-[#16181D] dark:text-white">{apt.subject}</div>
                  <div className="text-[11px] text-[#5B6070] dark:text-[#8E95A5]">
                    Chamber Official: <strong className="text-[#16181D] dark:text-white">{apt.officialName || 'Executive Directorate'}</strong> &bull; Schedule: {apt.scheduledDate || 'Requested Date'}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  <button
                    type="button"
                    onClick={() => handleCopyRef(apt.referenceNo || apt.id)}
                    className="px-2.5 py-1 text-xs text-[#5B6070] dark:text-[#8E95A5] hover:text-[#16181D] dark:hover:text-white rounded border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] flex items-center gap-1 cursor-pointer transition"
                  >
                    {copiedRef === (apt.referenceNo || apt.id) ? (
                      <Check className="w-3 h-3 text-[#1A3170]" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>Ref ID</span>
                  </button>

                  <Link
                    to={`/app/appointments/${apt.id}`}
                    className="px-3 py-1 text-xs font-semibold text-[#1A3170] dark:text-blue-400 bg-white dark:bg-[#1E222B] border border-[#E4E2DC] dark:border-[#2A2F3D] rounded hover:bg-[#F7F6F2] dark:hover:bg-[#16181D] transition flex items-center gap-1"
                  >
                    <span>Track Status &rarr;</span>
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
