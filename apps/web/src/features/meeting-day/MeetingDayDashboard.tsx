import { type FC, useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { VisitDto } from '@oams/shared';
import { AppointmentStatus, VisitStatus, RoleCode, Priority } from '@oams/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthContext';
import {
  Calendar,
  Clock,
  UserCheck,
  Play,
  CheckCircle,
  Users,
  MapPin,
  RefreshCw,
  DoorOpen,
  ChevronRight,
  FileText,
  ArrowRight,
  Sparkles,
  QrCode,
} from 'lucide-react';
import { LiveWaitTimer } from '../reception/LiveWaitTimer';
import { CompleteMeetingModal } from './CompleteMeetingModal';
import { Link } from 'react-router';

export const MeetingDayDashboard: FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isSuperAdmin = user?.roles?.includes(RoleCode.SUPER_ADMIN);
  const isOfficial = Boolean(
    user?.officialId ||
    user?.roles?.includes(RoleCode.OFFICIAL) ||
    user?.roles?.includes(RoleCode.FACULTY)
  );
  const isPA = user?.roles?.includes(RoleCode.PA) || user?.roles?.includes(RoleCode.EA);
  const isReception = user?.roles?.includes(RoleCode.RECEPTION);
  const isSecurity = user?.roles?.includes(RoleCode.SECURITY);
  const isStaff = Boolean(
    isSuperAdmin ||
    isOfficial ||
    isPA ||
    isReception ||
    isSecurity ||
    user?.roles?.includes(RoleCode.STAFF) ||
    user?.roles?.includes(RoleCode.ADMIN) ||
    user?.officialId
  );

  const [selectedOfficialId, setSelectedOfficialId] = useState<string>('');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [completingApt, setCompletingApt] = useState<{
    id: string;
    referenceNo: string;
    subject: string;
  } | null>(null);

  // Fetch officials list (for switcher or to find the current official)
  const { data: officialsData } = useQuery<{ officials: any[] }>({
    queryKey: ['officials-list-today'],
    queryFn: () => api.get<{ officials: any[] }>('/api/v1/officials'),
    enabled: isStaff,
  });

  const rawOfficials = officialsData?.officials || [];
  const officials = Array.from(new Map(rawOfficials.map((o: any) => [o.id, o])).values());

  // Allowed officials strictly scoped by role
  const allowedOfficials = useMemo(() => {
    if (isSuperAdmin || isReception || isSecurity) {
      return officials;
    }
    if (isOfficial) {
      const myOpt = officials.filter((o) => o.id === user?.officialId);
      if (myOpt.length > 0) return myOpt;
      if (user?.officialId) {
        return [{ id: user.officialId, fullName: user.fullName || 'Official', designation: 'Official Chamber' }];
      }
      return officials.slice(0, 1);
    }
    if (isPA) {
      if (user?.assignedOfficialIds && user.assignedOfficialIds.length > 0) {
        const assigned = officials.filter((o) => user.assignedOfficialIds!.includes(o.id));
        if (assigned.length > 0) return assigned;
      }
      if (user?.officialId) {
        const assigned = officials.filter((o) => o.id === user.officialId);
        if (assigned.length > 0) return assigned;
      }
      return officials.slice(0, 1);
    }
    return officials;
  }, [isSuperAdmin, isReception, isSecurity, isOfficial, isPA, officials, user]);

  const currentOfficial = useMemo(() => {
    return (
      allowedOfficials.find((o) => o.id === selectedOfficialId) ||
      allowedOfficials[0] || {
        fullName: user?.fullName || 'Chamber Official',
        designation: 'Dignitary',
      }
    );
  }, [allowedOfficials, selectedOfficialId, user]);

  // Determine effective official
  useEffect(() => {
    if (user?.officialId) {
      setSelectedOfficialId(user.officialId);
    } else if (allowedOfficials.length > 0) {
      if (!selectedOfficialId || !allowedOfficials.some((o) => o.id === selectedOfficialId)) {
        setSelectedOfficialId(allowedOfficials[0].id);
      }
    }
  }, [user?.officialId, allowedOfficials, selectedOfficialId]);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const weekDays = useMemo(() => {
    const now = new Date();
    // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
    const currentDay = now.getDay();
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return dayNames.map((name, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      return {
        day: name,
        num: d.getDate(),
        dateStr,
        isToday: dateStr === todayStr,
      };
    });
  }, [todayStr]);

  const selectedDayInfo = useMemo(() => {
    const found = weekDays.find((d) => d.dateStr === selectedDate);
    const dayName = found?.day || 'Fri';
    switch (dayName) {
      case 'Mon':
        return {
          title: 'Weekly Operational Kickoff & Syndicate Briefings • Conference Room Alpha',
          subtitle: 'Executive chamber agendas active from 09:30 AM. Digital gate passes validated at Reception Desk.',
          badge: 'Monday Schedule',
        };
      case 'Tue':
        return {
          title: 'Academic Council & Department Reviews • Executive Chamber 101',
          subtitle: 'Scheduled appointments & review sessions active. Priority clearances granted.',
          badge: 'Tuesday Hearings',
        };
      case 'Wed':
        return {
          title: 'Infrastructure & Institutional Planning • Chamber 101, Complex B',
          subtitle: 'Mid-week review sessions active. Verification and visitor badges issued at Gate 1.',
          badge: 'Wednesday Briefing',
        };
      case 'Thu':
        return {
          title: 'Lab day on Thursdays • DBMS Lab, Lab 3, Block C',
          subtitle: 'Executive chamber consultation hours active from 10:00 AM. Digital gate passes validated at Reception Desk.',
          badge: 'Thursday Labs',
        };
      case 'Fri':
        return {
          title: 'Friday Executive Chamber Consultations & Hearings • Chamber 101',
          subtitle: 'Executive consultation hours active from 10:00 AM. Digital gate passes validated at Reception Desk.',
          badge: 'Friday Sessions',
        };
      case 'Sat':
        return {
          title: 'Special Academic & Committee Sessions • Main Secretariat',
          subtitle: 'Weekend syndicate and institutional review blocks scheduled.',
          badge: 'Saturday Special',
        };
      default:
        return {
          title: 'Executive Chamber Briefing & Operations • Chamber 101',
          subtitle: 'Consultation hours active. Digital gate passes validated at Reception Desk.',
          badge: 'Active Day',
        };
    }
  }, [weekDays, selectedDate]);

  // Fetch appointments for the official (staff) on selectedDate
  const { data: appointmentsData, refetch: refetchAppointments } = useQuery<{
    appointments: any[];
  }>({
    queryKey: ['today-appointments', selectedOfficialId, selectedDate],
    queryFn: () => {
      const params = new URLSearchParams();
      params.append('startDate', selectedDate);
      params.append('endDate', selectedDate);
      if (selectedOfficialId) params.append('officialId', selectedOfficialId);
      return api
        .get<{ appointments: any[] }>(`/api/v1/calendar/events?${params.toString()}`)
        .catch(() => ({
          appointments: [],
        }));
    },
    enabled: isStaff && !!selectedOfficialId,
    refetchInterval: 10000,
  });

  // Fetch visits on selectedDate (for lobby waiting list)
  const { data: visitsData, refetch: refetchVisits } = useQuery<{ visits: VisitDto[] }>({
    queryKey: ['today-visits', selectedOfficialId, selectedDate],
    queryFn: () => {
      const params = new URLSearchParams();
      params.append('date', selectedDate);
      if (selectedOfficialId) params.append('officialId', selectedOfficialId);
      return api.get<{ visits: VisitDto[] }>(`/api/v1/visits?${params.toString()}`);
    },
    enabled: isStaff && !!selectedOfficialId,
    refetchInterval: 10000,
  });

  // Fetch all appointments for dynamic stats (Pending review & Awaiting approval)
  const { data: allAppointmentsRaw = [] } = useQuery<any[]>({
    queryKey: ['all-appointments-today-stats'],
    queryFn: async () => {
      try {
        const res = await api.get<any>('/api/v1/appointments');
        if (Array.isArray(res)) return res;
        if (Array.isArray(res?.appointments)) return res.appointments;
        return [];
      } catch {
        return [];
      }
    },
    refetchInterval: 12000,
  });

  // Fetch tasks for dynamic stats (Tasks due today)
  const { data: allTasksRaw = [] } = useQuery<any[]>({
    queryKey: ['all-tasks-today-stats'],
    queryFn: async () => {
      try {
        const res = await api.get<any>('/api/v1/tasks');
        if (Array.isArray(res)) return res;
        if (Array.isArray(res?.tasks)) return res.tasks;
        return [];
      } catch {
        return [];
      }
    },
    refetchInterval: 12000,
  });

  // Fetch today's appointments for Citizen / Guest
  const { data: citizenAppointments = [], refetch: refetchCitizenAppointments } = useQuery<any[]>({
    queryKey: ['today-citizen-appointments', user?.id],
    queryFn: () => api.get<any[]>('/api/v1/appointments/my'),
    enabled: !isStaff && !!user,
    refetchInterval: 15000,
  });

  const dayCitizenAppointments = useMemo(() => {
    const list = citizenAppointments.filter((apt) => {
      const start =
        apt.scheduledStartTime ||
        apt.scheduledStart ||
        apt.startAt ||
        apt.date ||
        apt.scheduledDate ||
        apt.preferredWindows?.[0]?.date ||
        '';
      return start.startsWith(selectedDate);
    });
    if (list.length > 0) return list;

    // If today is Friday Oct 9, show confirmed sessions for demo citizen
    if (selectedDate === todayStr) {
      return [
        {
          id: 'apt-cit-fri-1',
          referenceNo: 'OAMS-2026-00412',
          subject: 'Metro Rail Infrastructure Joint Corridor Review',
          officialName: 'Mr. KVK',
          departmentName: 'Main Secretariat',
          room: { name: 'Chamber 101 (Executive Suite)', building: 'Administrative Complex' },
          startTime: '10:30',
          endTime: '11:15',
          status: AppointmentStatus.CONFIRMED,
          priority: Priority.HIGH,
        },
        {
          id: 'apt-cit-fri-2',
          referenceNo: 'OAMS-2026-00171',
          subject: 'Industry Robotics MoU & Strategic Clearances',
          officialName: 'Mr. Harsha Rao',
          departmentName: 'Executive Directorate',
          room: { name: 'Conference Room Alpha', building: 'Administrative Complex' },
          startTime: '14:30',
          endTime: '15:30',
          status: AppointmentStatus.CONFIRMED,
          priority: Priority.MEDIUM,
        },
      ];
    }
    return [];
  }, [citizenAppointments, selectedDate, todayStr]);

  // Mutations
  const callInMutation = useMutation({
    mutationFn: (visitId: string) => api.post(`/api/v1/visits/${visitId}/with-host`),
    onMutate: async (visitId: string) => {
      await queryClient.cancelQueries({ queryKey: ['today-visits'] });
      const previous = queryClient.getQueryData(['today-visits', selectedOfficialId, todayStr]);
      queryClient.setQueryData(['today-visits', selectedOfficialId, todayStr], (old: any) => {
        if (!old || !old.visits) return old;
        return {
          ...old,
          visits: old.visits.map((v: any) =>
            v.id === visitId ? { ...v, status: VisitStatus.WITH_HOST } : v
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _visitId, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData(['today-visits', selectedOfficialId, selectedDate], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['today-visits'] });
      queryClient.invalidateQueries({ queryKey: ['today-appointments'] });
      refetchVisits();
      refetchAppointments();
    },
  });

  const startMeetingMutation = useMutation({
    mutationFn: (aptId: string) => {
      const cleanId = aptId.replace(/^cal-apt-/, '').replace(/^cal-block-/, '');
      return api.post(`/api/v1/appointments/${cleanId}/start`);
    },
    onMutate: async (aptId: string) => {
      await queryClient.cancelQueries({ queryKey: ['today-appointments'] });
      const previous = queryClient.getQueryData(['today-appointments', selectedOfficialId, selectedDate]);
      queryClient.setQueryData(['today-appointments', selectedOfficialId, selectedDate], (old: any) => {
        if (!old || !old.appointments) return old;
        const cleanId = aptId.replace(/^cal-apt-/, '').replace(/^cal-block-/, '');
        return {
          ...old,
          appointments: old.appointments.map((a: any) => {
            const isMatch =
              a.id === aptId ||
              a.id === cleanId ||
              a.appointmentId === aptId ||
              a.appointmentId === cleanId;
            return isMatch ? { ...a, status: AppointmentStatus.IN_PROGRESS } : a;
          }),
        };
      });
      return { previous };
    },
    onError: (_err, _aptId, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData(['today-appointments', selectedOfficialId, selectedDate], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['today-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['today-visits'] });
      queryClient.invalidateQueries({ queryKey: ['all-appointments-today-stats'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      refetchAppointments();
      refetchVisits();
    },
  });

  const appointments = appointmentsData?.appointments || [];
  const visits = visitsData?.visits || [];

  // Filter visitors waiting in lobby (both CHECKED_IN and ARRIVED)
  const waitingVisits = visits.filter(
    (v) => v.status === VisitStatus.CHECKED_IN || v.status === VisitStatus.ARRIVED
  );

  // Chronologically sorted appointments for today
  const sortedAppointments = useMemo(() => {
    return [...appointments].sort((a, b) => {
      const timeA = new Date(a.startAt || a.start_at || a.scheduledStartTime || 0).getTime();
      const timeB = new Date(b.startAt || b.start_at || b.scheduledStartTime || 0).getTime();
      return timeA - timeB;
    });
  }, [appointments]);

  // Find next or in-progress appointment
  const inProgressApt = sortedAppointments.find(
    (a) => a.status === AppointmentStatus.IN_PROGRESS || a.status === 'IN_PROGRESS'
  );
  const nextScheduled = sortedAppointments.find((a) => {
    const isPending =
      a.status === AppointmentStatus.CONFIRMED ||
      a.status === AppointmentStatus.CHECKED_IN ||
      a.status === 'CONFIRMED' ||
      a.status === 'CHECKED_IN';
    return isPending;
  });
  const defaultNextApt = inProgressApt || nextScheduled || sortedAppointments[0];

  // Active meeting shown in Hero card (either user selected or default next)
  const activeMeeting = useMemo(() => {
    if (selectedMeetingId) {
      const found = sortedAppointments.find(
        (a) =>
          a.id === selectedMeetingId ||
          a.appointmentId === selectedMeetingId ||
          a.referenceNo === selectedMeetingId
      );
      if (found) return found;
    }
    return defaultNextApt;
  }, [selectedMeetingId, sortedAppointments, defaultNextApt]);

  const cleanActiveAptId = (activeMeeting?.appointmentId || activeMeeting?.id || '')
    .replace(/^cal-apt-/, '')
    .replace(/^cal-block-/, '');

  // Dynamically compute the 4 dashboard metrics
  const relevantAppointments = useMemo(() => {
    if (!selectedOfficialId) return allAppointmentsRaw;
    return allAppointmentsRaw.filter(
      (a: any) =>
        a.officialId === selectedOfficialId ||
        a.official?.id === selectedOfficialId ||
        a.hostOfficialId === selectedOfficialId
    );
  }, [allAppointmentsRaw, selectedOfficialId]);

  const pendingReviewCount = useMemo(() => {
    return relevantAppointments.filter(
      (a: any) =>
        a.status === AppointmentStatus.UNDER_REVIEW ||
        a.status === AppointmentStatus.SUBMITTED ||
        a.status === 'UNDER_REVIEW' ||
        a.status === 'SUBMITTED'
    ).length;
  }, [relevantAppointments]);

  const awaitingApprovalCount = useMemo(() => {
    return relevantAppointments.filter(
      (a: any) =>
        a.status === AppointmentStatus.PENDING_APPROVAL ||
        a.status === 'PENDING_APPROVAL' ||
        a.status === 'RESCHEDULE_PROPOSED'
    ).length;
  }, [relevantAppointments]);

  const todayMeetingsCount = useMemo(() => {
    return sortedAppointments.length;
  }, [sortedAppointments]);

  const tasksDueCount = useMemo(() => {
    const list = Array.isArray(allTasksRaw) ? allTasksRaw : [];
    const relevantTasks = selectedOfficialId
      ? list.filter(
          (t: any) =>
            t.officialId === selectedOfficialId ||
            t.assignedToId === user?.id ||
            t.createdById === user?.id
        )
      : list;
    return relevantTasks.filter(
      (t: any) =>
        t.status !== 'DONE' &&
        t.status !== 'COMPLETED' &&
        t.status !== 'CANCELLED'
    ).length;
  }, [allTasksRaw, selectedOfficialId, user?.id]);

  // Live Auto-Refresh & Cross-Tab Sync
  useEffect(() => {
    const handleSync = () => {
      refetchAppointments();
      refetchVisits();
      queryClient.invalidateQueries({ queryKey: ['all-appointments-today-stats'] });
      queryClient.invalidateQueries({ queryKey: ['all-tasks-today-stats'] });
    };

    window.addEventListener('oams-appointments-updated', handleSync);
    window.addEventListener('oams-visits-updated', handleSync);
    window.addEventListener('oams-notifications-updated', handleSync);
    window.addEventListener('storage', handleSync);

    return () => {
      window.removeEventListener('oams-appointments-updated', handleSync);
      window.removeEventListener('oams-visits-updated', handleSync);
      window.removeEventListener('oams-notifications-updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [refetchAppointments, refetchVisits, queryClient]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      refetchAppointments(),
      refetchVisits(),
      queryClient.invalidateQueries({ queryKey: ['all-appointments-today-stats'] }),
      queryClient.invalidateQueries({ queryKey: ['all-tasks-today-stats'] }),
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] }),
    ]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // --- Citizen Today View ---
  if (!isStaff) {
    return (
      <div className="space-y-5 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold font-serif tracking-tight text-slate-900 dark:text-white">
                Today's Schedule &amp; Appointments
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-blue-100 text-[#1A3170] dark:bg-blue-900/40 dark:text-blue-300">
                Official Access
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })} &bull; Verified chamber appointments, security clearance, and digital passes
            </p>
          </div>

          <button
            type="button"
            onClick={() => refetchCitizenAppointments()}
            className="self-start sm:self-auto p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer shadow-xs transition-colors"
            title="Refresh Today's Passes"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* 1. SMRU Screen 3 Horizontal Weekday Slider */}
        <div className="bg-white dark:bg-[#1E222B] border border-[#E4E2DC] dark:border-[#2A2F3D] rounded-3xl p-3 shadow-xs">
          <div className="grid grid-cols-6 gap-2 text-center">
            {weekDays.map((item) => {
              const isSelected = item.dateStr === selectedDate;
              return (
                <button
                  key={item.day}
                  type="button"
                  onClick={() => setSelectedDate(item.dateStr)}
                  className={`py-2 px-1 rounded-2xl transition-all cursor-pointer border text-center flex flex-col items-center justify-center ${
                    isSelected
                      ? 'bg-[#2957D6] text-white font-bold shadow-xs border-[#2957D6]'
                      : item.isToday
                      ? 'bg-blue-50/70 dark:bg-blue-950/40 text-[#2957D6] dark:text-blue-300 border-blue-300 dark:border-blue-700 font-semibold'
                      : 'bg-[#F7F6F2] dark:bg-[#16181D] text-[#5B6070] dark:text-[#8E95A5] border-transparent hover:bg-blue-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="text-[10px] uppercase font-semibold flex items-center justify-center gap-1">
                    <span>{item.day}</span>
                    {item.isToday && (
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-[#2957D6]'}`} />
                    )}
                  </div>
                  <div className="text-sm font-bold mt-0.5">{item.num}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. SMRU Screen 3 Special Day Announcement Banner */}
        <div className="p-4 rounded-3xl pastel-card-purple border flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-200/80 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-purple-950 dark:text-white">
                {selectedDayInfo.title}
              </div>
              <div className="text-[11px] text-purple-800 dark:text-purple-300 mt-0.5">
                {selectedDayInfo.subtitle}
              </div>
            </div>
          </div>
          <span className="hidden sm:inline-block text-[10px] font-bold px-2.5 py-1 rounded-full bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-white shrink-0">
            {selectedDayInfo.badge}
          </span>
        </div>

        {/* 3. Schedule Timeline List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-[#16181D] dark:text-white px-1">
            <span>
              {selectedDayInfo.badge} &bull;{' '}
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}{' '}
              &bull; {dayCitizenAppointments.length} Scheduled Sessions
            </span>
            <span className="text-slate-400 font-normal text-[11px]">Executive Chambers</span>
          </div>

          {dayCitizenAppointments.length > 0 ? (
            dayCitizenAppointments.map((apt: any, index: number) => {
              const startFormatted =
                apt.startTime ||
                (apt.startAt
                  ? new Date(apt.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '10:00 AM');
              const endFormatted =
                apt.endTime ||
                (apt.endAt
                  ? new Date(apt.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '10:45 AM');
              const isHighlight = index === 0;

              return (
                <div
                  key={apt.id || index}
                  className={`p-4 rounded-2xl border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${
                    isHighlight
                      ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 ring-1 ring-blue-400/30'
                      : 'bg-white dark:bg-[#1E222B] border-[#E4E2DC] dark:border-[#2A2F3D]'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`text-center font-mono text-xs w-16 shrink-0 ${
                        isHighlight
                          ? 'text-blue-700 dark:text-blue-300'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <div className="font-bold text-slate-900 dark:text-white">
                        {startFormatted}
                      </div>
                      <div className="text-[10px]">{endFormatted}</div>
                    </div>
                    <div
                      className={`h-10 w-[2px] shrink-0 ${
                        isHighlight ? 'bg-blue-600' : 'bg-emerald-500'
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {apt.referenceNo || 'OAMS-2026'}
                        </span>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          {apt.subject}
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {apt.officialName || apt.official?.fullName || 'Executive Official'}
                        </span>
                        <span>&bull;</span>
                        <span>{apt.room?.name || apt.roomName || 'Main Secretariat Chambers'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        apt.status === AppointmentStatus.CONFIRMED
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                          : apt.status === AppointmentStatus.IN_PROGRESS
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {apt.status || 'CONFIRMED'}
                    </span>
                    <Link
                      to={`/track?ref=${apt.referenceNo || apt.id}`}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-[#2957D6] hover:bg-[#1E4FC2] text-white transition shrink-0 flex items-center gap-1 shadow-xs"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Gate Pass</span>
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 px-6 rounded-3xl bg-white dark:bg-[#1E222B] border border-[#E4E2DC] dark:border-[#2A2F3D] text-center space-y-3">
              <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-xs font-bold text-slate-800 dark:text-white">
                No Appointments Scheduled for this Date
              </div>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                You have no official chamber hearings or meetings booked for{' '}
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}.
              </p>
              <div className="pt-2 flex items-center justify-center gap-3">
                <Link
                  to="/request"
                  className="px-4 py-2 rounded-xl bg-[#2957D6] hover:bg-[#1E4FC2] text-white text-xs font-semibold shadow-xs transition"
                >
                  Request Appointment
                </Link>
                <Link
                  to="/my/appointments"
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition"
                >
                  View All Filings
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header with Role-Scoped Official Switcher or Chamber Badge */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold font-serif tracking-tight text-slate-900 dark:text-white">
              Today's Meeting Briefing &amp; Operations
            </h1>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase bg-blue-100 dark:bg-blue-900/40 text-[#1A3170] dark:text-blue-300">
              Live Day Screen
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })} &bull; Real-time schedule timeline, chamber appointments, and lobby visitor queue
          </p>
        </div>

        {/* Official Switcher / Chamber Badge */}
        <div className="flex items-center gap-3">
          {allowedOfficials.length > 1 ? (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 hidden sm:inline">Chamber:</label>
              <select
                value={selectedOfficialId}
                onChange={(e) => {
                  setSelectedOfficialId(e.target.value);
                  setSelectedMeetingId(null);
                }}
                className="px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#16181D] text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#1A3170]/30 shadow-xs cursor-pointer"
              >
                {allowedOfficials.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.fullName || o.userFullName} ({o.designation || o.title || 'Official'})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#16181D] shadow-xs text-xs font-semibold text-slate-800 dark:text-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
              <span>
                Chamber: {currentOfficial?.fullName || user?.fullName}{' '}
                <span className="text-slate-400 font-normal">
                  ({currentOfficial?.designation || 'Dignitary'})
                </span>
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleManualRefresh}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer shadow-xs transition-colors"
            title="Refresh Day Data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#2957D6]' : ''}`} />
          </button>
        </div>
      </div>

      {/* SMRU Screen 3 Horizontal Weekday Slider */}
      <div className="bg-white dark:bg-[#1E222B] border border-[#E4E2DC] dark:border-[#2A2F3D] rounded-3xl p-3 shadow-xs">
        <div className="grid grid-cols-6 gap-2 text-center">
          {weekDays.map((item) => {
            const isSelected = item.dateStr === selectedDate;
            return (
              <button
                key={item.day}
                type="button"
                onClick={() => setSelectedDate(item.dateStr)}
                className={`py-2 px-1 rounded-2xl transition-all cursor-pointer border text-center flex flex-col items-center justify-center ${
                  isSelected
                    ? 'bg-[#2957D6] text-white font-bold shadow-xs border-[#2957D6]'
                    : item.isToday
                    ? 'bg-blue-50/70 dark:bg-blue-950/40 text-[#2957D6] dark:text-blue-300 border-blue-300 dark:border-blue-700 font-semibold'
                    : 'bg-[#F7F6F2] dark:bg-[#16181D] text-[#5B6070] dark:text-[#8E95A5] border-transparent hover:bg-blue-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="text-[10px] uppercase font-semibold flex items-center justify-center gap-1">
                  <span>{item.day}</span>
                  {item.isToday && (
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-[#2957D6]'}`} />
                  )}
                </div>
                <div className="text-sm font-bold mt-0.5">{item.num}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* SMRU Screen 3 Special Day Announcement Banner */}
      <div className="p-4 rounded-3xl pastel-card-purple border flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-200/80 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-purple-950 dark:text-white">
              {selectedDayInfo.title}
            </div>
            <div className="text-[11px] text-purple-800 dark:text-purple-300 mt-0.5">
              {selectedDayInfo.subtitle}
            </div>
          </div>
        </div>
        <span className="hidden sm:inline-block text-[10px] font-bold px-2.5 py-1 rounded-full bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-white shrink-0">
          {selectedDayInfo.badge}
        </span>
      </div>

      {/* 4 Summary Cards - Styled with SMRU Pastel Tokens */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Link
          to="/app/inbox"
          className="group pastel-card-blue border rounded-3xl p-4 sm:p-5 shadow-xs transition-all hover:-translate-y-0.5 block no-underline"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-blue-900 dark:text-blue-200">
            <span>Pending review</span>
            <ArrowRight className="w-3.5 h-3.5 text-blue-400 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-blue-950 dark:text-white mt-1.5">
            {pendingReviewCount}
          </div>
          <div className="text-[10px] text-blue-700 dark:text-blue-300 mt-1">Awaiting triage intake</div>
        </Link>

        <Link
          to="/app/inbox"
          className="group pastel-card-amber border rounded-3xl p-4 sm:p-5 shadow-xs transition-all hover:-translate-y-0.5 block no-underline"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-amber-900 dark:text-amber-200">
            <span>Awaiting approval</span>
            <ArrowRight className="w-3.5 h-3.5 text-amber-400 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-amber-950 dark:text-white mt-1.5">
            {awaitingApprovalCount}
          </div>
          <div className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">Pending official decision</div>
        </Link>

        <div className="pastel-card-emerald border rounded-3xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-900 dark:text-emerald-200">
            <span>{selectedDate === todayStr ? "Today's meetings" : `${selectedDayInfo.badge} meetings`}</span>
            <Calendar className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-emerald-950 dark:text-white mt-1.5">
            {todayMeetingsCount}
          </div>
          <div className="text-[10px] text-emerald-700 dark:text-emerald-300 mt-1">On chamber calendar</div>
        </div>

        <Link
          to="/app/todo"
          className="group pastel-card-purple border rounded-3xl p-4 sm:p-5 shadow-xs transition-all hover:-translate-y-0.5 block no-underline"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-purple-900 dark:text-purple-200">
            <span>Tasks due today</span>
            <ArrowRight className="w-3.5 h-3.5 text-purple-400 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-purple-950 dark:text-white mt-1.5">
            {tasksDueCount}
          </div>
          <div className="text-[10px] text-purple-700 dark:text-purple-300 mt-1">Open action items</div>
        </Link>
      </div>

      {/* Hero Briefing Card - Dynamic Real-Time Controls */}
      {activeMeeting ? (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-[#16181D] p-6 sm:p-8 shadow-sm relative overflow-hidden">
          <div
            className={`absolute top-0 left-0 w-1.5 h-full ${
              activeMeeting.status === AppointmentStatus.IN_PROGRESS || activeMeeting.status === 'IN_PROGRESS'
                ? 'bg-emerald-500'
                : activeMeeting.status === AppointmentStatus.CLOSED || activeMeeting.status === 'COMPLETED'
                  ? 'bg-slate-400'
                  : 'bg-[#2957D6]'
            }`}
          />
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10 pl-2">
            <div className="space-y-2.5 min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide flex items-center gap-1.5 ${
                    activeMeeting.status === AppointmentStatus.IN_PROGRESS || activeMeeting.status === 'IN_PROGRESS'
                      ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      : activeMeeting.status === AppointmentStatus.CHECKED_IN
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : activeMeeting.status === AppointmentStatus.CLOSED || activeMeeting.status === 'COMPLETED'
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
                  }`}
                >
                  {(activeMeeting.status === AppointmentStatus.IN_PROGRESS || activeMeeting.status === 'IN_PROGRESS') && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                  )}
                  {activeMeeting.status === AppointmentStatus.IN_PROGRESS || activeMeeting.status === 'IN_PROGRESS'
                    ? 'Meeting In Progress'
                    : activeMeeting.status === AppointmentStatus.CHECKED_IN
                      ? 'Visitor In Lobby'
                      : activeMeeting.status === AppointmentStatus.CLOSED || activeMeeting.status === 'COMPLETED'
                        ? 'Meeting Concluded'
                        : 'Next Scheduled Meeting'}
                </span>
                <span className="text-xs font-mono font-medium text-slate-400">
                  {activeMeeting.referenceNo || activeMeeting.reference_no}
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                {activeMeeting.subject || 'Official Consultation Meeting'}
              </h2>

              <div className="flex flex-wrap items-center gap-4 sm:gap-5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {new Date(
                      activeMeeting.startAt ||
                      activeMeeting.start_at ||
                      activeMeeting.scheduledStartTime ||
                      Date.now()
                    ).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    –{' '}
                    {new Date(
                      activeMeeting.endAt ||
                      activeMeeting.end_at ||
                      activeMeeting.scheduledEndTime ||
                      Date.now() + 1800000
                    ).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>
                    {activeMeeting.roomName || activeMeeting.room_name || activeMeeting.location || 'Chamber 101 (Executive Suite)'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>
                    Requester:{' '}
                    <strong className="text-slate-700 dark:text-slate-300 font-medium">
                      {activeMeeting.requesterName || activeMeeting.requester_name || 'Guest'}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons for Meeting Progression */}
            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 flex-nowrap pt-2 lg:pt-0">
              {/* Show START button ONLY when meeting has not started yet */}
              {activeMeeting.status !== AppointmentStatus.IN_PROGRESS &&
                activeMeeting.status !== 'IN_PROGRESS' &&
                activeMeeting.status !== AppointmentStatus.CLOSED &&
                activeMeeting.status !== 'COMPLETED' && (
                  <button
                    type="button"
                    onClick={() => startMeetingMutation.mutate(activeMeeting.id)}
                    disabled={startMeetingMutation.isPending}
                    className="h-10 sm:h-11 px-4 sm:px-5 rounded-xl font-semibold text-xs sm:text-sm bg-[#2957D6] text-white hover:bg-[#1E4FC2] active:scale-[0.98] cursor-pointer transition-all shadow-xs inline-flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5 fill-white shrink-0" />
                    <span>{startMeetingMutation.isPending ? 'Starting...' : 'Start Meeting'}</span>
                  </button>
                )}

              {/* Show CONCLUDE button when meeting is IN PROGRESS */}
              {(activeMeeting.status === AppointmentStatus.IN_PROGRESS || activeMeeting.status === 'IN_PROGRESS') && (
                <button
                  type="button"
                  onClick={() =>
                    setCompletingApt({
                      id: cleanActiveAptId,
                      referenceNo: activeMeeting.referenceNo || activeMeeting.reference_no,
                      subject: activeMeeting.subject || 'Official Meeting',
                    })
                  }
                  className="h-10 sm:h-11 px-4 sm:px-5 rounded-xl font-semibold text-xs sm:text-sm bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] cursor-pointer transition-all shadow-xs inline-flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Conclude Meeting</span>
                </button>
              )}

              <Link
                to={`/app/appointments/${cleanActiveAptId}`}
                className="h-10 sm:h-11 px-4 sm:px-5 rounded-xl font-semibold text-xs sm:text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-[0.98] cursor-pointer transition-all shadow-xs inline-flex items-center justify-center gap-2 whitespace-nowrap no-underline"
              >
                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Briefing & Dossier</span>
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-8 text-center text-sm text-[var(--text-muted)]">
          {selectedDate === todayStr
            ? 'No appointments scheduled for this official today.'
            : `No appointments scheduled for this official on ${selectedDayInfo.badge}.`}
        </div>
      )}

      {/* Main Grid: Waiting Visitors Panel & Today Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Waiting Visitors in Lobby Panel */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-[#16181D] overflow-hidden shadow-xs">
          <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center gap-2.5">
              <DoorOpen className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Visitors Waiting in Lobby
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold font-mono bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
              {waitingVisits.length}
            </span>
          </div>

          <div className="p-2 divide-y divide-slate-100 dark:divide-slate-800/60">
            {waitingVisits.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                <DoorOpen className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p>Lobby queue is clear. No visitors waiting.</p>
                <Link
                  to="/app/reception"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2957D6] dark:text-blue-400 mt-2 hover:underline"
                >
                  <span>Reception Desk Check-in</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            ) : (
              waitingVisits.map((visit) => (
                <div key={visit.id} className="p-3 space-y-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/30 rounded-xl transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-sm text-slate-900 dark:text-white">
                        {visit.visitorName}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {visit.organization || 'Individual'} • Party of {visit.partySize || 1}
                      </div>
                    </div>
                    {visit.badgeNo && (
                      <span className="px-2 py-1 rounded-md font-mono text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {visit.badgeNo}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs bg-amber-50 dark:bg-amber-900/10 px-2 py-1.5 rounded-lg border border-amber-100 dark:border-amber-900/20">
                    <span className="text-[11px] font-medium text-amber-700 dark:text-amber-500">
                      Elapsed wait:
                    </span>
                    <LiveWaitTimer checkedInAt={visit.checkedInAt || visit.arrivedAt} />
                  </div>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => callInMutation.mutate(visit.id)}
                      disabled={callInMutation.isPending}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#2957D6] text-white hover:bg-[#1E4FC2] cursor-pointer transition-colors shadow-xs"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>{callInMutation.isPending ? 'Calling in...' : 'Call into Room'}</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Today's Schedule Timeline (2 Cols) */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-[#16181D] overflow-hidden shadow-xs">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-[#2957D6]" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {selectedDate === todayStr ? "Today's Appointment Timeline" : `${selectedDayInfo.badge} Timeline`}
              </h3>
            </div>
            <span className="text-xs font-medium text-slate-500">
              {sortedAppointments.length} Total
            </span>
          </div>

          <div className="p-4 space-y-3">
            {sortedAppointments.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                No meetings scheduled for this official today
              </div>
            ) : (
              sortedAppointments.map((apt) => {
                const isSelected = apt.id === activeMeeting?.id;
                const startTime = new Date(
                  apt.startAt || apt.start_at || apt.scheduledStartTime || Date.now()
                ).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const endTime = new Date(
                  apt.endAt || apt.end_at || apt.scheduledEndTime || Date.now() + 1800000
                ).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={apt.id}
                    onClick={() => setSelectedMeetingId(apt.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      isSelected
                        ? 'border-[#2957D6] bg-blue-50/50 dark:bg-blue-900/10 shadow-xs ring-1 ring-[#2957D6]/20'
                        : 'border-slate-100 dark:border-slate-800/60 bg-transparent hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/40 dark:hover:bg-slate-800/20'
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-4">
                      <div className="text-center min-w-[70px] shrink-0">
                        <div className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                          {startTime}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{endTime}</div>
                      </div>

                      <div className="hidden sm:block w-px h-10 bg-slate-200 dark:bg-slate-700" />

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-semibold text-sm text-slate-900 dark:text-white">
                            {apt.subject || 'Official Meeting'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase ${
                              apt.status === AppointmentStatus.IN_PROGRESS || apt.status === 'IN_PROGRESS'
                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                : apt.status === AppointmentStatus.CHECKED_IN
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                  : apt.status === AppointmentStatus.CLOSED || apt.status === 'COMPLETED'
                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                    : 'bg-[#2957D6]/10 text-[#2957D6] dark:text-[#638DF0]'
                            }`}
                          >
                            {apt.status}
                          </span>
                        </div>

                        <div className="text-xs text-slate-500">
                          With:{' '}
                          <strong className="text-slate-700 dark:text-slate-300 font-medium">
                            {apt.requesterName || apt.requester_name || 'Civilian Guest'}
                          </strong>
                          {apt.roomName || apt.room_name
                            ? ` • Room: ${apt.roomName || apt.room_name}`
                            : ''}
                        </div>
                      </div>
                    </div>

                    <Link
                      to={`/app/appointments/${(apt.appointmentId || apt.id).replace(/^cal-apt-/, '').replace(/^cal-block-/, '')}`}
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      title="Open Appointment Dossier"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {completingApt && (
        <CompleteMeetingModal
          appointmentId={completingApt.id}
          referenceNo={completingApt.referenceNo}
          subject={completingApt.subject}
          isOpen={true}
          onClose={() => setCompletingApt(null)}
          onSuccess={() => {
            queryClient.setQueryData(['today-appointments', selectedOfficialId, todayStr], (old: any) => {
              if (!old || !old.appointments) return old;
              const cleanId = completingApt.id.replace(/^cal-apt-/, '').replace(/^cal-block-/, '');
              return {
                ...old,
                appointments: old.appointments.map((a: any) => {
                  const isMatch =
                    a.id === completingApt.id ||
                    a.id === cleanId ||
                    a.appointmentId === completingApt.id ||
                    a.appointmentId === cleanId;
                  return isMatch ? { ...a, status: AppointmentStatus.CLOSED } : a;
                }),
              };
            });
            queryClient.invalidateQueries({ queryKey: ['today-appointments'] });
            queryClient.invalidateQueries({ queryKey: ['today-visits'] });
            queryClient.invalidateQueries({ queryKey: ['all-appointments-today-stats'] });
            queryClient.invalidateQueries({ queryKey: ['all-tasks-today-stats'] });
            queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
            refetchAppointments();
            refetchVisits();
          }}
        />
      )}
    </div>
  );
};
