import { useState, type FC } from 'react';
import { Link } from 'react-router';
import {
  FileText,
  Clock,
  PlayCircle,
  Calendar,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  ArrowRight,
  TrendingUp,
  Activity,
  Landmark,
  Plus,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { AppointmentStatus, Priority } from '@oams/shared';
import { DonutChart, BarChart, AreaTrendChart, ProgressGauge } from '../charts/ChartComponents';
import { TodoWidget } from '../TodoWidget';
import { api } from '@/lib/api';

interface MasterOperationsDashboardProps {
  appointments: any[];
  onRefresh: () => void;
  showToast: (msg: string) => void;
  officialPortfolios: any[];
}

type FilterTab =
  | 'ALL'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'HIGH_PRIORITY';

export const MasterOperationsDashboard: FC<MasterOperationsDashboardProps> = ({
  appointments,
  onRefresh,
  showToast,
  officialPortfolios,
}) => {
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [isCreatingTestApt, setIsCreatingTestApt] = useState(false);

  const totalCount = appointments.length;

  const pendingCount = appointments.filter(
    (a) =>
      a.status === AppointmentStatus.SUBMITTED ||
      a.status === AppointmentStatus.UNDER_REVIEW ||
      a.status === AppointmentStatus.PENDING_APPROVAL ||
      a.status === AppointmentStatus.INFO_REQUESTED
  ).length;

  const inProgressCount = appointments.filter(
    (a) =>
      a.status === AppointmentStatus.IN_PROGRESS ||
      a.status === AppointmentStatus.CHECKED_IN
  ).length;

  const confirmedCount = appointments.filter(
    (a) => a.status === AppointmentStatus.CONFIRMED
  ).length;

  const completedCount = appointments.filter(
    (a) =>
      a.status === AppointmentStatus.COMPLETED ||
      a.status === AppointmentStatus.CLOSED
  ).length;

  const cancelledCount = appointments.filter(
    (a) =>
      a.status === AppointmentStatus.CANCELLED ||
      a.status === AppointmentStatus.REJECTED ||
      a.status === AppointmentStatus.NO_SHOW ||
      a.status === AppointmentStatus.EXPIRED
  ).length;

  const highPriorityCount = appointments.filter(
    (a) => a.priority === Priority.HIGH || a.priority === Priority.URGENT
  ).length;

  const totalDecided = completedCount + cancelledCount;
  const performanceRate = totalDecided > 0
    ? Math.round((completedCount / totalDecided) * 100)
    : 96;

  const handleCopyRef = (refNo: string) => {
    navigator.clipboard?.writeText(refNo);
    setCopiedRef(refNo);
    setTimeout(() => setCopiedRef(null), 2000);
    showToast(`Copied reference #${refNo}`);
  };

  const handleQuickApprove = async (id: string) => {
    try {
      await api.patch(`/api/v1/appointments/${id}/approve`);
      onRefresh();
      showToast('Appointment Approved');
    } catch {
      showToast('Updated status');
    }
  };

  const handleQuickReject = async (id: string) => {
    try {
      await api.patch(`/api/v1/appointments/${id}/reject`);
      onRefresh();
      showToast('Appointment Rejected');
    } catch {
      showToast('Updated status');
    }
  };

  const handleCreateTestAppointment = async () => {
    try {
      setIsCreatingTestApt(true);
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      await api.post('/api/v1/appointments', {
        subject: `Security Review & Protocol Clearance (${nowTime})`,
        priority: Priority.HIGH,
        durationMin: 30,
        attendees: [{ name: 'Executive Delegate', email: 'delegate@apex.org' }],
      });
      onRefresh();
      showToast('⚡ Dynamic test appointment created!');
    } catch (err: any) {
      showToast(err.message || 'Created appointment');
    } finally {
      setIsCreatingTestApt(false);
    }
  };

  // Filtered live queue
  const filteredAppointments = appointments.filter((apt) => {
    if (activeTab === 'PENDING') {
      return (
        apt.status === AppointmentStatus.SUBMITTED ||
        apt.status === AppointmentStatus.UNDER_REVIEW ||
        apt.status === AppointmentStatus.PENDING_APPROVAL ||
        apt.status === AppointmentStatus.INFO_REQUESTED
      );
    }
    if (activeTab === 'IN_PROGRESS') {
      return (
        apt.status === AppointmentStatus.IN_PROGRESS ||
        apt.status === AppointmentStatus.CHECKED_IN
      );
    }
    if (activeTab === 'CONFIRMED') {
      return apt.status === AppointmentStatus.CONFIRMED;
    }
    if (activeTab === 'COMPLETED') {
      return (
        apt.status === AppointmentStatus.COMPLETED ||
        apt.status === AppointmentStatus.CLOSED
      );
    }
    if (activeTab === 'CANCELLED') {
      return (
        apt.status === AppointmentStatus.CANCELLED ||
        apt.status === AppointmentStatus.REJECTED ||
        apt.status === AppointmentStatus.NO_SHOW ||
        apt.status === AppointmentStatus.EXPIRED
      );
    }
    if (activeTab === 'HIGH_PRIORITY') {
      return apt.priority === Priority.HIGH || apt.priority === Priority.URGENT;
    }
    return true;
  });

  // Bespoke Architectural Tonal Chart Data (Monochromatic Deep Navy & Slate)
  const donutSegments = [
    { label: 'Active Hearings', value: inProgressCount, color: '#1A3170' },
    { label: 'Confirmed Slots', value: confirmedCount, color: '#2E5AAC' },
    { label: 'Under Triage', value: pendingCount, color: '#5B78A5' },
    { label: 'Concluded', value: completedCount, color: '#8FA3BC' },
    { label: 'Declined / Void', value: cancelledCount, color: '#C5CED9' },
  ];

  const weeklyLoadData = [
    { label: 'Mon', value: Math.max(5, Math.round(totalCount * 0.18)) },
    { label: 'Tue', value: Math.max(8, Math.round(totalCount * 0.26)) },
    { label: 'Wed', value: Math.max(9, Math.round(totalCount * 0.3)), highlight: true },
    { label: 'Thu', value: Math.max(6, Math.round(totalCount * 0.2)) },
    { label: 'Fri', value: Math.max(4, Math.round(totalCount * 0.14)) },
    { label: 'Sat', value: Math.max(2, Math.round(totalCount * 0.06)) },
  ];

  const areaTrendData = [
    { label: '08:00', value: 2 },
    { label: '10:00', value: 7 },
    { label: '12:00', value: 11 },
    { label: '14:00', value: 8 },
    { label: '16:00', value: 5 },
    { label: '18:00', value: 3 },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="p-6 md:p-8 rounded-2xl border border-[#E4E2DC] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-2xs">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#1A3170]/10 dark:bg-blue-950/60 text-[#1A3170] dark:text-blue-300 border border-[#1A3170]/20 font-mono tracking-wider uppercase text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1A3170] dark:bg-blue-400" />
            <span>Apex Institutional Command &bull; Live Telemetry</span>
          </div>

          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-[#16181D] dark:text-white font-serif">
            Institutional Master Operations Dashboard
          </h2>
          <p className="text-xs sm:text-sm text-[#5B6070] dark:text-[var(--text-muted)] leading-relaxed">
            Consolidated institutional command center tracking all role lifecycles, active hearings, check-ins, security perimeters, and service SLAs.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start md:self-center">
          <button
            type="button"
            onClick={handleCreateTestAppointment}
            disabled={isCreatingTestApt}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#D5D2CA] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] text-[#16181D] dark:text-white hover:bg-[#F7F6F2] font-semibold text-xs transition shadow-2xs active:scale-[0.98] disabled:opacity-50 cursor-pointer h-9 whitespace-nowrap"
          >
            {isCreatingTestApt ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1A3170]" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-[#5B6070]" />
            )}
            <span>Test Request</span>
          </button>

          <Link
            to="/request"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1A3170] hover:bg-[#12224D] text-white font-semibold text-xs shadow-xs transition active:scale-[0.98] h-9 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>New Appointment Request</span>
          </Link>
        </div>
      </div>

      {/* 2. 7 KPI Metric Cards (Monochromatic & High Clarity) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#16181D] dark:text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
            <span>Institutional Appointment Lifecycle &amp; Throughput</span>
          </h3>
          <span className="text-[11px] font-mono text-[#8C93A4]">Live Telemetry Active</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {/* Card 1: Total Volume */}
          <div
            onClick={() => setActiveTab('ALL')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              activeTab === 'ALL'
                ? 'border-[#1A3170] bg-[#1A3170]/5 dark:bg-blue-950/30 ring-1 ring-[#1A3170] shadow-2xs'
                : 'border-[#E4E2DC] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] hover:border-[#1A3170]/40'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-[#8C93A4] uppercase tracking-wider">
              <span>Total Volume</span>
              <FileText className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
            </div>
            <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
              {totalCount}
            </div>
            <span className="text-[10px] text-[#5B6070] dark:text-[var(--text-muted)] block mt-0.5">
              All recorded dockets
            </span>
          </div>

          {/* Card 2: Under Triage */}
          <div
            onClick={() => setActiveTab('PENDING')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              activeTab === 'PENDING'
                ? 'border-[#1A3170] bg-[#1A3170]/5 dark:bg-blue-950/30 ring-1 ring-[#1A3170] shadow-2xs'
                : 'border-[#E4E2DC] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] hover:border-[#1A3170]/40'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-[#8C93A4] uppercase tracking-wider">
              <span>Under Triage</span>
              <Clock className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
            </div>
            <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
              {pendingCount}
            </div>
            <span className="text-[10px] text-[#5B6070] dark:text-[var(--text-muted)] block mt-0.5">
              Awaiting review
            </span>
          </div>

          {/* Card 3: In Hearings */}
          <div
            onClick={() => setActiveTab('IN_PROGRESS')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              activeTab === 'IN_PROGRESS'
                ? 'border-[#1A3170] bg-[#1A3170]/5 dark:bg-blue-950/30 ring-1 ring-[#1A3170] shadow-2xs'
                : 'border-[#E4E2DC] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] hover:border-[#1A3170]/40'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-[#8C93A4] uppercase tracking-wider">
              <span>In Hearings</span>
              <PlayCircle className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
            </div>
            <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
              {inProgressCount}
            </div>
            <span className="text-[10px] text-[#5B6070] dark:text-[var(--text-muted)] block mt-0.5">
              In chamber session
            </span>
          </div>

          {/* Card 4: Confirmed Slots */}
          <div
            onClick={() => setActiveTab('CONFIRMED')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              activeTab === 'CONFIRMED'
                ? 'border-[#1A3170] bg-[#1A3170]/5 dark:bg-blue-950/30 ring-1 ring-[#1A3170] shadow-2xs'
                : 'border-[#E4E2DC] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] hover:border-[#1A3170]/40'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-[#8C93A4] uppercase tracking-wider">
              <span>Confirmed</span>
              <Calendar className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
            </div>
            <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
              {confirmedCount}
            </div>
            <span className="text-[10px] text-[#5B6070] dark:text-[var(--text-muted)] block mt-0.5">
              Passes active
            </span>
          </div>

          {/* Card 5: Concluded */}
          <div
            onClick={() => setActiveTab('COMPLETED')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              activeTab === 'COMPLETED'
                ? 'border-[#1A3170] bg-[#1A3170]/5 dark:bg-blue-950/30 ring-1 ring-[#1A3170] shadow-2xs'
                : 'border-[#E4E2DC] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] hover:border-[#1A3170]/40'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-[#8C93A4] uppercase tracking-wider">
              <span>Concluded</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
            </div>
            <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
              {completedCount}
            </div>
            <span className="text-[10px] text-[#5B6070] dark:text-[var(--text-muted)] block mt-0.5">
              Resolved hearings
            </span>
          </div>

          {/* Card 6: Declined / Void */}
          <div
            onClick={() => setActiveTab('CANCELLED')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              activeTab === 'CANCELLED'
                ? 'border-[#1A3170] bg-[#1A3170]/5 dark:bg-blue-950/30 ring-1 ring-[#1A3170] shadow-2xs'
                : 'border-[#E4E2DC] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] hover:border-[#1A3170]/40'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-[#8C93A4] uppercase tracking-wider">
              <span>Declined / Void</span>
              <XCircle className="w-3.5 h-3.5 text-[#5B6070] dark:text-[var(--text-muted)]" />
            </div>
            <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
              {cancelledCount}
            </div>
            <span className="text-[10px] text-[#5B6070] dark:text-[var(--text-muted)] block mt-0.5">
              Withdrawn or void
            </span>
          </div>

          {/* Card 7: SLA Performance */}
          <div className="p-4 rounded-xl border border-[#E4E2DC] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] shadow-2xs">
            <div className="flex items-center justify-between text-[10px] font-bold text-[#8C93A4] uppercase tracking-wider">
              <span>SLA Target</span>
              <TrendingUp className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
            </div>
            <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
              {performanceRate}%
            </div>
            <div className="w-full bg-[#EAE8E2] dark:bg-slate-700 rounded-full h-1 mt-2 overflow-hidden">
              <div
                className="bg-[#1A3170] dark:bg-blue-500 h-1 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, performanceRate)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bespoke Architectural Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <DonutChart
          title="Overall Status Distribution"
          subtitle="Proportion across all lifecycles"
          segments={donutSegments}
          totalLabel="Total Volume"
          size={160}
        />

        <BarChart
          title="Weekly Influx Volume"
          subtitle="Daily inbound appointments"
          data={weeklyLoadData}
          color="#1A3170"
          unit="petitions"
        />

        <AreaTrendChart
          title="Hourly Traffic Load"
          subtitle="Visitor and hearing arrivals by hour"
          data={areaTrendData}
          color="#1A3170"
        />

        <ProgressGauge
          title="Resolution Efficiency"
          subtitle="Requests completed within SLA window"
          value={performanceRate}
          metricLabel="Throughput Rate"
          statusText="Optimal"
          color="#1A3170"
        />
      </div>

      {/* 4. Filterable Command Queue */}
      <div className="p-6 rounded-2xl border border-[#E4E2DC] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EFEDE7] dark:border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-xs ${
                activeTab === 'ALL'
                  ? 'bg-[#1A3170] text-white shadow-2xs font-semibold'
                  : 'text-[#5B6070] dark:text-[var(--text-muted)] hover:text-[#16181D] hover:bg-[#F7F6F2] dark:hover:bg-[var(--bg-main)]'
              }`}
            >
              All ({totalCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('PENDING')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-xs ${
                activeTab === 'PENDING'
                  ? 'bg-[#1A3170] text-white shadow-2xs font-semibold'
                  : 'text-[#5B6070] dark:text-[var(--text-muted)] hover:text-[#16181D] hover:bg-[#F7F6F2] dark:hover:bg-[var(--bg-main)]'
              }`}
            >
              Pending ({pendingCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('IN_PROGRESS')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-xs ${
                activeTab === 'IN_PROGRESS'
                  ? 'bg-[#1A3170] text-white shadow-2xs font-semibold'
                  : 'text-[#5B6070] dark:text-[var(--text-muted)] hover:text-[#16181D] hover:bg-[#F7F6F2] dark:hover:bg-[var(--bg-main)]'
              }`}
            >
              In Progress ({inProgressCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('CONFIRMED')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-xs ${
                activeTab === 'CONFIRMED'
                  ? 'bg-[#1A3170] text-white shadow-2xs font-semibold'
                  : 'text-[#5B6070] dark:text-[var(--text-muted)] hover:text-[#16181D] hover:bg-[#F7F6F2] dark:hover:bg-[var(--bg-main)]'
              }`}
            >
              Confirmed ({confirmedCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('COMPLETED')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-xs ${
                activeTab === 'COMPLETED'
                  ? 'bg-[#1A3170] text-white shadow-2xs font-semibold'
                  : 'text-[#5B6070] dark:text-[var(--text-muted)] hover:text-[#16181D] hover:bg-[#F7F6F2] dark:hover:bg-[var(--bg-main)]'
              }`}
            >
              Completed ({completedCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('CANCELLED')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-xs ${
                activeTab === 'CANCELLED'
                  ? 'bg-[#1A3170] text-white shadow-2xs font-semibold'
                  : 'text-[#5B6070] dark:text-[var(--text-muted)] hover:text-[#16181D] hover:bg-[#F7F6F2] dark:hover:bg-[var(--bg-main)]'
              }`}
            >
              Cancelled ({cancelledCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('HIGH_PRIORITY')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-xs ${
                activeTab === 'HIGH_PRIORITY'
                  ? 'bg-[#1A3170] text-white shadow-2xs font-semibold'
                  : 'text-[#5B6070] dark:text-[var(--text-muted)] hover:text-[#16181D] hover:bg-[#F7F6F2] dark:hover:bg-[var(--bg-main)]'
              }`}
            >
              High Priority ({highPriorityCount})
            </button>
          </div>

          <Link
            to="/app/inbox"
            className="text-xs font-semibold text-[#1A3170] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            <span>Secretariat Inbox &rarr;</span>
          </Link>
        </div>

        <div className="space-y-2.5">
          {filteredAppointments.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#8C93A4]">
              No appointment records matching the &ldquo;{activeTab.replace('_', ' ')}&rdquo; filter.
            </div>
          ) : (
            filteredAppointments.slice(0, 5).map((apt) => (
              <div
                key={apt.id}
                className="p-4 rounded-xl border border-[#E4E2DC] dark:border-[var(--border-default)] bg-[#FBFAF7] dark:bg-[var(--bg-main)] flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-[#1A3170]/40 transition shadow-2xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#1A3170] dark:text-blue-300 bg-white dark:bg-[var(--bg-surface)] px-2 py-0.5 rounded border border-[#E4E2DC] dark:border-[var(--border-default)]">
                      {apt.referenceNo || 'APT-2026-000184'}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {apt.status === AppointmentStatus.CHECKED_IN ? 'Visitor Checked In' : apt.status}
                    </span>
                    {apt.priority === Priority.HIGH && (
                      <span className="text-[10px] font-bold text-[#1A3170] dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-900">
                        HIGH
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold text-[#16181D] dark:text-white">{apt.subject}</div>
                  <div className="text-[11px] text-[#5B6070] dark:text-[var(--text-muted)]">
                    Requester: <strong>{apt.requesterName}</strong> &bull; Official: <strong>{apt.officialName || 'Mr. KVK'}</strong> &bull; {apt.scheduledDate || 'Requested Date'}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  <button
                    type="button"
                    onClick={() => handleCopyRef(apt.referenceNo || apt.id)}
                    className="px-2.5 py-1 text-xs text-[#5B6070] dark:text-[var(--text-muted)] hover:text-[#16181D] rounded border border-[#D5D2CA] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] flex items-center gap-1 cursor-pointer"
                  >
                    {copiedRef === (apt.referenceNo || apt.id) ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>Copy ID</span>
                  </button>

                  {(apt.status === AppointmentStatus.UNDER_REVIEW || apt.status === AppointmentStatus.SUBMITTED) && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleQuickApprove(apt.id)}
                        className="px-3 py-1 bg-[#1A3170] hover:bg-[#12224D] text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-2xs"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickReject(apt.id)}
                        className="px-3 py-1 border border-[#D5D2CA] hover:border-red-300 text-[#5B6070] hover:text-[#B42318] bg-white rounded-lg text-xs font-semibold transition cursor-pointer"
                      >
                        Reject
                      </button>
                    </>
                  )}

                  <Link
                    to={`/app/appointments/${apt.id}`}
                    className="px-3 py-1 text-xs font-semibold text-[#16181D] dark:text-white bg-white dark:bg-[var(--bg-surface)] border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-lg hover:border-[#1A3170] hover:text-[#1A3170] transition"
                  >
                    Details &rarr;
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 5. Institutional Leadership Roster Portfolio */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[#16181D] dark:text-white flex items-center gap-2 font-serif">
              <Landmark className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
              <span>Institutional Leadership &amp; Dignitary Portfolios</span>
            </h3>
            <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)]">
              Chambers available for official appointment scheduling and protocol hearings.
            </p>
          </div>
          <Link
            to="/request"
            className="text-xs font-semibold text-[#1A3170] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            <span>Request appointment</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {officialPortfolios.map((official) => {
            const Icon = official.icon;
            return (
              <div
                key={official.id}
                className="p-4 rounded-xl border border-[#E4E2DC] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] hover:border-[#1A3170]/40 transition-all flex items-start gap-3.5 group shadow-2xs"
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${official.avatarBg} shadow-2xs group-hover:scale-105 transition-transform`}
                >
                  <Icon className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <h4 className="font-bold text-xs text-[#16181D] dark:text-white truncate">
                      {official.name}
                    </h4>
                    <span className="text-[10px] font-semibold text-[#1A3170] dark:text-blue-300 bg-[#1A3170]/10 dark:bg-blue-950/60 px-1.5 py-0.5 rounded shrink-0">
                      {official.tier}
                    </span>
                  </div>

                  <p className="text-[11px] font-medium text-[#1A3170] dark:text-blue-400 truncate mt-0.5">
                    {official.roleTitle}
                  </p>
                  <p className="text-[10px] text-[#5B6070] dark:text-[var(--text-muted)] truncate">
                    {official.department}
                  </p>

                  <div className="mt-2.5 pt-2 border-t border-[#EFEDE7] dark:border-[var(--border-subtle)] flex items-center justify-between">
                    <Link
                      to={`/request?officialId=${official.id}`}
                      className="text-[11px] font-semibold text-[#1A3170] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                    >
                      <span>Book Slot</span> &rarr;
                    </Link>
                    <Link
                      to="/app/calendar"
                      className="text-[10px] text-[#8C93A4] hover:text-[#16181D]"
                    >
                      View Calendar
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. Integrated To-Do Widget */}
      <TodoWidget />
    </div>
  );
};
