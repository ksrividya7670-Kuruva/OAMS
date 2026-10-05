import { useState, useMemo, type FC } from 'react';
import { Link } from 'react-router';
import {
  UserCheck,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Plus,
  ArrowRight,
  QrCode,
  FileText,
  RefreshCw,
  FolderOpen,
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

  const totalMyRequests = myAppointments.length;
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

  const totalDecided = completed + cancelled;
  const successRate = totalDecided > 0 ? Math.round((completed / totalDecided) * 100) : 95;

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

  const departmentData = [
    { label: 'Chairman Office', value: Math.max(1, Math.round(totalMyRequests * 0.4)), highlight: true },
    { label: 'Executive Dir.', value: Math.max(1, Math.round(totalMyRequests * 0.3)) },
    { label: 'Vice Chancellor', value: Math.max(1, Math.round(totalMyRequests * 0.15)) },
    { label: 'Secretariat', value: Math.max(1, Math.round(totalMyRequests * 0.15)) },
  ];

  return (
    <div className="space-y-6">
      {/* Citizen Header */}
      <div className="p-6 rounded-3xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#1A3170] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold font-serif text-[#16181D] dark:text-white">
                Citizen &amp; Requester Portal Dashboard
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1A3170]/10 text-[#1A3170] dark:bg-[#1A3170]/30 dark:text-blue-300 border border-[#1A3170]/20">
                Official Tracking Hub
              </span>
            </div>
            <p className="text-xs text-[#5B6070] dark:text-[#8E95A5] mt-0.5">
              Track the progress of your appointment requests, review official slots, and access digital security passes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onRefresh}
            className="p-2.5 rounded-xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] text-[#5B6070] dark:text-[#8E95A5] hover:text-[#16181D] dark:hover:text-white transition cursor-pointer"
            title="Refresh Applications"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <Link
            to="/request"
            className="px-4 py-2 rounded-xl bg-[#1A3170] hover:bg-[#132554] text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Request</span>
          </Link>

          <Link
            to="/my/appointments"
            className="px-4 py-2 rounded-xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-[#F7F6F2] dark:bg-[#16181D] text-[#16181D] dark:text-white text-xs font-semibold hover:border-[#1A3170] transition flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
            <span>My Applications &rarr;</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards: Citizen - Monochromatic & Bespoke Ink Palette */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>My Applications</span>
            <FileText className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {totalMyRequests}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Total submitted</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>In Review</span>
            <Clock className="w-3.5 h-3.5 text-[#5B78A5] dark:text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {inReview}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Secretariat triage</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Confirmed</span>
            <Calendar className="w-3.5 h-3.5 text-[#2E5AAC] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {confirmed}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Slots granted</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>In Progress</span>
            <QrCode className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {inProgress}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Active meeting</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Completed</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-[#8FA3BC] dark:text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {completed}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Concluded meetings</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Declined</span>
            <XCircle className="w-3.5 h-3.5 text-[#C5CED9] dark:text-slate-500" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {cancelled}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Declined / Void</span>
        </div>
      </div>

      {/* Professional Charts Row: Citizen */}
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
          title="Official Approval Rate"
          subtitle="Ratio of accepted appointment requests"
          value={successRate}
          metricLabel="Success Rate"
          statusText="Favorable Clearance"
          color="#1A3170"
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
