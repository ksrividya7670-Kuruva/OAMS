import { type FC, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { VisitDto } from '@oams/shared';
import { VisitStatus } from '@oams/shared';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import {
  Search,
  QrCode,
  UserPlus,
  Printer,
  Download,
  CheckCircle2,
  Clock,
  ArrowRight,
  UserCheck,
  DoorOpen,
  Calendar,
  RefreshCw,
  X,
} from 'lucide-react';
import { LiveWaitTimer } from './LiveWaitTimer';
import { CheckInModal } from './CheckInModal';
import { DenyModal } from './DenyModal';
import { BadgePrintModal } from './BadgePrintModal';
import { WalkInModal } from './WalkInModal';
import { QrScannerModal } from './QrScannerModal';

export const ReceptionPage: FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Filters
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split('T')[0]);
  const [searchFilter, setSearchFilter] = useState('');

  // Modals state
  const [checkInVisit, setCheckInVisit] = useState<VisitDto | null>(null);
  const [denyVisit, setDenyVisit] = useState<VisitDto | null>(null);
  const [badgePrintVisit, setBadgePrintVisit] = useState<VisitDto | null>(null);
  const [isWalkInOpen, setIsWalkInOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Fetch visits list (auto-polls every 15s to keep board fresh)
  const {
    data: visitsData,
    isFetching,
    refetch,
  } = useQuery<{ visits: VisitDto[] }>({
    queryKey: ['visits', dateFilter, searchFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (dateFilter) params.append('date', dateFilter);
      if (searchFilter) params.append('search', searchFilter);
      return api.get<{ visits: VisitDto[] }>(`/api/v1/visits?${params.toString()}`);
    },
    refetchInterval: 15000,
  });

  // Display all campus visits
  const allVisits: VisitDto[] =
    visitsData?.visits || (Array.isArray(visitsData) ? (visitsData as VisitDto[]) : []);
  const visits: VisitDto[] = allVisits;

  // Helper to update local query cache immediately for instant, responsive UX
  const updateVisitStatusInCache = (
    visitId: string,
    status: VisitStatus,
    extra: Partial<VisitDto> = {},
  ) => {
    queryClient.setQueriesData({ queryKey: ['visits'] }, (old: any) => {
      if (!old) return old;
      const updateList = (list: any[]) =>
        list.map((v) =>
          v.id === visitId
            ? { ...v, status, ...extra, updatedAt: new Date().toISOString() }
            : v,
        );
      if (Array.isArray(old)) return updateList(old);
      if (old.visits) return { ...old, visits: updateList(old.visits) };
      return old;
    });
  };

  // Mutations for state transitions with instant optimistic updates
  const arriveMutation = useMutation({
    mutationFn: async (visitId: string) => {
      updateVisitStatusInCache(visitId, VisitStatus.ARRIVED, {
        arrivedAt: new Date().toISOString(),
      });
      return api.post(`/api/v1/visits/${visitId}/arrive`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['visits'] }),
  });

  const withHostMutation = useMutation({
    mutationFn: async (visitId: string) => {
      updateVisitStatusInCache(visitId, VisitStatus.WITH_HOST, {
        withHostAt: new Date().toISOString(),
      });
      return api.post(`/api/v1/visits/${visitId}/with-host`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['visits'] }),
  });

  const checkOutMutation = useMutation({
    mutationFn: async (visitId: string) => {
      updateVisitStatusInCache(visitId, VisitStatus.CHECKED_OUT, {
        checkedOutAt: new Date().toISOString(),
      });
      return api.post(`/api/v1/visits/${visitId}/check-out`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['visits'] }),
  });

  // Group visits into 5 Kanban columns
  const expectedVisits = visits.filter((v) => v.status === VisitStatus.EXPECTED);
  const arrivedVisits = visits.filter((v) => v.status === VisitStatus.ARRIVED);
  const waitingVisits = visits.filter((v) => v.status === VisitStatus.CHECKED_IN);
  const withHostVisits = visits.filter((v) => v.status === VisitStatus.WITH_HOST);
  const completedVisits = visits.filter(
    (v) =>
      v.status === VisitStatus.CHECKED_OUT ||
      v.status === VisitStatus.DENIED ||
      v.status === VisitStatus.NO_SHOW,
  );

  // Unified official Reception Desk header
  const headerInfo = {
    title: 'Reception Desk & Visitor Management',
    subtitle: 'Real-time gate arrival queue, badge issuance, and campus-wide lobby tracking',
    badge: 'Live Gate Desk',
  };

  // Download printable daily expected list PDF / roster
  // Download / Print official daily visitor register
  const handlePrintDailyRoster = () => {
    const printWin = window.open('', '_blank', 'width=960,height=720');
    if (!printWin) {
      alert('Pop-up blocked. Please allow pop-ups to view printable visitor register.');
      return;
    }
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>OAMS Gate Visitor Register - ${dateFilter}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 28px; color: #16181D; background: #fff; }
          .header { border-bottom: 2px solid #1A3170; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 18px; font-weight: 800; color: #1A3170; letter-spacing: 0.5px; text-transform: uppercase; }
          .subtitle { font-size: 12px; color: #5B6070; margin-top: 3px; }
          .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 12px; padding: 10px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; font-size: 11px; }
          .meta-item strong { display: block; color: #1A3170; font-size: 10px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 18px; }
          th { background: #1A3170; color: #fff; border: 1px solid #1A3170; padding: 8px 6px; text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
          td { border: 1px solid #CBD5E1; padding: 7px 6px; vertical-align: top; }
          tr:nth-child(even) { background: #F8FAFC; }
          .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 10px; font-family: monospace; }
          .badge-expected { background: #EFF6FF; color: #1E40AF; border: 1px solid #BFDBFE; }
          .badge-arrived { background: #FFFBEB; color: #92400E; border: 1px solid #FDE68A; }
          .badge-checkedin { background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; }
          .badge-withhost { background: #EEF2FF; color: #3730A3; border: 1px solid #C7D2FE; }
          .badge-departed { background: #F1F5F9; color: #334155; border: 1px solid #CBD5E1; }
          .badge-denied { background: #FEF2F2; color: #991B1B; border: 1px solid #FECACA; }
          .signatures { margin-top: 48px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; font-size: 11px; }
          .sig-box { border-top: 1px solid #475569; padding-top: 8px; text-align: center; }
          .sig-title { font-weight: 700; color: #16181D; }
          .sig-sub { font-size: 10px; color: #64748B; margin-top: 2px; }
          @media print {
            body { padding: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">OAMS Institutional Secretariat — Gate Visitor Register</div>
          <div class="subtitle">Official Daily Entry Queue & Security Protocol Register (§15 Compliance)</div>
          <div class="meta-grid">
            <div class="meta-item"><strong>Date</strong>${dateFilter}</div>
            <div class="meta-item"><strong>Portfolio Scope</strong>${headerInfo.badge}</div>
            <div class="meta-item"><strong>Total Records</strong>${visits.length} Visitor(s)</div>
            <div class="meta-item"><strong>Generated On</strong>${new Date().toLocaleString()}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 28px;">#</th>
              <th>Pass Reference</th>
              <th>Visitor Name</th>
              <th>Organization</th>
              <th>Host Official</th>
              <th>Venue / Chamber</th>
              <th>Badge #</th>
              <th>Vehicle</th>
              <th>Scheduled</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${visits.length === 0 ? '<tr><td colspan="10" style="text-align: center; padding: 20px; color: #64748B;">No visitors found for the selected scope and date.</td></tr>' : visits.map((v, i) => {
              const statusClass = v.status === VisitStatus.EXPECTED ? 'badge-expected' :
                v.status === VisitStatus.ARRIVED ? 'badge-arrived' :
                v.status === VisitStatus.CHECKED_IN ? 'badge-checkedin' :
                v.status === VisitStatus.WITH_HOST ? 'badge-withhost' :
                v.status === VisitStatus.DENIED ? 'badge-denied' : 'badge-departed';
              return `
                <tr>
                  <td>${i + 1}</td>
                  <td><strong>${v.referenceNo}</strong></td>
                  <td><strong>${v.visitorName}</strong></td>
                  <td>${v.organization || 'Individual'}</td>
                  <td>${v.hostOfficialName || 'Official'}</td>
                  <td>${v.roomName || 'Main Complex'}</td>
                  <td><span class="badge ${statusClass}">${v.badgeNo || '—'}</span></td>
                  <td>${v.vehicleNo || '—'}</td>
                  <td>${v.scheduledStartTime ? new Date(v.scheduledStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today'}</td>
                  <td><span class="badge ${statusClass}">${v.status === VisitStatus.CHECKED_OUT ? 'DEPARTED' : v.status}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <div class="signatures">
          <div class="sig-box">
            <div class="sig-title">Reception Desk Officer</div>
            <div class="sig-sub">Signature & Gate Seal</div>
          </div>
          <div class="sig-box">
            <div class="sig-title">Security In-Charge</div>
            <div class="sig-sub">Identity Verified (§15)</div>
          </div>
          <div class="sig-box">
            <div class="sig-title">Executive Secretariat Verified</div>
            <div class="sig-sub">Protocol Compliance Validated</div>
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;
    printWin.document.write(html);
    printWin.document.close();
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-sans text-xl sm:text-2xl font-bold tracking-tight text-[#16181D] dark:text-white">
              {headerInfo.title}
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EFF4FB] text-[#1A3170] dark:bg-slate-800 dark:text-blue-300 border border-[#CBD5E1] dark:border-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1A3170] dark:bg-blue-400" />
              {headerInfo.badge}
            </span>
          </div>
          <p className="text-xs text-[#5B6070] dark:text-slate-400 mt-1">
            {headerInfo.subtitle}
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#D5D2CA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#16181D] dark:text-slate-200 hover:bg-[#F7F6F2] dark:hover:bg-slate-700/60 cursor-pointer transition-colors shadow-2xs"
          >
            <QrCode className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
            Scan Pass / QR
          </button>

          <button
            type="button"
            onClick={handlePrintDailyRoster}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#D5D2CA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#16181D] dark:text-slate-200 hover:bg-[#F7F6F2] dark:hover:bg-slate-700/60 cursor-pointer transition-colors shadow-2xs"
            title="Open printable gate register roster"
          >
            <Download className="w-3.5 h-3.5 text-[#475569] dark:text-slate-400" />
            Daily List (PDF)
          </button>

          <button
            type="button"
            onClick={() => setIsWalkInOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#1A3170] hover:bg-[#132554] text-white cursor-pointer transition-colors shadow-xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Register Walk-in
          </button>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded-lg border border-[#D5D2CA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#5B6070] hover:text-[#16181D] hover:bg-[#F7F6F2] dark:hover:bg-slate-700/60 cursor-pointer transition-colors shadow-2xs"
            title="Refresh Board"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-[#1A3170]' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Stats Summary Cards with Unique Solid Institutional Accents */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Expected */}
        <div className="p-3.5 rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-2xs hover:shadow-xs transition">
          <div>
            <div className="text-[11px] font-semibold text-[#5B6070] dark:text-slate-400 uppercase tracking-wider">
              Expected
            </div>
            <div className="text-2xl font-bold tracking-tight text-[#1E40AF] dark:text-blue-400 mt-0.5">
              {expectedVisits.length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] dark:bg-blue-950/40 text-[#2563EB] dark:text-blue-400 border border-[#DBEAFE] dark:border-blue-900 flex items-center justify-center font-bold">
            <Calendar className="w-4 h-4" />
          </div>
        </div>

        {/* Arrived at Gate */}
        <div className="p-3.5 rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-2xs hover:shadow-xs transition">
          <div>
            <div className="text-[11px] font-semibold text-[#5B6070] dark:text-slate-400 uppercase tracking-wider">
              At Gate
            </div>
            <div className="text-2xl font-bold tracking-tight text-[#B45309] dark:text-amber-400 mt-0.5">
              {arrivedVisits.length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-[#FFFBEB] dark:bg-amber-950/40 text-[#D97706] dark:text-amber-400 border border-[#FDE68A] dark:border-amber-900 flex items-center justify-center font-bold">
            <DoorOpen className="w-4 h-4" />
          </div>
        </div>

        {/* Waiting Lobby */}
        <div className="p-3.5 rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-2xs hover:shadow-xs transition">
          <div>
            <div className="text-[11px] font-semibold text-[#5B6070] dark:text-slate-400 uppercase tracking-wider">
              In Lobby
            </div>
            <div className="text-2xl font-bold tracking-tight text-[#065F46] dark:text-emerald-400 mt-0.5">
              {waitingVisits.length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-[#ECFDF5] dark:bg-emerald-950/40 text-[#059669] dark:text-emerald-400 border border-[#A7F3D0] dark:border-emerald-900 flex items-center justify-center font-bold">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        {/* With Host (Royal Indigo Accent) */}
        <div className="p-3.5 rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-2xs hover:shadow-xs transition">
          <div>
            <div className="text-[11px] font-semibold text-[#5B6070] dark:text-slate-400 uppercase tracking-wider">
              With Host
            </div>
            <div className="text-2xl font-bold tracking-tight text-[#3730A3] dark:text-indigo-400 mt-0.5">
              {withHostVisits.length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950/40 text-[#4F46E5] dark:text-indigo-400 border border-[#C7D2FE] dark:border-indigo-900 flex items-center justify-center font-bold">
            <UserCheck className="w-4 h-4" />
          </div>
        </div>

        {/* Completed / Left */}
        <div className="p-3.5 rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-2xs hover:shadow-xs transition">
          <div>
            <div className="text-[11px] font-semibold text-[#5B6070] dark:text-slate-400 uppercase tracking-wider">
              Completed
            </div>
            <div className="text-2xl font-bold tracking-tight text-[#334155] dark:text-slate-400 mt-0.5">
              {completedVisits.length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-[#F1F5F9] dark:bg-slate-800 text-[#64748B] dark:text-slate-400 border border-[#CBD5E1] dark:border-slate-700 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-2.5 sm:p-3 rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-[#8C93A4] dark:text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search visitor name, badge #, reference, host..."
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-[#D5D2CA] dark:border-slate-700 bg-[#F7F6F2]/60 dark:bg-slate-800 text-[#16181D] dark:text-white placeholder:text-[#8C93A4] focus:outline-none focus:ring-1 focus:ring-[#1A3170] focus:border-[#1A3170] transition"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                className="absolute right-2.5 top-2 text-[#8C93A4] hover:text-[#16181D] dark:hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

        </div>

        {/* Date Selector & Scope Summary Indicator */}
        <div className="flex items-center gap-3">
          <div className="text-xs text-[#5B6070] dark:text-slate-400">
            Viewing:{' '}
            <span className="font-semibold text-[#16181D] dark:text-white">
              Campus Visitors ({visits.length})
            </span>
          </div>

          <div className="h-4 w-[1px] bg-[#E4E2DC] dark:bg-slate-700 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#5B6070] dark:text-slate-400 font-medium">Date:</span>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg border border-[#D5D2CA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#16181D] dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#1A3170] cursor-pointer"
            />
            {dateFilter !== new Date().toISOString().split('T')[0] && (
              <button
                type="button"
                onClick={() => setDateFilter(new Date().toISOString().split('T')[0])}
                className="px-2 py-0.5 text-[11px] font-semibold text-[#1A3170] hover:underline cursor-pointer"
              >
                Today
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 5-Column Reception Kanban Board with Solid Unique Theme */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5 items-start">
        {/* Column 1: EXPECTED */}
        <div className="flex flex-col rounded-2xl border border-[#E4E2DC] dark:border-slate-800 bg-[#F9F8F5] dark:bg-slate-900/40 overflow-hidden shadow-xs">
          <div className="px-3.5 py-2.5 border-b border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
              <span className="text-xs font-semibold text-[#16181D] dark:text-white">Expected</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE]">
              {expectedVisits.length}
            </span>
          </div>

          <div className="p-3 space-y-3 min-h-[360px] max-h-[calc(100vh-280px)] overflow-y-auto">
            {expectedVisits.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#8C93A4] dark:text-slate-500">
                No scheduled arrivals remaining
              </div>
            ) : (
              expectedVisits.map((visit) => (
                <div
                  key={visit.id}
                  className="p-3.5 rounded-xl border border-[#E4E2DC] dark:border-slate-700/80 bg-white dark:bg-slate-800 space-y-2.5 shadow-2xs hover:shadow-xs hover:border-[#2563EB]/40 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-[#16181D] dark:text-white truncate">
                        {visit.visitorName}
                      </div>
                      <div className="text-[11px] text-[#5B6070] dark:text-slate-400 truncate mt-0.5">
                        {visit.organization || 'Individual Visitor'}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-[#1E40AF] dark:text-blue-400 bg-[#EFF6FF] dark:bg-blue-950/50 border border-[#BFDBFE] dark:border-blue-900 px-1.5 py-0.5 rounded shrink-0 font-semibold">
                      {visit.scheduledStartTime
                        ? new Date(visit.scheduledStartTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Today'}
                    </span>
                  </div>

                  {(visit.subject || visit.purpose) && (
                    <div className="text-[11px] text-[#475569] dark:text-slate-400 line-clamp-2 bg-[#F8FAFC] dark:bg-slate-900/40 p-1.5 rounded border border-[#F1F5F9] dark:border-slate-800">
                      {visit.purpose || visit.subject}
                    </div>
                  )}

                  <div className="text-xs text-[#5B6070] dark:text-slate-400 pt-1.5 border-t border-[#F0EFEA] dark:border-slate-700/60 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[#8C93A4] dark:text-slate-500 text-[11px]">Host:</span>
                      <span className="font-medium text-[#16181D] dark:text-slate-200 truncate ml-2">
                        {visit.hostOfficialName || 'Official'}
                      </span>
                    </div>
                    {visit.roomName && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#8C93A4] dark:text-slate-500 text-[11px]">Venue:</span>
                        <span className="text-[#16181D] dark:text-slate-200 truncate ml-2">
                          {visit.roomName}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#F0EFEA] dark:border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => arriveMutation.mutate(visit.id)}
                      disabled={arriveMutation.isPending}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-[#D5D2CA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#16181D] dark:text-slate-300 hover:bg-[#F7F6F2] dark:hover:bg-slate-700 cursor-pointer transition-colors"
                    >
                      {arriveMutation.isPending ? 'Marking...' : 'Mark Arrived'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCheckInVisit(visit)}
                      className="px-3 py-1 text-xs font-semibold rounded-lg bg-[#059669] hover:bg-[#047857] text-white cursor-pointer transition-colors shadow-2xs"
                    >
                      Check In
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 2: ARRIVED AT GATE */}
        <div className="flex flex-col rounded-2xl border border-[#E4E2DC] dark:border-slate-800 bg-[#F9F8F5] dark:bg-slate-900/40 overflow-hidden shadow-xs">
          <div className="px-3.5 py-2.5 border-b border-[#E2E8F0] dark:border-slate-800 bg-[#FFFDF7] dark:bg-slate-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#D97706]" />
              <span className="text-xs font-semibold text-[#16181D] dark:text-white">Arrived at Gate</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]">
              {arrivedVisits.length}
            </span>
          </div>

          <div className="p-3 space-y-3 min-h-[360px] max-h-[calc(100vh-280px)] overflow-y-auto">
            {arrivedVisits.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#8C93A4] dark:text-slate-500">
                No gate arrivals pending
              </div>
            ) : (
              arrivedVisits.map((visit) => (
                <div
                  key={visit.id}
                  className="p-3.5 rounded-xl border border-[#E4E2DC] dark:border-slate-700/80 bg-white dark:bg-slate-800 space-y-2.5 shadow-2xs hover:shadow-xs hover:border-[#D97706]/40 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-[#16181D] dark:text-white truncate">
                        {visit.visitorName}
                      </div>
                      <div className="text-[11px] text-[#5B6070] dark:text-slate-400 truncate mt-0.5">
                        {visit.organization || 'Individual'} • Ref: {visit.referenceNo}
                      </div>
                    </div>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A] shrink-0 font-mono">
                      GATE
                    </span>
                  </div>

                  {(visit.subject || visit.purpose) && (
                    <div className="text-[11px] text-[#475569] dark:text-slate-400 line-clamp-2 bg-[#FFFDF7] dark:bg-slate-900/40 p-1.5 rounded border border-[#FDE68A]/60">
                      {visit.purpose || visit.subject}
                    </div>
                  )}

                  <div className="text-xs text-[#5B6070] dark:text-slate-400 pt-1.5 border-t border-[#F0EFEA] dark:border-slate-700/60 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[#8C93A4] dark:text-slate-500 text-[11px]">Host:</span>
                      <span className="font-medium text-[#16181D] dark:text-slate-200 truncate ml-2">
                        {visit.hostOfficialName || 'Official'}
                      </span>
                    </div>
                    {visit.vehicleNo && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#8C93A4] dark:text-slate-500 text-[11px]">Vehicle:</span>
                        <span className="font-mono text-[#16181D] dark:text-slate-200 ml-2 font-semibold">
                          {visit.vehicleNo}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-2 border-t border-[#F0EFEA] dark:border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => setDenyVisit(visit)}
                      className="px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer transition-colors"
                    >
                      Deny
                    </button>
                    <button
                      type="button"
                      onClick={() => setCheckInVisit(visit)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-[#059669] hover:bg-[#047857] text-white cursor-pointer transition-colors shadow-2xs"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Verify & Badge
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 3: WAITING IN LOBBY */}
        <div className="flex flex-col rounded-2xl border border-[#E4E2DC] dark:border-slate-800 bg-[#F9F8F5] dark:bg-slate-900/40 overflow-hidden shadow-xs">
          <div className="px-3.5 py-2.5 border-b border-[#E2E8F0] dark:border-slate-800 bg-[#F7FCF9] dark:bg-slate-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
              <span className="text-xs font-semibold text-[#16181D] dark:text-white">Waiting Lobby</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]">
              {waitingVisits.length}
            </span>
          </div>

          <div className="p-3 space-y-3 min-h-[360px] max-h-[calc(100vh-280px)] overflow-y-auto">
            {waitingVisits.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#8C93A4] dark:text-slate-500">
                No visitors in waiting lobby
              </div>
            ) : (
              waitingVisits.map((visit) => (
                <div
                  key={visit.id}
                  className="p-3.5 rounded-xl border border-[#E4E2DC] dark:border-slate-700/80 bg-white dark:bg-slate-800 space-y-2.5 shadow-2xs hover:shadow-xs hover:border-[#059669]/40 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-[#16181D] dark:text-white truncate">
                        {visit.visitorName}
                      </div>
                      <div className="text-[11px] text-[#5B6070] dark:text-slate-400 truncate mt-0.5">
                        {visit.organization || 'Visitor'}
                      </div>
                    </div>
                    {visit.badgeNo && (
                      <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0] shrink-0">
                        {visit.badgeNo}
                      </span>
                    )}
                  </div>

                  {/* Live Waiting Timer */}
                  <div className="flex items-center justify-between pt-1.5 border-t border-[#F0EFEA] dark:border-slate-700/60">
                    <span className="text-[11px] font-medium text-[#8C93A4] dark:text-slate-500">
                      Wait Time:
                    </span>
                    <LiveWaitTimer checkedInAt={visit.checkedInAt} />
                  </div>

                  <div className="text-xs text-[#5B6070] dark:text-slate-400 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[#8C93A4] dark:text-slate-500 text-[11px]">Host:</span>
                      <span className="font-medium text-[#16181D] dark:text-slate-200 truncate ml-2">
                        {visit.hostOfficialName || 'Official'}
                      </span>
                    </div>
                    {visit.roomName && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#8C93A4] dark:text-slate-500 text-[11px]">Venue:</span>
                        <span className="text-[#16181D] dark:text-slate-200 truncate ml-2">
                          {visit.roomName}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-1 border-t border-[#F0EFEA] dark:border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => setBadgePrintVisit(visit)}
                      className="p-1.5 rounded-lg text-[#5B6070] hover:text-[#16181D] hover:bg-[#F0EFEA] dark:hover:bg-slate-700 cursor-pointer transition-colors"
                      title="Reprint Badge"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => checkOutMutation.mutate(visit.id)}
                        disabled={checkOutMutation.isPending}
                        className="px-2.5 py-1 text-xs font-semibold text-[#5B6070] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer transition-colors"
                      >
                        Exit
                      </button>
                      <button
                        type="button"
                        onClick={() => withHostMutation.mutate(visit.id)}
                        disabled={withHostMutation.isPending}
                        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-[#3B3F8C] hover:bg-[#2E3273] text-white cursor-pointer transition-colors shadow-2xs"
                      >
                        <span>{withHostMutation.isPending ? 'Calling...' : 'Call In'}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 4: WITH HOST (Solid Royal Indigo Identity) */}
        <div className="flex flex-col rounded-2xl border border-[#E4E2DC] dark:border-slate-800 bg-[#F9F8F5] dark:bg-slate-900/40 overflow-hidden shadow-xs">
          <div className="px-3.5 py-2.5 border-b border-[#E2E8F0] dark:border-slate-800 bg-[#F8F9FE] dark:bg-slate-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#4F46E5]" />
              <span className="text-xs font-semibold text-[#16181D] dark:text-white">With Host</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#EEF2FF] text-[#3730A3] border border-[#C7D2FE]">
              {withHostVisits.length}
            </span>
          </div>

          <div className="p-3 space-y-3 min-h-[360px] max-h-[calc(100vh-280px)] overflow-y-auto">
            {withHostVisits.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#8C93A4] dark:text-slate-500">
                No active meetings in progress
              </div>
            ) : (
              withHostVisits.map((visit) => (
                <div
                  key={visit.id}
                  className="p-3.5 rounded-xl border border-[#E4E2DC] dark:border-slate-700/80 bg-white dark:bg-slate-800 space-y-2.5 shadow-2xs hover:shadow-xs hover:border-[#4F46E5]/40 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-[#16181D] dark:text-white truncate">
                        {visit.visitorName}
                      </div>
                      <div className="text-[11px] text-[#5B6070] dark:text-slate-400 truncate mt-0.5">
                        {visit.organization || 'Visitor'}
                      </div>
                    </div>
                    {visit.badgeNo && (
                      <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-[#EEF2FF] text-[#3730A3] border border-[#C7D2FE] shrink-0">
                        {visit.badgeNo}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-[#5B6070] dark:text-slate-400 pt-1.5 border-t border-[#F0EFEA] dark:border-slate-700/60 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[#8C93A4] dark:text-slate-500 text-[11px]">Meeting With:</span>
                      <span className="font-semibold text-[#3730A3] dark:text-indigo-300 truncate ml-2">
                        {visit.hostOfficialName}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#8C93A4] dark:text-slate-500 text-[11px]">Chamber / Venue:</span>
                        <span className="font-medium text-[#16181D] dark:text-slate-200 truncate ml-2">
                          {visit.roomName || 'Executive Chamber'}
                        </span>
                      </div>
                    </div>
                    {visit.withHostAt && (
                      <div className="flex items-center justify-between text-[11px] pt-0.5">
                        <span className="text-[#8C93A4] dark:text-slate-500">In meeting since:</span>
                        <span className="font-mono text-[#5B6070] dark:text-slate-400 font-semibold">
                          {new Date(visit.withHostAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex items-center justify-end border-t border-[#F0EFEA] dark:border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => checkOutMutation.mutate(visit.id)}
                      disabled={checkOutMutation.isPending}
                      className="px-3.5 py-1 text-xs font-semibold rounded-lg bg-[#334155] hover:bg-[#1E293B] text-white cursor-pointer transition-colors shadow-2xs"
                    >
                      {checkOutMutation.isPending ? 'Checking Out...' : 'Check Out & Exit'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 5: COMPLETED / DEPARTED */}
        <div className="flex flex-col rounded-2xl border border-[#E4E2DC] dark:border-slate-800 bg-[#F9F8F5] dark:bg-slate-900/40 overflow-hidden shadow-xs">
          <div className="px-3.5 py-2.5 border-b border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#64748B]" />
              <span className="text-xs font-semibold text-[#16181D] dark:text-white">Checked Out</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#F1F5F9] text-[#334155] border border-[#E2E8F0]">
              {completedVisits.length}
            </span>
          </div>

          <div className="p-3 space-y-3 min-h-[360px] max-h-[calc(100vh-280px)] overflow-y-auto opacity-85">
            {completedVisits.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#8C93A4] dark:text-slate-500">
                No concluded visits today
              </div>
            ) : (
              completedVisits.map((visit) => (
                <div
                  key={visit.id}
                  className="p-3.5 rounded-xl border border-[#E4E2DC] dark:border-slate-700/80 bg-white dark:bg-slate-800 space-y-2 shadow-2xs hover:shadow-xs transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-xs text-[#16181D] dark:text-white truncate block">
                        {visit.visitorName}
                      </span>
                      <div className="text-[11px] text-[#5B6070] dark:text-slate-400 truncate mt-0.5">
                        {visit.organization || 'Visitor'}
                      </div>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        visit.status === VisitStatus.DENIED
                          ? 'bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA]'
                          : visit.status === VisitStatus.NO_SHOW
                            ? 'bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]'
                            : 'bg-[#F1F5F9] text-[#334155] border border-[#CBD5E1]'
                      }`}
                    >
                      {visit.status === VisitStatus.CHECKED_OUT ? 'DEPARTED' : visit.status}
                    </span>
                  </div>

                  {visit.deniedReason && (
                    <div className="text-[11px] text-red-700 bg-red-50 p-1.5 rounded border border-red-200">
                      Reason: {visit.deniedReason}
                    </div>
                  )}

                  <div className="text-xs text-[#5B6070] dark:text-slate-400 pt-1.5 border-t border-[#F0EFEA] dark:border-slate-700/60 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[#8C93A4] dark:text-slate-500 text-[11px]">Host:</span>
                      <span className="font-medium text-[#16181D] dark:text-slate-200 truncate ml-2">
                        {visit.hostOfficialName || 'Official'}
                      </span>
                    </div>
                    {visit.checkedOutAt && (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#8C93A4] dark:text-slate-500">Departed:</span>
                        <span className="font-mono text-[#5B6070] dark:text-slate-400 font-semibold">
                          {new Date(visit.checkedOutAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <CheckInModal
        visit={checkInVisit}
        isOpen={!!checkInVisit}
        onClose={() => setCheckInVisit(null)}
        onSuccess={(updated, shouldPrint) => {
          setCheckInVisit(null);
          updateVisitStatusInCache(updated.id, VisitStatus.CHECKED_IN, updated);
          queryClient.invalidateQueries({ queryKey: ['visits'] });
          if (shouldPrint) {
            setBadgePrintVisit(updated);
          }
        }}
      />

      <DenyModal
        visit={denyVisit}
        isOpen={!!denyVisit}
        onClose={() => setDenyVisit(null)}
        onSuccess={(updated) => {
          setDenyVisit(null);
          updateVisitStatusInCache(updated.id, VisitStatus.DENIED, updated);
          queryClient.invalidateQueries({ queryKey: ['visits'] });
        }}
      />

      <BadgePrintModal
        visit={badgePrintVisit}
        isOpen={!!badgePrintVisit}
        onClose={() => setBadgePrintVisit(null)}
      />

      <WalkInModal
        isOpen={isWalkInOpen}
        onClose={() => setIsWalkInOpen(false)}
        defaultOfficialId={user?.officialId || ''}
        onSuccess={(newVisit) => {
          setIsWalkInOpen(false);
          queryClient.setQueriesData({ queryKey: ['visits'] }, (old: any) => {
            if (!old) return old;
            const addToList = (list: any[]) => [newVisit, ...list];
            if (Array.isArray(old)) return addToList(old);
            if (old.visits) return { ...old, visits: addToList(old.visits), total: (old.total || 0) + 1 };
            return old;
          });
          queryClient.invalidateQueries({ queryKey: ['visits'] });
        }}
      />

      <QrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onSelectVisit={(v) => {
          // If already checked in, show badge print, otherwise check in
          if (v.status === VisitStatus.CHECKED_IN || v.status === VisitStatus.WITH_HOST) {
            setBadgePrintVisit(v);
          } else {
            setCheckInVisit(v);
          }
        }}
        onCheckInDirect={(v) => setCheckInVisit(v)}
      />
    </div>
  );
};
