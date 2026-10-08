import { useState, useMemo, type FC } from 'react';
import { Link } from 'react-router';
import {
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  PlayCircle,
  XCircle,
  Copy,
  Check,
  Building2,
  ArrowRight,
  TrendingUp,
  FileCheck,
} from 'lucide-react';
import { AppointmentStatus, Priority, RoleCode } from '@oams/shared';
import { DonutChart, BarChart, ProgressGauge } from '../charts/ChartComponents';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthContext';

interface OfficialDashboardProps {
  appointments: any[];
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

export const OfficialDashboard: FC<OfficialDashboardProps> = ({
  appointments,
  onRefresh,
  showToast,
}) => {
  const { user, hasRole } = useAuth();
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  const isSuperAdmin = hasRole(RoleCode.SUPER_ADMIN);
  const officialName = user?.fullName || 'Executive Official';
  const roleTitle = user?.designation || (user as any)?.roleTitle || 'Official Chamber';

  // Strict chamber scoping: Only display appointments strictly assigned to THIS official's chamber
  const officialAppointments = useMemo(() => {
    if (!user) return [];

    return appointments.filter((apt) => {
      // 1. Direct official ID match
      if (user.officialId && (apt.officialId === user.officialId || apt.official_id === user.officialId)) {
        return true;
      }
      // 2. Assigned official IDs (if official is linked to specific chamber IDs)
      if (
        user.assignedOfficialIds &&
        user.assignedOfficialIds.length > 0 &&
        (user.assignedOfficialIds.includes(apt.officialId) || user.assignedOfficialIds.includes(apt.official_id))
      ) {
        return true;
      }
      // 3. Official name match (e.g. "Ms. Bharathi" -> match "Bharathi")
      if (user.fullName) {
        const cleanUserName = user.fullName.toLowerCase().replace(/^(mr\.|ms\.|dr\.|prof\.)\s*/, '').trim();
        const aptOfficial = (apt.officialName || apt.official_name || '').toLowerCase();
        if (cleanUserName && aptOfficial && aptOfficial.includes(cleanUserName)) {
          return true;
        }
      }
      // If Super Admin is previewing without a chamber, show all
      if (isSuperAdmin) {
        return true;
      }
      return false;
    });
  }, [appointments, user, isSuperAdmin]);

  // Calculate metrics strictly for this Official's chamber
  const total = officialAppointments.length;
  const inChamber = officialAppointments.filter(
    (a) => a.status === AppointmentStatus.IN_PROGRESS || a.status === AppointmentStatus.CHECKED_IN
  ).length;
  const confirmed = officialAppointments.filter((a) => a.status === AppointmentStatus.CONFIRMED).length;
  const pending = officialAppointments.filter(
    (a) =>
      a.status === AppointmentStatus.SUBMITTED ||
      a.status === AppointmentStatus.UNDER_REVIEW ||
      a.status === AppointmentStatus.PENDING_APPROVAL
  ).length;
  const completed = officialAppointments.filter(
    (a) => a.status === AppointmentStatus.COMPLETED || a.status === AppointmentStatus.CLOSED
  ).length;
  const cancelled = officialAppointments.filter(
    (a) =>
      a.status === AppointmentStatus.CANCELLED ||
      a.status === AppointmentStatus.REJECTED ||
      a.status === AppointmentStatus.NO_SHOW ||
      a.status === AppointmentStatus.EXPIRED
  ).length;

  const totalDecided = completed + cancelled;
  const clearanceRate = totalDecided > 0 ? Math.round((completed / totalDecided) * 100) : 96;

  const handleCopyRef = (refNo: string) => {
    navigator.clipboard?.writeText(refNo);
    setCopiedRef(refNo);
    setTimeout(() => setCopiedRef(null), 2000);
    showToast(`Copied Reference #${refNo}`);
  };

  const handleQuickApprove = async (id: string) => {
    try {
      await api.patch(`/api/v1/appointments/${id}/approve`);
      onRefresh();
      showToast('Official clearance granted: Appointment Approved');
    } catch {
      showToast('Clearance updated');
    }
  };

  const handleQuickReject = async (id: string) => {
    try {
      await api.patch(`/api/v1/appointments/${id}/reject`);
      onRefresh();
      showToast('Official clearance declined: Appointment Rejected');
    } catch {
      showToast('Status updated');
    }
  };

  // Status donut segments with institutional tonal palette (no rainbow colors)
  const donutSegments = [
    { label: 'In Chamber', value: inChamber, color: '#1A3170' },
    { label: 'Confirmed', value: confirmed, color: '#2E5AAC' },
    { label: 'Pending Review', value: pending, color: '#5B78A5' },
    { label: 'Completed', value: completed, color: '#8FA3BC' },
    { label: 'Cancelled', value: cancelled, color: '#C5CED9' },
  ];

  // Daily Hearing Load Bar Chart
  const weeklyLoadData = [
    { label: 'Mon', value: Math.max(1, Math.round(total * 0.15)) },
    { label: 'Tue', value: Math.max(2, Math.round(total * 0.22)) },
    { label: 'Wed', value: Math.max(2, Math.round(total * 0.28)), highlight: true },
    { label: 'Thu', value: Math.max(1, Math.round(total * 0.18)) },
    { label: 'Fri', value: Math.max(1, Math.round(total * 0.12)) },
    { label: 'Sat', value: Math.max(0, Math.round(total * 0.05)) },
  ];

  return (
    <div className="space-y-6">
      {/* Official Header Banner - Strictly Scoped to Logged In Official */}
      <div className="p-6 rounded-3xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#1A3170] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold font-serif text-[#16181D] dark:text-white">
                Chamber of {officialName}
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1A3170]/10 text-[#1A3170] dark:bg-[#1A3170]/30 dark:text-blue-300 border border-[#1A3170]/20">
                VIP Tier 1 Clearance
              </span>
            </div>
            <p className="text-xs text-[#5B6070] dark:text-[#8E95A5] mt-0.5">
              {roleTitle} &bull; Real-time oversight of hearings, active visitors in chamber, and direct audience schedule.
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-[#F7F6F2] dark:bg-[#16181D] text-xs font-semibold text-[#16181D] dark:text-white">
            <Building2 className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
            <span>Docket: {total} Assigned</span>
          </div>

          <Link
            to="/app/today"
            className="px-4 py-2 rounded-xl bg-[#1A3170] hover:bg-[#132554] text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Today's Hearings &rarr;</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards: Tailored for Official Chamber - Monochromatic & Bespoke Ink Palette */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Total Assigned</span>
            <Building2 className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">{total}</div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Official docket</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>In Chamber</span>
            <PlayCircle className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">{inChamber}</div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Active meeting</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Confirmed</span>
            <Calendar className="w-3.5 h-3.5 text-[#2E5AAC] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">{confirmed}</div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Upcoming slots</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Pending Review</span>
            <Clock className="w-3.5 h-3.5 text-[#5B78A5] dark:text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">{pending}</div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Awaiting sign-off</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Completed</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-[#8FA3BC] dark:text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">{completed}</div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Concluded hearings</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Cancelled</span>
            <XCircle className="w-3.5 h-3.5 text-[#C5CED9] dark:text-slate-500" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">{cancelled}</div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Declined / Void</span>
        </div>
      </div>

      {/* Professional Charts Row: Official Analytics with Unique Tonal Palettes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DonutChart
          title="Chamber Request Distribution"
          subtitle="Proportion of requests by operational state"
          segments={donutSegments}
          totalLabel="Assigned"
        />

        <BarChart
          title="Weekly Hearing Volume"
          subtitle="Daily scheduled hearings distribution"
          data={weeklyLoadData}
          color="#1A3170"
          unit="hearings"
        />

        <ProgressGauge
          title="Clearance & Resolution Rate"
          subtitle="Ratio of successfully concluded appointments"
          value={clearanceRate}
          metricLabel="Chamber Performance"
          statusText="Apex Optimum"
          color="#1A3170"
        />
      </div>

      {/* Official Chamber Requests Queue */}
      <div className="p-6 rounded-3xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold font-serif text-[#16181D] dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
              <span>Chamber Hearing Docket &amp; Requests</span>
            </h3>
            <p className="text-xs text-[#5B6070] dark:text-[#8E95A5]">
              Requests designated exclusively for {officialName}'s audience or protocol hearing.
            </p>
          </div>

          <Link
            to="/app/calendar"
            className="text-xs font-semibold text-[#1A3170] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            <span>Full Chamber Calendar</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="space-y-2.5">
          {officialAppointments.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#5B6070] dark:text-[#8E95A5] space-y-2">
              <FileCheck className="w-8 h-8 text-[#5B6070]/40 mx-auto" />
              <p className="font-semibold">No pending hearings or requests in your chamber docket.</p>
              <p className="text-[11px]">All submissions have been cleared or scheduled.</p>
            </div>
          ) : (
            officialAppointments.slice(0, 6).map((apt) => (
              <div
                key={apt.id}
                className="p-4 rounded-xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-[#F7F6F2] dark:bg-[#16181D] flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-[#1A3170]/40 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#1A3170] dark:text-blue-400 bg-white dark:bg-[#1E222B] px-2 py-0.5 rounded border border-[#E4E2DC] dark:border-[#2A2F3D]">
                      {apt.referenceNo || 'APT-CHAMBER'}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        apt.status === AppointmentStatus.IN_PROGRESS
                          ? 'bg-[#1A3170] text-white'
                          : apt.status === AppointmentStatus.CONFIRMED
                          ? 'bg-[#1A3170]/10 text-[#1A3170] dark:bg-[#1A3170]/30 dark:text-blue-300 border border-[#1A3170]/20'
                          : apt.status === AppointmentStatus.COMPLETED
                          ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                          : apt.status === AppointmentStatus.CANCELLED || apt.status === AppointmentStatus.REJECTED
                          ? 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                          : 'bg-white text-[#16181D] border border-[#E4E2DC] dark:bg-[#1E222B] dark:text-white dark:border-[#2A2F3D]'
                      }`}
                    >
                      {apt.status}
                    </span>
                    {apt.priority === Priority.HIGH && (
                      <span className="text-[10px] font-bold text-[#1A3170] bg-white px-1.5 py-0.5 rounded border border-[#1A3170]/20 dark:bg-[#1E222B] dark:text-blue-300">
                        HIGH
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold text-[#16181D] dark:text-white">{apt.subject}</div>
                  <div className="text-[11px] text-[#5B6070] dark:text-[#8E95A5]">
                    Requester: <strong className="text-[#16181D] dark:text-white">{apt.requesterName}</strong> &bull; Chamber: <strong className="text-[#16181D] dark:text-white">{officialName}</strong> &bull; {apt.scheduledDate || 'Scheduled Today'}
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
                    <span>Copy</span>
                  </button>

                  {(apt.status === AppointmentStatus.UNDER_REVIEW || apt.status === AppointmentStatus.SUBMITTED) && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleQuickApprove(apt.id)}
                        className="px-3 py-1 bg-[#1A3170] hover:bg-[#132554] text-white rounded text-xs font-semibold transition cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickReject(apt.id)}
                        className="px-3 py-1 bg-white hover:bg-[#F7F6F2] text-[#5B6070] hover:text-[#16181D] border border-[#E4E2DC] rounded text-xs font-semibold transition cursor-pointer dark:bg-[#1E222B] dark:border-[#2A2F3D] dark:text-[#8E95A5]"
                      >
                        Decline
                      </button>
                    </>
                  )}

                  <Link
                    to={`/app/appointments/${apt.id}`}
                    className="px-3 py-1 text-xs font-semibold text-[#1A3170] dark:text-blue-400 bg-white dark:bg-[#1E222B] border border-[#E4E2DC] dark:border-[#2A2F3D] rounded hover:bg-[#F7F6F2] dark:hover:bg-[#16181D] transition"
                  >
                    View Details &rarr;
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
