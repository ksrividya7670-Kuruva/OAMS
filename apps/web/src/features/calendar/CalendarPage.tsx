import { useState, useMemo, useEffect, useRef, type FC, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';

// Standard Real Business Time Grid Constants (08:00 to 20:00 = 13 hourly markers)
const START_HOUR = 8;
const END_HOUR = 20;
const HOURS_COUNT = END_HOUR - START_HOUR + 1; // 13 (8:00 to 20:00)
const HOUR_HEIGHT = 64; // px per hour

const TIME_SLOTS = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
];
import {
  CalendarType,
  EventKind,
  BlockStrength,
  Visibility,
  RoleCode,
  type CalendarEventItem,
} from '@oams/shared';
import {
  Plus,
  X,
  AlertCircle,
  MapPin,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
  ExternalLink,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { RescheduleModal } from '../appointments/RescheduleModal';
import { INITIAL_OFFICIALS } from '@/lib/mockData';

// --- Interfaces ---
interface OfficialOption {
  id: string;
  title: string;
  userFullName?: string;
  fullName?: string;
  designation?: string;
}

interface RoomOption {
  id: string;
  name: string;
  building: string;
  floor: string;
  capacity: number;
}

export interface InternalCalendarEvent {
  id: string;
  officialId?: string;
  date: string; // YYYY-MM-DD
  title: string;
  fullTitle?: string;
  startHour: number; // e.g. 9.5 = 09:30
  endHour: number; // e.g. 10.5 = 10:30
  kind: string; // 'Org · Meeting' | 'Org · Appointment' | 'Personal · Private' | 'Org · Soft block' | 'Org · Travel' | 'Org · Hold'
  type: 'ORG' | 'PERSONAL';
  location?: string;
  roomId?: string;
  roomName?: string;
  description?: string;
  appointmentId?: string;
  referenceNo?: string;
  style?: string;
  meta?: {
    l1?: string;
    l2?: string;
    l3?: string;
  };
}

// --- Helper Functions ---
function padZero(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatHour(h: number): string {
  const hour = Math.floor(h);
  const min = Math.round((h - hour) * 60);
  return `${padZero(hour)}:${padZero(min)}`;
}

function parseHourStr(str: string): number {
  if (!str) return 9;
  const [h, m] = str.split(':').map(Number);
  return (h || 0) + (m || 0) / 60;
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = padZero(d.getMonth() + 1);
  const day = padZero(d.getDate());
  return `${y}-${m}-${day}`;
}

function parseDateKey(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];



// Fallback rooms if API offline
const FALLBACK_ROOMS: RoomOption[] = [
  { id: 'rm-1', name: 'Board Room', building: 'Main Secretariat', floor: '3', capacity: 20 },
  { id: 'rm-2', name: 'Conference Room 1', building: 'Admin Block', floor: '1', capacity: 12 },
  { id: 'rm-3', name: 'Conference Room 2', building: 'Admin Block', floor: '2', capacity: 10 },
  { id: 'rm-4', name: 'Executive Suite', building: 'Main Secretariat', floor: '4', capacity: 8 },
  { id: 'rm-5', name: 'Meeting Room A', building: 'Innovation Wing', floor: '1', capacity: 6 },
];

export const CalendarPage: FC = () => {
  const { user, token, hasRole } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Active Date (defaults to current real date)
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  // Real today key (YYYY-MM-DD)
  const todayKey = useMemo(() => formatDateKey(new Date()), []);

  // Real-time ticking clock for current time red indicator line
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Mini-calendar month anchor (defaults to current active month)
  const [miniCalMonth, setMiniCalMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Layer toggles
  const [showOrg, setShowOrg] = useState(true);
  const [showPersonal, setShowPersonal] = useState(true);

  // View state: Day | Week | Month | Agenda
  const [viewMode, setViewMode] = useState<'Day' | 'Week' | 'Month' | 'Agenda'>('Week');
  const [asPA, setAsPA] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  // Search filter for Agenda
  const [agendaSearch, setAgendaSearch] = useState('');

  // Selected official
  const [selectedOfficialId, setSelectedOfficialId] = useState<string>('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [rescheduleData, setRescheduleData] = useState<{
    appointmentId: string;
    subject?: string;
    primaryOfficialId?: string;
    defaultDate?: string;
    defaultStartTime?: string;
    defaultEndTime?: string;
    currentRoomId?: string | null;
  } | null>(null);

  // Local Events with LocalStorage persistence
  const STORAGE_KEY = 'oams_calendar_events_v5_clean';
  const [localEvents, setLocalEvents] = useState<InternalCalendarEvent[]>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('oams_calendar_events_v4_sep28');
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localEvents));
    } catch {
      // ignore
    }
  }, [localEvents]);

  // Keep miniCalMonth in sync when currentDate changes months
  useEffect(() => {
    if (
      miniCalMonth.getMonth() !== currentDate.getMonth() ||
      miniCalMonth.getFullYear() !== currentDate.getFullYear()
    ) {
      setMiniCalMonth(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
    }
  }, [currentDate]);

  // Create form state
  const [targetCalendar, setTargetCalendar] = useState<string>(CalendarType.ORG);
  const [createKind, setCreateKind] = useState<string>(EventKind.MEETING);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDateStr, setStartDateStr] = useState(() => formatDateKey(new Date()));
  const [startTimeStr, setStartTimeStr] = useState('10:00');
  const [endTimeStr, setEndTimeStr] = useState('11:00');
  const [roomId, setRoomId] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch officials list if backend available
  const { data: officials = [] } = useQuery<OfficialOption[]>({
    queryKey: ['calendar-officials'],
    queryFn: () =>
      api.get<OfficialOption[]>('/api/v1/officials', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    enabled: !!token,
  });

  const isSuperAdmin = hasRole(RoleCode.SUPER_ADMIN);
  const isOfficial = hasRole(RoleCode.OFFICIAL);
  const isPA = hasRole(RoleCode.PA) || hasRole(RoleCode.EA);

  // Resolved list of executive officials with designations
  const officialOptions = useMemo(() => {
    const list = officials && officials.length > 0 ? officials : INITIAL_OFFICIALS;
    return list.map((o: any) => ({
      id: o.id,
      name: o.userFullName || o.fullName,
      designation: o.designation || o.title || '',
      label: o.designation
        ? `${o.userFullName || o.fullName} (${o.designation})`
        : `${o.userFullName || o.fullName}`,
    }));
  }, [officials]);

  // Determine the logged-in user's own official ID if they are an official
  const userOfficialId = useMemo(() => {
    if (!user) return null;
    if (user.officialId) return user.officialId;
    const found = officialOptions.find((o) => {
      if (user.fullName) {
        const cleanUser = user.fullName.toLowerCase().replace(/^(mr\.|ms\.|dr\.|prof\.)\s*/, '').trim();
        const cleanName = o.name.toLowerCase().replace(/^(mr\.|ms\.|dr\.|prof\.)\s*/, '').trim();
        return cleanName.includes(cleanUser) || cleanUser.includes(cleanName);
      }
      return false;
    });
    return found ? found.id : null;
  }, [user, officialOptions]);

  // Strictly allowed official calendars based on authenticated user's role
  const allowedOfficialOptions = useMemo(() => {
    if (isSuperAdmin) {
      // Super Admin has executive oversight over all leadership desks
      return officialOptions;
    }
    if (isOfficial) {
      // An individual official can ONLY see their own calendar!
      const myOpt = officialOptions.filter((o) => o.id === userOfficialId);
      return myOpt.length > 0 ? myOpt : officialOptions.slice(0, 1);
    }
    if (isPA) {
      // Secretariat PA can only see officials assigned to their desk
      if (user?.assignedOfficialIds && user.assignedOfficialIds.length > 0) {
        const assigned = officialOptions.filter((o) => user.assignedOfficialIds.includes(o.id));
        if (assigned.length > 0) return assigned;
      }
      if (user?.officialId) {
        const assigned = officialOptions.filter((o) => o.id === user.officialId);
        if (assigned.length > 0) return assigned;
      }
      return officialOptions.slice(0, 1);
    }
    if (userOfficialId) {
      const myOpt = officialOptions.filter((o) => o.id === userOfficialId);
      return myOpt.length > 0 ? myOpt : officialOptions.slice(0, 1);
    }
    return officialOptions.slice(0, 1);
  }, [isSuperAdmin, isOfficial, isPA, officialOptions, userOfficialId, user]);

  // Effective official ID: strictly locked to allowed options
  const effectiveOfficialId = useMemo(() => {
    // 1. If official is logged in, ALWAYS force their own official ID!
    if (isOfficial && userOfficialId) {
      return userOfficialId;
    }
    // 2. If an allowed official is actively selected (e.g. Super Admin or PA with multiple assigned)
    if (selectedOfficialId && allowedOfficialOptions.some((o) => o.id === selectedOfficialId)) {
      return selectedOfficialId;
    }
    // 3. Fallback to user's assigned official ID
    if (userOfficialId && allowedOfficialOptions.some((o) => o.id === userOfficialId)) {
      return userOfficialId;
    }
    if (allowedOfficialOptions.length > 0) {
      return allowedOfficialOptions[0].id;
    }
    return 'off-4';
  }, [isOfficial, userOfficialId, selectedOfficialId, allowedOfficialOptions]);

  const currentOfficial = useMemo(() => {
    return allowedOfficialOptions.find((o) => o.id === effectiveOfficialId) || allowedOfficialOptions[0] || officialOptions[0];
  }, [allowedOfficialOptions, officialOptions, effectiveOfficialId]);

  // Fetch active rooms if backend available
  const { data: apiRooms = [] } = useQuery<RoomOption[]>({
    queryKey: ['available-rooms'],
    queryFn: () =>
      api.get<RoomOption[]>('/api/v1/rooms', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    enabled: !!token,
  });

  const rooms = apiRooms.length > 0 ? apiRooms : FALLBACK_ROOMS;

  // Compute full 7-day week range (Monday to Sunday) for Week view
  const { monday, sunday, weekDays } = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay(); // 0 is Sunday, 1 is Monday ...
    const diff = d.getDate() - (day === 0 ? 6 : day - 1); // Monday is start of week
    const mon = new Date(d.getFullYear(), d.getMonth(), diff);
    mon.setHours(0, 0, 0, 0);

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const nextDay = new Date(mon);
      nextDay.setDate(mon.getDate() + i);
      days.push(nextDay);
    }

    const sun = new Date(days[6]);
    sun.setHours(23, 59, 59, 999);

    return { monday: mon, sunday: sun, weekDays: days };
  }, [currentDate]);

  // Fetch API events if online
  const layerParams = useMemo(() => {
    const arr: string[] = [];
    if (showOrg) arr.push('ORG');
    if (showPersonal && !asPA) arr.push('PERSONAL');
    return arr.join(',');
  }, [showOrg, showPersonal, asPA]);

  const { data: apiEvents = [] } = useQuery<CalendarEventItem[]>({
    queryKey: [
      'calendar-events',
      effectiveOfficialId,
      monday.toISOString(),
      sunday.toISOString(),
      layerParams,
    ],
    queryFn: () =>
      api.get<CalendarEventItem[]>(
        `/api/v1/calendar-events?officialId=${effectiveOfficialId}&start=${monday.toISOString()}&end=${sunday.toISOString()}&layers=${layerParams}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      ),
    enabled: !!token && !!effectiveOfficialId,
  });

  // Fetch official's actual appointments
  const { data: apiAppointments = [] } = useQuery<any[]>({
    queryKey: ['calendar-appointments', effectiveOfficialId],
    queryFn: () =>
      api.get<any[]>(`/api/v1/appointments?officialId=${effectiveOfficialId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    enabled: !!token && !!effectiveOfficialId,
  });

  // Combine, deduplicate, and format events based on appointments and calendar blocks
  const combinedEvents = useMemo(() => {
    const map = new Map<string, InternalCalendarEvent>();
    const seenAptIds = new Set<string>();
    const seenRefNos = new Set<string>();
    const seenTimeSlots = new Set<string>();

    // 1. Process API Calendar Events first
    apiEvents.forEach((aeItem) => {
      const ae = aeItem as any;
      if (ae.officialId && ae.officialId !== effectiveOfficialId) return;
      if (!ae.startAt || !ae.endAt) return;

      const start = new Date(ae.startAt);
      const end = new Date(ae.endAt);
      const dateStr = formatDateKey(start);
      const startH = start.getHours() + start.getMinutes() / 60;
      const endH = end.getHours() + end.getMinutes() / 60;
      const titleStr = ae.title || ae.subject || '';
      const timeKey = `${dateStr}_${startH.toFixed(2)}_${titleStr.trim().toLowerCase()}`;

      if (ae.appointmentId && seenAptIds.has(ae.appointmentId)) return;
      if (ae.referenceNo && seenRefNos.has(ae.referenceNo)) return;
      if (seenTimeSlots.has(timeKey)) return;

      if (ae.appointmentId) seenAptIds.add(ae.appointmentId);
      if (ae.referenceNo) seenRefNos.add(ae.referenceNo);
      seenTimeSlots.add(timeKey);

      const kindStr = String(ae.kind || '');
      const isApt = !!ae.appointmentId || kindStr === 'APPOINTMENT';
      const kindLabel =
        ae.calendarType === 'PERSONAL'
          ? 'Personal · Private'
          : isApt
          ? 'Org · Appointment'
          : kindStr === 'HOLD'
          ? 'Org · Hold'
          : kindStr === 'TRAVEL'
          ? 'Org · Travel'
          : kindStr === 'SOFT_BLOCK' || kindStr.includes('Soft')
          ? 'Org · Soft block'
          : 'Org · ' + (ae.kind || 'Meeting');

      map.set(ae.id, {
        id: ae.id,
        officialId: ae.officialId || effectiveOfficialId,
        date: dateStr,
        title: titleStr || 'Scheduled Event',
        fullTitle: titleStr || 'Scheduled Event',
        startHour: startH,
        endHour: endH > startH ? endH : startH + 0.75,
        kind: kindLabel,
        type: ae.calendarType === 'PERSONAL' ? 'PERSONAL' : 'ORG',
        location: ae.roomName || ae.location || 'Assigned Location',
        roomName: ae.roomName || undefined,
        roomId: ae.roomId || undefined,
        description: ae.description || undefined,
        appointmentId: ae.appointmentId || undefined,
        referenceNo: ae.referenceNo || undefined,
        meta: ae.appointmentId || ae.referenceNo
          ? {
              l1: `${ae.referenceNo || ae.appointmentId} · ${ae.requesterName || 'Visitor'}`,
              l2: ae.roomName || ae.location || 'Assigned Room',
              l3: `Status: ${ae.status || 'Confirmed'}`,
            }
          : undefined,
      });
    });

    // 2. Process real appointments from /api/v1/appointments
    apiAppointments.forEach((apt) => {
      const aptOfficialId = apt.officialId || apt.official?.id;
      if (aptOfficialId && aptOfficialId !== effectiveOfficialId) return;

      // Deduplicate if already handled in apiEvents
      if (seenAptIds.has(apt.id)) return;
      if (apt.referenceNo && seenRefNos.has(apt.referenceNo)) return;

      const startIso = apt.startAt || apt.scheduledStartTime || (apt.preferredWindows?.[0]?.date && apt.preferredWindows?.[0]?.from ? `${apt.preferredWindows[0].date}T${apt.preferredWindows[0].from}:00.000Z` : null);
      const endIso = apt.endAt || apt.scheduledEndTime || (apt.preferredWindows?.[0]?.date && apt.preferredWindows?.[0]?.to ? `${apt.preferredWindows[0].date}T${apt.preferredWindows[0].to}:00.000Z` : null);

      if (!startIso) return;

      const start = new Date(startIso);
      const end = endIso ? new Date(endIso) : new Date(start.getTime() + (apt.durationMin || 30) * 60000);
      const dateStr = formatDateKey(start);
      const startH = start.getHours() + start.getMinutes() / 60;
      const endH = end.getHours() + end.getMinutes() / 60;
      const timeKey = `${dateStr}_${startH.toFixed(2)}_${(apt.subject || '').trim().toLowerCase()}`;

      if (seenTimeSlots.has(timeKey)) return;

      seenAptIds.add(apt.id);
      if (apt.referenceNo) seenRefNos.add(apt.referenceNo);
      seenTimeSlots.add(timeKey);

      const isHold = apt.status === 'UNDER_REVIEW' || apt.status === 'TENTATIVE';
      const kindLabel = isHold ? 'Org · Hold' : 'Org · Appointment';
      const roomName = apt.room?.name || apt.location || (apt.roomId ? `Room ${apt.roomId}` : 'Assigned Location');

      map.set(`apt-evt-${apt.id}`, {
        id: `apt-evt-${apt.id}`,
        officialId: aptOfficialId || effectiveOfficialId,
        date: dateStr,
        title: apt.subject || 'Official Appointment',
        fullTitle: apt.subject || 'Official Appointment',
        startHour: startH,
        endHour: endH > startH ? endH : startH + (apt.durationMin || 30) / 60,
        kind: kindLabel,
        type: 'ORG',
        location: roomName,
        roomName: apt.room?.name || undefined,
        roomId: apt.roomId || apt.room?.id || undefined,
        description: apt.description || apt.purpose || undefined,
        appointmentId: apt.id,
        referenceNo: apt.referenceNo,
        meta: {
          l1: `${apt.referenceNo || 'Appointment'} · ${apt.requesterName || apt.attendees?.[0]?.name || 'Citizen Requester'}`,
          l2: `${roomName} · ${apt.durationMin || 30}m`,
          l3: `Status: ${apt.status || 'Confirmed'}`,
        },
      });
    });

    // 3. Process local manually created events (filtered by officialId)
    localEvents.forEach((ev) => {
      if (ev.officialId && ev.officialId !== effectiveOfficialId) return;
      if (ev.appointmentId && seenAptIds.has(ev.appointmentId)) return;
      if (ev.referenceNo && seenRefNos.has(ev.referenceNo)) return;

      const timeKey = `${ev.date}_${ev.startHour.toFixed(2)}_${(ev.title || '').trim().toLowerCase()}`;
      if (seenTimeSlots.has(timeKey)) return;

      seenTimeSlots.add(timeKey);
      if (ev.appointmentId) seenAptIds.add(ev.appointmentId);
      if (ev.referenceNo) seenRefNos.add(ev.referenceNo);

      map.set(ev.id, ev);
    });

    return Array.from(map.values());
  }, [apiEvents, apiAppointments, localEvents, effectiveOfficialId]);

  // Apply layer & privacy filters
  const visibleEvents = useMemo(() => {
    return combinedEvents
      .filter((ev) => {
        if (ev.type === 'ORG' && !showOrg) return false;
        if (ev.type === 'PERSONAL' && (!showPersonal || asPA)) {
          // If asPA, we still show personal events but masked as "Busy"
          if (!asPA) return false;
        }
        return true;
      })
      .map((ev) => {
        if (ev.type === 'PERSONAL' && asPA) {
          return {
            ...ev,
            title: 'Busy',
            fullTitle: 'Personal details hidden',
            kind: 'Personal · details hidden',
            location: 'Private',
            meta: {
              l1: 'Personal time — details hidden',
              l2: 'Not bookable',
              l3: 'Masked for PA privacy',
            },
          };
        }
        return ev;
      });
  }, [combinedEvents, showOrg, showPersonal, asPA]);

  // Selected event
  const selectedEvent = useMemo(() => {
    const found = visibleEvents.find((e) => e.id === selectedEventId);
    if (found) return found;
    return visibleEvents[0] || null;
  }, [visibleEvents, selectedEventId]);

  // Styling helper for event cards/blocks
  const getEventStyle = (ev: InternalCalendarEvent, isSelected: boolean) => {
    if (ev.type === 'PERSONAL' && asPA) {
      return `bg-[#E4E6EA] text-[#3B4150] border border-[#A3A9B6] ${
        isSelected ? 'ring-2 ring-[#16181D]' : ''
      }`;
    }
    if (ev.type === 'PERSONAL') {
      return `bg-[#EDE8F9] text-[#4A2885] border border-[#C4B5FD] ${
        isSelected ? 'ring-2 ring-[#7A4FD0]' : 'hover:brightness-95'
      }`;
    }
    if (ev.kind.includes('Appointment')) {
      return `bg-[#2957D6] text-white shadow-xs ${
        isSelected ? 'ring-2 ring-[#16181D]' : 'hover:bg-[#1E4FC2]'
      }`;
    }
    if (ev.kind.includes('Hold')) {
      return `bg-hold-pattern text-[#7A4B04] ${
        isSelected ? 'ring-2 ring-[#B7791F]' : 'hover:brightness-95'
      }`;
    }
    if (ev.kind.includes('Soft block')) {
      return `bg-white text-[#1E4FC2] border-[1.5px] border-dashed border-[#2957D6] ${
        isSelected ? 'ring-2 ring-[#2957D6]' : 'hover:bg-blue-50/40'
      }`;
    }
    if (ev.kind.includes('Travel')) {
      return `bg-[#D8E2F9] text-[#173A99] border border-[#8FA8E8] ${
        isSelected ? 'ring-2 ring-[#2957D6]' : 'hover:brightness-95'
      }`;
    }
    // Default Org Meeting
    return `bg-[#D8E5FD] text-[#16181D] border border-[#B3CCF7] ${
      isSelected ? 'ring-2 ring-[#2957D6]' : 'hover:brightness-95'
    }`;
  };

  // Navigation handlers
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'Day') {
      d.setDate(d.getDate() - 1);
    } else if (viewMode === 'Week') {
      d.setDate(d.getDate() - 7);
    } else {
      // Month or Agenda
      d.setMonth(d.getMonth() - 1);
    }
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'Day') {
      d.setDate(d.getDate() + 1);
    } else if (viewMode === 'Week') {
      d.setDate(d.getDate() + 7);
    } else {
      // Month or Agenda
      d.setMonth(d.getMonth() + 1);
    }
    setCurrentDate(d);
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setMiniCalMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  // Open Create Modal
  const handleOpenCreate = (targetDate?: Date, startH?: number) => {
    const d = targetDate || currentDate;
    setStartDateStr(formatDateKey(d));
    if (startH !== undefined) {
      setStartTimeStr(formatHour(startH));
      setEndTimeStr(formatHour(Math.min(18, startH + 1)));
    } else {
      setStartTimeStr('10:00');
      setEndTimeStr('11:00');
    }
    setTitle('');
    setDescription('');
    setLocation('');
    setRoomId('');
    setFormError(null);
    setShowCreateModal(true);
  };

  // Submit Create Event
  const handleSubmitCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Please enter an event title');
      return;
    }

    const sHour = parseHourStr(startTimeStr);
    const eHour = parseHourStr(endTimeStr);
    if (eHour <= sHour) {
      setFormError('End time must be after start time');
      return;
    }

    const selectedRoom = rooms.find((r) => r.id === roomId);
    const newId = `evt_${Date.now()}`;
    const kindLabel =
      targetCalendar === CalendarType.PERSONAL
        ? 'Personal · Private'
        : createKind === EventKind.APPOINTMENT
        ? 'Org · Appointment'
        : createKind === EventKind.HOLD
        ? 'Org · Hold'
        : createKind === EventKind.TRAVEL
        ? 'Org · Travel'
        : 'Org · Meeting';

    const newEvent: InternalCalendarEvent = {
      id: newId,
      officialId: effectiveOfficialId,
      date: startDateStr,
      title: title.trim(),
      fullTitle: title.trim(),
      startHour: sHour,
      endHour: eHour,
      kind: kindLabel,
      type: targetCalendar === CalendarType.PERSONAL ? 'PERSONAL' : 'ORG',
      location: selectedRoom
        ? `${selectedRoom.name} (${selectedRoom.building}, Fl ${selectedRoom.floor})`
        : location.trim() || undefined,
      roomId: roomId || undefined,
      roomName: selectedRoom ? selectedRoom.name : undefined,
      description: description.trim() || undefined,
      meta: {
        l1: selectedRoom ? `${selectedRoom.name} · Cap: ${selectedRoom.capacity}` : 'Manual event',
        l2: `Scheduled for ${startDateStr}`,
        l3: 'Status: Confirmed',
      },
    };

    setLocalEvents((prev) => [newEvent, ...prev]);
    setSelectedEventId(newId);
    setShowCreateModal(false);

    // Optional API sync
    if (token && effectiveOfficialId) {
      const startAt = `${startDateStr}T${startTimeStr}:00.000Z`;
      const endAt = `${startDateStr}T${endTimeStr}:00.000Z`;
      api
        .post(
          '/api/v1/calendar-events',
          {
            officialId: effectiveOfficialId,
            calendarType: targetCalendar,
            kind: createKind,
            blockStrength: BlockStrength.HARD,
            title: title.trim(),
            description: description.trim() || null,
            location: location.trim() || null,
            startAt,
            endAt,
            visibility: Visibility.INTERNAL,
            roomId: roomId || null,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        )
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
          queryClient.invalidateQueries({ queryKey: ['calendar-appointments'] });
        })
        .catch(() => {});
    }
  };

  // Delete event
  const handleDeleteEvent = (id: string) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;
    setLocalEvents((prev) => prev.filter((e) => e.id !== id));
    if (selectedEventId === id) {
      const remaining = visibleEvents.filter((e) => e.id !== id);
      setSelectedEventId(remaining[0]?.id || '');
    }
  };

  // Handle successful reschedule
  const handleRescheduleSuccess = (updatedData: {
    appointmentId: string;
    newDate?: string;
    newStart?: string;
    newEnd?: string;
    roomId?: string;
  }) => {
    setLocalEvents((prev) =>
      prev.map((e) => {
        if (e.id === updatedData.appointmentId || e.appointmentId === updatedData.appointmentId) {
          const roomObj = rooms.find((r) => r.id === updatedData.roomId);
          return {
            ...e,
            date: updatedData.newDate || e.date,
            startHour: updatedData.newStart ? parseHourStr(updatedData.newStart) : e.startHour,
            endHour: updatedData.newEnd ? parseHourStr(updatedData.newEnd) : e.endHour,
            roomId: updatedData.roomId || e.roomId,
            roomName: roomObj ? roomObj.name : e.roomName,
            location: roomObj ? `${roomObj.name} (${roomObj.building})` : e.location,
          };
        }
        return e;
      }),
    );
    queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    queryClient.invalidateQueries({ queryKey: ['calendar-appointments'] });
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
    setRescheduleData(null);
  };

  // Dynamic Header Title
  const headerTitle = useMemo(() => {
    if (viewMode === 'Day') {
      const dow = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
      const month = MONTH_NAMES[currentDate.getMonth()];
      return `${dow}, ${currentDate.getDate()} ${month} ${currentDate.getFullYear()}`;
    }
    if (viewMode === 'Week') {
      const startM = MONTH_NAMES[monday.getMonth()];
      const endM = MONTH_NAMES[sunday.getMonth()];
      if (monday.getMonth() === sunday.getMonth()) {
        return `${monday.getDate()} – ${sunday.getDate()} ${endM} ${sunday.getFullYear()}`;
      }
      return `${monday.getDate()} ${startM.slice(0, 3)} – ${sunday.getDate()} ${endM.slice(0, 3)} ${sunday.getFullYear()}`;
    }
    if (viewMode === 'Month') {
      return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()} — Agenda`;
  }, [viewMode, currentDate, monday, sunday]);

  // Mini-calendar calculations
  const miniCalendarDays = useMemo(() => {
    const year = miniCalMonth.getFullYear();
    const month = miniCalMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Monday is index 0
    const startDayIdx = (firstDay.getDay() + 6) % 7;
    const totalDays = lastDay.getDate();

    const days: Array<{
      dayNum: number;
      isCurrentMonth: boolean;
      dateKey: string;
      hasEvents: boolean;
      isSelected: boolean;
      isInSelectedWeek: boolean;
      isToday: boolean;
    }> = [];

    // Leading empty/prev month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayIdx - 1; i >= 0; i--) {
      const dNum = prevMonthLastDay - i;
      const dObj = new Date(year, month - 1, dNum);
      const k = formatDateKey(dObj);
      days.push({
        dayNum: dNum,
        isCurrentMonth: false,
        dateKey: k,
        hasEvents: visibleEvents.some((e) => e.date === k),
        isSelected: formatDateKey(currentDate) === k,
        isInSelectedWeek: k >= formatDateKey(monday) && k <= formatDateKey(sunday),
        isToday: k === todayKey,
      });
    }

    // Days of current month
    for (let i = 1; i <= totalDays; i++) {
      const dObj = new Date(year, month, i);
      const k = formatDateKey(dObj);
      days.push({
        dayNum: i,
        isCurrentMonth: true,
        dateKey: k,
        hasEvents: visibleEvents.some((e) => e.date === k),
        isSelected: formatDateKey(currentDate) === k,
        isInSelectedWeek: k >= formatDateKey(monday) && k <= formatDateKey(sunday),
        isToday: k === todayKey,
      });
    }

    // Trailing days to fill 35 or 42 grid
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const dObj = new Date(year, month + 1, i);
      const k = formatDateKey(dObj);
      days.push({
        dayNum: i,
        isCurrentMonth: false,
        dateKey: k,
        hasEvents: visibleEvents.some((e) => e.date === k),
        isSelected: formatDateKey(currentDate) === k,
        isInSelectedWeek: k >= formatDateKey(monday) && k <= formatDateKey(sunday),
        isToday: k === todayKey,
      });
    }

    return days;
  }, [miniCalMonth, currentDate, visibleEvents, monday, sunday, todayKey]);

  // Real-time live current time positioning for Today indicator
  const currentHour = currentTime.getHours() + currentTime.getMinutes() / 60;
  const isWithinDayHours = currentHour >= START_HOUR && currentHour <= END_HOUR;
  const currentTimeTopPx = Math.max(0, Math.min(HOURS_COUNT * HOUR_HEIGHT, Math.floor((currentHour - START_HOUR) * HOUR_HEIGHT)));
  const formattedCurrentTime = currentTime.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const timeGridRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to 09:00 AM (or current time) on initial load
  useEffect(() => {
    if (timeGridRef.current && viewMode === 'Week') {
      const scrollHour = isWithinDayHours ? Math.max(START_HOUR, currentHour - 1) : 9;
      timeGridRef.current.scrollTop = Math.floor((scrollHour - START_HOUR) * HOUR_HEIGHT);
    }
  }, [viewMode]);

  return (
    <div className="flex flex-col gap-5 max-w-[1440px] mx-auto w-full pb-8">
      {/* Top Toolbar matching Spec */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        {/* Date Navigator & Heading */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous"
            className="w-10 h-10 border border-[#CBD5E1] rounded-lg bg-white text-[#334155] flex items-center justify-center hover:bg-[#F8FAFC] hover:border-[#94A3B8] transition cursor-pointer shadow-2xs active:scale-[0.98]"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleToday}
            className="h-10 px-3.5 sm:px-4 border border-[#CBD5E1] rounded-lg bg-white text-xs uppercase tracking-wider font-bold text-[#0F172A] hover:bg-[#F8FAFC] hover:border-[#94A3B8] transition cursor-pointer shadow-2xs active:scale-[0.98]"
          >
            Today
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next"
            className="w-10 h-10 border border-[#CBD5E1] rounded-lg bg-white text-[#334155] flex items-center justify-center hover:bg-[#F8FAFC] hover:border-[#94A3B8] transition cursor-pointer shadow-2xs active:scale-[0.98]"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A] ml-1 sm:ml-2 whitespace-nowrap">
            {headerTitle}
          </h1>
        </div>

        {/* Controls: Official, View Mode, Actions (Find Slot + New Event) */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-nowrap shrink-0 overflow-x-auto py-0.5">
          {allowedOfficialOptions.length > 1 ? (
            <select
              aria-label="Official"
              value={effectiveOfficialId}
              onChange={(e) => setSelectedOfficialId(e.target.value)}
              className="h-10 border border-[#CBD5E1] dark:border-[#2A2F3D] rounded-lg px-3 text-xs font-semibold bg-white dark:bg-[#1E222B] text-[#0F172A] dark:text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1A3170] shadow-2xs hover:border-[#1A3170] transition shrink-0 max-w-[210px] truncate"
            >
              {allowedOfficialOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="h-10 border border-[#CBD5E1] dark:border-[#2A2F3D] rounded-lg px-3.5 bg-white dark:bg-[#1E222B] text-xs font-semibold text-[#0F172A] dark:text-white shadow-2xs flex items-center gap-2 shrink-0">
              <span className="w-2 h-2 rounded-full bg-[#1A3170]" />
              <span className="font-bold">{currentOfficial?.name}</span>
              {currentOfficial?.designation && (
                <span className="text-[#64748B] dark:text-[#8E95A5]">({currentOfficial.designation})</span>
              )}
            </div>
          )}

          {/* Grouped View Switcher: Day, Week, Month, Agenda */}
          <div
            role="group"
            aria-label="Calendar view"
            className="flex border border-[#CBD5E1] rounded-lg p-0.5 bg-[#F1F5F9] shadow-2xs shrink-0"
          >
            {(['Day', 'Week', 'Month', 'Agenda'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                onClick={() => setViewMode(mode)}
                className={`h-8 px-2.5 sm:px-3.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  viewMode === mode
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Action buttons locked together side-by-side */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/app/find-slot')}
              className="h-10 px-3.5 border border-[#CBD5E1] rounded-lg bg-white text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC] hover:border-[#94A3B8] transition cursor-pointer shadow-2xs whitespace-nowrap"
            >
              Find a slot
            </button>

            <button
              type="button"
              onClick={() => handleOpenCreate()}
              className="h-10 px-3.5 sm:px-4 border-0 rounded-lg bg-[#1A3170] hover:bg-[#132554] text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-[0.98] whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>New event</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Layout: Active View + Right Aside */}
      <div className="flex flex-col xl:flex-row gap-4 flex-grow min-h-0 items-start">
        {/* VIEW AREA */}
        <section className="bg-white border border-[#E2E8F0] rounded-xl flex-grow flex flex-col overflow-hidden min-w-0 shadow-2xs w-full">
          {/* ===================== 1. WEEK VIEW ===================== */}
          {viewMode === 'Week' && (
            <div className="flex flex-col flex-grow min-w-[700px] w-full overflow-hidden">
              {/* Sticky Column Headers */}
              <div className="flex border-b border-[#E2E8F0] bg-white sticky top-0 z-20 shadow-2xs">
                {/* Time Gutter Header */}
                <div className="w-[64px] shrink-0 border-r border-[#E2E8F0] bg-[#FAFBFD] p-2 flex items-end justify-end">
                  <span className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase">Time</span>
                </div>

                {/* 7 Days Headers */}
                <div className="flex flex-1 divide-x divide-[#E2E8F0]">
                  {weekDays.map((d) => {
                    const dateKey = formatDateKey(d);
                    const dow = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
                    const dayNum = d.getDate();
                    const monthName = d.toLocaleDateString('en-US', { month: 'short' });
                    const isTodayCol = dateKey === todayKey;
                    const isSelectedDay = dateKey === formatDateKey(currentDate);

                    return (
                      <div
                        key={dateKey}
                        onClick={() => setCurrentDate(d)}
                        className={`flex-1 min-w-0 py-2.5 px-1.5 flex flex-col items-center justify-center cursor-pointer transition select-none ${
                          isTodayCol
                            ? 'bg-blue-50/70 border-b-2 border-b-[#1A3170]'
                            : isSelectedDay
                            ? 'bg-slate-100/80 font-semibold'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`text-[11px] tracking-wider uppercase font-bold ${
                            isTodayCol ? 'text-[#1A3170]' : 'text-[#64748B]'
                          }`}
                        >
                          {dow}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span
                            className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition ${
                              isTodayCol
                                ? 'bg-[#1A3170] text-white shadow-xs'
                                : isSelectedDay
                                ? 'bg-[#334155] text-white'
                                : 'text-[#1E293B]'
                            }`}
                          >
                            {dayNum}
                          </span>
                          <span className="text-[10px] text-[#94A3B8] font-medium hidden sm:inline">
                            {monthName}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Scrollable Time Grid */}
              <div
                ref={timeGridRef}
                className="flex flex-1 overflow-y-auto max-h-[580px] xl:max-h-[660px] relative scroll-smooth bg-white"
              >
                {/* Time Gutter */}
                <div className="w-[64px] shrink-0 border-r border-[#E2E8F0] bg-[#FAFBFD] select-none">
                  {TIME_SLOTS.map((t) => (
                    <div
                      key={t}
                      style={{ height: `${HOUR_HEIGHT}px` }}
                      className="text-[11px] text-[#64748B] text-right pr-2 pt-1 font-mono font-medium box-border"
                    >
                      {t}
                    </div>
                  ))}
                </div>

                {/* 7 Columns */}
                <div className="flex flex-1 divide-x divide-[#E2E8F0] relative">
                  {weekDays.map((d) => {
                    const dateKey = formatDateKey(d);
                    const isTodayCol = dateKey === todayKey;
                    const dayEvents = visibleEvents.filter((ev) => ev.date === dateKey);

                    return (
                      <div
                        key={dateKey}
                        className={`flex-1 min-w-0 relative ${
                          isTodayCol ? 'bg-blue-50/15' : 'bg-white'
                        }`}
                        style={{ height: `${HOURS_COUNT * HOUR_HEIGHT}px` }}
                        onDoubleClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const clickY = e.clientY - rect.top;
                          const clickedHour = START_HOUR + Math.floor(clickY / HOUR_HEIGHT);
                          handleOpenCreate(d, clickedHour);
                        }}
                        title="Double-click to schedule meeting"
                      >
                        {/* Hour guidelines */}
                        {Array.from({ length: HOURS_COUNT }).map((_, idx) => (
                          <div
                            key={idx}
                            className="absolute left-0 right-0 border-t border-[#F1F5F9] pointer-events-none"
                            style={{ top: `${idx * HOUR_HEIGHT}px` }}
                          >
                            <div
                              className="absolute left-0 right-0 border-t border-dashed border-[#F8FAFC]"
                              style={{ top: `${HOUR_HEIGHT / 2}px` }}
                            />
                          </div>
                        ))}

                        {/* Events */}
                        {dayEvents.map((ev) => {
                          const isSelected = selectedEventId === ev.id;
                          const topPx = Math.max(0, Math.floor((ev.startHour - START_HOUR) * HOUR_HEIGHT));
                          const duration = Math.max(0.4, ev.endHour - ev.startHour);
                          const heightPx = Math.max(26, Math.floor(duration * HOUR_HEIGHT - 2));

                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEventId(ev.id);
                              }}
                              className={`absolute left-1 right-1 rounded-md p-1.5 text-left text-xs transition-all cursor-pointer overflow-hidden z-10 shadow-2xs ${getEventStyle(
                                ev,
                                isSelected,
                              )}`}
                              style={{
                                top: `${topPx}px`,
                                height: `${heightPx}px`,
                              }}
                              title={`${ev.title} (${formatHour(ev.startHour)} – ${formatHour(ev.endHour)})`}
                            >
                              <span className="block font-semibold truncate leading-tight">
                                {ev.title}
                              </span>
                              <div className="flex items-center gap-1 text-[10px] opacity-85 mt-0.5 truncate font-mono">
                                <span>{formatHour(ev.startHour)} – {formatHour(ev.endHour)}</span>
                                {ev.location && <span className="opacity-70 truncate">• {ev.location}</span>}
                              </div>
                            </button>
                          );
                        })}

                        {/* Red Current Time Line Indicator on Today */}
                        {isTodayCol && isWithinDayHours && (
                          <div
                            className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                            style={{ top: `${currentTimeTopPx}px` }}
                          >
                            <div className="relative -left-1 flex items-center justify-center">
                              <span className="absolute w-3 h-3 rounded-full bg-red-500 animate-ping opacity-75" />
                              <span className="relative w-2.5 h-2.5 rounded-full bg-[#DC2626] ring-2 ring-white shadow-xs" />
                            </div>
                            <div className="flex-1 h-[2px] bg-[#DC2626] shadow-2xs" />
                            <span className="mr-1 px-1.5 py-0.5 rounded bg-[#DC2626] text-white text-[10px] font-mono font-bold shadow-xs">
                              {formattedCurrentTime}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ===================== 2. DAY VIEW ===================== */}
          {viewMode === 'Day' && (
            <div className="flex flex-col p-6 min-h-[600px]">
              {/* Day Header Banner */}
              <div className="flex items-center justify-between pb-4 border-b border-[#E4E2DC] mb-4">
                <div>
                  <h2 className="text-xl font-bold font-serif text-[#16181D]">
                    {currentDate.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </h2>
                  <p className="text-xs text-[#5B6070] mt-0.5">
                    {visibleEvents.filter((e) => e.date === formatDateKey(currentDate)).length}{' '}
                    events scheduled for this day
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenCreate(currentDate)}
                  className="px-3.5 py-2 rounded-lg bg-[#1A3170] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#132554] transition cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add event to this day</span>
                </button>
              </div>

              {/* Day Hourly Timeline (08:00 - 20:00) */}
              <div className="space-y-2">
                {TIME_SLOTS.map((slot, idx) => {
                  const hour = START_HOUR + idx;
                  const hourDateKey = formatDateKey(currentDate);
                  const matchingEvents = visibleEvents.filter(
                    (ev) =>
                      ev.date === hourDateKey &&
                      ev.startHour >= hour &&
                      ev.startHour < hour + 1,
                  );

                  return (
                    <div
                      key={slot}
                      className="flex items-start gap-4 p-2.5 rounded-xl hover:bg-gray-50/70 transition border border-transparent hover:border-[#EFEDE7] group"
                    >
                      <div className="w-16 shrink-0 text-sm font-mono font-medium text-[#5B6070] pt-1">
                        {slot}
                      </div>

                      <div className="flex-1 flex flex-col gap-2 min-h-[44px]">
                        {matchingEvents.length > 0 ? (
                          matchingEvents.map((ev) => {
                            const isSelected = selectedEventId === ev.id;
                            return (
                              <div
                                key={ev.id}
                                onClick={() => setSelectedEventId(ev.id)}
                                className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                                  isSelected
                                    ? 'border-[#1A3170] bg-blue-50/40 shadow-xs'
                                    : 'border-[#E4E2DC] bg-white hover:border-[#D5D2CA]'
                                }`}
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                        ev.type === 'PERSONAL'
                                          ? 'bg-purple-100 text-purple-800'
                                          : 'bg-blue-100 text-blue-800'
                                      }`}
                                    >
                                      {ev.kind}
                                    </span>
                                    <span className="text-xs text-[#5B6070] font-mono">
                                      {formatHour(ev.startHour)} – {formatHour(ev.endHour)}
                                    </span>
                                  </div>
                                  <h3 className="text-base font-semibold text-[#16181D]">
                                    {ev.fullTitle || ev.title}
                                  </h3>
                                  {ev.location && (
                                    <p className="text-xs text-[#5B6070] flex items-center gap-1.5">
                                      <MapPin className="w-3.5 h-3.5 text-[#5B6070]" />
                                      <span>{ev.location}</span>
                                    </p>
                                  )}
                                  {ev.description && (
                                    <p className="text-xs text-[#5B6070]">{ev.description}</p>
                                  )}
                                </div>

                                {/* Quick actions */}
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRescheduleData({
                                        appointmentId: ev.id,
                                        subject: ev.fullTitle || ev.title,
                                        defaultDate: ev.date,
                                        defaultStartTime: formatHour(ev.startHour),
                                        defaultEndTime: formatHour(ev.endHour),
                                        currentRoomId: ev.roomId || null,
                                      });
                                    }}
                                    className="px-2.5 py-1 text-xs border border-[#D5D2CA] rounded-lg hover:bg-gray-100 font-medium"
                                  >
                                    Reschedule
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteEvent(ev.id);
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                                    title="Delete event"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenCreate(currentDate, hour)}
                            className="h-9 border border-dashed border-[#D5D2CA] rounded-lg text-xs text-[#5B6070] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-blue-50/50 hover:border-[#1A3170] hover:text-[#1A3170] transition cursor-pointer"
                          >
                            + Click to schedule event at {slot}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===================== 3. MONTH VIEW ===================== */}
          {viewMode === 'Month' && (
            <div className="flex flex-col p-4">
              {/* Day Headers (Mon - Sun) */}
              <div className="grid grid-cols-7 border-b border-[#E4E2DC] pb-2 text-center text-xs font-semibold text-[#5B6070] uppercase tracking-wider">
                {WEEKDAY_NAMES_SHORT.map((dw) => (
                  <div key={dw}>{dw}</div>
                ))}
              </div>

              {/* Month Grid Cells */}
              <div className="grid grid-cols-7 border-l border-t border-[#E4E2DC]">
                {miniCalendarDays.map((cell, idx) => {
                  const cellEvents = visibleEvents.filter((e) => e.date === cell.dateKey);
                  const isCurrentDay = cell.dateKey === todayKey;

                  return (
                    <div
                      key={idx}
                      onClick={() => setCurrentDate(parseDateKey(cell.dateKey))}
                      onDoubleClick={() => handleOpenCreate(parseDateKey(cell.dateKey))}
                      className={`min-h-[110px] p-1.5 border-r border-b border-[#E4E2DC] flex flex-col transition cursor-pointer ${
                        !cell.isCurrentMonth
                          ? 'bg-gray-50/60 text-gray-400'
                          : cell.isSelected
                          ? 'bg-blue-50/30'
                          : 'bg-white hover:bg-gray-50/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-xs font-medium w-6 h-6 rounded-full flex items-center justify-center ${
                            isCurrentDay
                              ? 'bg-[#1E40AF] text-white font-bold ring-2 ring-[#93C5FD]'
                              : cell.isSelected
                              ? 'bg-[#334155] text-white'
                              : 'text-[#16181D]'
                          }`}
                        >
                          {cell.dayNum}
                        </span>
                        {cellEvents.length > 0 && (
                          <span className="text-[10px] text-[#5B6070] font-semibold">
                            {cellEvents.length}
                          </span>
                        )}
                      </div>

                      {/* Event Chips */}
                      <div className="flex flex-col gap-1 overflow-y-auto max-h-[78px]">
                        {cellEvents.slice(0, 3).map((ev) => (
                          <div
                            key={ev.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEventId(ev.id);
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] truncate font-medium border ${
                              ev.type === 'PERSONAL'
                                ? 'bg-purple-50 text-purple-800 border-purple-200'
                                : ev.kind.includes('Appointment')
                                ? 'bg-blue-600 text-white border-blue-700'
                                : ev.kind.includes('Hold')
                                ? 'bg-amber-100 text-amber-900 border-amber-300'
                                : 'bg-blue-50 text-blue-900 border-blue-200'
                            }`}
                            title={`${formatHour(ev.startHour)} ${ev.title}`}
                          >
                            <span className="font-mono opacity-85 mr-1">
                              {formatHour(ev.startHour)}
                            </span>
                            {ev.title}
                          </div>
                        ))}
                        {cellEvents.length > 3 && (
                          <span className="text-[10px] text-[#2957D6] font-semibold pl-1">
                            +{cellEvents.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===================== 4. AGENDA VIEW ===================== */}
          {viewMode === 'Agenda' && (
            <div className="flex flex-col p-6 min-h-[600px]">
              {/* Agenda Search & Filter Bar */}
              <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#E4E2DC] mb-5">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-[#5B6070]" />
                  <input
                    type="text"
                    value={agendaSearch}
                    onChange={(e) => setAgendaSearch(e.target.value)}
                    placeholder="Search events, keywords, or locations..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#D5D2CA] text-xs bg-white text-[#16181D] focus:outline-none focus:ring-1 focus:ring-[#2957D6]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenCreate(currentDate)}
                  className="px-3.5 py-2 rounded-lg bg-[#2957D6] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#1E4FC2] transition cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>New event</span>
                </button>
              </div>

              {/* Grouped Chronological List */}
              <div className="space-y-6">
                {(() => {
                  const filtered = visibleEvents.filter((ev) => {
                    if (!agendaSearch.trim()) return true;
                    const q = agendaSearch.toLowerCase();
                    return (
                      ev.title.toLowerCase().includes(q) ||
                      (ev.description && ev.description.toLowerCase().includes(q)) ||
                      (ev.location && ev.location.toLowerCase().includes(q))
                    );
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="py-16 text-center text-[#5B6070]">
                        <CalendarIcon className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                        <p className="text-sm font-medium">No events found matching your criteria.</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Try adjusting search terms or click "New event" to schedule one.
                        </p>
                      </div>
                    );
                  }

                  // Group by date
                  const groups: { [key: string]: InternalCalendarEvent[] } = {};
                  filtered.forEach((ev) => {
                    if (!groups[ev.date]) groups[ev.date] = [];
                    groups[ev.date].push(ev);
                  });

                  // Sort dates
                  const sortedDates = Object.keys(groups).sort();

                  return sortedDates.map((dateKey) => {
                    const dayEvents = groups[dateKey].sort(
                      (a, b) => a.startHour - b.startHour,
                    );
                    const dObj = parseDateKey(dateKey);
                    const isToday = dateKey === todayKey;

                    return (
                      <div key={dateKey} className="space-y-2.5">
                        <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-[#5B6070] border-b border-[#EFEDE7] pb-1.5">
                          <CalendarIcon className="w-3.5 h-3.5 text-[#1E40AF]" />
                          <span>
                            {dObj.toLocaleDateString('en-US', {
                              weekday: 'long',
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                          {isToday && (
                            <span className="px-2 py-0.5 rounded-full bg-[#1E40AF] text-white text-[10px] font-bold tracking-wider">
                              TODAY
                            </span>
                          )}
                        </div>

                        <div className="grid gap-2">
                          {dayEvents.map((ev) => {
                            const isSelected = selectedEventId === ev.id;
                            return (
                              <div
                                key={ev.id}
                                onClick={() => setSelectedEventId(ev.id)}
                                className={`p-4 rounded-xl border transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                  isSelected
                                    ? 'border-[#2957D6] bg-blue-50/40 shadow-xs ring-1 ring-[#2957D6]'
                                    : 'border-[#E4E2DC] bg-white hover:border-[#D5D2CA]'
                                }`}
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                        ev.type === 'PERSONAL'
                                          ? 'bg-purple-100 text-purple-800'
                                          : ev.kind.includes('Appointment')
                                          ? 'bg-blue-100 text-blue-800'
                                          : ev.kind.includes('Hold')
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-gray-100 text-gray-800'
                                      }`}
                                    >
                                      {ev.kind}
                                    </span>
                                    <span className="text-xs font-mono font-medium text-[#16181D]">
                                      {formatHour(ev.startHour)} – {formatHour(ev.endHour)}
                                    </span>
                                  </div>
                                  <div className="text-sm font-semibold text-[#16181D]">
                                    {ev.fullTitle || ev.title}
                                  </div>
                                  {ev.location && (
                                    <div className="text-xs text-[#5B6070] flex items-center gap-1.5">
                                      <MapPin className="w-3.5 h-3.5" />
                                      <span>{ev.location}</span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRescheduleData({
                                        appointmentId: ev.id,
                                        subject: ev.fullTitle || ev.title,
                                        defaultDate: ev.date,
                                        defaultStartTime: formatHour(ev.startHour),
                                        defaultEndTime: formatHour(ev.endHour),
                                        currentRoomId: ev.roomId || null,
                                      });
                                    }}
                                    className="px-2.5 py-1 text-xs border border-[#D5D2CA] rounded-lg hover:bg-gray-100 font-medium"
                                  >
                                    Reschedule
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteEvent(ev.id);
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                                    title="Delete event"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT ASIDE PANEL matching Spec & Prototype */}
        <aside className="w-full xl:w-[300px] shrink-0 flex flex-col gap-3.5">
          {/* Card 1: Interactive Mini-Calendar */}
          <section className="bg-white border border-[#E4E2DC] rounded-xl p-3.5 sm:p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-[#16181D]">
                {MONTH_NAMES[miniCalMonth.getMonth()]} {miniCalMonth.getFullYear()}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setMiniCalMonth(
                      new Date(miniCalMonth.getFullYear(), miniCalMonth.getMonth() - 1, 1),
                    )
                  }
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-[#5B6070] cursor-pointer"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMiniCalMonth(
                      new Date(miniCalMonth.getFullYear(), miniCalMonth.getMonth() + 1, 1),
                    )
                  }
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-[#5B6070] cursor-pointer"
                >
                  ›
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((dw, i) => (
                <div key={i} className="text-[11px] text-[#5B6070] py-1 font-medium">
                  {dw}
                </div>
              ))}

              {miniCalendarDays.map((c, i) => (
                <div
                  key={i}
                  onClick={() => setCurrentDate(parseDateKey(c.dateKey))}
                  className={`h-[30px] flex flex-col items-center justify-center text-xs rounded-full cursor-pointer transition relative select-none ${
                    c.isSelected
                      ? 'bg-[#1E40AF] text-white font-bold shadow-xs'
                      : c.isToday
                      ? 'ring-2 ring-[#1E40AF] text-[#1E40AF] font-bold bg-blue-50/70'
                      : c.isInSelectedWeek && viewMode === 'Week'
                      ? 'bg-[#E8EEFC] text-[#173A99] font-medium'
                      : c.isCurrentMonth
                      ? 'text-[#16181D] hover:bg-[#F7F6F2]'
                      : 'text-gray-300 hover:bg-[#F7F6F2]'
                  }`}
                >
                  <span>{c.dayNum}</span>
                  {c.hasEvents && !c.isSelected && (
                    <span
                      className={`w-1 h-1 rounded-full -mt-0.5 ${
                        c.isToday ? 'bg-[#1E40AF]' : 'bg-[#2957D6]'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Card 2: VIEWING AS Switcher & Layers */}
          <section className="bg-white border border-[#E2E8F0] dark:border-[#2A2F3D] dark:bg-[#1E222B] rounded-xl p-3.5 sm:p-4 flex flex-col gap-2.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#64748B] dark:text-[#8E95A5] uppercase tracking-wider">
                Viewing Calendar As
              </span>
              {currentOfficial?.designation && (
                <span className="text-[10px] font-bold text-[#1A3170] dark:text-blue-300 bg-[#1A3170]/10 dark:bg-[#1A3170]/30 border border-[#1A3170]/20 px-2 py-0.5 rounded-full">
                  {currentOfficial.designation}
                </span>
              )}
            </div>
            {isPA ? (
              <div
                role="group"
                aria-label="Viewing as"
                className="flex border border-[#CBD5E1] dark:border-[#2A2F3D] rounded-lg p-0.5 bg-[#F1F5F9] dark:bg-[#16181D]"
              >
                <button
                  type="button"
                  aria-pressed={!asPA}
                  onClick={() => setAsPA(false)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer truncate px-2 ${
                    !asPA
                      ? 'bg-white dark:bg-[#1E222B] text-[#0F172A] dark:text-white shadow-xs'
                      : 'text-[#64748B] dark:text-[#8E95A5] hover:text-[#0F172A]'
                  }`}
                  title={currentOfficial?.name || 'Official'}
                >
                  {currentOfficial?.name || 'Official View'}
                </button>
                <button
                  type="button"
                  aria-pressed={asPA}
                  onClick={() => setAsPA(true)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer truncate px-2 ${
                    asPA
                      ? 'bg-white dark:bg-[#1E222B] text-[#0F172A] dark:text-white shadow-xs'
                      : 'text-[#64748B] dark:text-[#8E95A5] hover:text-[#0F172A]'
                  }`}
                >
                  PA (Masked View)
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8FAFC] dark:bg-[#16181D] border border-[#E2E8F0] dark:border-[#2A2F3D]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#1A3170] text-white flex items-center justify-center text-xs font-bold">
                    {currentOfficial?.name ? currentOfficial.name.split(' ').map((n: string) => n[0]).join('') : 'OF'}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#16181D] dark:text-white">{currentOfficial?.name}</div>
                    <div className="text-[10px] text-[#64748B] dark:text-[#8E95A5]">{currentOfficial?.designation || 'Official Chamber'}</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-[#1A3170] bg-[#1A3170]/10 dark:text-blue-300 dark:bg-[#1A3170]/30 px-2 py-0.5 rounded-full">
                  Direct Chamber Access
                </span>
              </div>
            )}

            <label className="flex items-center gap-2.5 text-xs font-medium text-[#1E293B] cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={showOrg}
                onChange={(e) => setShowOrg(e.target.checked)}
                className="w-4 h-4 accent-[#1E40AF]"
              />
              <span className="w-3 h-3 rounded-[3px] bg-[#1E40AF]" />
              <span>Org calendar</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs font-medium text-[#1E293B] cursor-pointer">
              <input
                type="checkbox"
                checked={showPersonal && !asPA}
                disabled={asPA}
                onChange={(e) => setShowPersonal(e.target.checked)}
                className="w-4 h-4 accent-[#7E22CE] disabled:opacity-50"
              />
              <span className="w-3 h-3 rounded-[3px] bg-[#7E22CE]" />
              <span className={asPA ? 'line-through text-gray-400' : ''}>Personal calendar</span>
            </label>

            <div className="flex flex-wrap gap-2 text-[11px] text-[#475569] pt-2 border-t border-[#F1F5F9]">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-[3px] bg-[#EFF6FF] border border-[#BFDBFE]" />
                Meeting
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-[3px] bg-[#1E40AF]" />
                Appointment
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-[3px] bg-[#FFFBEB] border border-[#FDE68A]" />
                Hold
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-[3px] border-[1.5px] border-dashed border-[#60A5FA]" />
                Soft block
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-[3px] bg-[#F1F5F9] border border-[#CBD5E1]" />
                Busy (masked)
              </span>
            </div>
          </section>

          {/* Card 3: Selected Event Detail Panel */}
          {selectedEvent ? (
            <section className="bg-white border border-[#E4E2DC] rounded-xl p-4 flex flex-col gap-2.5 shadow-2xs">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    selectedEvent.type === 'PERSONAL'
                      ? 'bg-[#7A4FD0]'
                      : selectedEvent.kind.includes('Hold')
                      ? 'bg-[#B7791F]'
                      : 'bg-[#2957D6]'
                  }`}
                />
                <span className="text-xs text-[#5B6070] font-semibold">{selectedEvent.kind}</span>
              </div>

              <div className="text-[17px] font-semibold text-[#16181D] leading-tight">
                {selectedEvent.fullTitle || selectedEvent.title}
              </div>

              <div className="text-xs text-[#3B4150] font-mono">
                {parseDateKey(selectedEvent.date).toLocaleDateString('en-US', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}{' '}
                · {formatHour(selectedEvent.startHour)} – {formatHour(selectedEvent.endHour)}
              </div>

              {selectedEvent.location && (
                <div className="text-xs text-[#5B6070] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#5B6070]" />
                  <span>{selectedEvent.location}</span>
                </div>
              )}

              {selectedEvent.description && (
                <p className="text-xs text-[#5B6070] bg-gray-50 p-2 rounded-lg border border-[#EFEDE7]">
                  {selectedEvent.description}
                </p>
              )}

              {selectedEvent.meta && (
                <div className="flex flex-col gap-1.5 text-xs text-[#3B4150] pt-2 border-t border-[#EFEDE7]">
                  {selectedEvent.meta.l1 && <span>{selectedEvent.meta.l1}</span>}
                  {selectedEvent.meta.l2 && <span>{selectedEvent.meta.l2}</span>}
                  {selectedEvent.meta.l3 && <span>{selectedEvent.meta.l3}</span>}
                </div>
              )}

              <div className="flex gap-2 mt-2 pt-2 border-t border-[#EFEDE7]">
                <button
                  type="button"
                  onClick={() =>
                    setRescheduleData({
                      appointmentId: selectedEvent.id,
                      subject: selectedEvent.fullTitle || selectedEvent.title,
                      primaryOfficialId: effectiveOfficialId,
                      defaultDate: selectedEvent.date,
                      defaultStartTime: formatHour(selectedEvent.startHour),
                      defaultEndTime: formatHour(selectedEvent.endHour),
                      currentRoomId: selectedEvent.roomId || null,
                    })
                  }
                  className="flex-1 h-9 border border-[#D5D2CA] rounded-lg bg-white hover:bg-[#F7F6F2] text-xs text-[#16181D] transition cursor-pointer font-medium"
                >
                  Reschedule
                </button>

                {selectedEvent.appointmentId ? (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/app/appointments/${selectedEvent.appointmentId}`)
                    }
                    className="flex-1 h-9 border-0 rounded-lg bg-[#2957D6] hover:bg-[#1E4FC2] text-white text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                  >
                    <span>Open</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(selectedEvent.id)}
                    className="h-9 px-3 border border-red-200 rounded-lg bg-red-50 hover:bg-red-100 text-xs text-red-700 transition cursor-pointer font-medium"
                    title="Delete event"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </section>
          ) : (
            <section className="bg-white border border-[#E4E2DC] rounded-xl p-4 text-center text-xs text-[#5B6070]">
              Select an event to view full details
            </section>
          )}
        </aside>
      </div>

      {/* Reschedule Modal */}
      {rescheduleData && (
        <RescheduleModal
          appointmentId={rescheduleData.appointmentId}
          subject={rescheduleData.subject}
          primaryOfficialId={rescheduleData.primaryOfficialId}
          defaultDate={rescheduleData.defaultDate}
          defaultStartTime={rescheduleData.defaultStartTime}
          defaultEndTime={rescheduleData.defaultEndTime}
          currentRoomId={rescheduleData.currentRoomId}
          onClose={() => setRescheduleData(null)}
          onSuccess={() => {
            // Local state update in case backend API is offline
            handleRescheduleSuccess({
              appointmentId: rescheduleData.appointmentId,
              newDate: rescheduleData.defaultDate,
              newStart: rescheduleData.defaultStartTime,
              newEnd: rescheduleData.defaultEndTime,
              roomId: rescheduleData.currentRoomId || undefined,
            });
            queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
          }}
        />
      )}

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-[#E4E2DC] bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E4E2DC] pb-3">
              <h2 className="text-lg font-bold text-[#16181D] flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#2957D6]" /> Create Calendar Event
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-[#5B6070] hover:text-[#16181D] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitCreate} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTargetCalendar(CalendarType.ORG)}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                    targetCalendar === CalendarType.ORG
                      ? 'border-[#2957D6] bg-blue-50/50 font-bold text-[#16181D]'
                      : 'border-[#D5D2CA] text-[#5B6070]'
                  }`}
                >
                  <span className="block font-semibold">ORG Calendar</span>
                  <span className="text-[11px] opacity-80">
                    Work, meetings, appointments
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetCalendar(CalendarType.PERSONAL)}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                    targetCalendar === CalendarType.PERSONAL
                      ? 'border-[#7A4FD0] bg-purple-50/50 font-bold text-[#7A4FD0]'
                      : 'border-[#D5D2CA] text-[#5B6070]'
                  }`}
                >
                  <span className="block font-semibold">PERSONAL Calendar</span>
                  <span className="text-[11px] opacity-80">
                    Private blocks (masked to staff)
                  </span>
                </button>
              </div>

              <div>
                <label className="block font-semibold text-[#16181D] mb-1">
                  Event Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Budget Strategy Discussion"
                  className="w-full px-3 py-2 rounded-lg border border-[#D5D2CA] bg-white text-sm text-[#16181D] focus:outline-none focus:ring-1 focus:ring-[#2957D6]"
                />
              </div>

              {targetCalendar === CalendarType.ORG && (
                <div>
                  <label className="block font-semibold text-[#16181D] mb-1">
                    Event Type
                  </label>
                  <select
                    value={createKind}
                    onChange={(e) => setCreateKind(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[#D5D2CA] bg-white text-xs text-[#16181D]"
                  >
                    <option value={EventKind.MEETING}>Meeting</option>
                    <option value={EventKind.APPOINTMENT}>Appointment</option>
                    <option value={EventKind.HOLD}>Hold (Tentative)</option>
                    <option value={EventKind.TRAVEL}>Travel</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-[#16181D] mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={startDateStr}
                    onChange={(e) => setStartDateStr(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-[#D5D2CA] bg-white text-xs text-[#16181D]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#16181D] mb-1">Start *</label>
                  <input
                    type="time"
                    required
                    value={startTimeStr}
                    onChange={(e) => setStartTimeStr(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-[#D5D2CA] bg-white text-xs text-[#16181D]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#16181D] mb-1">End *</label>
                  <input
                    type="time"
                    required
                    value={endTimeStr}
                    onChange={(e) => setEndTimeStr(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-[#D5D2CA] bg-white text-xs text-[#16181D]"
                  />
                </div>
              </div>

              {targetCalendar === CalendarType.ORG && (
                <div>
                  <label className="block font-semibold text-[#16181D] mb-1">
                    Meeting Room
                  </label>
                  <select
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-[#D5D2CA] bg-white text-xs text-[#16181D]"
                  >
                    <option value="">No Room Assigned / Online</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.building}, Fl {r.floor} · Cap: {r.capacity})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-[#16181D] mb-1">
                  Location / Notes (Optional)
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Teams Link, Room notes..."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#D5D2CA] bg-white text-xs text-[#16181D]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#16181D] mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Agenda items or context..."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#D5D2CA] bg-white text-xs text-[#16181D]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E4E2DC]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border border-[#D5D2CA] hover:bg-[#F7F6F2] font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#2957D6] hover:bg-[#1E4FC2] text-white font-semibold shadow-xs"
                >
                  Save Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
