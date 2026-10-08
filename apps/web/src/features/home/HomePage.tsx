import { useState, useMemo, type FC } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '@/lib/api';
import {
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Award,
  Briefcase,
  GraduationCap,
  Building2,
  FileText,
  ShieldCheck,
  Inbox,
  DoorOpen,
  UserCheck,
  Clock,
  Calendar,
  CheckSquare,
  LayoutGrid,
  PlusCircle,
  Users,
  Shield,
} from 'lucide-react';
import { RoleCode } from '@oams/shared';
import { useAuth } from '@/features/auth/AuthContext';

import { OfficialDashboard } from './dashboards/OfficialDashboard';
import { SecretariatDashboard } from './dashboards/SecretariatDashboard';
import { ReceptionDashboard } from './dashboards/ReceptionDashboard';
import { SecurityDashboard } from './dashboards/SecurityDashboard';
import { CitizenDashboard } from './dashboards/CitizenDashboard';
import { AdminDashboard } from './dashboards/AdminDashboard';
import { PublicHomePage } from './PublicHomePage';

export interface OfficialPortfolio {
  id: string;
  name: string;
  initials: string;
  roleTitle: string;
  department: string;
  tier: string;
  icon: any;
  avatarBg: string;
}

export const OFFICIAL_PORTFOLIOS: OfficialPortfolio[] = [
  {
    id: 'off-1',
    name: 'Mr. KVK',
    initials: 'KVK',
    roleTitle: 'Official',
    department: 'Executive Governance Board',
    tier: 'Executive Chamber',
    icon: Award,
    avatarBg: 'bg-[#1A3170] text-white',
  },
  {
    id: 'off-2',
    name: 'Mr. Harsha Rao',
    initials: 'HR',
    roleTitle: 'Chief Executive Officer',
    department: 'General Administration',
    tier: 'Executive Directorate',
    icon: Briefcase,
    avatarBg: 'bg-[#1E3A8A] text-white',
  },
  {
    id: 'off-3',
    name: 'Prof. Vice Chancellor',
    initials: 'VC',
    roleTitle: 'Vice Chancellor',
    department: 'Academic Senate & Research',
    tier: 'Chancellery Office',
    icon: GraduationCap,
    avatarBg: 'bg-[#312E81] text-white',
  },
  {
    id: 'off-4',
    name: 'Ms. Bharathi',
    initials: 'MB',
    roleTitle: 'President',
    department: 'Institutional Affairs',
    tier: 'Presidential Office',
    icon: Building2,
    avatarBg: 'bg-[#4B5563] text-white',
  },
  {
    id: 'off-5',
    name: 'Ms. Indhu',
    initials: 'MI',
    roleTitle: 'Joint Secretary',
    department: 'Protocol & Secretariat',
    tier: 'Secretariat Desk',
    icon: FileText,
    avatarBg: 'bg-[#0F766E] text-white',
  },
  {
    id: 'off-6',
    name: 'Mr. Janardhan',
    initials: 'MJ',
    roleTitle: 'Vice Principal / Admin',
    department: 'Administration & Security',
    tier: 'Administrative Desk',
    icon: ShieldCheck,
    avatarBg: 'bg-[#334155] text-white',
  },
];

export type RoleDashboardPerspective =
  | 'OFFICIAL'
  | 'SECRETARIAT'
  | 'RECEPTION'
  | 'SECURITY'
  | 'CITIZEN'
  | 'ADMIN';

export const HomePage: FC = () => {
  const { user, hasRole } = useAuth();
  const queryClient = useQueryClient();

  const [interactiveToast, setInteractiveToast] = useState<string | null>(null);

  // Strict role scoping: Every role ONLY lands directly and exclusively on their designated dashboard
  const currentRolePerspective: RoleDashboardPerspective = useMemo(() => {
    if (!user) return 'CITIZEN';
    if (
      hasRole(RoleCode.ADMIN) ||
      hasRole(RoleCode.SUPER_ADMIN) ||
      hasRole(RoleCode.APPOINTMENT_ADMIN)
    )
      return 'ADMIN';
    if (user.officialId) return 'OFFICIAL';
    if (hasRole(RoleCode.OFFICIAL)) return 'OFFICIAL';
    if (hasRole(RoleCode.PA) || hasRole(RoleCode.EA)) return 'SECRETARIAT';
    if (hasRole(RoleCode.RECEPTION)) return 'RECEPTION';
    if (hasRole(RoleCode.SECURITY)) return 'SECURITY';
    return 'CITIZEN';
  }, [user, hasRole]);

  // Live health
  const { data: health, refetch: refetchHealth, isFetching: isHealthFetching } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    refetchInterval: 30000,
  });

  // Live appointments for the dashboards
  const { data: appointments = [], refetch: refetchAppointments } = useQuery<any[]>({
    queryKey: ['home-appointments'],
    queryFn: () => api.get<any[]>('/api/v1/appointments'),
  });

  const showToast = (msg: string) => {
    setInteractiveToast(msg);
    setTimeout(() => setInteractiveToast(null), 3500);
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['home-appointments'] });
    await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    refetchAppointments();
  };

  // If user is not authenticated / signed in, show public institutional Home Page
  if (!user) {
    return <PublicHomePage />;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-200 pb-12">
      {/* Dynamic Toast Feedback */}
      {interactiveToast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-[#16181D] text-white shadow-2xl text-xs font-semibold flex items-center gap-2.5 border border-[#E4E2DC] dark:border-[#2A2F3D] animate-in slide-in-from-bottom-5">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{interactiveToast}</span>
        </div>
      )}

      {/* Role-Specific Dashboard Renderer - Strictly locked to authenticated user's role */}
      {currentRolePerspective === 'OFFICIAL' && (
        <OfficialDashboard
          appointments={appointments}
          onRefresh={handleRefresh}
          showToast={showToast}
        />
      )}

      {currentRolePerspective === 'SECRETARIAT' && (
        <SecretariatDashboard
          appointments={appointments}
          onRefresh={handleRefresh}
          showToast={showToast}
        />
      )}

      {currentRolePerspective === 'RECEPTION' && (
        <ReceptionDashboard
          appointments={appointments}
          onRefresh={handleRefresh}
          showToast={showToast}
        />
      )}

      {currentRolePerspective === 'SECURITY' && (
        <SecurityDashboard
          appointments={appointments}
          onRefresh={handleRefresh}
          showToast={showToast}
        />
      )}

      {currentRolePerspective === 'CITIZEN' && (
        <CitizenDashboard
          appointments={appointments}
          onRefresh={handleRefresh}
          showToast={showToast}
        />
      )}

      {currentRolePerspective === 'ADMIN' && (
        <AdminDashboard
          appointments={appointments}
          onRefresh={handleRefresh}
          showToast={showToast}
        />
      )}

      {/* Role Quick-Access Workflow Hubs Navigation - Tailored Strictly by Role */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#5B6070] dark:text-[#8E95A5]">
          Quick Workspace Navigation
        </h3>

        {/* OFFICIAL Quick Links */}
        {currentRolePerspective === 'OFFICIAL' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Link
              to="/app/today"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] dark:hover:bg-[#16181D] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] dark:text-blue-400 mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <Clock className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170] dark:group-hover:text-blue-400">
                Official Briefing
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Day's Hearings</span>
            </Link>

            <Link
              to="/app/inbox"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] dark:hover:bg-[#16181D] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] dark:text-blue-400 mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <Inbox className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170] dark:group-hover:text-blue-400">
                Chamber Inbox
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Audience Requests</span>
            </Link>

            <Link
              to="/app/calendar"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] dark:hover:bg-[#16181D] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] dark:text-blue-400 mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170] dark:group-hover:text-blue-400">
                Chamber Calendar
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Schedule &amp; Slots</span>
            </Link>

            <Link
              to="/app/todo"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] dark:hover:bg-[#16181D] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] dark:text-blue-400 mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <CheckSquare className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170] dark:group-hover:text-blue-400">
                Action Tasks
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Sign-offs &amp; Notes</span>
            </Link>

            <Link
              to="/my/appointments"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] dark:hover:bg-[#16181D] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] dark:text-blue-400 mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <UserCheck className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170] dark:group-hover:text-blue-400">
                Chamber Records
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Historical Dockets</span>
            </Link>
          </div>
        )}

        {/* SECRETARIAT Quick Links */}
        {currentRolePerspective === 'SECRETARIAT' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link
              to="/app/inbox"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <Inbox className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170]">
                Triage Inbox
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Screen &amp; Assign</span>
            </Link>

            <Link
              to="/app/calendar"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170]">
                Dual Calendar
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Dignitary Schedule</span>
            </Link>

            <Link
              to="/app/today"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <Clock className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170]">
                Today's Schedule
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Daily Dispatch</span>
            </Link>

            <Link
              to="/app/todo"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <CheckSquare className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170]">
                Secretariat Tasks
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Follow-ups</span>
            </Link>
          </div>
        )}

        {/* RECEPTION Quick Links */}
        {currentRolePerspective === 'RECEPTION' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link
              to="/app/reception"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <DoorOpen className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170]">
                Reception Desk
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Pass &amp; Check-In</span>
            </Link>

            <Link
              to="/app/today"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <Clock className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170]">
                Today's Visitors
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Daily Arrivals</span>
            </Link>

            <Link
              to="/app/calendar"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170]">
                Floor Schedule
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Chamber Slots</span>
            </Link>

            <Link
              to="/app/todo"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <CheckSquare className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170]">
                Reception Tasks
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Badge Returns</span>
            </Link>
          </div>
        )}

        {/* SECURITY Quick Links */}
        {currentRolePerspective === 'SECURITY' && (
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <Link
              to="/app/security"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170]">
                Security Gate Check
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Gate Scan &amp; Clearance</span>
            </Link>

            <Link
              to="/app/today"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <Clock className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170]">
                Daily Pass Manifest
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Campus Entry Log</span>
            </Link>
          </div>
        )}

        {/* CITIZEN Quick Links */}
        {currentRolePerspective === 'CITIZEN' && (
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <Link
              to="/request"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <PlusCircle className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170]">
                Request Meeting
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Form OAMS-101</span>
            </Link>

            <Link
              to={user ? '/my/appointments' : '/track'}
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <Clock className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170]">
                Track Appointments
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Pass &amp; Status</span>
            </Link>
          </div>
        )}

        {/* ADMIN SUPER ADMIN Quick Links */}
        {currentRolePerspective === 'ADMIN' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link
              to="/admin/users"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <Users className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170]">
                Users &amp; Roles
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Faculty &amp; Staff</span>
            </Link>

            <Link
              to="/admin/officials"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <Shield className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170]">
                Faculty Chambers
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Dignitary Chambers</span>
            </Link>

            <Link
              to="/admin/reports"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <LayoutGrid className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170]">
                Executive Reports
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Intelligence &amp; CSV</span>
            </Link>

            <Link
              to="/admin/audit"
              className="p-3.5 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] hover:border-[#1A3170] hover:bg-[#F7F6F2] transition text-center space-y-1.5 group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F7F6F2] dark:bg-[#16181D] text-[#1A3170] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170]">
                Security Audit
              </div>
              <span className="text-[10px] text-[#5B6070] dark:text-[#8E95A5] block">Verification Trail</span>
            </Link>
          </div>
        )}
      </div>

      {/* System Health Status Card - Clean Monochromatic */}
      <div className="p-4 rounded-2xl border border-[#E4E2DC] dark:border-[#2A2F3D] bg-white dark:bg-[#1E222B] flex items-center justify-between text-xs shadow-2xs">
        <div className="flex items-center gap-2 text-[#5B6070] dark:text-[#8E95A5]">
          <CheckCircle2 className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
          <span>System Status:</span>
          <strong className="text-[#16181D] dark:text-white">
            {health?.status === 'ok' || health?.status === 'degraded'
              ? 'Institutional Operations Platform Operational'
              : 'Standby / Resilient Active'}
          </strong>
        </div>

        <button
          type="button"
          onClick={() => refetchHealth()}
          disabled={isHealthFetching}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-[#E4E2DC] dark:border-[#2A2F3D] text-[#5B6070] dark:text-[#8E95A5] hover:text-[#16181D] dark:hover:text-white hover:bg-[#F7F6F2] dark:hover:bg-[#16181D] transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isHealthFetching ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>
    </div>
  );
};
