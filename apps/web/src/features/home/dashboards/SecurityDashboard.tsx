import { useState, type FC } from 'react';
import { Link } from 'react-router';
import {
  ShieldCheck,
  ShieldAlert,
  QrCode,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  ArrowRight,
  Clock,
  Eye,
} from 'lucide-react';
import { AppointmentStatus, Priority } from '@oams/shared';
import { DonutChart, BarChart, ProgressGauge } from '../charts/ChartComponents';

interface SecurityDashboardProps {
  appointments: any[];
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

export const SecurityDashboard: FC<SecurityDashboardProps> = ({
  appointments,
  onRefresh,
  showToast,
}) => {
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // Security Gate Metrics
  const totalGatePasses = appointments.length;
  const clearedOnCampus = appointments.filter(
    (a) => a.status === AppointmentStatus.CHECKED_IN || a.status === AppointmentStatus.IN_PROGRESS
  ).length;
  const inInspection = appointments.filter(
    (a) => a.status === AppointmentStatus.CONFIRMED
  ).length;
  const departedCampus = appointments.filter(
    (a) => a.status === AppointmentStatus.COMPLETED || a.status === AppointmentStatus.CLOSED
  ).length;
  const flaggedOrDenied = appointments.filter(
    (a) =>
      a.status === AppointmentStatus.CANCELLED ||
      a.status === AppointmentStatus.REJECTED ||
      a.status === AppointmentStatus.NO_SHOW
  ).length;

  const securityComplianceRate = 99;

  const handleCopyRef = (refNo: string) => {
    navigator.clipboard?.writeText(refNo);
    setCopiedRef(refNo);
    setTimeout(() => setCopiedRef(null), 2000);
    showToast(`Copied Security ID #${refNo}`);
  };

  const handleQuickGateClear = (refNo: string) => {
    showToast(`Gate Pass #${refNo}: Physical & Baggage Clearance Verified`);
    onRefresh();
  };

  // Inspection Donut with tonal navy/slate palette
  const securityDonut = [
    { label: 'Cleared On-Campus', value: clearedOnCampus, color: '#1A3170' },
    { label: 'Awaiting Gate Inspection', value: inInspection, color: '#2E5AAC' },
    { label: 'Departed Campus', value: departedCampus, color: '#8FA3BC' },
    { label: 'Flagged / Denied', value: flaggedOrDenied, color: '#C5CED9' },
  ];

  // Gate Checkpoint Throughput
  const gateThroughputData = [
    { label: 'Main Gate 1', value: Math.max(8, Math.round(totalGatePasses * 0.42)), highlight: true },
    { label: 'VIP Gate 2', value: Math.max(5, Math.round(totalGatePasses * 0.28)) },
    { label: 'North Gate', value: Math.max(4, Math.round(totalGatePasses * 0.18)) },
    { label: 'Service Gate', value: Math.max(2, Math.round(totalGatePasses * 0.12)) },
  ];

  return (
    <div className="space-y-6">
      {/* Security Header */}
      <div className="p-6 rounded-3xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#1A3170] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold font-serif text-[#16181D] dark:text-white">
                Security Control Room &amp; Gate Clearance
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1A3170]/10 text-[#1A3170] dark:bg-[#1A3170]/30 dark:text-blue-300 border border-[#1A3170]/20">
                Perimeter Active
              </span>
            </div>
            <p className="text-xs text-[#5B6070] dark:text-[#8E95A5] mt-0.5">
              Gate pass verification, digital QR scanning, contraband screening, and live campus occupancy tracking.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/app/security"
            className="px-4 py-2 rounded-xl bg-[#1A3170] hover:bg-[#132554] text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Launch QR Scanner</span>
          </Link>

          <Link
            to="/app/security"
            className="px-4 py-2 rounded-xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-[#F7F6F2] dark:bg-[#16181D] text-[#16181D] dark:text-white text-xs font-semibold hover:border-[#1A3170] transition flex items-center gap-1.5"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
            <span>Evacuation Log &rarr;</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards: Security - Monochromatic & Bespoke Ink Palette */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Gate Records</span>
            <ShieldCheck className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {totalGatePasses}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Issued passes</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>On-Campus</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {clearedOnCampus}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Cleared perimeter</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>In Inspection</span>
            <Clock className="w-3.5 h-3.5 text-[#2E5AAC] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {inInspection}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">At checkpoints</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Departed</span>
            <Check className="w-3.5 h-3.5 text-[#8FA3BC] dark:text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {departedCampus}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Exit scanned</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Denied / Flagged</span>
            <XCircle className="w-3.5 h-3.5 text-[#C5CED9] dark:text-slate-500" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {flaggedOrDenied}
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Access withheld</span>
        </div>

        <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#5B6070] dark:text-[#8E95A5] uppercase tracking-wider">
            <span>Compliance Rate</span>
            <ShieldCheck className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1.5">
            {securityComplianceRate}%
          </div>
          <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] mt-0.5 block">Perimeter SLA</span>
        </div>
      </div>

      {/* Professional Charts Row: Security */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DonutChart
          title="Perimeter Occupancy Breakdown"
          subtitle="Status of active and expected visitors on premises"
          segments={securityDonut}
          totalLabel="Passes"
        />

        <BarChart
          title="Checkpoint Gate Throughput"
          subtitle="Vehicle &amp; pedestrian clearance by gate"
          data={gateThroughputData}
          color="#1A3170"
          unit="entries"
        />

        <ProgressGauge
          title="Campus Security Compliance"
          subtitle="Visitor background check and baggage clearance"
          value={securityComplianceRate}
          metricLabel="Security SLA"
          statusText="Perimeter Secure"
          color="#1A3170"
        />
      </div>

      {/* Security Gate Pass Verification Queue */}
      <div className="p-6 rounded-3xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold font-serif text-[#16181D] dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
              <span>Gate Access Clearance Queue</span>
            </h3>
            <p className="text-xs text-[#5B6070] dark:text-[#8E95A5]">
              Screen approaching vehicles and visitors before authorizing security barrier opening.
            </p>
          </div>

          <Link
            to="/app/security"
            className="text-xs font-semibold text-[#1A3170] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            <span>Live Security Console</span>
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
                    {apt.referenceNo || 'PASS-SEC'}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      apt.status === AppointmentStatus.CHECKED_IN || apt.status === AppointmentStatus.IN_PROGRESS
                        ? 'bg-[#1A3170] text-white'
                        : apt.status === AppointmentStatus.CONFIRMED
                        ? 'bg-[#1A3170]/10 text-[#1A3170] dark:bg-[#1A3170]/30 dark:text-blue-300 border border-[#1A3170]/20'
                        : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {apt.status === AppointmentStatus.CHECKED_IN ? 'On Campus' : apt.status}
                  </span>
                  {apt.priority === Priority.HIGH && (
                    <span className="text-[10px] font-bold text-[#1A3170] bg-white px-1.5 py-0.5 rounded border border-[#1A3170]/20 dark:bg-[#1E222B] dark:text-blue-300">
                      VIP VEHICLE PASS
                    </span>
                  )}
                </div>
                <div className="text-xs font-bold text-[#16181D] dark:text-white">
                  Subject: {apt.subject} &bull; Holder: {apt.requesterName}
                </div>
                <div className="text-[11px] text-[#5B6070] dark:text-[#8E95A5]">
                  Destination: <strong className="text-[#16181D] dark:text-white">{apt.officialName || 'Main Chambers'}</strong> &bull; Schedule: {apt.scheduledDate || 'Today'}
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

                <button
                  type="button"
                  onClick={() => handleQuickGateClear(apt.referenceNo || apt.id)}
                  className="px-3 py-1 bg-[#1A3170] hover:bg-[#132554] text-white rounded text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>Clear Gate</span>
                </button>

                <Link
                  to="/app/security"
                  className="px-3 py-1 text-xs font-semibold text-[#1A3170] dark:text-blue-400 bg-white dark:bg-[#1E222B] border border-[#E4E2DC] dark:border-[#2A2F3D] rounded hover:bg-[#F7F6F2] dark:hover:bg-[#16181D] transition flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" />
                  <span>Inspect &rarr;</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
