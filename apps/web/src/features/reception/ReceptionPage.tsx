import { type FC, useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { VisitStatus, RoleCode, type VisitDto } from '@oams/shared';
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
  FileText,
  Car,
  Bell,
  Phone,
  Mail,
  Users,
} from 'lucide-react';
import { LiveWaitTimer } from './LiveWaitTimer';
import { CheckInModal } from './CheckInModal';
import { DenyModal } from './DenyModal';
import { BadgePrintModal } from './BadgePrintModal';
import { WalkInModal } from './WalkInModal';
import { QrScannerModal } from './QrScannerModal';

export type ReceptionPerspective = 'MY_CHAMBER' | 'GATE_SECURITY' | 'SECRETARIAT';

// Helper: Format raw enum values into human-readable purpose labels
const formatPurposeCategory = (purpose?: string | null, subject?: string | null): string => {
  if (!purpose && !subject) return 'General Official Appointment';
  const val = (purpose || subject || '').trim();
  const MAP: Record<string, string> = {
    APPROVAL_REQUEST: 'Administrative Approval Request',
    OFFICIAL_MEETING: 'Official Institutional Meeting',
    VIP_DELEGATION: 'High-Level VIP Delegation',
    CAMPUS_VISIT: 'Campus / Institutional Visit',
    ACADEMIC: 'Academic Review & Consultation',
    GRIEVANCE: 'Institutional Representation',
    VENDOR: 'Vendor & Procurement Review',
    PRESS_MEDIA: 'Press & Media Briefing',
    GENERAL: 'General Official Appointment',
    OTHER: 'General Official Visit',
  };
  if (MAP[val]) return MAP[val];
  if (/^[A-Z0-9_]+$/.test(val)) {
    return val
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return val;
};

// Helper: Title-case visitor names cleanly
const formatVisitorName = (name: string): string => {
  if (!name) return 'Guest Visitor';
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

export const ReceptionPage: FC = () => {
  const queryClient = useQueryClient();
  const { user, hasRole } = useAuth();

  // Role detection
  const isOfficialOrFaculty = Boolean(
    user?.officialId || hasRole(RoleCode.OFFICIAL) || hasRole(RoleCode.FACULTY),
  );
  const isSecurityOrReception = hasRole(RoleCode.RECEPTION) || hasRole(RoleCode.SECURITY);
  const isSecretariat = hasRole(RoleCode.PA) || hasRole(RoleCode.EA);

  // Role-derived default perspective
  const defaultPerspective: ReceptionPerspective = isOfficialOrFaculty
    ? 'MY_CHAMBER'
    : isSecurityOrReception
      ? 'GATE_SECURITY'
      : isSecretariat
        ? 'SECRETARIAT'
        : 'GATE_SECURITY';

  const [selectedPerspective, setSelectedPerspective] = useState<ReceptionPerspective | null>(null);
  const perspective = selectedPerspective || defaultPerspective;

  // Filters
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split('T')[0]);
  const [searchFilter, setSearchFilter] = useState('');

  // Modals state
  const [checkInVisit, setCheckInVisit] = useState<VisitDto | null>(null);
  const [denyVisit, setDenyVisit] = useState<VisitDto | null>(null);
  const [badgePrintVisit, setBadgePrintVisit] = useState<VisitDto | null>(null);
  const [isWalkInOpen, setIsWalkInOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Real-time synchronization: listen for appointment creation & visit updates across tabs/windows
  useEffect(() => {
    const handleSync = () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
    };
    window.addEventListener('oams-visits-updated', handleSync);
    window.addEventListener('oams-visit-created', handleSync);
    window.addEventListener('oams-appointments-updated', handleSync);
    return () => {
      window.removeEventListener('oams-visits-updated', handleSync);
      window.removeEventListener('oams-visit-created', handleSync);
      window.removeEventListener('oams-appointments-updated', handleSync);
    };
  }, [queryClient]);

  // Fetch visits list (auto-polls every 15s to keep board fresh)
  const {
    data: visitsData,
    isFetching,
    refetch,
  } = useQuery<{ visits: VisitDto[] }>({
    queryKey: ['visits', dateFilter, searchFilter, user?.officialId, perspective, isOfficialOrFaculty],
    queryFn: () => {
      const params = new URLSearchParams();
      if (dateFilter && dateFilter !== 'ALL') params.append('date', dateFilter);
      if (searchFilter) params.append('search', searchFilter);
      if (perspective === 'MY_CHAMBER' && isOfficialOrFaculty && user?.officialId) {
        params.append('officialId', user.officialId);
      }
      return api.get<{ visits: VisitDto[] }>(`/api/v1/visits?${params.toString()}`);
    },
    refetchInterval: 15000,
  });

  const allVisits: VisitDto[] = useMemo(() => {
    if (!visitsData) return [];
    if (Array.isArray(visitsData)) return visitsData as VisitDto[];
    return visitsData.visits || [];
  }, [visitsData]);

  // Filter visits based on active role & perspective
  const visits = useMemo(() => {
    if (perspective === 'MY_CHAMBER' && isOfficialOrFaculty) {
      return allVisits.filter((v) => {
        if (user?.officialId && (v.hostOfficialId === user.officialId || (v as any).officialId === user.officialId)) return true;
        if (user?.fullName && v.hostOfficialName) {
          const u = user.fullName.toLowerCase().replace(/^(mr\.|dr\.|prof\.|ms\.|mrs\.)\s*/i, '').trim();
          const h = v.hostOfficialName.toLowerCase().replace(/^(mr\.|dr\.|prof\.|ms\.|mrs\.)\s*/i, '').trim();
          if (u && h && (h.includes(u) || u.includes(h))) return true;
        }
        return false;
      });
    }
    if (perspective === 'SECRETARIAT' && isSecretariat && user?.assignedOfficialIds && user.assignedOfficialIds.length > 0) {
      return allVisits.filter((v) =>
        user.assignedOfficialIds!.includes(v.hostOfficialId || (v as any).officialId),
      );
    }
    const isCitizen =
      !user?.officialId &&
      (!user?.roles ||
        user.roles.includes(RoleCode.GUEST) ||
        (user.roles as any).includes('CITIZEN') ||
        (user.roles as any).includes('STUDENT')) &&
      !isSecurityOrReception &&
      !hasRole(RoleCode.ADMIN) &&
      !hasRole(RoleCode.SUPER_ADMIN) &&
      !hasRole(RoleCode.STAFF);
    if (isCitizen) {
      return allVisits.filter((v) => {
        const email = (v.email || '').toLowerCase();
        const userEmail = (user?.email || '').toLowerCase();
        const name = (v.visitorName || '').toLowerCase();
        const userName = (user?.fullName || '').toLowerCase();
        return (userEmail && email === userEmail) || (userName && name.includes(userName));
      });
    }
    return allVisits;
  }, [allVisits, perspective, isOfficialOrFaculty, isSecretariat, isSecurityOrReception, hasRole, user]);

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
  const expectedVisits = visits.filter(
    (v) =>
      v.status === VisitStatus.EXPECTED ||
      (v.status as any) === 'UNDER_REVIEW' ||
      (v.status as any) === 'SUBMITTED' ||
      (v.status as any) === 'PENDING_APPROVAL' ||
      (v.status as any) === 'REQUESTED' ||
      (v.status as any) === 'CONFIRMED',
  );
  const arrivedVisits = visits.filter((v) => v.status === VisitStatus.ARRIVED);
  const waitingVisits = visits.filter((v) => v.status === VisitStatus.CHECKED_IN);
  const withHostVisits = visits.filter((v) => v.status === VisitStatus.WITH_HOST);
  const completedVisits = visits.filter(
    (v) =>
      v.status === VisitStatus.CHECKED_OUT ||
      v.status === VisitStatus.DENIED ||
      v.status === VisitStatus.NO_SHOW,
  );

  // Dynamic role-based header info
  const headerInfo = useMemo(() => {
    if (perspective === 'MY_CHAMBER') {
      return {
        title: `${user?.fullName ? `${user.fullName}'s` : 'My'} Chamber Reception`,
        subtitle: 'Real-time lobby monitoring for your visitors, instant chamber call-in, and session duration tracking',
        badge: 'Chamber Office Desk',
        badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800',
        dotClass: 'bg-indigo-600 dark:bg-indigo-400',
      };
    }
    if (perspective === 'GATE_SECURITY') {
      return {
        title: 'Central Gate 1 & Perimeter Reception Desk',
        subtitle: 'Front-gate optical QR scanning, identity verification (§15 compliance), badge issuance, and vehicle logs',
        badge: 'Live Gate 1 Desk',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
        dotClass: 'bg-amber-600 dark:bg-amber-400',
      };
    }
    return {
      title: 'Executive Secretariat Reception & Triage Desk',
      subtitle: 'VIP delegation coordination, executive chamber queue management, and dignitary escort triage',
      badge: 'Secretariat Command',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
      dotClass: 'bg-emerald-600 dark:bg-emerald-400',
    };
  }, [perspective, user]);

  // Download / Print official daily visitor register
  const handlePrintDailyRoster = () => {
    const printWin = window.open('', '_blank', 'width=960,height=720');
    if (!printWin) {
      alert('Pop-up blocked. Please allow pop-ups to view printable visitor register.');
      return;
    }

    const scopeTitle =
      perspective === 'MY_CHAMBER'
        ? `Chamber Roster — ${user?.fullName || 'Official'}`
        : perspective === 'GATE_SECURITY'
          ? 'Central Gate 1 Security Register'
          : 'Executive Secretariat Daily Roster';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>OAMS Visitor Register — ${dateFilter}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #0F172A; }
          .header { border-bottom: 2px solid #1A3170; padding-bottom: 12px; margin-bottom: 18px; }
          .title { font-size: 18px; font-weight: 800; color: #1A3170; }
          .subtitle { font-size: 12px; color: #475569; margin-top: 2px; }
          .meta-grid { display: flex; gap: 20px; font-size: 11px; margin-top: 8px; color: #334155; }
          .meta-item strong { display: block; color: #64748B; font-size: 9px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 14px; }
          th { background: #F1F5F9; color: #334155; text-align: left; padding: 7px 8px; border-bottom: 1px solid #CBD5E1; font-weight: 700; }
          td { padding: 7px 8px; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
          tr:nth-child(even) { background: #F8FAFC; }
          .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 9px; }
          .badge-expected { background: #EFF6FF; color: #1D4ED8; }
          .badge-arrived { background: #FFFBEB; color: #B45309; }
          .badge-checkedin { background: #ECFDF5; color: #047857; }
          .badge-withhost { background: #EEF2FF; color: #4338CA; }
          .badge-departed { background: #F1F5F9; color: #475569; }
          .badge-denied { background: #FEF2F2; color: #B91C1C; }
          .signatures { margin-top: 36px; display: flex; justify-content: space-between; page-break-inside: avoid; }
          .sig-box { border-top: 1px solid #94A3B8; width: 200px; padding-top: 6px; text-align: center; font-size: 10px; color: #475569; }
          .sig-title { font-weight: 700; color: #1E293B; }
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
            <div class="meta-item"><strong>Scope</strong>${scopeTitle}</div>
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
                  <td><strong>${formatVisitorName(v.visitorName)}</strong></td>
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
            <div class="sig-title">Executive Host Verified</div>
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
    <div className="space-y-4">
      {/* 1. Page Header with Role Identity */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-1">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="font-sans text-xl sm:text-2xl font-bold tracking-tight text-[#16181D] dark:text-white">
              {headerInfo.title}
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${headerInfo.badgeClass}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${headerInfo.dotClass}`} />
              {headerInfo.badge}
            </span>
          </div>
          <p className="text-xs text-[#5B6070] dark:text-slate-400">
            {headerInfo.subtitle}
          </p>
        </div>

        {/* Header Action Buttons - Side by Side & Clean */}
        <div className="flex items-center gap-2 flex-nowrap shrink-0 overflow-x-auto max-w-full pb-0.5">
          {perspective === 'GATE_SECURITY' ? (
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs font-semibold rounded-xl bg-[#1A3170] hover:bg-[#132554] text-white cursor-pointer transition-colors shadow-xs whitespace-nowrap shrink-0"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Scan Pass / QR</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs font-semibold rounded-xl border border-[#D5D2CA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#16181D] dark:text-slate-200 hover:bg-[#F7F6F2] dark:hover:bg-slate-700/60 cursor-pointer transition-colors shadow-2xs whitespace-nowrap shrink-0"
            >
              <QrCode className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400" />
              <span>Scan Pass / QR</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePrintDailyRoster}
            className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs font-semibold rounded-xl border border-[#D5D2CA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#16181D] dark:text-slate-200 hover:bg-[#F7F6F2] dark:hover:bg-slate-700/60 cursor-pointer transition-colors shadow-2xs whitespace-nowrap shrink-0"
            title="Open printable register roster"
          >
            <Download className="w-3.5 h-3.5 text-[#475569] dark:text-slate-400" />
            <span>Daily List (PDF)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsWalkInOpen(true)}
            className={`inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs font-semibold rounded-xl cursor-pointer transition-colors shadow-xs whitespace-nowrap shrink-0 ${
              perspective === 'GATE_SECURITY'
                ? 'border border-[#D5D2CA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#16181D] dark:text-slate-200 hover:bg-[#F7F6F2]'
                : 'bg-[#1A3170] hover:bg-[#132554] text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{perspective === 'MY_CHAMBER' ? 'Register Guest' : 'Register Walk-in'}</span>
          </button>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="w-9 h-9 inline-flex items-center justify-center rounded-xl border border-[#D5D2CA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#5B6070] hover:text-[#16181D] hover:bg-[#F7F6F2] dark:hover:bg-slate-700/60 cursor-pointer transition-colors shadow-2xs shrink-0"
            title="Refresh Board"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-[#1A3170]' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Quick Perspective Switcher for Officials / Staff */}
      {(isOfficialOrFaculty || isSecretariat || isSecurityOrReception) && (
        <div className="flex items-center gap-2 pt-0.5">
          <div className="inline-flex items-center gap-1 p-0.5 rounded-xl bg-[#F0EFEA] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs shadow-2xs">
            {isOfficialOrFaculty && (
              <button
                type="button"
                onClick={() => setSelectedPerspective('MY_CHAMBER')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  perspective === 'MY_CHAMBER'
                    ? 'bg-white dark:bg-slate-900 text-[#1A3170] dark:text-blue-400 shadow-2xs'
                    : 'text-[#64748B] hover:text-[#16181D] dark:hover:text-white'
                }`}
              >
                My Chamber
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedPerspective('GATE_SECURITY')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                perspective === 'GATE_SECURITY'
                  ? 'bg-white dark:bg-slate-900 text-[#1A3170] dark:text-blue-400 shadow-2xs'
                  : 'text-[#64748B] hover:text-[#16181D] dark:hover:text-white'
              }`}
            >
              All Campus Visitors (Gate 1)
            </button>
            {isSecretariat && (
              <button
                type="button"
                onClick={() => setSelectedPerspective('SECRETARIAT')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  perspective === 'SECRETARIAT'
                    ? 'bg-white dark:bg-slate-900 text-[#1A3170] dark:text-blue-400 shadow-2xs'
                    : 'text-[#64748B] hover:text-[#16181D] dark:hover:text-white'
                }`}
              >
                Secretariat Triage
              </button>
            )}
          </div>
        </div>
      )}



      {/* 3. Stats Summary Cards */}
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

        {/* With Host / In Chamber */}
        <div className="p-3.5 rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-2xs hover:shadow-xs transition">
          <div>
            <div className="text-[11px] font-semibold text-[#5B6070] dark:text-slate-400 uppercase tracking-wider">
              {perspective === 'MY_CHAMBER' ? 'In Chamber' : 'With Host'}
            </div>
            <div className="text-2xl font-bold tracking-tight text-[#3730A3] dark:text-indigo-400 mt-0.5">
              {withHostVisits.length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950/40 text-[#4F46E5] dark:text-indigo-400 border border-[#C7D2FE] dark:border-indigo-900 flex items-center justify-center font-bold">
            <UserCheck className="w-4 h-4" />
          </div>
        </div>

        {/* Completed */}
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

      {/* 4. Search and Date Filter Toolbar */}
      <div className="p-2.5 sm:p-3 rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-[#8C93A4] dark:text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search visitor name, badge #, reference code, host..."
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

        {/* Date Selector & Scope Summary */}
        <div className="flex items-center gap-3">
          <div className="text-xs text-[#5B6070] dark:text-slate-400">
            Active Records:{' '}
            <span className="font-semibold text-[#16181D] dark:text-white">
              {visits.length}
            </span>
          </div>

          <div className="h-4 w-[1px] bg-[#E4E2DC] dark:bg-slate-700 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#5B6070] dark:text-slate-400 font-medium">Date:</span>
            <input
              type="date"
              value={dateFilter === 'ALL' ? '' : dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg border border-[#D5D2CA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#16181D] dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#1A3170] cursor-pointer"
            />
            {dateFilter !== new Date().toISOString().split('T')[0] && (
              <button
                type="button"
                onClick={() => setDateFilter(new Date().toISOString().split('T')[0])}
                className="px-2 py-0.5 text-[11px] font-semibold text-[#1A3170] dark:text-blue-400 hover:underline cursor-pointer"
              >
                Today
              </button>
            )}
            <button
              type="button"
              onClick={() => setDateFilter(dateFilter === 'ALL' ? new Date().toISOString().split('T')[0] : 'ALL')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition cursor-pointer ${
                dateFilter === 'ALL'
                  ? 'bg-[#1A3170] text-white border-[#1A3170]'
                  : 'border-[#D5D2CA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#5B6070] dark:text-slate-300 hover:bg-[#F7F6F2]'
              }`}
            >
              {dateFilter === 'ALL' ? 'Showing All Dates' : 'All Dates'}
            </button>
          </div>
        </div>
      </div>

      {/* 5. 5-Column Reception Kanban Board */}
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
                        {formatVisitorName(visit.visitorName)}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-[#5B6070] dark:text-slate-400 truncate mt-0.5">
                        <span>{visit.organization || 'Individual Requester'}</span>
                        {visit.partySize && visit.partySize > 1 && (
                          <span className="inline-flex items-center gap-0.5 font-semibold text-[#1A3170] dark:text-blue-300">
                            • <Users className="w-3 h-3 ml-0.5" /> {visit.partySize}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] font-mono text-[#1E40AF] dark:text-blue-400 bg-[#EFF6FF] dark:bg-blue-950/50 border border-[#BFDBFE] dark:border-blue-900 px-1.5 py-0.5 rounded font-semibold">
                        {visit.scheduledStartTime
                          ? new Date(visit.scheduledStartTime).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Today'}
                      </span>
                      <span className="text-[9px] font-mono font-bold text-slate-500 dark:text-slate-400">
                        {visit.referenceNo}
                      </span>
                    </div>
                  </div>

                  {/* Requester Contact Coordinates */}
                  {(visit.phone || visit.email) && (
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[#475569] dark:text-slate-400 bg-[#F8FAFC] dark:bg-slate-900/60 p-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-800">
                      {visit.phone && (
                        <a
                          href={`tel:${visit.phone}`}
                          className="inline-flex items-center gap-1 hover:text-[#1A3170] dark:hover:text-blue-400 font-mono"
                          title="Call Requester"
                        >
                          <Phone className="w-3 h-3 text-[#2563EB]" />
                          <span>{visit.phone}</span>
                        </a>
                      )}
                      {visit.email && (
                        <a
                          href={`mailto:${visit.email}`}
                          className="inline-flex items-center gap-1 hover:text-[#1A3170] dark:hover:text-blue-400 truncate max-w-[170px]"
                          title={visit.email}
                        >
                          <Mail className="w-3 h-3 text-[#2563EB]" />
                          <span className="truncate">{visit.email}</span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Dynamic Request Status Pill if newly submitted */}
                  {((visit as any).appointmentStatus === 'UNDER_REVIEW' ||
                    (visit as any).appointmentStatus === 'SUBMITTED' ||
                    (visit as any).appointmentStatus === 'PENDING_APPROVAL') && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      <Clock className="w-2.5 h-2.5 text-amber-600" />
                      <span>Request Under Review</span>
                    </div>
                  )}

                  {/* Clean Formatted Purpose Tag & Subject */}
                  {(visit.subject || visit.purpose) && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
                        <FileText className="w-3 h-3 text-[#1A3170] dark:text-blue-400 shrink-0" />
                        <span className="font-medium truncate">
                          {formatPurposeCategory(visit.purpose, visit.subject)}
                        </span>
                      </div>
                      {visit.subject && (
                        <p className="text-[11px] text-[#64748B] dark:text-slate-400 italic line-clamp-1 pl-1">
                          "{visit.subject}"
                        </p>
                      )}
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
                        {formatVisitorName(visit.visitorName)}
                      </div>
                      <div className="text-[11px] text-[#5B6070] dark:text-slate-400 truncate mt-0.5">
                        {visit.organization || 'Individual'} • Ref: {visit.referenceNo}
                      </div>
                    </div>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A] shrink-0 font-mono">
                      GATE
                    </span>
                  </div>

                  {/* Clean Formatted Purpose Tag (Replaces raw enum) */}
                  {(visit.subject || visit.purpose) && (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] bg-amber-50/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 border border-amber-200/70 dark:border-amber-800/60">
                      <FileText className="w-3 h-3 text-amber-700 dark:text-amber-400 shrink-0" />
                      <span className="font-medium truncate">
                        {formatPurposeCategory(visit.purpose, visit.subject)}
                      </span>
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
                        <span className="text-[#8C93A4] dark:text-slate-500 text-[11px] flex items-center gap-1">
                          <Car className="w-3 h-3" /> Vehicle:
                        </span>
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
                      Deny Entry
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
                        {formatVisitorName(visit.visitorName)}
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
                        <Bell className="w-3 h-3" />
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

        {/* Column 4: WITH HOST / IN CHAMBER */}
        <div className="flex flex-col rounded-2xl border border-[#E4E2DC] dark:border-slate-800 bg-[#F9F8F5] dark:bg-slate-900/40 overflow-hidden shadow-xs">
          <div className="px-3.5 py-2.5 border-b border-[#E2E8F0] dark:border-slate-800 bg-[#F8F9FE] dark:bg-slate-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#4F46E5]" />
              <span className="text-xs font-semibold text-[#16181D] dark:text-white">
                {perspective === 'MY_CHAMBER' ? 'In Chamber' : 'With Host'}
              </span>
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
                        {formatVisitorName(visit.visitorName)}
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
                        <span className="text-[#8C93A4] dark:text-slate-500">In session since:</span>
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
                      {checkOutMutation.isPending ? 'Ending Session...' : 'Conclude Meeting'}
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
                        {formatVisitorName(visit.visitorName)}
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
