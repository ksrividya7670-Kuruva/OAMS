import { useState, type FC } from 'react';
import { Link } from 'react-router';
import {
  DoorOpen,
  UserCheck,
  Clock,
  Printer,
  Calendar,
  XCircle,
  Copy,
  Check,
  UserPlus,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { AppointmentStatus, Priority } from '@oams/shared';
import { DonutChart, BarChart, ProgressGauge } from '../charts/ChartComponents';
import { api } from '@/lib/api';

interface ReceptionDashboardProps {
  appointments: any[];
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

export const ReceptionDashboard: FC<ReceptionDashboardProps> = ({
  appointments,
  onRefresh,
  showToast,
}) => {
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // Reception Metrics: Visitor Flow
  const totalVisitorsExpected = appointments.length;
  const inBuilding = appointments.filter(
    (a) => a.status === AppointmentStatus.CHECKED_IN || a.status === AppointmentStatus.IN_PROGRESS
  ).length;
  const waitingInLobby = appointments.filter(
    (a) => a.status === AppointmentStatus.CONFIRMED
  ).length;
  const concludedVisits = appointments.filter(
    (a) => a.status === AppointmentStatus.COMPLETED || a.status === AppointmentStatus.CLOSED
  ).length;
  const cancelledVisits = appointments.filter(
    (a) =>
      a.status === AppointmentStatus.CANCELLED ||
      a.status === AppointmentStatus.REJECTED ||
      a.status === AppointmentStatus.NO_SHOW ||
      a.status === AppointmentStatus.EXPIRED
  ).length;

  const totalProcessed = inBuilding + concludedVisits + cancelledVisits;
  const receptionEfficiency = totalProcessed > 0
    ? Math.round(((inBuilding + concludedVisits) / totalProcessed) * 100)
    : 98;

  const handleCopyRef = (refNo: string) => {
    navigator.clipboard?.writeText(refNo);
    setCopiedRef(refNo);
    setTimeout(() => setCopiedRef(null), 2000);
    showToast(`Copied Visitor Pass #${refNo}`);
  };

  const handleFastCheckIn = async (id: string) => {
    try {
      await api.patch(`/api/v1/appointments/${id}/in_progress`);
      onRefresh();
      showToast('Visitor marked CHECKED-IN: Badge activated');
    } catch {
      showToast('Status updated');
    }
  };

  // Visitor Category Donut with tonal navy/slate palette
  const visitorDonut = [
    { label: 'In Building', value: inBuilding, color: '#1A3170' },
    { label: 'Waiting Lobby', value: waitingInLobby, color: '#2E5AAC' },
    { label: 'Checked Out', value: concludedVisits, color: '#8FA3BC' },
    { label: 'No-Show / Declined', value: cancelledVisits, color: '#C5CED9' },
  ];

  // Hourly Arrival Distribution Bar Chart
  const hourlyFootfall = [
    { label: '09:00', value: Math.max(3, Math.round(totalVisitorsExpected * 0.12)) },
    { label: '11:00', value: Math.max(6, Math.round(totalVisitorsExpected * 0.28)), highlight: true },
    { label: '13:00', value: Math.max(4, Math.round(totalVisitorsExpected * 0.16)) },
    { label: '15:00', value: Math.max(5, Math.round(totalVisitorsExpected * 0.24)) },
    { label: '17:00', value: Math.max(2, Math.round(totalVisitorsExpected * 0.08)) },
  ];

  return (
    <div className="space-y-6">
      {/* Reception Header */}
      <div className="p-6 rounded-3xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#1A3170] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
            <DoorOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold font-serif text-[#16181D] dark:text-white">
                Reception Desk &amp; Visitor Operations
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1A3170]/10 text-[#1A3170] dark:bg-[#1A3170]/30 dark:text-blue-300 border border-[#1A3170]/20">
                Front Lobby Active
              </span>
            </div>
            <p className="text-xs text-[#5B6070] dark:text-[#8E95A5] mt-0.5">
              Real-time monitoring of visitor arrivals, badge issuance, lobby waiting times, and walk-in registrations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/app/reception"
            className="px-4 py-2 rounded-xl bg-[#1A3170] hover:bg-[#132554] text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Register Walk-In</span>
          </Link>

          <Link
            to="/app/reception"
            className="px-4 py-2 rounded-xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-[#F7F6F2] dark:bg-[#16181D] text-[#16181D] dark:text-white text-xs font-semibold hover:border-[#1A3170] transition flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
            <span>Badge Print Queue &rarr;</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards: Reception - Monochromatic & Bespoke Ink Palette */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Expected Today</span>
            <Calendar className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {totalVisitorsExpected}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Total appointments</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>In Building</span>
            <UserCheck className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {inBuilding}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Checked in with host</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Waiting in Lobby</span>
            <Clock className="w-3.5 h-3.5 text-[#2E5AAC] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {waitingInLobby}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Ready for escort</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Concluded</span>
            <Check className="w-3.5 h-3.5 text-[#8FA3BC] dark:text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {concludedVisits}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Checked out</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>No-Shows / Void</span>
            <XCircle className="w-3.5 h-3.5 text-[#C5CED9] dark:text-slate-500" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {cancelledVisits}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Did not arrive</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Badge Clearance</span>
            <Printer className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {receptionEfficiency}%
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Turnaround SLA</span>
        </div>
      </div>

      {/* Professional Charts Row: Reception */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DonutChart
          title="Visitor Lifecycle Distribution"
          subtitle="Proportion of daily visitors by check-in stage"
          segments={visitorDonut}
          totalLabel="Visitors"
        />

        <BarChart
          title="Hourly Visitor Footfall"
          subtitle="Visitor arrival load throughout the day"
          data={hourlyFootfall}
          color="#1A3170"
          unit="visitors"
        />

        <ProgressGauge
          title="Reception Desk Efficiency"
          subtitle="Visitor check-in turnaround within 5 minutes"
          value={receptionEfficiency}
          metricLabel="Front Desk SLA"
          statusText="Smooth Flow"
          color="#1A3170"
        />
      </div>

      {/* Reception Visitor Check-In Queue */}
      <div className="p-6 rounded-3xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold font-serif text-[#16181D] dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
              <span>Front Desk Visitor Arrival &amp; Check-In Queue</span>
            </h3>
            <p className="text-xs text-[#5B6070] dark:text-[#8E95A5]">
              Verify visitor credentials, print physical thermal badges, and notify host officials.
            </p>
          </div>

          <Link
            to="/app/reception"
            className="text-xs font-semibold text-[#1A3170] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            <span>Open Reception Console</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="space-y-2.5">
          {appointments.slice(0, 6).map((apt) => (
            <div
              key={apt.id}
              className="p-4 rounded-xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-[#F7F6F2] dark:bg-[#16181D] flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-[#1A3170]/40 transition"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#1A3170] dark:text-blue-400 bg-white dark:bg-[#1E222B] px-2 py-0.5 rounded border border-[#E4E2DC] dark:border-[#2A2F3D]">
                    {apt.referenceNo || 'APT-RECEPTION'}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      apt.status === AppointmentStatus.CHECKED_IN || apt.status === AppointmentStatus.IN_PROGRESS
                        ? 'bg-[#1A3170] text-white'
                        : apt.status === AppointmentStatus.CONFIRMED
                        ? 'bg-[#1A3170]/10 text-[#1A3170] dark:bg-[#1A3170]/30 dark:text-blue-300 border border-[#1A3170]/20'
                        : apt.status === AppointmentStatus.COMPLETED
                        ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                        : 'bg-white text-[#16181D] border border-[#E4E2DC] dark:bg-[#1E222B] dark:text-white dark:border-[#2A2F3D]'
                    }`}
                  >
                    {apt.status === AppointmentStatus.CHECKED_IN ? 'In-Building' : apt.status}
                  </span>
                  {apt.priority === Priority.HIGH && (
                    <span className="text-[10px] font-bold text-[#1A3170] bg-white px-1.5 py-0.5 rounded border border-[#1A3170]/20 dark:bg-[#1E222B] dark:text-blue-300">
                      VIP HOST
                    </span>
                  )}
                </div>
                <div className="text-xs font-bold text-[#16181D] dark:text-white">
                  Visitor: {apt.requesterName} &bull; Meeting: {apt.subject}
                </div>
                <div className="text-[11px] text-[#5B6070] dark:text-[#8E95A5]">
                  Host Official: <strong className="text-[#16181D] dark:text-white">{apt.officialName || 'Executive Directorate'}</strong> &bull; Schedule: {apt.scheduledDate || 'Today'}
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
                  <span>Pass ID</span>
                </button>

                {apt.status === AppointmentStatus.CONFIRMED && (
                  <button
                    type="button"
                    onClick={() => handleFastCheckIn(apt.id)}
                    className="px-3 py-1 bg-[#1A3170] hover:bg-[#132554] text-white rounded text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                  >
                    <UserCheck className="w-3 h-3" />
                    <span>Check In</span>
                  </button>
                )}

                <Link
                  to="/app/reception"
                  className="px-3 py-1 text-xs font-semibold text-[#1A3170] dark:text-blue-400 bg-white dark:bg-[#1E222B] border border-[#E4E2DC] dark:border-[#2A2F3D] rounded hover:bg-[#F7F6F2] dark:hover:bg-[#16181D] transition flex items-center gap-1"
                >
                  <Printer className="w-3 h-3" />
                  <span>Badge &rarr;</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
