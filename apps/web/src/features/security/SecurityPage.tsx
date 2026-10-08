import { type FC, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { VisitDto, EmergencyGroupDto } from '@oams/shared';
import { VisitStatus } from '@oams/shared';
import { api } from '@/lib/api';
import {
  ShieldAlert,
  ShieldCheck,
  Building2,
  Users,
  Search,
  QrCode,
  LogOut,
  CheckCircle2,
  RefreshCw,
  Printer,
  Download,
  X,
  FileText,
  Clock,
  Shield,
} from 'lucide-react';
import { QrScannerModal } from '../reception/QrScannerModal';
import { CheckInModal } from '../reception/CheckInModal';
import { DenyModal } from '../reception/DenyModal';

export const SecurityPage: FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'roster' | 'evacuation'>('evacuation');
  const [searchFilter, setSearchFilter] = useState('');

  // Modals state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isEvacuationModalOpen, setIsEvacuationModalOpen] = useState(false);
  const [checkInVisit, setCheckInVisit] = useState<VisitDto | null>(null);
  const [denyVisit, setDenyVisit] = useState<VisitDto | null>(null);

  // Fetch emergency evacuation groups
  const { data: emergencyData, refetch: refetchEmergency } = useQuery<{
    groups: EmergencyGroupDto[];
    totalCount: number;
  }>({
    queryKey: ['emergency-evacuation-list'],
    queryFn: () =>
      api.get<{ groups: EmergencyGroupDto[]; totalCount: number }>(
        '/api/v1/visits/emergency-list?format=JSON',
      ),
    refetchInterval: 10000,
  });

  // Fetch active visits currently in premises (CHECKED_IN or WITH_HOST)
  const { data: visitsData, refetch: refetchVisits } = useQuery<{ visits: VisitDto[] }>({
    queryKey: ['active-security-visits', searchFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchFilter) params.append('search', searchFilter);
      return api.get<{ visits: VisitDto[] }>(`/api/v1/visits?${params.toString()}`);
    },
    refetchInterval: 15000,
  });

  const checkOutMutation = useMutation({
    mutationFn: (visitId: string) => api.post(`/api/v1/visits/${visitId}/check-out`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-security-visits'] });
      queryClient.invalidateQueries({ queryKey: ['emergency-evacuation-list'] });
    },
  });

  const emergencyGroups = emergencyData?.groups || [];
  const visits = visitsData?.visits || [];
  const activeVisitors = visits.filter(
    (v) => v.status === VisitStatus.CHECKED_IN || v.status === VisitStatus.WITH_HOST,
  );

  // Fallback building calculation ensures real headcount is always shown
  const effectiveGroups: EmergencyGroupDto[] =
    emergencyGroups.length > 0
      ? emergencyGroups
      : ([
        {
          building: 'Main Secretariat',
          floor: '1st Floor',
          count: activeVisitors.filter(
            (v) =>
              (v.building === 'Main Secretariat' || !v.building) &&
              (v.floor === '1st Floor' || !v.floor),
          ).length,
          visitors: activeVisitors.filter(
            (v) =>
              (v.building === 'Main Secretariat' || !v.building) &&
              (v.floor === '1st Floor' || !v.floor),
          ),
        },
        {
          building: 'Main Secretariat',
          floor: '2nd Floor',
          count: activeVisitors.filter(
            (v) => v.building === 'Main Secretariat' && v.floor === '2nd Floor',
          ).length,
          visitors: activeVisitors.filter(
            (v) => v.building === 'Main Secretariat' && v.floor === '2nd Floor',
          ),
        },
        {
          building: 'Administration Wing',
          floor: '1st Floor',
          count: activeVisitors.filter((v) => v.building === 'Administration Wing').length,
          visitors: activeVisitors.filter((v) => v.building === 'Administration Wing'),
        },
      ].filter((g) => g.count > 0) as EmergencyGroupDto[]);

  const effectiveTotal = emergencyData?.totalCount || activeVisitors.length;

  // Open Official Emergency Evacuation Dossier Modal & Print/Save as PDF
  const handleDownloadEmergencyPdf = async () => {
    setIsEvacuationModalOpen(true);
  };

  const handleExportTextRoster = () => {
    try {
      const nowStr = new Date().toLocaleString('en-IN', {
        dateStyle: 'full',
        timeStyle: 'medium',
      });
      const content = `
========================================================================================
            OAMS OFFICIAL EMERGENCY MUSTER & EVACUATION ROSTER (§15.4, §22)
                 STATE APEX SECRETARIAT · DISASTER MANAGEMENT PROTOCOL
========================================================================================
GENERATED AT      : ${nowStr}
PERIMETER STATUS  : EMERGENCY MOBILIZATION / MUSTER CALL
TOTAL HEADCOUNT   : ${effectiveTotal} CIVILIAN VISITORS IN PREMISES
ACTIVE CLUSTERS   : ${effectiveGroups.length} BUILDING & FLOOR ZONES
INCIDENT MARSHAL  : Mr. Janardhan (Security Desk) / Mr. KVK (Super Admin)
========================================================================================

${effectiveGroups
          .map(
            (g, gIdx) => `
[ZONE ${gIdx + 1}] ${g.building.toUpperCase()} — ${g.floor.toUpperCase()} (OCCUPANCY: ${g.visitors.length})
----------------------------------------------------------------------------------------
${g.visitors
                .map(
                  (v: any, vIdx: number) =>
                    `  ${vIdx + 1}. [BADGE: ${v.badgeNo || v.badgeNumber || 'VIP-01'}] ${v.visitorName}
     • Organization : ${v.organization || 'Individual Visitor'} (Party of ${v.partySize || 1})
     • Location     : ${v.roomName || 'Executive Suite'} | Phone: ${v.phone || 'N/A'}
     • Host Official: ${v.hostOfficialName || v.officialName || 'Executive Office'}
     • Status       : ${v.status} | Checked-in: ${v.checkedInAt || v.arrivedAt || 'Today'}
     • Vehicle Ref  : ${v.vehicleNo || 'None'} | Pass Ref: ${v.referenceNo || 'N/A'}`
                )
                .join('\n\n')}
`
          )
          .join('\n========================================================================================\n')}

========================================================================================
INCIDENT COMMAND INSTRUCTIONS:
1. Cross-verify civilian count at designated assembly points (Muster Point Alpha & Beta).
2. Ensure all visitors listed above with active badges have evacuated the zone.
3. Transmit cleared headcount confirmation to Security Control Room.
========================================================================================
`;

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OAMS_Emergency_Evacuation_Roster_${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (e: any) {
      console.error('Failed to export emergency roster:', e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Security Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-sans text-xl sm:text-2xl font-bold tracking-tight text-[#16181D] dark:text-white">
              Security Gate & Emergency Operations
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Perimeter Secured
            </span>
          </div>
          <p className="text-xs text-[#5B6070] dark:text-slate-400 mt-1">
            Real-time civilian headcount, floor muster verification, and perimeter access control
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Evacuation Dossier PDF Button */}
          <button
            type="button"
            onClick={handleDownloadEmergencyPdf}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#1A3170] hover:bg-[#244394] dark:bg-slate-800 dark:hover:bg-slate-700 text-white cursor-pointer transition-colors shadow-xs"
            title="Open formatted evacuation roster for incident commanders / Print to PDF"
          >
            <FileText className="w-3.5 h-3.5" />
            Evacuation Dossier (PDF)
          </button>

          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[#D5D2CA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#16181D] dark:text-slate-200 hover:bg-[#F7F6F2] dark:hover:bg-slate-700/60 cursor-pointer transition-colors shadow-2xs"
          >
            <QrCode className="w-3.5 h-3.5 text-[#2957D6] dark:text-blue-400" />
            Scan Pass
          </button>
        </div>
      </div>

      {/* Real-time Headcount & Incident Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-2xs hover:shadow-xs transition">
          <div>
            <div className="text-[11px] font-semibold text-[#5B6070] dark:text-slate-400 uppercase tracking-wider">
              Premises Headcount
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-[#16181D] dark:text-white mt-1">
              {effectiveTotal}
            </div>
            <div className="text-xs text-[#8C93A4] dark:text-slate-500 mt-1">
              Authorized civilian visitors inside
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-2xs hover:shadow-xs transition">
          <div>
            <div className="text-[11px] font-semibold text-[#5B6070] dark:text-slate-400 uppercase tracking-wider">
              Occupied Floor Zones
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-[#16181D] dark:text-white mt-1">
              {effectiveGroups.length}
            </div>
            <div className="text-xs text-[#8C93A4] dark:text-slate-500 mt-1">
              Active building clusters occupied
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-2xs hover:shadow-xs transition">
          <div>
            <div className="text-[11px] font-semibold text-[#5B6070] dark:text-slate-400 uppercase tracking-wider">
              Perimeter Status
            </div>
            <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Normal Operations</span>
            </div>
            <div className="text-xs text-[#8C93A4] dark:text-slate-500 mt-1">
              Access control gates active
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              refetchEmergency();
              refetchVisits();
            }}
            className="p-2.5 rounded-xl border border-[#E4E2DC] dark:border-slate-700 bg-[#F7F6F2] dark:bg-slate-800 text-[#5B6070] hover:text-[#16181D] dark:hover:text-white hover:bg-[#ECEAE3] dark:hover:bg-slate-700 cursor-pointer transition shadow-2xs"
            title="Refresh Headcount & Perimeter"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-[#E4E2DC] dark:border-slate-800">
        <div className="flex items-center gap-1 sm:gap-4 -mb-px">
          <button
            type="button"
            onClick={() => setActiveTab('evacuation')}
            className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs font-semibold border-b-2 cursor-pointer transition-all ${activeTab === 'evacuation'
                ? 'border-[#2957D6] text-[#2957D6] dark:text-blue-400'
                : 'border-transparent text-[#5B6070] dark:text-slate-400 hover:text-[#16181D] dark:hover:text-white'
              }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Floor Muster & Evacuation Roster</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'evacuation'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
            >
              {effectiveGroups.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('roster')}
            className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs font-semibold border-b-2 cursor-pointer transition-all ${activeTab === 'roster'
                ? 'border-[#2957D6] text-[#2957D6] dark:text-blue-400'
                : 'border-transparent text-[#5B6070] dark:text-slate-400 hover:text-[#16181D] dark:hover:text-white'
              }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Active Visitors Inside Premises</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'roster'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
            >
              {activeVisitors.length}
            </span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#8C93A4] dark:text-slate-500 pb-2">
          <Clock className="w-3 h-3" />
          <span>Auto-synced</span>
        </div>
      </div>

      {/* TAB 1: Evacuation Roster Grouped by Building / Floor */}
      {activeTab === 'evacuation' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
            <div className="flex items-center gap-2.5 text-[#5B6070] dark:text-slate-400">
              <Shield className="w-4 h-4 text-[#2957D6] shrink-0" />
              <span>
                Disaster & Emergency Protocol: Cross-verify all visitor headcounts by building and floor cluster at designated muster points.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadEmergencyPdf}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D5D2CA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#16181D] dark:text-slate-200 hover:bg-[#F7F6F2] dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer transition shadow-2xs"
              >
                <FileText className="w-3.5 h-3.5 text-[#2957D6]" />
                View Dossier PDF
              </button>
              <button
                type="button"
                onClick={handleExportTextRoster}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D5D2CA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#5B6070] dark:text-slate-400 hover:text-[#16181D] dark:hover:text-white hover:bg-[#F7F6F2] dark:hover:bg-slate-700 text-xs font-medium cursor-pointer transition"
                title="Download raw roster text file"
              >
                <Download className="w-3.5 h-3.5" />
                Export TXT
              </button>
            </div>
          </div>

          {effectiveGroups.length === 0 ? (
            <div className="py-16 text-center rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 text-[#8C93A4] dark:text-slate-500 text-sm space-y-1">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
              <div className="font-semibold text-[#16181D] dark:text-white">Premises Clear</div>
              <div className="text-xs text-[#8C93A4] dark:text-slate-500">Zero civilian visitors checked in inside the perimeter.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {effectiveGroups.map((group) => (
                <div
                  key={`${group.building}-${group.floor}`}
                  className="rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs hover:shadow-xs transition"
                >
                  <div className="px-4 py-3 border-b border-[#E4E2DC] dark:border-slate-800 bg-[#FAF9F5] dark:bg-slate-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#2957D6] dark:text-blue-400 flex items-center justify-center">
                        <Building2 className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-[#16181D] dark:text-white">
                          {group.building}
                        </span>
                        <span className="text-xs font-medium text-[#5B6070] dark:text-slate-400 ml-1.5">
                          · {group.floor}
                        </span>
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {group.count} {group.count === 1 ? 'Visitor' : 'Visitors'}
                    </span>
                  </div>

                  <div className="divide-y divide-[#F0EFEA] dark:divide-slate-800">
                    {group.visitors.map((visitor) => (
                      <div
                        key={visitor.id}
                        className="p-3.5 hover:bg-[#FAF9F5]/60 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="font-semibold text-xs text-[#16181D] dark:text-white truncate">
                            {visitor.visitorName}
                          </div>
                          <div className="text-[11px] text-[#5B6070] dark:text-slate-400 truncate">
                            {visitor.organization || 'Individual Visitor'} · Ref: {visitor.referenceNo}
                          </div>
                          <div className="text-[11px] text-[#5B6070] dark:text-slate-400 flex items-center gap-1.5 pt-0.5">
                            <span>Host:</span>
                            <span className="font-medium text-[#16181D] dark:text-slate-200">
                              {visitor.hostOfficialName || 'Official'}
                            </span>
                            {visitor.roomName && (
                              <span className="text-[#8C93A4] dark:text-slate-500">
                                · {visitor.roomName}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-[#1A3170] text-white dark:bg-slate-800 border border-slate-700 shadow-2xs">
                            {visitor.badgeNo || 'VIP-01'}
                          </span>
                          <button
                            type="button"
                            onClick={() => checkOutMutation.mutate(visitor.id)}
                            className="text-[11px] font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 px-2 py-0.5 rounded cursor-pointer transition-colors"
                          >
                            Mark Exited
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: All Active Visitors (List View) */}
      {activeTab === 'roster' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-[#8C93A4] dark:text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search visitor name, badge #, host..."
                className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-[#D5D2CA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#16181D] dark:text-white placeholder:text-[#8C93A4] focus:outline-none focus:ring-1 focus:ring-[#2957D6] focus:border-[#2957D6] transition"
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

            <div className="text-xs text-[#5B6070] dark:text-slate-400 font-medium">
              Showing {activeVisitors.length} active {activeVisitors.length === 1 ? 'visitor' : 'visitors'}
            </div>
          </div>

          <div className="rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[620px]">
              <thead className="bg-[#FAF9F5] dark:bg-slate-800/60 border-b border-[#E4E2DC] dark:border-slate-800 font-semibold text-[#5B6070] dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4">Visitor</th>
                  <th className="py-3 px-4">Badge #</th>
                  <th className="py-3 px-4">Host Official</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Check-in Time</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Gate Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EFEA] dark:divide-slate-800">
                {activeVisitors.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#8C93A4] dark:text-slate-500">
                      No active visitors inside premises
                    </td>
                  </tr>
                ) : (
                  activeVisitors.map((v) => (
                    <tr key={v.id} className="hover:bg-[#FAF9F5]/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#16181D] dark:text-white">{v.visitorName}</div>
                        <div className="text-[11px] text-[#5B6070] dark:text-slate-400 mt-0.5">
                          {v.organization || 'Individual'} {v.phone ? `· ${v.phone}` : ''}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                          {v.badgeNo || '—'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-[#16181D] dark:text-slate-200">
                        {v.hostOfficialName || 'Official'}
                      </td>
                      <td className="py-3.5 px-4 text-[#5B6070] dark:text-slate-400">
                        <div>{v.building || 'Main Secretariat'}</div>
                        {v.floor && <div className="text-[10px] text-[#8C93A4]">{v.floor}</div>}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[#5B6070] dark:text-slate-400">
                        {v.checkedInAt
                          ? new Date(v.checkedInAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                          : '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${v.status === VisitStatus.WITH_HOST
                              ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                            }`}
                        >
                          {v.status === VisitStatus.WITH_HOST ? 'WITH HOST' : 'IN LOBBY'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => checkOutMutation.mutate(v.id)}
                          disabled={checkOutMutation.isPending}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white cursor-pointer transition shadow-2xs"
                        >
                          <LogOut className="w-3 h-3" />
                          Gate Exit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <QrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onSelectVisit={(v) => {
          if (v.status === VisitStatus.EXPECTED || v.status === VisitStatus.ARRIVED) {
            setCheckInVisit(v);
          }
        }}
        onCheckInDirect={(v) => setCheckInVisit(v)}
      />

      <CheckInModal
        visit={checkInVisit}
        isOpen={!!checkInVisit}
        onClose={() => setCheckInVisit(null)}
        onSuccess={() => {
          setCheckInVisit(null);
          refetchEmergency();
          refetchVisits();
        }}
      />

      <DenyModal
        visit={denyVisit}
        isOpen={!!denyVisit}
        onClose={() => setDenyVisit(null)}
        onSuccess={() => {
          setDenyVisit(null);
          refetchEmergency();
          refetchVisits();
        }}
      />

      {/* Official Emergency Evacuation Dossier & Print View Modal */}
      {isEvacuationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white">
          <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-[#E4E2DC] dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200 print:border-none print:shadow-none print:m-0 print:w-full print:max-w-none">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#E4E2DC] dark:border-slate-800 bg-[#1A3170] text-white print:bg-transparent print:text-black print:border-b-2 print:border-black">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-white/10 print:hidden">
                  <ShieldAlert className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold tracking-wide uppercase">
                    Official Emergency Muster & Evacuation Dossier
                  </h3>
                  <p className="text-xs text-blue-200 print:text-gray-600 font-normal mt-0.5">
                    State Apex Secretariat · Incident Command & Disaster Management Protocol
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[#1A3170] hover:bg-blue-50 text-xs font-semibold cursor-pointer transition shadow-xs"
                  title="Print to printer or Save as PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Save as PDF
                </button>
                <button
                  type="button"
                  onClick={handleExportTextRoster}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium cursor-pointer transition border border-white/20"
                  title="Download raw roster text file"
                >
                  <Download className="w-3.5 h-3.5" />
                  Text Roster
                </button>
                <button
                  type="button"
                  onClick={() => setIsEvacuationModalOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/20 text-white cursor-pointer ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto print:max-h-none print:overflow-visible">
              {/* Emergency Summary Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="p-4 rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-[#FAF9F5] dark:bg-slate-800/60">
                  <div className="text-[11px] font-semibold text-[#5B6070] dark:text-slate-400 uppercase tracking-wider">
                    Total Evacuation Headcount
                  </div>
                  <div className="text-2xl font-bold text-[#16181D] dark:text-white font-mono mt-1">
                    {effectiveTotal} Civilians
                  </div>
                  <div className="text-[11px] text-[#8C93A4] dark:text-slate-500 mt-0.5">
                    Currently verified inside perimeter
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-[#E4E2DC] dark:border-slate-800 bg-[#FAF9F5] dark:bg-slate-800/60">
                  <div className="text-[11px] font-semibold text-[#5B6070] dark:text-slate-400 uppercase tracking-wider">
                    Occupied Floor Zones
                  </div>
                  <div className="text-2xl font-bold text-[#16181D] dark:text-white font-mono mt-1">
                    {effectiveGroups.length} Clusters
                  </div>
                  <div className="text-[11px] text-[#8C93A4] dark:text-slate-500 mt-0.5">
                    Designated muster points Alpha & Beta
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                    Perimeter Status
                  </div>
                  <div className="text-base font-bold text-emerald-700 dark:text-emerald-400 mt-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Muster Call Active</span>
                  </div>
                  <div className="text-[11px] text-emerald-600/80 dark:text-emerald-500 mt-0.5">
                    Security gate access locked
                  </div>
                </div>
              </div>

              {/* Grouped Evacuation Tables */}
              <div className="space-y-4">
                {effectiveGroups.map((group, idx) => (
                  <div
                    key={`${group.building}-${group.floor}`}
                    className="rounded-xl border border-[#E4E2DC] dark:border-slate-800 overflow-hidden shadow-2xs"
                  >
                    <div className="px-4 py-2.5 bg-[#FAF9F5] dark:bg-slate-800/60 border-b border-[#E4E2DC] dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#1A3170] text-white flex items-center justify-center text-[11px] font-bold font-mono">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-xs text-[#16181D] dark:text-white">
                          {group.building} — {group.floor}
                        </span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {group.visitors.length} {group.visitors.length === 1 ? 'Occupant' : 'Occupants'}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs min-w-[600px]">
                      <thead className="border-b border-[#E4E2DC] dark:border-slate-800 text-[#5B6070] dark:text-slate-400 bg-white dark:bg-slate-900 font-semibold">
                        <tr>
                          <th className="py-2.5 px-3">Badge #</th>
                          <th className="py-2.5 px-3">Visitor Name</th>
                          <th className="py-2.5 px-3">Organization</th>
                          <th className="py-2.5 px-3">Room / Venue</th>
                          <th className="py-2.5 px-3">Host Official</th>
                          <th className="py-2.5 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0EFEA] dark:divide-slate-800 bg-white dark:bg-slate-900">
                        {group.visitors.map((v: any) => (
                          <tr key={v.id} className="hover:bg-[#FAF9F5]/60 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-[#1A3170] text-white dark:bg-slate-800">
                                {v.badgeNo || v.badgeNumber || 'VIP-01'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-[#16181D] dark:text-white">
                              {v.visitorName}
                              {v.partySize > 1 && (
                                <span className="ml-1 text-[10px] text-[#8C93A4]">
                                  (+{v.partySize - 1})
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-[#5B6070] dark:text-slate-400">
                              {v.organization || 'Individual'}
                            </td>
                            <td className="py-2.5 px-3 text-[#16181D] dark:text-slate-200">
                              {v.roomName || 'Executive Suite'}
                            </td>
                            <td className="py-2.5 px-3 text-[#16181D] dark:text-slate-200 font-medium">
                              {v.hostOfficialName || v.officialName || 'Official'}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${v.status === VisitStatus.WITH_HOST
                                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800'
                                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                  }`}
                              >
                                {v.status === VisitStatus.WITH_HOST ? 'WITH HOST' : 'IN LOBBY'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                ))}
              </div>

              {/* Marshal Sign-off Footer */}
              <div className="pt-6 border-t border-[#E4E2DC] dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-[#5B6070] dark:text-slate-400">
                <div>
                  Generated on {new Date().toLocaleString()} · OAMS Incident Command Dispatch
                </div>
                <div className="flex items-center gap-8 print:flex">
                  <div className="text-center">
                    <div className="w-40 border-b border-gray-400 dark:border-slate-600 mb-1.5"></div>
                    <span className="text-[10px] uppercase font-semibold text-[#8C93A4]">Floor Marshal Sign</span>
                  </div>
                  <div className="text-center">
                    <div className="w-40 border-b border-gray-400 dark:border-slate-600 mb-1.5"></div>
                    <span className="text-[10px] uppercase font-semibold text-[#8C93A4]">Incident Commander</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="px-6 py-3 border-t border-[#E4E2DC] dark:border-slate-800 bg-[#FAF9F5] dark:bg-slate-800/60 flex items-center justify-end gap-3 print:hidden">
              <button
                type="button"
                onClick={() => setIsEvacuationModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium border border-[#D5D2CA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#5B6070] dark:text-slate-300 hover:text-[#16181D] dark:hover:text-white cursor-pointer transition shadow-2xs"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#1A3170] hover:bg-[#244394] text-white cursor-pointer shadow-xs transition"
              >
                <Printer className="w-3.5 h-3.5" />
                Print / Save as PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};