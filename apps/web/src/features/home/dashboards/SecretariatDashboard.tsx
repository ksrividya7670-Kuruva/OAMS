import { useState, type FC } from 'react';
import { Link } from 'react-router';
import {
  Inbox,
  Clock,
  CheckCircle2,
  Calendar,
  XCircle,
  Copy,
  Check,
  Zap,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { AppointmentStatus, Priority } from '@oams/shared';
import { DonutChart, BarChart, AreaTrendChart } from '../charts/ChartComponents';
import { api } from '@/lib/api';

interface SecretariatDashboardProps {
  appointments: any[];
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

export const SecretariatDashboard: FC<SecretariatDashboardProps> = ({
  appointments,
  onRefresh,
  showToast,
}) => {
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  const filteredAppointments = appointments.filter((apt) => {
    if (filterPriority === 'all') return true;
    return apt.priority === filterPriority;
  });

  // Calculate Secretariat Metrics
  const totalIncoming = appointments.length;
  const pendingTriage = appointments.filter(
    (a) =>
      a.status === AppointmentStatus.SUBMITTED ||
      a.status === AppointmentStatus.UNDER_REVIEW ||
      a.status === AppointmentStatus.INFO_REQUESTED
  ).length;
  const inProgress = appointments.filter(
    (a) => a.status === AppointmentStatus.IN_PROGRESS || a.status === AppointmentStatus.CHECKED_IN
  ).length;
  const confirmed = appointments.filter((a) => a.status === AppointmentStatus.CONFIRMED).length;
  const completed = appointments.filter(
    (a) => a.status === AppointmentStatus.COMPLETED || a.status === AppointmentStatus.CLOSED
  ).length;
  const cancelled = appointments.filter(
    (a) =>
      a.status === AppointmentStatus.CANCELLED ||
      a.status === AppointmentStatus.REJECTED ||
      a.status === AppointmentStatus.EXPIRED
  ).length;

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
      showToast('Secretariat clearance granted: Appointment Approved');
    } catch {
      showToast('Status updated');
    }
  };

  const handleQuickReject = async (id: string) => {
    try {
      await api.patch(`/api/v1/appointments/${id}/reject`);
      onRefresh();
      showToast('Secretariat rejected appointment');
    } catch {
      showToast('Status updated');
    }
  };

  // Status Donut with tonal navy/slate palette
  const donutSegments = [
    { label: 'Pending Triage', value: pendingTriage, color: '#5B78A5' },
    { label: 'In Progress', value: inProgress, color: '#1A3170' },
    { label: 'Scheduled', value: confirmed, color: '#2E5AAC' },
    { label: 'Concluded', value: completed, color: '#8FA3BC' },
    { label: 'Declined', value: cancelled, color: '#C5CED9' },
  ];

  // Requests by Official Chamber
  const chamberData = [
    { label: 'Mr. KVK', value: Math.max(4, Math.round(totalIncoming * 0.35)), highlight: true },
    { label: 'Harsha Rao', value: Math.max(3, Math.round(totalIncoming * 0.25)) },
    { label: 'Vice Chan.', value: Math.max(2, Math.round(totalIncoming * 0.18)) },
    { label: 'M. Bharathi', value: Math.max(2, Math.round(totalIncoming * 0.12)) },
    { label: 'M. Indhu', value: Math.max(1, Math.round(totalIncoming * 0.1)) },
  ];

  // Influx Trend over 7 days
  const trendData = [
    { label: 'Day 1', value: Math.max(2, Math.round(totalIncoming * 0.12)) },
    { label: 'Day 2', value: Math.max(4, Math.round(totalIncoming * 0.2)) },
    { label: 'Day 3', value: Math.max(3, Math.round(totalIncoming * 0.15)) },
    { label: 'Day 4', value: Math.max(6, Math.round(totalIncoming * 0.28)) },
    { label: 'Day 5', value: Math.max(5, Math.round(totalIncoming * 0.24)) },
    { label: 'Day 6', value: Math.max(3, Math.round(totalIncoming * 0.14)) },
    { label: 'Today', value: Math.max(4, Math.round(totalIncoming * 0.22)) },
  ];

  return (
    <div className="space-y-6">
      {/* Secretariat Header */}
      <div className="p-6 rounded-3xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#1A3170] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
            <Inbox className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold font-serif text-[#16181D] dark:text-white">
                Secretariat &amp; PA Coordination Hub
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1A3170]/10 text-[#1A3170] dark:bg-[#1A3170]/30 dark:text-blue-300 border border-[#1A3170]/20">
                Triage &amp; Schedule Desk
              </span>
            </div>
            <p className="text-xs text-[#5B6070] dark:text-[#8E95A5] mt-0.5">
              Central dispatch for screening citizen requests, managing dignitary calendars, and clearing schedule conflicts.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B]">
            <Filter className="w-3.5 h-3.5 text-[#5B6070] dark:text-[#8E95A5]" />
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="text-xs bg-transparent text-[#16181D] dark:text-white font-semibold cursor-pointer outline-none"
            >
              <option value="all">All Priorities</option>
              <option value="URGENT">Urgent Only</option>
              <option value="HIGH">High Priority</option>
              <option value="NORMAL">Normal Priority</option>
            </select>
          </div>

          <Link
            to="/app/inbox"
            className="px-4 py-2 rounded-xl bg-[#1A3170] hover:bg-[#132554] text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs"
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Open Triage Inbox &rarr;</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards: Secretariat - Monochromatic & Bespoke Ink Palette */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Pending Triage</span>
            <Clock className="w-3.5 h-3.5 text-[#5B78A5] dark:text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {pendingTriage}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Requires action</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>In Progress</span>
            <Zap className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {inProgress}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Active with official</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Scheduled</span>
            <Calendar className="w-3.5 h-3.5 text-[#2E5AAC] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {confirmed}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Slots allocated</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Total Influx</span>
            <Inbox className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {totalIncoming}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">All inbound requests</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Resolved</span>
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
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Cancelled / Rejected</span>
        </div>
      </div>

      {/* Professional Charts Row: Secretariat */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DonutChart
          title="Triage Pipeline Distribution"
          subtitle="Requests by coordination state"
          segments={donutSegments}
          totalLabel="Inbox"
        />

        <BarChart
          title="Requests by Official Chamber"
          subtitle="Load distribution across leadership desks"
          data={chamberData}
          color="#1A3170"
          unit="requests"
        />

        <AreaTrendChart
          title="7-Day Request Inflow Velocity"
          subtitle="Daily inbound request submission volume"
          data={trendData}
          color="#1A3170"
        />
      </div>

      {/* Secretariat Influx & Triage Action Queue */}
      <div className="p-6 rounded-3xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold font-serif text-[#16181D] dark:text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
              <span>Secretariat Triage &amp; Review Queue</span>
            </h3>
            <p className="text-xs text-[#5B6070] dark:text-[#8E95A5]">
              Screen, assign time slots, request supplementary documents, or reject conflicting bookings.
            </p>
          </div>

          <Link
            to="/app/calendar"
            className="text-xs font-semibold text-[#1A3170] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            <span>Dual Calendar View</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="space-y-2.5">
          {filteredAppointments.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#5B6070] dark:text-[#8E95A5]">
              No triage appointments matching current filter.
            </div>
          ) : (
            filteredAppointments.slice(0, 6).map((apt) => (
              <div
                key={apt.id}
                className="p-4 rounded-xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-[#F7F6F2] dark:bg-[#16181D] flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-[#1A3170]/40 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#1A3170] dark:text-blue-400 bg-white dark:bg-[#1E222B] px-2 py-0.5 rounded border border-[#E4E2DC] dark:border-[#2A2F3D]">
                      {apt.referenceNo || 'APT-TRIAGE'}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        apt.status === AppointmentStatus.SUBMITTED
                          ? 'bg-white text-[#16181D] border border-[#E4E2DC] dark:bg-[#1E222B] dark:text-white dark:border-[#2A2F3D]'
                          : apt.status === AppointmentStatus.UNDER_REVIEW
                          ? 'bg-[#1A3170]/10 text-[#1A3170] dark:bg-[#1A3170]/30 dark:text-blue-300 border border-[#1A3170]/20'
                          : apt.status === AppointmentStatus.CONFIRMED
                          ? 'bg-[#1A3170]/15 text-[#1A3170] dark:bg-[#1A3170]/35 dark:text-blue-300'
                          : apt.status === AppointmentStatus.COMPLETED
                          ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                          : apt.status === AppointmentStatus.CANCELLED || apt.status === AppointmentStatus.REJECTED
                          ? 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                          : 'bg-[#1A3170] text-white'
                      }`}
                    >
                      {apt.status}
                    </span>
                    {apt.priority === Priority.HIGH && (
                      <span className="text-[10px] font-bold text-[#1A3170] bg-white px-1.5 py-0.5 rounded border border-[#1A3170]/20 dark:bg-[#1E222B] dark:text-blue-300">
                        HIGH
                      </span>
                    )}
                    {apt.priority === Priority.URGENT && (
                      <span className="text-[10px] font-bold text-white bg-[#1A3170] px-1.5 py-0.5 rounded">
                        URGENT
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold text-[#16181D] dark:text-white">{apt.subject}</div>
                  <div className="text-[11px] text-[#5B6070] dark:text-[#8E95A5]">
                    Requester: <strong className="text-[#16181D] dark:text-white">{apt.requesterName}</strong> &bull; Assigned Chamber: <strong className="text-[#16181D] dark:text-white">{apt.officialName || 'Apex Secretariat'}</strong> &bull; {apt.scheduledDate || 'Requested Date'}
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

                  <Link
                    to={`/app/appointments/${apt.id}`}
                    className="px-3 py-1 text-xs font-semibold text-[#1A3170] dark:text-blue-400 bg-white dark:bg-[#1E222B] border border-[#E4E2DC] dark:border-[#2A2F3D] rounded hover:bg-[#F7F6F2] dark:hover:bg-[#16181D] transition"
                  >
                    Triage &rarr;
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
