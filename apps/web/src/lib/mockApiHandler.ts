import {
  INITIAL_OFFICIALS,
  INITIAL_ROOMS,
  INITIAL_APPOINTMENTS,
  INITIAL_TASKS,
  INITIAL_VISITS,
  DEMO_PERSONAS,
  DEFAULT_REPORTS_OVERVIEW,
  INITIAL_USERS,
  INITIAL_DEPARTMENTS,
  INITIAL_HOLIDAYS,
  INITIAL_AUDIT_EVENTS,
  INITIAL_OPS_OVERVIEW,
  INITIAL_SUPPORT_STAFF,
  INITIAL_NOTIFICATIONS,
} from './mockData';
import { RoleCode, AppointmentStatus, Priority, TaskStatus, VisitStatus } from '@oams/shared';

const CURRENT_MOCK_VERSION = 'v34_comprehensive_audit_events_and_filters';
if (typeof window !== 'undefined') {
  try {
    if (localStorage.getItem('oams_mock_data_version') !== CURRENT_MOCK_VERSION) {
      localStorage.removeItem('oams_mock_officials');
      localStorage.removeItem('oams_mock_users');
      localStorage.removeItem('oams_mock_departments');
      localStorage.removeItem('oams_mock_appointments');
      localStorage.removeItem('oams_mock_tasks');
      localStorage.removeItem('oams_mock_visits');
      localStorage.removeItem('oams_mock_notifications');
      localStorage.removeItem('oams_mock_support_staff');
      localStorage.removeItem('oams_mock_audit_events');
      localStorage.removeItem('oams_mock_calendar_events');
      localStorage.removeItem('oams_mock_meeting_notes');
      localStorage.removeItem('oams_mock_meeting_action_items');
      localStorage.removeItem('oams_calendar_events_v4_sep28');
      localStorage.removeItem('oams_calendar_events_v5_clean');
      localStorage.setItem('oams_mock_data_version', CURRENT_MOCK_VERSION);
    }
  } catch {}
}

// Initialize mock store in localStorage with memory fallback
const mockMemoryStore: Record<string, string> = {};

function getStorage<T>(key: string, defaultValue: T): T {
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(`oams_mock_${key}`);
      if (val) return JSON.parse(val);
    }
  } catch {}
  if (mockMemoryStore[`oams_mock_${key}`]) {
    try {
      return JSON.parse(mockMemoryStore[`oams_mock_${key}`]);
    } catch {}
  }
  return defaultValue;
}

function setStorage<T>(key: string, value: T): void {
  const serialized = JSON.stringify(value);
  mockMemoryStore[`oams_mock_${key}`] = serialized;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`oams_mock_${key}`, serialized);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function handleMockRequest<T>(url: string, method: string = 'GET', body?: any): T | null {
  const cleanUrl = url.split('?')[0];

  // 1. Health check
  if (cleanUrl === '/health') {
    return {
      status: 'ok',
      uptimeSec: 3600,
      timestamp: new Date().toISOString(),
      services: {
        database: { status: 'ok', latencyMs: 2 },
        redis: { status: 'ok', latencyMs: 1 },
      },
    } as unknown as T;
  }

  // 1.1 Auth Current User (/auth/me)
  if (cleanUrl === '/api/v1/auth/me') {
    const tokenStr = typeof localStorage !== 'undefined' ? (localStorage.getItem('oams_token') || sessionStorage.getItem('oams_token') || '') : '';
    const personaId = tokenStr.replace('demo-token-', '');
    if (personaId) {
      // Look up persona first
      const persona = Object.values(DEMO_PERSONAS).find(p => p.id === personaId);
      if (persona) return persona as unknown as T;

      // Look up in users store
      const users: any[] = getStorage('users', INITIAL_USERS);
      const user = users.find((u: any) => u.id === personaId);
      if (user) {
        return {
          id: user.id,
          orgId: 'org-apex-main',
          email: user.email,
          fullName: user.fullName,
          designation: user.designation,
          departmentId: user.departmentId || null,
          authProvider: 'LOCAL',
          status: user.status || 'ACTIVE',
          timezone: 'Asia/Kolkata',
          theme: 'SYSTEM',
          roles: user.roles || ['EMPLOYEE'],
          officialId: user.officialId || null,
          assignedOfficialIds: user.assignedOfficialIds || [],
        } as unknown as T;
      }
    }
    // Fallback default persona is admin if requested
    return DEMO_PERSONAS.admin as unknown as T;
  }

  // 1.2 Auth Login
  if (cleanUrl === '/api/v1/auth/login') {
    const inputEmail = (body?.email || body?.username || '').trim().toLowerCase();

    // Check admin shortcuts
    if (
      inputEmail === 'admin' ||
      inputEmail === 'administrator' ||
      inputEmail === 'admin@stmarysgroup.com' ||
      inputEmail === 'admin@apex.gov.in'
    ) {
      return {
        accessToken: `demo-token-${DEMO_PERSONAS.admin.id}`,
        user: DEMO_PERSONAS.admin,
        expiresInSec: 86400,
      } as unknown as T;
    }

    const users: any[] = getStorage('users', INITIAL_USERS);
    let user = users.find((u: any) => u.email?.toLowerCase() === inputEmail);

    if (!user) {
      // Check DEMO_PERSONAS
      const persona = Object.values(DEMO_PERSONAS).find(p => p.email.toLowerCase() === inputEmail);
      if (persona) {
        return {
          accessToken: `demo-token-${persona.id}`,
          user: persona,
          expiresInSec: 86400,
        } as unknown as T;
      }
      throw new Error('Invalid email or password');
    }

    if (user.status === 'DISABLED') {
      throw new Error('Account deactivated. Please contact Administrator.');
    }

    return {
      accessToken: `demo-token-${user.id}`,
      user: {
        id: user.id,
        orgId: 'org-apex-main',
        email: user.email,
        fullName: user.fullName,
        designation: user.designation,
        departmentId: user.departmentId || null,
        authProvider: 'LOCAL',
        status: user.status || 'ACTIVE',
        timezone: 'Asia/Kolkata',
        theme: 'SYSTEM',
        roles: user.roles || ['EMPLOYEE'],
        officialId: null,
        assignedOfficialIds: [],
      },
      expiresInSec: 86400,
    } as unknown as T;
  }

  // 1.3 Forgot Password
  if (cleanUrl === '/api/v1/auth/forgot-password') {
    const inputEmail = (body?.email || '').trim().toLowerCase();
    const resetToken = `RST-${Math.floor(100000 + Math.random() * 900000)}`;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`oams_reset_${inputEmail}`, JSON.stringify({
          token: resetToken,
          expiresAt: Date.now() + 15 * 60 * 1000,
        }));
      }
    } catch {}
    return {
      success: true,
      message: 'Password reset instructions dispatched.',
      resetToken, // Provided for realistic demonstration/autofill
    } as unknown as T;
  }

  // 1.4 Reset Password
  if (cleanUrl === '/api/v1/auth/reset-password') {
    const newPassword = body?.newPassword;
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    return {
      success: true,
      message: 'Password has been successfully updated. You may now sign in.',
    } as unknown as T;
  }

  // 1.5 Change Password
  if (cleanUrl === '/api/v1/auth/change-password') {
    const newPassword = body?.newPassword;
    if (!newPassword || newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long');
    }
    return {
      success: true,
      message: 'Your password has been changed successfully.',
    } as unknown as T;
  }

  // 1.6 Logout
  if (cleanUrl === '/api/v1/auth/logout') {
    return { success: true } as unknown as T;
  }

  // 2. Officials
  if (cleanUrl === '/api/v1/officials' || cleanUrl === '/api/officials') {
    const officials = getStorage('officials', INITIAL_OFFICIALS);
    // Accommodate both array or { officials: [] } depending on endpoint spec
    const res: any = [...officials];
    res.officials = officials;
    return res as unknown as T;
  }

  // 3. Rooms
  if (cleanUrl.includes('/rooms')) {
    const rooms = getStorage('rooms', INITIAL_ROOMS);
    return rooms as unknown as T;
  }

  // 3.5 Scheduling & Slots Engine (§11)
  if (cleanUrl === '/api/v1/scheduling/slots' || cleanUrl === '/api/scheduling/slots') {
    const rooms: any[] = getStorage('rooms', INITIAL_ROOMS);
    const appointments: any[] = getStorage('appointments', INITIAL_APPOINTMENTS);

    const primaryOfficialId = body?.officialIds?.[0]?.id || 'off-1';
    const duration = body?.durationMin || 30;
    const windows = Array.isArray(body?.windows) && body.windows.length > 0 ? body.windows : null;

    // Determine target dates from windows or tomorrow
    const baseDate = windows?.[0]?.date
      ? new Date(windows[0].date)
      : new Date(Date.now() + 24 * 3600 * 1000);
    const dateStr = baseDate.toISOString().split('T')[0];

    // Find confirmed appointments for this official on this date
    const bookedTimes = appointments
      .filter((a: any) => {
        if (a.status !== 'CONFIRMED' && a.status !== 'IN_PROGRESS') return false;
        if (a.officialId !== primaryOfficialId && a.official?.id !== primaryOfficialId) return false;
        const aptDate = (a.scheduledStartTime || a.startAt || '').split('T')[0];
        return aptDate === dateStr;
      })
      .map((a: any) => {
        const s = new Date(a.scheduledStartTime || a.startAt);
        const e = new Date(a.scheduledEndTime || a.endAt || s.getTime() + 30 * 60000);
        return { start: s.getTime(), end: e.getTime() };
      });

    const candidateHours = [
      { startHour: 10, startMin: 0 },
      { startHour: 11, startMin: 30 },
      { startHour: 14, startMin: 0 },
      { startHour: 15, startMin: 30 },
      { startHour: 16, startMin: 45 },
    ];

    const availableRooms = rooms.filter((r: any) => r.isActive !== false);
    const defaultRoom = availableRooms[0] || { id: 'room-1', name: 'Chamber 101 (Executive Suite)', building: 'Main Secretariat', floor: '1st Floor' };

    const slots = [];
    for (let i = 0; i < candidateHours.length; i++) {
      const { startHour, startMin } = candidateHours[i];
      const slotStart = new Date(`${dateStr}T${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00.000Z`);
      const slotEnd = new Date(slotStart.getTime() + duration * 60000);

      const hasOverlap = bookedTimes.some((b: any) => slotStart.getTime() < b.end && slotEnd.getTime() > b.start);
      if (!hasOverlap) {
        const room = availableRooms[i % availableRooms.length] || defaultRoom;
        const score = 98 - i * 3;
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          roomId: room.id,
          roomName: room.name,
          score,
          reasons: [
            'Chamber dignitary buffer verified (no consecutive conflict)',
            `${room.name} verified available with AV & Protocol clearance`,
            'Aligned with requested preferred working window',
          ],
        });
      }
    }

    return (slots.length > 0 ? slots : [
      {
        start: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        end: new Date(Date.now() + 24 * 3600 * 1000 + duration * 60000).toISOString(),
        roomId: defaultRoom.id,
        roomName: defaultRoom.name,
        score: 95,
        reasons: ['Direct priority match for executive chamber calendar'],
      }
    ]) as unknown as T;
  }

  // 3.6 Day Slots Availability Engine (§4)
  if (cleanUrl === '/api/v1/scheduling/day-slots' || cleanUrl === '/api/scheduling/day-slots') {
    const appointments: any[] = getStorage('appointments', INITIAL_APPOINTMENTS);
    const searchParams = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
    const offId = searchParams.get('officialId') || body?.officialId || 'off-1';
    const dateStr = searchParams.get('date') || body?.date || new Date().toISOString().split('T')[0];

    const standardTimeRanges = [
      { from: '09:30', to: '10:00', label: '09:30 AM – 10:00 AM' },
      { from: '10:00', to: '10:30', label: '10:00 AM – 10:30 AM' },
      { from: '10:30', to: '11:00', label: '10:30 AM – 11:00 AM' },
      { from: '11:00', to: '11:30', label: '11:00 AM – 11:30 AM' },
      { from: '11:30', to: '12:00', label: '11:30 AM – 12:00 PM' },
      { from: '14:00', to: '14:30', label: '02:00 PM – 02:30 PM' },
      { from: '14:30', to: '15:00', label: '02:30 PM – 03:00 PM' },
      { from: '15:00', to: '15:30', label: '03:00 PM – 03:30 PM' },
      { from: '15:30', to: '16:00', label: '03:30 PM – 04:00 PM' },
      { from: '16:00', to: '16:30', label: '04:00 PM – 04:30 PM' },
      { from: '16:30', to: '17:00', label: '04:30 PM – 05:00 PM' },
    ];

    // Find active appointments for this official on this date
    const dayAppointments = appointments.filter((a: any) => {
      if (
        a.status === 'CANCELLED' ||
        a.status === 'REJECTED' ||
        a.status === 'NO_SHOW' ||
        a.status === 'EXPIRED'
      ) {
        return false;
      }
      if (offId && a.officialId !== offId && a.official?.id !== offId) return false;

      const aptDate = (
        a.scheduledStartTime ||
        a.startAt ||
        a.preferredWindows?.[0]?.date ||
        ''
      ).split('T')[0];
      return aptDate === dateStr;
    });

    const evaluatedSlots = standardTimeRanges.map((slot) => {
      const slotStart = new Date(`${dateStr}T${slot.from}:00`).getTime();
      const slotEnd = new Date(`${dateStr}T${slot.to}:00`).getTime();

      const conflictingApt = dayAppointments.find((a: any) => {
        let aptStartMs = 0;
        let aptEndMs = 0;

        if (a.scheduledStartTime || a.startAt) {
          const s = a.scheduledStartTime || a.startAt;
          const e = a.scheduledEndTime || a.endAt;
          aptStartMs = new Date(s).getTime();
          aptEndMs = e ? new Date(e).getTime() : aptStartMs + 30 * 60000;
        } else if (a.preferredWindows?.[0]) {
          const pw = a.preferredWindows[0];
          aptStartMs = new Date(`${pw.date}T${pw.from || '10:00'}:00`).getTime();
          aptEndMs = new Date(`${pw.date}T${pw.to || '10:30'}:00`).getTime();
        }

        return slotStart < aptEndMs && slotEnd > aptStartMs;
      });

      const isBooked = Boolean(conflictingApt);
      return {
        ...slot,
        date: dateStr,
        status: isBooked ? 'BOOKED' : 'AVAILABLE',
        isBooked,
        bookedReferenceNo: conflictingApt?.referenceNo || null,
        bookedSubject: conflictingApt?.subject || null,
      };
    });

    return evaluatedSlots as unknown as T;
  }

  // 3.7 Scheduling Conflict Check
  if (cleanUrl === '/api/v1/scheduling/check' || cleanUrl === '/api/scheduling/check') {
    const appointments: any[] = getStorage('appointments', INITIAL_APPOINTMENTS);
    const start = body?.startAt ? new Date(body.startAt).getTime() : 0;
    const end = body?.endAt ? new Date(body.endAt).getTime() : 0;
    const offId = body?.officialId;

    const conflict = appointments.find((a: any) => {
      if (
        a.status === 'CANCELLED' ||
        a.status === 'REJECTED' ||
        a.status === 'NO_SHOW' ||
        a.status === 'EXPIRED'
      ) {
        return false;
      }
      if (offId && a.officialId !== offId && a.official?.id !== offId) return false;

      let aStart = 0;
      let aEnd = 0;
      if (a.scheduledStartTime || a.startAt) {
        aStart = new Date(a.scheduledStartTime || a.startAt).getTime();
        aEnd = new Date(a.scheduledEndTime || a.endAt || aStart + 30 * 60000).getTime();
      } else if (a.preferredWindows?.[0]) {
        const pw = a.preferredWindows[0];
        aStart = new Date(`${pw.date}T${pw.from || '10:00'}:00`).getTime();
        aEnd = new Date(`${pw.date}T${pw.to || '10:30'}:00`).getTime();
      }

      return start < aEnd && end > aStart;
    });

    if (conflict) {
      return {
        hasConflict: true,
        conflicts: [
          {
            id: conflict.id,
            referenceNo: conflict.referenceNo,
            subject: conflict.subject,
            reason: `Chamber time slot already allocated to ${conflict.referenceNo}`,
          },
        ],
      } as unknown as T;
    }

    return {
      hasConflict: false,
      conflicts: [],
    } as unknown as T;
  }

  // 4. Appointments Inbox, Submissions & Tracking Detail
  if (cleanUrl.includes('/api/v1/appointments') || cleanUrl.includes('/api/appointments')) {
    const appointments: any[] = getStorage('appointments', INITIAL_APPOINTMENTS);
    const officials: any[] = getStorage('officials', INITIAL_OFFICIALS);

    // Extract current user from token to filter appointments
    const tokenStr = typeof localStorage !== 'undefined' ? (localStorage.getItem('oams_token') || '') : '';
    const personaId = tokenStr.replace('demo-token-', '');
    let allowedOfficialIds: string[] | null = null;
    let isGlobalRole = false;
    if (personaId) {
      const persona = Object.values(DEMO_PERSONAS).find(p => p.id === personaId);
      if (persona) {
        if (
          persona.roles.includes('SUPER_ADMIN') ||
          persona.roles.includes('ADMIN') ||
          persona.roles.includes('APPOINTMENT_ADMIN') ||
          persona.roles.includes('RECEPTION') ||
          persona.roles.includes('SECURITY')
        ) {
          isGlobalRole = true;
        } else if (persona.assignedOfficialIds && persona.assignedOfficialIds.length > 0) {
          allowedOfficialIds = persona.assignedOfficialIds;
        } else if (persona.officialId) {
          allowedOfficialIds = [persona.officialId];
        }
      }
    }

    if (!isGlobalRole && (!allowedOfficialIds || allowedOfficialIds.length === 0) && typeof localStorage !== 'undefined') {
      try {
        const uStr = localStorage.getItem('oams_user') || sessionStorage.getItem('oams_user');
        if (uStr) {
          const authU = JSON.parse(uStr);
          if (
            authU.roles?.includes('SUPER_ADMIN') ||
            authU.roles?.includes('ADMIN') ||
            authU.roles?.includes('APPOINTMENT_ADMIN') ||
            authU.roles?.includes('RECEPTION') ||
            authU.roles?.includes('SECURITY')
          ) {
            isGlobalRole = true;
          } else if (authU.officialId) {
            allowedOfficialIds = [authU.officialId];
          } else if (authU.assignedOfficialIds && authU.assignedOfficialIds.length > 0) {
            allowedOfficialIds = authU.assignedOfficialIds;
          }
        }
      } catch {}
    }

    const formatDetail = (apt: any) => {
      const offId = apt.officialId || apt.official?.id || 'off-1';
      const off =
        officials.find((o: any) => o.id === offId) ||
        officials[0] ||
        INITIAL_OFFICIALS[0];

      return {
        ...apt,
        id: apt.id,
        referenceNo:
          apt.referenceNo ||
          `OAMS-2026-${Math.floor(10000 + Math.random() * 90000)}`,
        subject: apt.subject || 'Official Consultation Request',
        purpose: apt.purpose || 'Business Discussion',
        description:
          apt.description ||
          'Discussion and strategic review of project milestones, operational rollout status, and administrative clearances.',
        priority: apt.priority || Priority.MEDIUM,
        priorityReason: apt.priorityReason || null,
        meetingMode: apt.meetingMode || 'IN_PERSON',
        durationMin: apt.durationMin || 30,
        status: apt.status || AppointmentStatus.UNDER_REVIEW,
        statusChangedAt:
          apt.statusChangedAt || apt.createdAt || new Date().toISOString(),
        submittedAt:
          apt.submittedAt || apt.createdAt || new Date().toISOString(),
        confirmedAt:
          apt.status === AppointmentStatus.CONFIRMED
            ? apt.confirmedAt || new Date().toISOString()
            : null,
        slaDueAt:
          apt.slaDueAt ||
          new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        official: {
          id: off.id,
          title: off.title || 'Mr.',
          fullName: off.fullName || off.full_name || 'Mr. KVK',
          departmentName:
            off.departmentName ||
            off.department_name ||
            'Office of the Chairman',
        },
        additionalOfficials: Array.isArray(apt.additionalOfficials)
          ? apt.additionalOfficials
          : [],
        preferredWindows:
          Array.isArray(apt.preferredWindows) && apt.preferredWindows.length > 0
            ? apt.preferredWindows
            : [
                {
                  date: new Date(Date.now() + 24 * 3600 * 1000)
                    .toISOString()
                    .split('T')[0],
                  from: '10:30',
                  to: '11:00',
                },
              ],
        startAt: apt.startAt || apt.scheduledStartTime || null,
        endAt: apt.endAt || apt.scheduledEndTime || null,
        timezone: 'Asia/Kolkata',
        onlineLink:
          apt.onlineLink ||
          (apt.meetingMode === 'ONLINE'
            ? 'https://teams.microsoft.com/meet/oams-sample-session'
            : null),
        room:
          apt.room ||
          (apt.roomId
            ? {
                id: apt.roomId,
                name: apt.location || 'Chamber 101 (Executive Suite)',
                building: 'Main Secretariat',
                floor: '1st Floor',
              }
            : null),
        attendees: Array.isArray(apt.attendees) ? apt.attendees : [],
        attachments: Array.isArray(apt.attachments) ? apt.attachments : [],
        cancelReason: apt.cancelReason || null,
        cancelNote: apt.cancelNote || null,
        canCancel:
          apt.status !== 'CANCELLED' &&
          apt.status !== 'COMPLETED' &&
          apt.status !== 'REJECTED',
      };
    };

    // Duplicate check (§9.1)
    if (cleanUrl.endsWith('/check-duplicate') && method === 'POST') {
      const offId = body?.officialId;
      const prefDate = body?.preferredDate;
      const subj = (body?.subject || '').trim().toLowerCase();

      // Check for active existing appointments for this official on the same date or similar subject
      const match = appointments.find((a: any) => {
        if (a.status === 'CANCELLED' || a.status === 'REJECTED') return false;
        const sameOfficial = a.officialId === offId || a.official?.id === offId;
        const aptDate = (a.scheduledStartTime || a.startAt || a.preferredWindows?.[0]?.date || '').split('T')[0];
        const sameDate = prefDate && aptDate === prefDate;
        const sameSubject = subj && subj.length > 4 && (a.subject || '').toLowerCase().includes(subj);
        return sameOfficial && (sameDate || sameSubject);
      });

      if (match) {
        return {
          isDuplicate: true,
          isBlocked: false,
          isWarning: true,
          message: `Notice: An active appointment (${match.referenceNo}: "${match.subject}") is already registered for ${match.officialName || 'the official'}. You may still submit if this is an additional session.`,
          existingAppointmentId: match.id,
          existingReferenceNo: match.referenceNo,
        } as unknown as T;
      }

      return {
        isDuplicate: false,
        isBlocked: false,
        isWarning: false,
        message: null,
      } as unknown as T;
    }

    // Submissions & Quick Test Creation
    if (
      (cleanUrl.endsWith('/submit') ||
        cleanUrl.endsWith('/appointments') ||
        cleanUrl === '/api/v1/appointments' ||
        cleanUrl === '/api/appointments') &&
      method === 'POST'
    ) {
      const newRef = `OAMS-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
      const off =
        officials.find((o: any) => o.id === body?.officialId) || officials[0];
      const prefWin = body?.preferredWindows?.[0] || {
        date: new Date().toLocaleDateString('en-CA'),
        from: '10:00',
        to: '10:30',
      };
      const scheduledStart = body?.scheduledStartTime || `${prefWin.date}T${prefWin.from}:00.000Z`;
      const scheduledEnd = body?.scheduledEndTime || `${prefWin.date}T${prefWin.to}:00.000Z`;

      const primaryAttendee = body?.attendees?.[0] || {};
      const reqName = primaryAttendee.name || body?.requesterName || 'Requester';
      const reqEmail = primaryAttendee.email || body?.requesterEmail || 'requester@example.com';
      const reqPhone = primaryAttendee.phone || body?.requesterPhone || body?.phone || '+91 98450 00000';
      const reqOrg = primaryAttendee.organization || body?.requesterOrg || body?.organization || 'Individual Requester';
      const partySize = Array.isArray(body?.attendees) && body.attendees.length > 0 ? body.attendees.length : (body?.partySize || 1);

      const newApt = {
        id: `apt-${Date.now()}`,
        referenceNo: newRef,
        subject: body?.subject || 'Meeting Request',
        purpose: body?.purpose || 'Business Discussion',
        description: body?.description || '',
        priority: body?.priority || Priority.MEDIUM,
        priorityReason: body?.priorityReason || null,
        status: AppointmentStatus.UNDER_REVIEW,
        meetingMode: body?.meetingMode || 'IN_PERSON',
        officialId: body?.officialId || off.id,
        officialName: off.fullName || off.full_name || 'Mr. KVK',
        officialTitle: off.title || 'Chairman',
        departmentName: off.departmentName || 'Office of the Chairman',
        requesterName: reqName,
        requesterEmail: reqEmail,
        requesterPhone: reqPhone,
        requesterOrganization: reqOrg,
        preferredWindows: body?.preferredWindows || [prefWin],
        scheduledStartTime: scheduledStart,
        scheduledEndTime: scheduledEnd,
        durationMin: body?.durationMin || 30,
        slaDueAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        location: body?.location || `${off.fullName || 'Official'}'s Chamber`,
        attendees: body?.attendees || [primaryAttendee],
        partySize: partySize,
        createdAt: new Date().toISOString(),
      };
      appointments.unshift(newApt);
      setStorage('appointments', appointments);

      // Dynamically add Visit entry in visits store so Reception Desk updates instantly
      try {
        const visits: any[] = getStorage('visits', INITIAL_VISITS);
        const qrTokenNum = newRef.split('-').pop() || String(Math.floor(10000 + Math.random() * 90000));
        const newVisit = {
          id: `vis-${newApt.id}`,
          orgId: 'org-apex-main',
          appointmentId: newApt.id,
          referenceNo: newRef,
          qrToken: qrTokenNum,
          visitorName: reqName,
          phone: reqPhone,
          email: reqEmail,
          organization: reqOrg,
          idType: 'AADHAAR',
          idLast4: 'XXXX',
          vehicleNo: body?.vehicleNo || null,
          partySize: partySize,
          status: VisitStatus.EXPECTED,
          appointmentStatus: newApt.status,
          badgeNo: null,
          badgeNumber: null,
          hostOfficialId: newApt.officialId,
          hostOfficialName: newApt.officialName,
          officialName: newApt.officialName,
          hostOfficialTitle: newApt.officialTitle,
          scheduledStartTime: scheduledStart,
          scheduledEndTime: scheduledEnd,
          scheduledAt: scheduledStart,
          roomName: newApt.location,
          building: 'Main Secretariat',
          floor: '1st Floor',
          subject: newApt.subject,
          purpose: newApt.purpose,
          createdAt: newApt.createdAt,
          updatedAt: newApt.createdAt,
        };
        visits.unshift(newVisit);
        setStorage('visits', visits);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('oams-visit-created', { detail: newVisit }));
          window.dispatchEvent(new CustomEvent('oams-visits-updated'));
          window.dispatchEvent(new CustomEvent('oams-appointments-updated'));
        }
      } catch {}

      // Dynamically add in-app notification
      try {
        const notifs: any[] = getStorage('notifications', INITIAL_NOTIFICATIONS);
        const submitNotif = {
          id: `notif-${Date.now()}`,
          userId: newApt.officialId || 'usr-admin-1',
          officialId: newApt.officialId || null,
          targetRoles: [RoleCode.FACULTY, RoleCode.STAFF, RoleCode.ADMIN, 'OFFICIAL', 'EA_PA', 'SUPER_ADMIN'],
          type: 'appointment_booked',
          eventType: 'APPOINTMENT_REQUESTED',
          title: `Appointment Request Submitted (#${newRef})`,
          message: `Request for "${newApt.subject}" with ${newApt.officialName} has been submitted and is currently under review.`,
          body: `Request for "${newApt.subject}" with ${newApt.officialName} has been submitted and is currently under review.`,
          appointmentId: newApt.id,
          link: `/app/appointments/${newApt.id}`,
          priority: newApt.priority || Priority.HIGH,
          entityType: 'APPOINTMENT',
          entityId: newApt.id,
          isRead: false,
          readAt: null,
          createdAt: new Date().toISOString(),
        };
        notifs.unshift(submitNotif);
        setStorage('notifications', notifs);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('oams-notification-created', { detail: submitNotif }));
          window.dispatchEvent(new CustomEvent('oams-notifications-updated'));
        }
      } catch {
        // ignore storage error
      }

      return {
        id: newApt.id,
        referenceNo: newApt.referenceNo,
        slaDueAt: newApt.slaDueAt,
        status: newApt.status,
      } as unknown as T;
    }

    // Status History
    if (cleanUrl.endsWith('/history')) {
      const pathParts = cleanUrl.split('/');
      const aptId = pathParts[pathParts.length - 2];
      const targetApt = appointments.find(
        (a) => a.id === aptId || a.referenceNo === aptId,
      );

      const historyEvents = [
        {
          id: `hist-${aptId}-1`,
          appointmentId: aptId,
          action: 'SUBMITTED',
          fromStatus: null,
          toStatus: 'SUBMITTED',
          actorUserId: 'usr-cit-1',
          actorName: targetApt?.requesterName || 'Citizen Requester',
          actorRole: 'CITIZEN',
          note: 'Appointment request submitted with preferred windows',
          at:
            targetApt?.createdAt ||
            new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
        },
        {
          id: `hist-${aptId}-2`,
          appointmentId: aptId,
          action: 'UNDER_REVIEW',
          fromStatus: 'SUBMITTED',
          toStatus: 'UNDER_REVIEW',
          actorUserId: 'usr-indhu-1',
          actorName: 'Ms. Indhu (Joint Secretary)',
          actorRole: 'PA',
          note: 'Assigned to Secretariat scheduling queue (§9.2)',
          at: new Date(Date.now() - 3600 * 1000).toISOString(),
        },
      ];

      if (targetApt?.status === AppointmentStatus.CONFIRMED) {
        historyEvents.push({
          id: `hist-${aptId}-3`,
          appointmentId: aptId,
          action: 'CONFIRMED',
          fromStatus: 'UNDER_REVIEW',
          toStatus: 'CONFIRMED',
          actorUserId: targetApt.officialId || 'usr-official-1',
          actorName: targetApt.officialName || 'Official',
          actorRole: 'OFFICIAL',
          note: 'Appointment slot approved and room allocated',
          at: new Date(Date.now() - 1800 * 1000).toISOString(),
        });
      }

      return historyEvents as unknown as T;
    }

    // Change requests
    if (cleanUrl.endsWith('/change-requests')) {
      const pathParts = cleanUrl.split('/');
      const aptId = pathParts[pathParts.length - 2];
      const changeRequests: any[] = getStorage('change_requests', []);
      if (method === 'POST') {
        const newCr = {
          id: `cr-${Date.now()}`,
          appointmentId: aptId,
          status: 'PENDING',
          reason: body?.reason || 'Schedule adjustment requested',
          preferredWindows: body?.preferredWindows || [],
          newDurationMin: body?.newDurationMin,
          proposals: [],
          createdAt: new Date().toISOString(),
        };
        changeRequests.unshift(newCr);
        setStorage('change_requests', changeRequests);
        return newCr as unknown as T;
      }
      const matched = changeRequests.filter((cr) => cr.appointmentId === aptId);
      return matched as unknown as T;
    }

    // Change requests withdraw / accept / propose
    if (cleanUrl.includes('/change-requests/')) {
      const pathParts = cleanUrl.split('/');
      const changeRequests: any[] = getStorage('change_requests', []);
      if (cleanUrl.endsWith('/withdraw') && method === 'POST') {
        const crId = pathParts[pathParts.length - 2];
        const idx = changeRequests.findIndex((c) => c.id === crId);
        if (idx >= 0) {
          changeRequests[idx].status = 'WITHDRAWN';
          setStorage('change_requests', changeRequests);
        }
        return { success: true } as unknown as T;
      }
      if (cleanUrl.endsWith('/accept') && method === 'POST') {
        const crId = pathParts[pathParts.length - 2];
        const idx = changeRequests.findIndex((c) => c.id === crId);
        if (idx >= 0) {
          changeRequests[idx].status = 'ACCEPTED';
          setStorage('change_requests', changeRequests);
          const aptId = changeRequests[idx].appointmentId;
          const aptIdx = appointments.findIndex((a) => a.id === aptId || a.referenceNo === aptId);
          if (aptIdx >= 0) {
            appointments[aptIdx].status = AppointmentStatus.CONFIRMED;
            appointments[aptIdx].confirmedAt = new Date().toISOString();
            setStorage('appointments', appointments);
          }
        }
        return { success: true } as unknown as T;
      }
      if (method === 'POST') {
        return { success: true } as unknown as T;
      }
    }

    // Remove official from appointment
    if (cleanUrl.includes('/officials/') && cleanUrl.endsWith('/remove') && method === 'POST') {
      return { success: true } as unknown as T;
    }

    // Proposals list (§10.2)
    if (cleanUrl.endsWith('/proposals') && method === 'GET') {
      const pathParts = cleanUrl.split('/');
      const aptId = pathParts[pathParts.length - 2];
      const targetApt = appointments.find((a) => a.id === aptId || a.referenceNo === aptId);
      if (targetApt?.proposals && targetApt.proposals.length > 0) {
        return targetApt.proposals as unknown as T;
      }
      return [
        {
          id: 'prop-1',
          startAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          endAt: new Date(Date.now() + 24.5 * 3600 * 1000).toISOString(),
          roomId: 'room-1',
          proposedBy: 'Secretariat Office',
          expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        },
      ] as unknown as T;
    }

    // Accept proposal
    if (cleanUrl.endsWith('/accept-proposal') && method === 'POST') {
      const pathParts = cleanUrl.split('/');
      const aptId = pathParts[pathParts.length - 2];
      const idx = appointments.findIndex((a) => a.id === aptId || a.referenceNo === aptId);
      if (idx >= 0) {
        appointments[idx].status = AppointmentStatus.CONFIRMED;
        appointments[idx].scheduledStartTime = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        appointments[idx].scheduledEndTime = new Date(Date.now() + 24.5 * 3600 * 1000).toISOString();
        appointments[idx].confirmedAt = new Date().toISOString();
        setStorage('appointments', appointments);
        return formatDetail(appointments[idx]) as unknown as T;
      }
      return { success: true } as unknown as T;
    }

    // Decline proposals
    if (cleanUrl.endsWith('/decline-proposals') && method === 'POST') {
      return { success: true } as unknown as T;
    }

    // Propose alternative times (§10.2)
    if (cleanUrl.endsWith('/propose-times') && method === 'POST') {
      const pathParts = cleanUrl.split('/');
      const aptId = pathParts[pathParts.length - 2];
      const idx = appointments.findIndex((a) => a.id === aptId || a.referenceNo === aptId);
      if (idx >= 0) {
        appointments[idx].status = AppointmentStatus.UNDER_REVIEW;
        appointments[idx].proposals = (body?.slots || []).map((s: any, pIdx: number) => ({
          id: `prop-${aptId}-${pIdx + 1}`,
          startAt: s.startAt,
          endAt: s.endAt,
          roomId: s.roomId || 'room-1',
          expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        }));
        setStorage('appointments', appointments);
      }
      return { success: true } as unknown as T;
    }

    // Reschedule appointment (§10.4)
    if (cleanUrl.endsWith('/reschedule') && method === 'POST') {
      const pathParts = cleanUrl.split('/');
      const aptId = pathParts[pathParts.length - 2];
      const idx = appointments.findIndex((a) => a.id === aptId || a.referenceNo === aptId);
      if (idx >= 0) {
        if (body?.startAt) appointments[idx].scheduledStartTime = body.startAt;
        if (body?.endAt) appointments[idx].scheduledEndTime = body.endAt;
        if (body?.roomId) appointments[idx].roomId = body.roomId;
        appointments[idx].status = AppointmentStatus.CONFIRMED;
        appointments[idx].rescheduleReason = body?.reason || 'Rescheduled by secretariat';
        appointments[idx].statusChangedAt = new Date().toISOString();
        setStorage('appointments', appointments);

        // Update corresponding calendar_events
        try {
          const calEvts: any[] = getStorage('calendar_events', []);
          const calIdx = calEvts.findIndex((ce) => ce.appointmentId === aptId || ce.referenceNo === aptId);
          if (calIdx >= 0) {
            if (body?.startAt) calEvts[calIdx].startAt = body.startAt;
            if (body?.endAt) calEvts[calIdx].endAt = body.endAt;
            if (body?.roomId) calEvts[calIdx].roomId = body.roomId;
            calEvts[calIdx].status = 'CONFIRMED';
            setStorage('calendar_events', calEvts);
          }
        } catch {}

        return formatDetail(appointments[idx]) as unknown as T;
      }
      return { success: true } as unknown as T;
    }

    // Cancel appointment
    if (cleanUrl.endsWith('/cancel') && method === 'POST') {
      const pathParts = cleanUrl.split('/');
      const aptId = pathParts[pathParts.length - 2];
      const idx = appointments.findIndex(
        (a) => a.id === aptId || a.referenceNo === aptId,
      );
      if (idx >= 0) {
        appointments[idx].status = AppointmentStatus.CANCELLED;
        appointments[idx].cancelReason = body?.reason || 'REQUESTER_CANCELLED';
        appointments[idx].cancelNote = body?.note || '';
        setStorage('appointments', appointments);
        return formatDetail(appointments[idx]) as unknown as T;
      }
      return { success: true } as unknown as T;
    }

    // Detail by ID or Status Action (e.g. approve, reject, start, complete)
    const pathParts = cleanUrl.split('/');
    const lastPart = pathParts[pathParts.length - 1];

    // Status action (e.g. approve, reject, start, complete)
    if (method === 'PATCH' || method === 'POST') {
      const action = lastPart.toLowerCase();
      const matchId = pathParts[pathParts.length - 2];
      const isActionRoute = ['approve', 'reject', 'start', 'complete', 'conclude', 'confirm', 'close', 'schedule', 'check-in', 'checkin'].includes(action);

      const targetId = isActionRoute ? matchId : lastPart;
      const cleanTargetId = targetId.replace(/^cal-apt-/, '').replace(/^cal-block-/, '');
      let targetIndex = appointments.findIndex(
        (a) =>
          a.id === targetId ||
          a.id === cleanTargetId ||
          a.referenceNo === targetId ||
          a.referenceNo === cleanTargetId,
      );

      if (targetIndex >= 0) {
        if (action === 'schedule' || cleanUrl.endsWith('/schedule')) {
          if (body?.startAt) appointments[targetIndex].scheduledStartTime = body.startAt;
          if (body?.endAt) appointments[targetIndex].scheduledEndTime = body.endAt;
          if (body?.roomId) appointments[targetIndex].roomId = body.roomId;
          appointments[targetIndex].status = AppointmentStatus.CONFIRMED;
          appointments[targetIndex].confirmedAt = new Date().toISOString();
        } else if (action === 'approve' || action === 'confirm' || body?.status === AppointmentStatus.CONFIRMED) {
          appointments[targetIndex].status = AppointmentStatus.CONFIRMED;
          appointments[targetIndex].confirmedAt = new Date().toISOString();
        } else if (action === 'check-in' || action === 'checkin' || body?.status === AppointmentStatus.CHECKED_IN) {
          appointments[targetIndex].status = AppointmentStatus.CHECKED_IN;
          appointments[targetIndex].checkedInAt = new Date().toISOString();
        } else if (action === 'reject' || body?.status === AppointmentStatus.REJECTED) {
          appointments[targetIndex].status = AppointmentStatus.REJECTED;
          appointments[targetIndex].rejectedAt = new Date().toISOString();
        } else if (action === 'start' || body?.status === 'IN_PROGRESS' || body?.status === AppointmentStatus.IN_PROGRESS) {
          appointments[targetIndex].status = AppointmentStatus.IN_PROGRESS;
        } else if (action === 'complete' || action === 'conclude' || action === 'close' || body?.status === AppointmentStatus.CLOSED || body?.status === 'COMPLETED') {
          appointments[targetIndex].status = AppointmentStatus.CLOSED;
          appointments[targetIndex].closedAt = new Date().toISOString();
        } else if (body?.status) {
          appointments[targetIndex].status = body.status;
        }

        appointments[targetIndex].statusChangedAt = new Date().toISOString();
        setStorage('appointments', appointments);

        // Keep calendar_events status in exact sync
        try {
          const calEvts: any[] = getStorage('calendar_events', []);
          const calIdx = calEvts.findIndex(
            (ce) =>
              ce.appointmentId === targetId ||
              ce.appointmentId === cleanTargetId ||
              ce.id === targetId ||
              ce.id === cleanTargetId ||
              ce.referenceNo === targetId,
          );
          if (calIdx >= 0) {
            calEvts[calIdx].status = appointments[targetIndex].status;
            setStorage('calendar_events', calEvts);
          }
        } catch {}

        // Keep visits in sync
        try {
          const visits: any[] = getStorage('visits', INITIAL_VISITS);
          const vIdx = visits.findIndex(
            (v) =>
              v.appointmentId === targetId ||
              v.appointmentId === cleanTargetId ||
              v.id === targetId ||
              v.id === cleanTargetId,
          );
          if (vIdx >= 0) {
            if (action === 'start') {
              visits[vIdx].status = VisitStatus.WITH_HOST;
              visits[vIdx].withHostAt = new Date().toISOString();
            } else if (action === 'complete' || action === 'conclude' || action === 'close') {
              visits[vIdx].status = VisitStatus.CHECKED_OUT;
              visits[vIdx].checkedOutAt = new Date().toISOString();
            }
            setStorage('visits', visits);
          }
        } catch {}

        // Auto-generate Visit pass for IN_PERSON confirmed appointments
        if (appointments[targetIndex].status === AppointmentStatus.CONFIRMED && appointments[targetIndex].meetingMode !== 'ONLINE' && appointments[targetIndex].meetingMode !== 'PHONE') {
          try {
            const visits: any[] = getStorage('visits', INITIAL_VISITS);
            const apt = appointments[targetIndex];
            if (!visits.find(v => v.appointmentId === apt.id)) {
              const qrTokenNum = apt.referenceNo.split('-').pop() || String(Math.floor(Math.random() * 90000));
              visits.unshift({
                id: `vis-${Date.now()}`,
                orgId: 'org-apex-main',
                appointmentId: apt.id,
                referenceNo: apt.referenceNo,
                qrToken: qrTokenNum,
                visitorName: apt.requesterName || 'Visitor',
                phone: apt.requesterPhone || '+91 99999 00000',
                email: apt.requesterEmail || '',
                organization: 'Visitor',
                idType: 'AADHAAR',
                idLast4: 'XXXX',
                partySize: apt.attendees ? apt.attendees.length || 1 : 1,
                status: VisitStatus.EXPECTED,
                hostOfficialId: apt.officialId,
                hostOfficialName: apt.officialName,
                officialName: apt.officialName,
                hostOfficialTitle: apt.officialTitle,
                scheduledStartTime: apt.scheduledStartTime || new Date().toISOString(),
                scheduledEndTime: apt.scheduledEndTime || new Date(Date.now() + 3600000).toISOString(),
                scheduledAt: apt.scheduledStartTime || new Date().toISOString(),
                roomName: apt.location || 'Chamber 101',
                subject: apt.subject,
                purpose: apt.purpose,
                createdAt: new Date().toISOString(),
              });
              setStorage('visits', visits);
            }
          } catch (e) {}
        }

        // Keep calendar_events status in exact sync
        try {
          const calEvts: any[] = getStorage('calendar_events', []);
          const calIdx = calEvts.findIndex(
            (ce) => ce.appointmentId === targetId || ce.referenceNo === targetId || ce.id === targetId,
          );
          if (calIdx >= 0) {
            calEvts[calIdx].status = appointments[targetIndex].status;
            setStorage('calendar_events', calEvts);
          }
        } catch {}

        // Dynamically add in-app status update notification
        try {
          const notifs: any[] = getStorage('notifications', INITIAL_NOTIFICATIONS);
          const apt = appointments[targetIndex];
          let type = 'appointment_confirmed';
          let eventType = 'APPOINTMENT_UPDATED';
          let notifTitle = `Appointment Updated (#${apt.referenceNo || targetId})`;
          let notifBody = `Status changed to ${apt.status}.`;

          if (apt.status === AppointmentStatus.CONFIRMED) {
            type = 'appointment_confirmed';
            eventType = 'APPOINTMENT_CONFIRMED';
            notifTitle = `Appointment Confirmed (#${apt.referenceNo || targetId})`;
            notifBody = `Meeting with ${apt.officialName || 'the official'} has been confirmed.`;
          } else if (apt.status === AppointmentStatus.REJECTED) {
            type = 'appointment_rejected';
            eventType = 'APPOINTMENT_REJECTED';
            notifTitle = `Appointment Request Declined (#${apt.referenceNo || targetId})`;
            notifBody = `Request #${apt.referenceNo || targetId} was declined due to schedule constraints.`;
          } else if (apt.status === AppointmentStatus.CANCELLED) {
            type = 'appointment_cancelled';
            eventType = 'APPOINTMENT_CANCELLED';
            notifTitle = `Appointment Cancelled (#${apt.referenceNo || targetId})`;
            notifBody = `Appointment #${apt.referenceNo || targetId} has been cancelled.`;
          } else if (apt.status === AppointmentStatus.CLOSED || apt.status === 'COMPLETED') {
            type = 'appointment_completed';
            eventType = 'APPOINTMENT_COMPLETED';
            notifTitle = `Appointment Completed (#${apt.referenceNo || targetId})`;
            notifBody = `Appointment #${apt.referenceNo || targetId} has concluded. Minutes of meeting recorded.`;
          } else if (action === 'reschedule' || action === 'schedule') {
            type = 'appointment_rescheduled';
            eventType = 'APPOINTMENT_RESCHEDULED';
            notifTitle = `Appointment Rescheduled (#${apt.referenceNo || targetId})`;
            notifBody = `Appointment #${apt.referenceNo || targetId} schedule has been updated.`;
          }

          const statusNotif = {
            id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            userId: apt.citizenUserId || apt.officialId || 'usr-admin-1',
            officialId: apt.officialId || null,
            targetRoles: [RoleCode.FACULTY, RoleCode.STAFF, RoleCode.ADMIN, 'OFFICIAL', 'EA_PA', 'SUPER_ADMIN'],
            type,
            eventType,
            title: notifTitle,
            message: notifBody,
            body: notifBody,
            appointmentId: targetId,
            link: `/app/appointments/${targetId}`,
            priority: Priority.HIGH,
            entityType: 'APPOINTMENT',
            entityId: targetId,
            isRead: false,
            readAt: null,
            createdAt: new Date().toISOString(),
          };
          notifs.unshift(statusNotif);
          setStorage('notifications', notifs);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('oams-notification-created', { detail: statusNotif }));
            window.dispatchEvent(new CustomEvent('oams-notifications-updated'));
          }
        } catch {
          // ignore storage error
        }

        if (action === 'complete') {
          return {
            appointment: formatDetail(appointments[targetIndex]),
            note: { notes: body?.notes || 'Meeting concluded.', decisions: body?.decisions || null },
            actionItems: body?.actionItems || [],
            followUpRequested: !!body?.scheduleFollowUp,
          } as unknown as T;
        }

        return formatDetail(appointments[targetIndex]) as unknown as T;
      }

      // If not in appointments, check calendar_events (e.g. for standalone meeting blocks)
      try {
        const calEvts: any[] = getStorage('calendar_events', []);
        const calIdx = calEvts.findIndex(
          (ce) => ce.id === targetId || ce.id === cleanTargetId || ce.referenceNo === targetId,
        );
        if (calIdx >= 0) {
          if (action === 'start') calEvts[calIdx].status = 'IN_PROGRESS';
          if (action === 'complete' || action === 'conclude' || action === 'close') calEvts[calIdx].status = 'COMPLETED';
          setStorage('calendar_events', calEvts);
          return calEvts[calIdx] as unknown as T;
        }
      } catch {}
    }

    // Detail by ID (e.g. /api/v1/appointments/my/:id or /api/v1/appointments/:id)
    if (
      method === 'GET' &&
      lastPart &&
      lastPart !== 'appointments' &&
      lastPart !== 'inbox' &&
      lastPart !== 'my'
    ) {
      const decodedPart = decodeURIComponent(lastPart).trim();
      const found = appointments.find(
        (a) =>
          a.id.toLowerCase() === decodedPart.toLowerCase() ||
          a.referenceNo?.toLowerCase() === decodedPart.toLowerCase(),
      );
      if (found) {
        return formatDetail(found) as unknown as T;
      }

      // Check visits storage in case it was created via visit pass
      try {
        const visits: any[] = getStorage('visits', INITIAL_VISITS);
        const foundVisit = visits.find(
          (v) =>
            v.id?.toLowerCase() === decodedPart.toLowerCase() ||
            v.referenceNo?.toLowerCase() === decodedPart.toLowerCase() ||
            v.appointmentId?.toLowerCase() === decodedPart.toLowerCase(),
        );
        if (foundVisit) {
          return formatDetail({
            id: foundVisit.appointmentId || foundVisit.id,
            referenceNo: foundVisit.referenceNo,
            subject: foundVisit.subject || 'Campus Official Appointment',
            status: foundVisit.status === 'EXPECTED' ? AppointmentStatus.CONFIRMED : foundVisit.status,
            requesterName: foundVisit.visitorName,
            requesterEmail: foundVisit.email,
            requesterPhone: foundVisit.phone,
            officialId: foundVisit.hostOfficialId,
            officialName: foundVisit.hostOfficialName,
            officialTitle: foundVisit.hostOfficialTitle,
            scheduledStartTime: foundVisit.scheduledStartTime || foundVisit.scheduledAt,
            location: foundVisit.roomName,
            roomId: foundVisit.roomName,
            attendees: [{ name: foundVisit.visitorName, organization: foundVisit.organization, email: foundVisit.email }],
          }) as unknown as T;
        }
      } catch {}

      throw new Error(`Appointment record not found for reference "${decodedPart}"`);
    }

    // Explicit My Appointments endpoint (/api/v1/appointments/my)
    if (cleanUrl.endsWith('/my') || cleanUrl.includes('/appointments/my')) {
      let myUser: any = null;
      if (personaId) {
        myUser = Object.values(DEMO_PERSONAS).find(
          (p) => p.id === personaId || p.email.toLowerCase() === personaId.toLowerCase(),
        );
      }
      if (!myUser && typeof localStorage !== 'undefined') {
        try {
          const uStr = localStorage.getItem('oams_user') || sessionStorage.getItem('oams_user');
          if (uStr) myUser = JSON.parse(uStr);
        } catch {}
      }

      let myList = [...appointments];
      if (myUser) {
        if (myUser.officialId) {
          // Official: only appointments for their own chamber
          myList = appointments.filter((a) => {
            const offId = a.officialId || a.official?.id || '';
            const offName = (a.officialName || a.official?.fullName || '').toLowerCase();
            const uName = (myUser.fullName || '').toLowerCase().replace(/^(mr\.|ms\.|dr\.|prof\.)\s*/, '').trim();
            return offId === myUser.officialId || (uName && offName.includes(uName));
          });
        } else if (myUser.assignedOfficialIds && myUser.assignedOfficialIds.length > 0) {
          // Secretariat PA: only appointments for assigned officials
          myList = appointments.filter((a) => {
            const offId = a.officialId || a.official?.id || '';
            return myUser.assignedOfficialIds.includes(offId);
          });
        } else {
          // Citizen / Guest / Petitioner: only their own requested appointments
          myList = appointments.filter((a) => {
            const cId = a.citizenUserId || a.userId;
            const reqEmail = (a.requesterEmail || a.email || '').toLowerCase();
            const uEmail = (myUser.email || '').toLowerCase();
            const reqName = (a.requesterName || a.fullName || '').toLowerCase();
            const uName = (myUser.fullName || '').toLowerCase();
            return (
              (cId && cId === myUser.id) ||
              (uEmail && reqEmail === uEmail) ||
              (uName && reqName.includes(uName))
            );
          });
        }
      }
      return myList.map((a) => formatDetail(a)) as unknown as T;
    }

    // List of appointments
    const queryParams = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
    const officialIdParam = queryParams.get('officialId');

    let filteredList = appointments;
    if (officialIdParam) {
      filteredList = filteredList.filter((a) => {
        const offId = a.officialId || a.official?.id || 'off-1';
        return offId === officialIdParam;
      });
    } else if (!isGlobalRole && allowedOfficialIds !== null && allowedOfficialIds.length > 0) {
      filteredList = filteredList.filter((a) => {
        const offId = a.officialId || a.official?.id || 'off-1';
        return allowedOfficialIds!.includes(offId);
      });
    }

    return filteredList.map((a) => formatDetail(a)) as unknown as T;
  }

  // 4.5 Meetings, Minutes & Action Items (§16, §22)
  if (cleanUrl.includes('/meetings')) {
    const notes: any[] = getStorage('meeting_notes', [
      {
        id: 'note-1',
        appointmentId: 'apt-101',
        authorName: 'Ms. Indhu',
        body: 'Quarterly review concluded. Agreed to proceed with phase 2 alignment pending urban planning clearance.',
        decisions: 'Approved expansion plan draft; clearance memo to be prepared.',
        isConfidential: false,
        createdAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      },
    ]);

    const actionItems: any[] = getStorage('meeting_action_items', [
      {
        id: 'ai-1',
        appointmentId: 'apt-101',
        title: 'Obtain statutory clearance certificate from Urban Development Ministry',
        ownerName: 'Ms. Indhu',
        dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        status: 'OPEN',
        convertedTaskId: 'tsk-1',
        convertedTaskRef: 'TSK-101',
        createdAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      },
    ]);

    // Complete meeting
    if (cleanUrl.endsWith('/complete') && method === 'POST') {
      const parts = cleanUrl.split('/');
      const aptId = parts[parts.length - 2];
      const cleanAptId = aptId.replace(/^cal-apt-/, '').replace(/^cal-block-/, '');

      // Update appointment status to CLOSED
      const appointments: any[] = getStorage('appointments', INITIAL_APPOINTMENTS);
      const aptIdx = appointments.findIndex((a) => a.id === aptId || a.id === cleanAptId || a.referenceNo === aptId || a.referenceNo === cleanAptId);
      if (aptIdx >= 0) {
        appointments[aptIdx].status = AppointmentStatus.CLOSED;
        appointments[aptIdx].closedAt = new Date().toISOString();
        setStorage('appointments', appointments);
      }

      // Keep calendar_events in exact sync
      try {
        const calEvts: any[] = getStorage('calendar_events', []);
        const calIdx = calEvts.findIndex(
          (ce) => ce.id === aptId || ce.id === cleanAptId || ce.appointmentId === aptId || ce.appointmentId === cleanAptId,
        );
        if (calIdx >= 0) {
          calEvts[calIdx].status = 'COMPLETED';
          setStorage('calendar_events', calEvts);
        }
      } catch {}

      // Keep visits in sync
      try {
        const visits: any[] = getStorage('visits', INITIAL_VISITS);
        const vIdx = visits.findIndex(
          (v) => v.appointmentId === aptId || v.appointmentId === cleanAptId || v.id === aptId || v.id === cleanAptId,
        );
        if (vIdx >= 0) {
          visits[vIdx].status = VisitStatus.CHECKED_OUT;
          visits[vIdx].checkedOutAt = new Date().toISOString();
          setStorage('visits', visits);
        }
      } catch {}

      // Add note if provided
      let createdNote = null;
      if (body?.notes) {
        createdNote = {
          id: `note-${Date.now()}`,
          appointmentId: aptId,
          authorName: 'Mr. KVK',
          body: body.notes,
          decisions: body.decisions || null,
          isConfidential: false,
          createdAt: new Date().toISOString(),
        };
        notes.unshift(createdNote);
        setStorage('meeting_notes', notes);
      }

      // Add action items if provided
      const createdActionItems: any[] = [];
      if (Array.isArray(body?.actionItems)) {
        body.actionItems.forEach((ai: any, i: number) => {
          const item = {
            id: `ai-${Date.now()}-${i}`,
            appointmentId: aptId,
            title: ai.title,
            ownerName: 'Assigned Officer',
            dueDate: ai.dueDate || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
            status: 'OPEN',
            convertedTaskId: null,
            createdAt: new Date().toISOString(),
          };
          actionItems.unshift(item);
          createdActionItems.push(item);
        });
        setStorage('meeting_action_items', actionItems);
      }

      return {
        appointment: aptIdx >= 0 ? appointments[aptIdx] : null,
        note: createdNote,
        actionItems: createdActionItems,
        followUpRequested: !!body?.scheduleFollowUp,
      } as unknown as T;
    }

    // Close meeting
    if (cleanUrl.endsWith('/close') && method === 'POST') {
      const parts = cleanUrl.split('/');
      const aptId = parts[parts.length - 2];
      const appointments: any[] = getStorage('appointments', INITIAL_APPOINTMENTS);
      const aptIdx = appointments.findIndex((a) => a.id === aptId || a.referenceNo === aptId);
      if (aptIdx >= 0) {
        appointments[aptIdx].status = AppointmentStatus.CLOSED;
        appointments[aptIdx].closedAt = new Date().toISOString();
        setStorage('appointments', appointments);
      }
      return { success: true } as unknown as T;
    }

    // Convert action item to task
    if (cleanUrl.includes('/convert-to-task') && method === 'POST') {
      const parts = cleanUrl.split('/');
      const actionItemId = parts[parts.length - 2];
      const aiIdx = actionItems.findIndex((a) => a.id === actionItemId);
      const newTaskId = `tsk-${Date.now()}`;
      if (aiIdx >= 0) {
        actionItems[aiIdx].convertedTaskId = newTaskId;
        actionItems[aiIdx].convertedTaskRef = `TSK-${newTaskId.slice(-4)}`;
        setStorage('meeting_action_items', actionItems);

        // Add to tasks list
        const tasks: any[] = getStorage('tasks', INITIAL_TASKS);
        tasks.unshift({
          id: newTaskId,
          title: actionItems[aiIdx].title,
          description: `Generated from meeting action item for appointment ${actionItems[aiIdx].appointmentId}`,
          status: TaskStatus.TODO,
          priority: body?.priority || Priority.MEDIUM,
          category: 'ACTION_ITEM',
          officialId: body?.officialId || 'off-1',
          officialName: 'Mr. KVK',
          assignedToName: 'Assigned Officer',
          dueAt: actionItems[aiIdx].dueDate || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          tags: ['Meeting Action'],
          createdAt: new Date().toISOString(),
        });
        setStorage('tasks', tasks);
      }
      return { success: true, taskId: newTaskId } as unknown as T;
    }

    // Patch action item (toggle status)
    if (cleanUrl.includes('/action-items/') && method === 'PATCH') {
      const parts = cleanUrl.split('/');
      const actionItemId = parts[parts.length - 1];
      const aiIdx = actionItems.findIndex((a) => a.id === actionItemId);
      if (aiIdx >= 0) {
        actionItems[aiIdx] = { ...actionItems[aiIdx], ...body };
        setStorage('meeting_action_items', actionItems);
        return actionItems[aiIdx] as unknown as T;
      }
      return { success: true } as unknown as T;
    }

    // Action items for an appointment
    if (cleanUrl.endsWith('/action-items')) {
      const parts = cleanUrl.split('/');
      const aptId = parts[parts.length - 2];
      if (method === 'POST') {
        const newItem = {
          id: `ai-${Date.now()}`,
          appointmentId: aptId,
          title: body?.title || 'Action Item',
          ownerName: 'Assigned Staff',
          dueDate: body?.dueDate || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          status: 'OPEN',
          convertedTaskId: null,
          createdAt: new Date().toISOString(),
        };
        actionItems.unshift(newItem);
        setStorage('meeting_action_items', actionItems);
        return newItem as unknown as T;
      }
      return actionItems.filter((a) => a.appointmentId === aptId) as unknown as T;
    }

    // Notes for an appointment
    if (cleanUrl.endsWith('/notes')) {
      const parts = cleanUrl.split('/');
      const aptId = parts[parts.length - 2];
      if (method === 'POST') {
        const newNote = {
          id: `note-${Date.now()}`,
          appointmentId: aptId,
          authorName: 'Mr. KVK',
          body: body?.body || '',
          decisions: body?.decisions || null,
          isConfidential: !!body?.isConfidential,
          createdAt: new Date().toISOString(),
        };
        notes.unshift(newNote);
        setStorage('meeting_notes', notes);
        return newNote as unknown as T;
      }
      return notes.filter((n) => n.appointmentId === aptId) as unknown as T;
    }

    return [] as unknown as T;
  }

  // 5. Tasks & To-Dos (§12)
  if (cleanUrl.includes('/tasks') || cleanUrl.includes('/todos')) {
    const tasks: any[] = getStorage('tasks', INITIAL_TASKS);

    // Format tasks so all required DTO properties exist
    const formatTask = (t: any) => {
      const off = INITIAL_OFFICIALS.find((o) => o.id === t.officialId);
      const cleanId = String(t.id || '0001').toUpperCase().replace('TSK-', '').replace(/[^0-9A-Z]/g, '');
      const refNum = t.referenceNo || `TSK-2026-${cleanId.padStart(4, '0')}`;

      const defaultChecklist = [
        {
          id: `${t.id || 'tsk'}-chk-1`,
          taskId: t.id,
          text: 'Review agenda documentation and preliminary briefs',
          done: true,
          position: 0,
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          updatedAt: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: `${t.id || 'tsk'}-chk-2`,
          taskId: t.id,
          text: 'Confirm chamber schedule allocation and briefing materials',
          done: false,
          position: 1,
          createdAt: new Date(Date.now() - 1800000).toISOString(),
          updatedAt: new Date(Date.now() - 1800000).toISOString(),
        },
      ];

      const defaultComments = [
        {
          id: `${t.id || 'tsk'}-com-1`,
          taskId: t.id,
          authorId: 'usr-officer-1',
          authorName: 'Ms. Indhu',
          authorEmail: 'indhu@university.edu',
          body: 'Preliminary brief prepared and updated for executive review.',
          text: 'Preliminary brief prepared and updated for executive review.',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          updatedAt: new Date(Date.now() - 3600000).toISOString(),
        },
      ];

      const rawChecklist = t.checklistItems || t.checklist || defaultChecklist;
      const checklistItems = rawChecklist.map((ci: any, idx: number) => ({
        id: ci.id || `chk-${idx + 1}`,
        taskId: t.id,
        text: ci.text || '',
        done: !!ci.done,
        position: typeof ci.position === 'number' ? ci.position : idx,
        createdAt: ci.createdAt || new Date().toISOString(),
        updatedAt: ci.updatedAt || new Date().toISOString(),
      }));

      const rawComments = t.comments || defaultComments;
      const comments = rawComments.map((c: any, idx: number) => ({
        id: c.id || `com-${idx + 1}`,
        taskId: t.id,
        authorId: c.authorId || 'usr-officer-1',
        authorName: c.authorName || 'Ms. Indhu',
        authorEmail: c.authorEmail || 'indhu@university.edu',
        body: c.body || c.text || '',
        text: c.body || c.text || '',
        createdAt: c.createdAt || new Date().toISOString(),
        updatedAt: c.updatedAt || new Date().toISOString(),
      }));

      const rawReminders = t.reminders || [];
      const reminders = rawReminders.map((r: any, idx: number) => ({
        id: r.id || `rem-${idx + 1}`,
        taskId: t.id,
        remindAt: r.remindAt || new Date().toISOString(),
        channel: r.channel || 'IN_APP',
        sentAt: r.sentAt || null,
        createdAt: r.createdAt || new Date().toISOString(),
      }));

      return {
        ...t,
        id: t.id,
        referenceNo: refNum,
        title: t.title,
        description: t.description || '',
        status: t.status || TaskStatus.TODO,
        priority: t.priority || Priority.MEDIUM,
        category: t.category || 'OTHER',
        officialId: t.officialId || 'off-1',
        officialName: t.officialName || off?.fullName || off?.full_name || 'Official',
        assignedToId: t.assignedToId || null,
        assignedToName: t.assignedToName || 'Assigned Officer',
        assigneeName: t.assigneeName || t.assignedToName || 'Assigned Officer',
        dueAt: t.dueAt || t.dueDate || new Date(Date.now() + 14 * 3600 * 1000).toISOString(),
        dueDate: t.dueAt || t.dueDate || new Date(Date.now() + 14 * 3600 * 1000).toISOString(),
        isPersonal: !!t.isPersonal,
        visibility: t.isPersonal ? 'PERSONAL' : (t.visibility || 'ORG'),
        blockedReason: t.blockedReason || t.blockReason || null,
        blockReason: t.blockedReason || t.blockReason || null,
        cancelReason: t.cancelReason || null,
        tags: t.tags || ['Action'],
        createdAt: t.createdAt || new Date().toISOString(),
        completedAt: t.completedAt || (t.status === TaskStatus.DONE ? new Date().toISOString() : null),
        checklistItems,
        checklist: checklistItems,
        comments,
        reminders,
        isOverdue: t.dueAt ? new Date(t.dueAt) < new Date() && t.status !== TaskStatus.DONE && t.status !== TaskStatus.CANCELLED : false,
        awaitingVerification: !!t.awaitingVerification,
      };
    };

    // Identify current authenticated persona
    let tokenStr = '';
    if (typeof sessionStorage !== 'undefined') {
      tokenStr = sessionStorage.getItem('oams_token') || '';
    }
    if (!tokenStr && typeof localStorage !== 'undefined') {
      tokenStr = localStorage.getItem('oams_token') || '';
    }
    const personaId = tokenStr.replace('demo-token-', '');
    const currentPersona = Object.values(DEMO_PERSONAS).find(
      (p) => p.id === personaId || p.email.toLowerCase() === personaId.toLowerCase(),
    );

    const queryParams = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
    const requestedOfficialId = queryParams.get('officialId');
    const requestedUserId = queryParams.get('userId');
    const requestedPriority = queryParams.get('priority');
    const requestedCategory = queryParams.get('category');
    const searchQuery = (queryParams.get('search') || '').toLowerCase().trim();

    // Filter tasks based on logged-in persona / requested official
    let userTasks = tasks;
    if (requestedOfficialId) {
      userTasks = tasks.filter((t) => t.officialId === requestedOfficialId);
    } else if (requestedUserId) {
      userTasks = tasks.filter(
        (t) =>
          t.assignedToId === requestedUserId ||
          t.createdById === requestedUserId ||
          t.ownerUserId === requestedUserId,
      );
    } else if (currentPersona) {
      const pOfficialId =
        currentPersona.officialId ||
        (currentPersona.assignedOfficialIds && currentPersona.assignedOfficialIds[0]);
      if (pOfficialId) {
        userTasks = tasks.filter(
          (t) =>
            t.officialId === pOfficialId ||
            t.assignedToId === currentPersona.id ||
            t.createdById === currentPersona.id,
        );
      } else {
        userTasks = tasks.filter(
          (t) => t.assignedToId === currentPersona.id || t.createdById === currentPersona.id,
        );
      }
    }

    if (requestedPriority) {
      userTasks = userTasks.filter((t) => t.priority === requestedPriority);
    }
    if (requestedCategory) {
      userTasks = userTasks.filter((t) => t.category === requestedCategory);
    }
    if (searchQuery) {
      userTasks = userTasks.filter(
        (t) =>
          (t.title || '').toLowerCase().includes(searchQuery) ||
          (t.description || '').toLowerCase().includes(searchQuery),
      );
    }

    // Summary endpoint (§12.3 KPI cards)
    if (cleanUrl.includes('/summary')) {
      const formatted = userTasks.map(formatTask);
      const now = new Date();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59);

      const overdueCount = formatted.filter(
        (t) =>
          t.status !== TaskStatus.DONE &&
          t.status !== TaskStatus.CANCELLED &&
          t.dueAt &&
          new Date(t.dueAt) < now,
      ).length;

      const todayCount = formatted.filter((t) => {
        if (t.status === TaskStatus.DONE || t.status === TaskStatus.CANCELLED || !t.dueAt) return false;
        const d = new Date(t.dueAt);
        return d >= now && d <= todayEnd;
      }).length;

      const upcomingCount = formatted.filter((t) => {
        if (t.status === TaskStatus.DONE || t.status === TaskStatus.CANCELLED || !t.dueAt) return false;
        const d = new Date(t.dueAt);
        return d > todayEnd && d <= weekEnd;
      }).length;

      const highPri = formatted.filter(
        (t) =>
          t.status !== TaskStatus.DONE &&
          t.status !== TaskStatus.CANCELLED &&
          (t.priority === Priority.HIGH || t.priority === Priority.URGENT),
      ).length;

      const doneToday = formatted.filter((t) => t.status === TaskStatus.DONE).length;

      return {
        totalOpenCount: formatted.filter(
          (t) => t.status !== TaskStatus.DONE && t.status !== TaskStatus.CANCELLED,
        ).length,
        overdueCount,
        todayCount,
        upcomingCount,
        highPriorityCount: highPri,
        doneTodayCount: doneToday,
      } as unknown as T;
    }

    const getActionTaskId = (actionName: string) => {
      const parts = cleanUrl.split('/');
      const idx = parts.lastIndexOf(actionName);
      return idx > 0 ? parts[idx - 1] : '';
    };

    // Complete task action
    if (cleanUrl.endsWith('/complete') && method === 'POST') {
      const taskId = getActionTaskId('complete');
      const idx = tasks.findIndex((t) => t.id === taskId);
      if (idx >= 0) {
        tasks[idx].status = TaskStatus.DONE;
        tasks[idx].completedAt = new Date().toISOString();
        setStorage('tasks', tasks);
        return formatTask(tasks[idx]) as unknown as T;
      }
      return { success: true } as unknown as T;
    }

    // Start task action
    if (cleanUrl.endsWith('/start') && method === 'POST') {
      const taskId = getActionTaskId('start');
      const idx = tasks.findIndex((t) => t.id === taskId);
      if (idx >= 0) {
        tasks[idx].status = TaskStatus.IN_PROGRESS;
        setStorage('tasks', tasks);
        return formatTask(tasks[idx]) as unknown as T;
      }
      return { success: true } as unknown as T;
    }

    // Reopen task action
    if (cleanUrl.endsWith('/reopen') && method === 'POST') {
      const taskId = getActionTaskId('reopen');
      const idx = tasks.findIndex((t) => t.id === taskId);
      if (idx >= 0) {
        tasks[idx].status = TaskStatus.TODO;
        tasks[idx].completedAt = null;
        setStorage('tasks', tasks);
        return formatTask(tasks[idx]) as unknown as T;
      }
      return { success: true } as unknown as T;
    }

    // Block task action
    if (cleanUrl.endsWith('/block') && method === 'POST') {
      const taskId = getActionTaskId('block');
      const idx = tasks.findIndex((t) => t.id === taskId);
      if (idx >= 0) {
        tasks[idx].status = TaskStatus.BLOCKED;
        const reason = body?.reason || 'Blocked pending dependencies';
        tasks[idx].blockedReason = reason;
        tasks[idx].blockReason = reason;
        setStorage('tasks', tasks);
        return formatTask(tasks[idx]) as unknown as T;
      }
      return { success: true } as unknown as T;
    }

    // Verify task action
    if (cleanUrl.endsWith('/verify') && method === 'POST') {
      const taskId = getActionTaskId('verify');
      const idx = tasks.findIndex((t) => t.id === taskId);
      if (idx >= 0) {
        tasks[idx].status = TaskStatus.DONE;
        tasks[idx].verified = true;
        tasks[idx].awaitingVerification = false;
        tasks[idx].verifiedAt = new Date().toISOString();
        setStorage('tasks', tasks);
        return formatTask(tasks[idx]) as unknown as T;
      }
      return { success: true } as unknown as T;
    }

    // Unblock task action
    if (cleanUrl.endsWith('/unblock') && method === 'POST') {
      const taskId = getActionTaskId('unblock');
      const idx = tasks.findIndex((t) => t.id === taskId);
      if (idx >= 0) {
        tasks[idx].status = TaskStatus.IN_PROGRESS;
        delete tasks[idx].blockedReason;
        delete tasks[idx].blockReason;
        setStorage('tasks', tasks);
        return formatTask(tasks[idx]) as unknown as T;
      }
      return { success: true } as unknown as T;
    }

    // Cancel task action
    if (cleanUrl.endsWith('/cancel') && method === 'POST') {
      const taskId = getActionTaskId('cancel');
      const idx = tasks.findIndex((t) => t.id === taskId);
      if (idx >= 0) {
        tasks[idx].status = TaskStatus.CANCELLED;
        tasks[idx].cancelReason = body?.reason || 'Cancelled by user';
        setStorage('tasks', tasks);
        return formatTask(tasks[idx]) as unknown as T;
      }
      return { success: true } as unknown as T;
    }

    // Checklist action
    if (cleanUrl.includes('/checklist')) {
      const parts = cleanUrl.split('/');
      const chkIdx = parts.indexOf('checklist');
      const taskId = chkIdx > 0 ? parts[chkIdx - 1] : '';
      const itemId = chkIdx < parts.length - 1 ? parts[chkIdx + 1] : '';
      const tIdx = tasks.findIndex((t) => t.id === taskId);

      if (tIdx >= 0) {
        const currentTask = formatTask(tasks[tIdx]);
        const items = [...currentTask.checklistItems];

        if (method === 'POST') {
          const newItem = {
            id: `chk-${Date.now()}`,
            taskId,
            text: body?.text || 'New sub-task',
            done: false,
            position: items.length,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          items.push(newItem);
          tasks[tIdx].checklistItems = items;
          tasks[tIdx].checklist = items;
          setStorage('tasks', tasks);
          return newItem as unknown as T;
        }

        if (method === 'PATCH' && itemId) {
          const itIdx = items.findIndex((it) => it.id === itemId);
          if (itIdx >= 0) {
            items[itIdx] = {
              ...items[itIdx],
              ...(body || {}),
              updatedAt: new Date().toISOString(),
            };
            tasks[tIdx].checklistItems = items;
            tasks[tIdx].checklist = items;
            setStorage('tasks', tasks);
            return items[itIdx] as unknown as T;
          }
        }

        if (method === 'DELETE' && itemId) {
          const filteredItems = items.filter((it) => it.id !== itemId);
          tasks[tIdx].checklistItems = filteredItems;
          tasks[tIdx].checklist = filteredItems;
          setStorage('tasks', tasks);
          return { success: true } as unknown as T;
        }
      }
      return { success: true } as unknown as T;
    }

    // Comments action
    if (cleanUrl.includes('/comments') && method === 'POST') {
      const parts = cleanUrl.split('/');
      const comIdx = parts.indexOf('comments');
      const taskId = comIdx > 0 ? parts[comIdx - 1] : '';
      const tIdx = tasks.findIndex((t) => t.id === taskId);
      const author = currentPersona?.fullName || 'Ms. Indhu';

      const newComment = {
        id: `com-${Date.now()}`,
        taskId,
        authorId: currentPersona?.id || 'usr-officer-1',
        authorName: author,
        authorEmail: currentPersona?.email || 'indhu@university.edu',
        body: body?.body || body?.text || '',
        text: body?.body || body?.text || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (tIdx >= 0) {
        const currentTask = formatTask(tasks[tIdx]);
        const coms = [...currentTask.comments];
        coms.push(newComment);
        tasks[tIdx].comments = coms;
        setStorage('tasks', tasks);
      }
      return newComment as unknown as T;
    }

    // Reminders action
    if (cleanUrl.includes('/reminders')) {
      const parts = cleanUrl.split('/');
      const remIdx = parts.indexOf('reminders');
      const taskId = remIdx > 0 ? parts[remIdx - 1] : '';
      const reminderId = remIdx < parts.length - 1 ? parts[remIdx + 1] : '';
      const tIdx = tasks.findIndex((t) => t.id === taskId);

      if (tIdx >= 0) {
        const currentTask = formatTask(tasks[tIdx]);
        const rems = [...currentTask.reminders];

        if (method === 'POST') {
          const newReminder = {
            id: `rem-${Date.now()}`,
            taskId,
            remindAt: body?.remindAt || new Date().toISOString(),
            channel: 'IN_APP',
            sentAt: null,
            createdAt: new Date().toISOString(),
          };
          rems.push(newReminder);
          tasks[tIdx].reminders = rems;
          setStorage('tasks', tasks);
          return newReminder as unknown as T;
        }

        if (method === 'DELETE' && reminderId) {
          const filteredRems = rems.filter((r) => r.id !== reminderId);
          tasks[tIdx].reminders = filteredRems;
          setStorage('tasks', tasks);
          return { success: true } as unknown as T;
        }
      }
      return { success: true } as unknown as T;
    }

    // Reorder action
    if (cleanUrl.endsWith('/reorder') && (method === 'PATCH' || method === 'POST')) {
      return { success: true } as unknown as T;
    }

    // Create new task
    if (method === 'POST') {
      const activeOfficialId = body?.officialId || currentPersona?.officialId || 'off-1';
      const activeOfficial = INITIAL_OFFICIALS.find((o) => o.id === activeOfficialId);
      const newTask = formatTask({
        id: `tsk-${Date.now()}`,
        title: body?.title || 'New Action Item',
        description: body?.description || '',
        status: TaskStatus.TODO,
        priority: body?.priority || Priority.MEDIUM,
        category: body?.category || 'OTHER',
        officialId: activeOfficialId,
        officialName: activeOfficial?.fullName || activeOfficial?.full_name || currentPersona?.fullName || 'Official',
        assignedToId: body?.assignedToId || currentPersona?.id || 'usr-admin-1',
        assignedToName: body?.assignedToName || currentPersona?.fullName || 'Assigned Officer',
        createdById: currentPersona?.id || 'usr-admin-1',
        createdByName: currentPersona?.fullName || 'Official',
        dueAt: body?.dueDate || body?.dueAt || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        isPersonal: !!body?.isPersonal,
        tags: body?.tags || ['Action'],
        createdAt: new Date().toISOString(),
      });
      tasks.unshift(newTask);
      setStorage('tasks', tasks);
      return newTask as unknown as T;
    }

    // Patch task
    if (method === 'PATCH') {
      const parts = cleanUrl.split('/');
      const taskId = parts[parts.length - 1];
      const idx = tasks.findIndex((t) => t.id === taskId);
      if (idx >= 0) {
        tasks[idx] = { ...tasks[idx], ...body };
        setStorage('tasks', tasks);
        return formatTask(tasks[idx]) as unknown as T;
      }
    }

    // Delete task
    if (method === 'DELETE' && !cleanUrl.includes('/checklist') && !cleanUrl.includes('/reminders')) {
      const parts = cleanUrl.split('/');
      const taskId = parts[parts.length - 1];
      const filtered = tasks.filter((t) => t.id !== taskId);
      setStorage('tasks', filtered);
      return { success: true } as unknown as T;
    }

    // Single task detail
    const pathParts = cleanUrl.split('/');
    const lastSeg = pathParts[pathParts.length - 1];
    if (
      method === 'GET' &&
      lastSeg &&
      lastSeg !== 'tasks' &&
      lastSeg !== 'todos' &&
      lastSeg !== 'summary'
    ) {
      const single = tasks.find((t) => t.id === lastSeg);
      if (single) {
        return formatTask(single) as unknown as T;
      }
    }

    // List tasks
    const formatted = userTasks.map(formatTask);
    return {
      tasks: formatted,
      total: formatted.length,
      summary: {
        total: formatted.length,
        pending: formatted.filter((t) => t.status === TaskStatus.TODO).length,
        inProgress: formatted.filter((t) => t.status === TaskStatus.IN_PROGRESS).length,
        completed: formatted.filter((t) => t.status === TaskStatus.DONE).length,
        overdue: 0,
      },
    } as unknown as T;
  }

  // 6. Reception & Security Visits (§15)
  if (cleanUrl.includes('/visits') || cleanUrl.includes('/reception') || cleanUrl.includes('/security')) {
    let visits: any[] = getStorage('visits', INITIAL_VISITS);
    const appointments: any[] = getStorage('appointments', INITIAL_APPOINTMENTS);
    const officials: any[] = getStorage('officials', INITIAL_OFFICIALS);

    // 1. Normalize demo visits so they stay anchored to current local date
    const todayStr = new Date().toISOString().split('T')[0];
    let visitsNeedUpdate = false;
    visits = visits.map((v: any) => {
      if (v.id && !v.id.startsWith('vis-apt-') && !v.appointmentId?.startsWith('apt-')) {
        if (v.scheduledStartTime && !v.scheduledStartTime.startsWith(todayStr)) {
          const timePart = v.scheduledStartTime.split('T')[1] || '10:00:00.000Z';
          const endTimePart = v.scheduledEndTime ? v.scheduledEndTime.split('T')[1] || '11:00:00.000Z' : '11:00:00.000Z';
          visitsNeedUpdate = true;
          return {
            ...v,
            scheduledStartTime: `${todayStr}T${timePart}`,
            scheduledEndTime: `${todayStr}T${endTimePart}`,
            scheduledAt: `${todayStr}T${timePart}`,
          };
        }
      }
      return v;
    });

    // 2. Dynamic bidirectional sync: Ensure every appointment dynamically reflects in Reception Desk
    for (const apt of appointments) {
      if (!apt || !apt.id || apt.status === 'CANCELLED' || apt.status === 'REJECTED') continue;
      const existingVIdx = visits.findIndex(
        (v: any) => v.appointmentId === apt.id || v.referenceNo === apt.referenceNo || v.id === `vis-${apt.id}`,
      );

      const firstAtt = apt.attendees?.[0] || {};
      const vName = apt.requesterName || firstAtt.name || 'Requester';
      const vEmail = apt.requesterEmail || firstAtt.email || '';
      const vPhone = apt.requesterPhone || firstAtt.phone || '';
      const vOrg = apt.requesterOrganization || firstAtt.organization || 'Individual Requester';
      const pSize = Array.isArray(apt.attendees) && apt.attendees.length > 0 ? apt.attendees.length : (apt.partySize || 1);

      let vStatus: VisitStatus = VisitStatus.EXPECTED;
      if (apt.status === AppointmentStatus.CHECKED_IN) vStatus = VisitStatus.CHECKED_IN;
      else if (apt.status === AppointmentStatus.IN_PROGRESS) vStatus = VisitStatus.WITH_HOST;
      else if (apt.status === AppointmentStatus.COMPLETED || apt.status === AppointmentStatus.CLOSED) vStatus = VisitStatus.CHECKED_OUT;

      if (existingVIdx >= 0) {
        // Keep in sync with latest appointment updates
        const existing = visits[existingVIdx];
        if (
          existing.visitorName !== vName ||
          existing.phone !== vPhone ||
          existing.email !== vEmail ||
          existing.appointmentStatus !== apt.status ||
          existing.hostOfficialId !== apt.officialId
        ) {
          visits[existingVIdx] = {
            ...existing,
            visitorName: vName,
            phone: vPhone,
            email: vEmail,
            organization: vOrg,
            partySize: pSize,
            appointmentStatus: apt.status,
            hostOfficialId: apt.officialId,
            hostOfficialName: apt.officialName,
            officialName: apt.officialName,
            scheduledStartTime: apt.scheduledStartTime || existing.scheduledStartTime,
            scheduledEndTime: apt.scheduledEndTime || existing.scheduledEndTime,
            subject: apt.subject,
            purpose: apt.purpose,
            updatedAt: new Date().toISOString(),
          };
          visitsNeedUpdate = true;
        }
      } else {
        // Create corresponding Visit pass
        const qrTokenNum = (apt.referenceNo || '').split('-').pop() || String(Math.floor(10000 + Math.random() * 90000));
        const newV = {
          id: `vis-${apt.id}`,
          orgId: 'org-apex-main',
          appointmentId: apt.id,
          referenceNo: apt.referenceNo,
          qrToken: qrTokenNum,
          visitorName: vName,
          phone: vPhone,
          email: vEmail,
          organization: vOrg,
          idType: 'AADHAAR',
          idLast4: 'XXXX',
          vehicleNo: apt.vehicleNo || null,
          partySize: pSize,
          status: vStatus,
          appointmentStatus: apt.status,
          badgeNo: apt.badgeNo || null,
          badgeNumber: apt.badgeNo || null,
          hostOfficialId: apt.officialId,
          hostOfficialName: apt.officialName,
          officialName: apt.officialName,
          hostOfficialTitle: apt.officialTitle,
          scheduledStartTime: apt.scheduledStartTime || apt.createdAt || new Date().toISOString(),
          scheduledEndTime: apt.scheduledEndTime || new Date(Date.now() + 3600000).toISOString(),
          scheduledAt: apt.scheduledStartTime || apt.createdAt || new Date().toISOString(),
          roomName: apt.location || (apt.officialName ? `${apt.officialName}'s Chamber` : 'Main Secretariat'),
          building: 'Main Secretariat',
          floor: '1st Floor',
          subject: apt.subject,
          purpose: apt.purpose,
          createdAt: apt.createdAt || new Date().toISOString(),
          updatedAt: apt.updatedAt || apt.createdAt || new Date().toISOString(),
        };
        visits.unshift(newV);
        visitsNeedUpdate = true;
      }
    }

    if (visitsNeedUpdate) {
      setStorage('visits', visits);
    }

    const queryParams = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');

    // 6.1 Pass / QR Lookup (GET or POST)
    if (cleanUrl.endsWith('/lookup')) {
      const rawQuery = queryParams.get('query') || queryParams.get('qrToken') || body?.query || body?.qrToken || '';
      const q = rawQuery.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, '');

      if (!q) {
        return { matchType: 'NONE', visit: null, visits: [], total: 0 } as unknown as T;
      }

      const matched = visits.find((v: any) => {
        const ref = (v.referenceNo || '').toLowerCase();
        const refDigits = ref.replace(/\D/g, '');
        const token = (v.qrToken || '').toLowerCase();
        const name = (v.visitorName || '').toLowerCase();
        const phone = (v.phone || '').replace(/\D/g, '');
        const badge = (v.badgeNo || v.badgeNumber || '').toLowerCase();
        const org = (v.organization || '').toLowerCase();

        return (
          token === q ||
          ref === q ||
          ref.includes(q) ||
          (qDigits.length >= 3 && refDigits.includes(qDigits)) ||
          name.includes(q) ||
          (qDigits.length >= 4 && phone.includes(qDigits)) ||
          badge === q ||
          org.includes(q)
        );
      });

      let matchedVisit = matched;

      // If not in visits, check appointments for unapproved/pending ones
      if (!matchedVisit) {
        const appointments: any[] = getStorage('appointments', INITIAL_APPOINTMENTS);
        const apt = appointments.find((a: any) => {
          const ref = (a.referenceNo || '').toLowerCase();
          const refDigits = ref.replace(/\D/g, '');
          const token = refDigits.slice(-5);
          const name = (a.requesterName || '').toLowerCase();
          return (
            token === q ||
            ref === q ||
            ref.includes(q) ||
            (qDigits.length >= 3 && refDigits.includes(qDigits)) ||
            name.includes(q)
          );
        });

        if (apt) {
          matchedVisit = {
            id: `vis-temp-${apt.id}`,
            orgId: 'org-apex-main',
            appointmentId: apt.id,
            referenceNo: apt.referenceNo,
            qrToken: apt.referenceNo?.replace(/\D/g, '').slice(-5),
            visitorName: apt.requesterName || 'Unknown',
            phone: apt.requesterPhone || '',
            email: apt.requesterEmail || '',
            organization: apt.requesterOrganization || '',
            idType: 'AADHAAR',
            idLast4: 'XXXX',
            partySize: apt.partySize || 1,
            status: apt.status === AppointmentStatus.CONFIRMED ? VisitStatus.EXPECTED : (apt.status === AppointmentStatus.UNDER_REVIEW ? 'PENDING_APPROVAL' : apt.status),
            hostOfficialId: apt.officialId,
            hostOfficialName: apt.officialName || 'Official',
            hostOfficialTitle: apt.officialTitle || 'Official',
            scheduledStartTime: apt.scheduledStartTime || apt.proposedDate || new Date().toISOString(),
            scheduledEndTime: apt.scheduledEndTime || new Date(Date.now() + 3600000).toISOString(),
            scheduledAt: apt.scheduledStartTime || apt.proposedDate || new Date().toISOString(),
            roomName: apt.roomId || 'TBD',
            subject: apt.subject,
            purpose: apt.purpose,
            createdAt: apt.createdAt || new Date().toISOString(),
            updatedAt: apt.updatedAt || new Date().toISOString(),
          };

          if (!visits.some((v: any) => v.id === matchedVisit.id || v.referenceNo === matchedVisit.referenceNo)) {
            visits.unshift(matchedVisit);
            setStorage('visits', visits);
          }
        }
      }

      const res: any = {
        matchType: matchedVisit ? (q === matchedVisit.qrToken?.toLowerCase() ? 'QR' : 'SEARCH') : 'NONE',
        visit: matchedVisit || null,
        visits: matchedVisit ? [matchedVisit] : [],
        total: matchedVisit ? 1 : 0,
      };
      if (matchedVisit) {
        res[0] = matchedVisit;
        res.length = 1;
      }
      return res as unknown as T;
    }

    // 6.2 Emergency Evacuation Visitor Roster
    if (cleanUrl.endsWith('/emergency-list')) {
      const inBuilding = visits.filter(
        (v: any) => v.status === VisitStatus.CHECKED_IN || v.status === VisitStatus.WITH_HOST,
      );
      const groups = [
        {
          building: 'Main Secretariat',
          floor: '1st Floor',
          count: inBuilding.filter(
            (v: any) =>
              (v.building === 'Main Secretariat' || !v.building) &&
              (v.floor === '1st Floor' || !v.floor),
          ).length,
          visitors: inBuilding.filter(
            (v: any) =>
              (v.building === 'Main Secretariat' || !v.building) &&
              (v.floor === '1st Floor' || !v.floor),
          ),
        },
        {
          building: 'Main Secretariat',
          floor: '2nd Floor',
          count: inBuilding.filter(
            (v: any) => v.building === 'Main Secretariat' && v.floor === '2nd Floor',
          ).length,
          visitors: inBuilding.filter(
            (v: any) => v.building === 'Main Secretariat' && v.floor === '2nd Floor',
          ),
        },
        {
          building: 'Administration Wing',
          floor: '1st Floor',
          count: inBuilding.filter((v: any) => v.building === 'Administration Wing').length,
          visitors: inBuilding.filter((v: any) => v.building === 'Administration Wing'),
        },
      ].filter((g) => g.count > 0);

      const resObj: any = {
        groups,
        totalCount: inBuilding.length,
      };
      groups.forEach((g: any, i: number) => {
        resObj[i] = g;
      });
      resObj.length = groups.length;
      return resObj as unknown as T;
    }

    // 6.3 Register Walk-In Visitor
    if (cleanUrl.endsWith('/walk-in') && method === 'POST') {
      const offId = body?.officialId || 'off-1';
      const off = officials.find((o: any) => o.id === offId) || officials[0];
      const newRef = `OAMS-2026-${Math.floor(10000 + Math.random() * 90000)}`;
      const newVisit = {
        id: `vis-${Date.now()}`,
        orgId: 'org-apex-main',
        appointmentId: `apt-walkin-${Date.now()}`,
        referenceNo: newRef,
        qrToken: newRef.replace('OAMS-2026-', ''),
        visitorName: body?.visitorName || 'Walk-in Visitor',
        phone: body?.phone || '',
        email: body?.email || null,
        organization: body?.organization || 'Walk-in Visitor',
        idType: body?.idType || 'AADHAAR',
        idLast4: body?.idLast4 || null,
        vehicleNo: body?.vehicleNo || null,
        partySize: Number(body?.partySize) || 1,
        status: VisitStatus.ARRIVED,
        badgeNo: null,
        badgeNumber: null,
        arrivedAt: new Date().toISOString(),
        hostOfficialId: off.id,
        hostOfficialName: off.fullName || off.full_name || 'Mr. KVK',
        officialName: off.fullName || off.full_name || 'Mr. KVK',
        hostOfficialTitle: off.title || 'Official',
        scheduledStartTime: new Date().toISOString(),
        scheduledEndTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        scheduledAt: new Date().toISOString(),
        roomName: 'Lobby Security Desk / Chamber 101',
        building: 'Main Secretariat',
        floor: 'Ground Floor',
        subject: body?.purpose || 'Walk-in Engagement',
        purpose: body?.purpose || 'Walk-in Engagement',
        purposeCategory: body?.purposeCategory || 'OTHER',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      visits.unshift(newVisit);
      setStorage('visits', visits);

      // In-app alert
      try {
        const notifs: any[] = getStorage('notifications', INITIAL_NOTIFICATIONS);
        notifs.unshift({
          id: `notif-${Date.now()}`,
          userId: newVisit.hostOfficialId || 'usr-admin-1',
          officialId: newVisit.hostOfficialId || null,
          targetRoles: [RoleCode.RECEPTION, RoleCode.SECURITY, RoleCode.FACULTY, RoleCode.STAFF, RoleCode.ADMIN, 'RECEPTIONIST', 'OFFICIAL', 'EA_PA'],
          type: 'security_alert',
          eventType: 'WALK_IN_REGISTERED',
          title: `Gate Alert: Walk-in Arrival (${newVisit.visitorName})`,
          message: `Walk-in visitor registered at Main Gate for ${newVisit.hostOfficialName}.`,
          body: `Walk-in visitor registered at Main Gate for ${newVisit.hostOfficialName}.`,
          link: '/app/reception',
          priority: Priority.MEDIUM,
          entityType: 'VISIT',
          entityId: newVisit.id,
          isRead: false,
          readAt: null,
          createdAt: new Date().toISOString(),
        });
        setStorage('notifications', notifs);
      } catch {}

      return newVisit as unknown as T;
    }

    // 6.4 Transition: Mark Arrived at Gate
    if (cleanUrl.endsWith('/arrive') && method === 'POST') {
      const parts = cleanUrl.split('/');
      const visitId = parts[parts.length - 2];
      const idx = visits.findIndex((v: any) => v.id === visitId || v.appointmentId === visitId || v.referenceNo === visitId);
      if (idx >= 0) {
        visits[idx].status = VisitStatus.ARRIVED;
        visits[idx].arrivedAt = new Date().toISOString();
        visits[idx].updatedAt = new Date().toISOString();
        setStorage('visits', visits);
        return visits[idx] as unknown as T;
      }
      return { success: true } as unknown as T;
    }

    // 6.5 Transition: Check In & Issue Badge
    if (cleanUrl.endsWith('/check-in') && method === 'POST') {
      const parts = cleanUrl.split('/');
      const visitId = parts[parts.length - 2];
      const idx = visits.findIndex((v: any) => v.id === visitId || v.appointmentId === visitId || v.referenceNo === visitId);
      if (idx >= 0) {
        const badge = body?.badgeNo || `B-${Math.floor(100 + Math.random() * 900)}`;
        visits[idx].status = VisitStatus.CHECKED_IN;
        visits[idx].badgeNo = badge;
        visits[idx].badgeNumber = badge;
        if (body?.idType) visits[idx].idType = body.idType;
        if (body?.idLast4) visits[idx].idLast4 = body.idLast4;
        if (body?.vehicleNo) visits[idx].vehicleNo = body.vehicleNo;
        visits[idx].checkedInAt = new Date().toISOString();
        visits[idx].waitingMinutes = 0;
        setStorage('visits', visits);

        // Also synchronize linked appointment status to CHECKED_IN
        try {
          const apts: any[] = getStorage('appointments', INITIAL_APPOINTMENTS);
          const aptIdx = apts.findIndex(
            (a: any) =>
              a.id === visits[idx].appointmentId ||
              a.referenceNo === visits[idx].referenceNo ||
              a.id === visitId,
          );
          if (aptIdx >= 0) {
            apts[aptIdx].status = AppointmentStatus.CHECKED_IN;
            apts[aptIdx].checkedInAt = new Date().toISOString();
            apts[aptIdx].statusChangedAt = new Date().toISOString();
            setStorage('appointments', apts);
          }
        } catch {}

        // In-app alert
        try {
          const notifs: any[] = getStorage('notifications', INITIAL_NOTIFICATIONS);
          notifs.unshift({
            id: `notif-${Date.now()}`,
            userId: visits[idx].hostOfficialId || 'usr-admin-1',
            officialId: visits[idx].hostOfficialId || null,
            targetRoles: [RoleCode.RECEPTION, RoleCode.SECURITY, RoleCode.FACULTY, RoleCode.STAFF, 'RECEPTIONIST', 'OFFICIAL', 'EA_PA'],
            type: 'appointment_confirmed',
            eventType: 'VISIT_CHECKED_IN',
            title: `Visitor Checked In: Badge ${badge}`,
            message: `${visits[idx].visitorName} checked in. Waiting in Lobby for ${visits[idx].hostOfficialName}.`,
            body: `${visits[idx].visitorName} checked in. Waiting in Lobby for ${visits[idx].hostOfficialName}.`,
            link: '/app/reception',
            priority: Priority.HIGH,
            entityType: 'VISIT',
            entityId: visits[idx].id,
            isRead: false,
            readAt: null,
            createdAt: new Date().toISOString(),
          });
          setStorage('notifications', notifs);
        } catch {}

        return visits[idx] as unknown as T;
      }
      return { success: true } as unknown as T;
    }

    // 6.6 Transition: Call In / With Host
    if (cleanUrl.endsWith('/with-host') && method === 'POST') {
      const parts = cleanUrl.split('/');
      const visitId = parts[parts.length - 2];
      const idx = visits.findIndex((v: any) => v.id === visitId || v.appointmentId === visitId || v.referenceNo === visitId);
      if (idx >= 0) {
        visits[idx].status = VisitStatus.WITH_HOST;
        visits[idx].withHostAt = new Date().toISOString();
        visits[idx].updatedAt = new Date().toISOString();
        setStorage('visits', visits);
        return visits[idx] as unknown as T;
      }
      return { success: true } as unknown as T;
    }

    // 6.7 Transition: Check Out / Depart
    if (cleanUrl.endsWith('/check-out') && method === 'POST') {
      const parts = cleanUrl.split('/');
      const visitId = parts[parts.length - 2];
      const idx = visits.findIndex((v: any) => v.id === visitId || v.appointmentId === visitId || v.referenceNo === visitId);
      if (idx >= 0) {
        visits[idx].status = VisitStatus.CHECKED_OUT;
        visits[idx].checkedOutAt = new Date().toISOString();
        visits[idx].updatedAt = new Date().toISOString();
        setStorage('visits', visits);
        return visits[idx] as unknown as T;
      }
      return { success: true } as unknown as T;
    }

    // 6.8 Transition: Deny Entry
    if (cleanUrl.endsWith('/deny') && method === 'POST') {
      const parts = cleanUrl.split('/');
      const visitId = parts[parts.length - 2];
      const idx = visits.findIndex((v: any) => v.id === visitId || v.appointmentId === visitId || v.referenceNo === visitId);
      if (idx >= 0) {
        visits[idx].status = VisitStatus.DENIED;
        visits[idx].deniedReason = body?.reason || 'Denied by gate protocol';
        visits[idx].updatedAt = new Date().toISOString();
        setStorage('visits', visits);
        return visits[idx] as unknown as T;
      }
      return { success: true } as unknown as T;
    }

    // 6.9 Single Visit Detail by ID
    const pathParts = cleanUrl.split('/');
    const lastSeg = pathParts[pathParts.length - 1];
    if (lastSeg && lastSeg !== 'visits' && lastSeg !== 'security' && lastSeg !== 'reception') {
      const single = visits.find((v: any) => v.id === lastSeg || v.appointmentId === lastSeg || v.referenceNo === lastSeg);
      if (single) return single as unknown as T;
    }

    // 6.10 List Visits (with date, officialId, requester, search filters)
    const dateParam = queryParams.get('date');
    let officialIdParam = queryParams.get('officialId');
    const requesterParam = queryParams.get('requester')?.toLowerCase().trim();
    const searchParam = queryParams.get('search')?.toLowerCase().trim();

    // Contextual auth user detection
    const tokenStr = typeof localStorage !== 'undefined' ? (localStorage.getItem('oams_token') || sessionStorage.getItem('oams_token') || '') : '';
    const personaId = tokenStr.replace('demo-token-', '');
    let authUser: any = null;
    if (personaId) {
      authUser = Object.values(DEMO_PERSONAS).find((p: any) => p.id === personaId);
      if (!authUser) {
        const storedUsers = getStorage('users', INITIAL_USERS);
        authUser = storedUsers.find((u: any) => u.id === personaId);
      }
    }
    if (!authUser && typeof localStorage !== 'undefined') {
      try {
        const u = localStorage.getItem('oams_user') || sessionStorage.getItem('oams_user');
        if (u) authUser = JSON.parse(u);
      } catch {}
    }

    const isGlobalReceptionSecurity = authUser && (
      authUser.roles?.includes('RECEPTION') ||
      authUser.roles?.includes('SECURITY') ||
      authUser.roles?.includes('SUPER_ADMIN')
    );

    if (!officialIdParam && authUser && !isGlobalReceptionSecurity) {
      if (authUser.officialId) {
        officialIdParam = authUser.officialId;
      }
    }

    let filtered = [...visits];
    if (officialIdParam) {
      filtered = filtered.filter(
        (v: any) => v.hostOfficialId === officialIdParam || v.officialId === officialIdParam,
      );
    } else if (authUser?.assignedOfficialIds && authUser.assignedOfficialIds.length > 0 && !isGlobalReceptionSecurity) {
      filtered = filtered.filter(
        (v: any) => authUser.assignedOfficialIds.includes(v.hostOfficialId) || authUser.assignedOfficialIds.includes(v.officialId),
      );
    } else if (
      authUser &&
      !isGlobalReceptionSecurity &&
      !authUser.officialId &&
      (authUser.roles?.includes('GUEST') ||
        authUser.roles?.includes('CITIZEN') ||
        authUser.roles?.includes('STUDENT') ||
        !authUser.roles?.some((r: any) =>
          ['ADMIN', 'SUPER_ADMIN', 'APPOINTMENT_ADMIN', 'STAFF', 'PA', 'EA', 'FACULTY', 'OFFICIAL', 'RECEPTION', 'SECURITY'].includes(r),
        ))
    ) {
      // Citizen: only their own visit pass
      filtered = filtered.filter((v: any) => {
        const email = (v.email || '').toLowerCase();
        const userEmail = (authUser.email || '').toLowerCase();
        const name = (v.visitorName || '').toLowerCase();
        const userName = (authUser.fullName || '').toLowerCase();
        return (userEmail && email === userEmail) || (userName && name.includes(userName));
      });
    }
    if (requesterParam) {
      filtered = filtered.filter((v: any) => {
        const email = (v.email || '').toLowerCase();
        const name = (v.visitorName || '').toLowerCase();
        return email === requesterParam || name.includes(requesterParam);
      });
    }
    if (searchParam) {
      filtered = filtered.filter((v: any) => {
        const name = (v.visitorName || '').toLowerCase();
        const org = (v.organization || '').toLowerCase();
        const ref = (v.referenceNo || '').toLowerCase();
        const badge = (v.badgeNo || v.badgeNumber || '').toLowerCase();
        const host = (v.hostOfficialName || v.officialName || '').toLowerCase();
        const phone = v.phone || '';
        return (
          name.includes(searchParam) ||
          org.includes(searchParam) ||
          ref.includes(searchParam) ||
          badge.includes(searchParam) ||
          host.includes(searchParam) ||
          phone.includes(searchParam)
        );
      });
    }
    if (dateParam && dateParam !== 'ALL') {
      filtered = filtered.filter((v: any) => {
        if (v.status === VisitStatus.CHECKED_IN || v.status === VisitStatus.ARRIVED) return true;
        const schedUtc = (v.scheduledStartTime || v.scheduledAt || '').split('T')[0];
        const createdUtc = (v.createdAt || '').split('T')[0];
        const arrivedUtc = (v.arrivedAt || '').split('T')[0];

        let schedLocal = '';
        if (v.scheduledStartTime || v.scheduledAt) {
          try {
            schedLocal = new Date(v.scheduledStartTime || v.scheduledAt).toLocaleDateString('en-CA');
          } catch {}
        }
        let createdLocal = '';
        if (v.createdAt) {
          try {
            createdLocal = new Date(v.createdAt).toLocaleDateString('en-CA');
          } catch {}
        }

        return (
          schedUtc === dateParam ||
          createdUtc === dateParam ||
          arrivedUtc === dateParam ||
          schedLocal === dateParam ||
          createdLocal === dateParam
        );
      });
    }

    // Return hybrid Array + Object with .visits and .total
    const resList: any = [...filtered];
    resList.visits = filtered;
    resList.total = filtered.length;
    return resList as unknown as T;
  }

  // 6.5 Scheduling Engine & Conflict Evaluation
  if (cleanUrl.includes('/scheduling/slots')) {
    const today = new Date();
    const todayIso = today.toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const tomorrowIso = tomorrow.toISOString().split('T')[0];

    const durationMin = body?.durationMin || 30;

    return [
      {
        start: `${todayIso}T14:30:00.000Z`,
        end: new Date(new Date(`${todayIso}T14:30:00.000Z`).getTime() + durationMin * 60000).toISOString(),
        score: 98,
        officialId: body?.officialIds?.[0]?.id || 'off-1',
        roomId: 'room-1',
        roomName: 'Chamber 101 (Executive Suite)',
        conflicts: [],
      },
      {
        start: `${todayIso}T16:00:00.000Z`,
        end: new Date(new Date(`${todayIso}T16:00:00.000Z`).getTime() + durationMin * 60000).toISOString(),
        score: 92,
        officialId: body?.officialIds?.[0]?.id || 'off-1',
        roomId: 'room-2',
        roomName: 'Conference Room Alpha',
        conflicts: [],
      },
      {
        start: `${tomorrowIso}T10:30:00.000Z`,
        end: new Date(new Date(`${tomorrowIso}T10:30:00.000Z`).getTime() + durationMin * 60000).toISOString(),
        score: 95,
        officialId: body?.officialIds?.[0]?.id || 'off-1',
        roomId: 'room-1',
        roomName: 'Chamber 101 (Executive Suite)',
        conflicts: [],
      },
      {
        start: `${tomorrowIso}T11:45:00.000Z`,
        end: new Date(new Date(`${tomorrowIso}T11:45:00.000Z`).getTime() + durationMin * 60000).toISOString(),
        score: 89,
        officialId: body?.officialIds?.[0]?.id || 'off-1',
        roomId: 'room-3',
        roomName: 'Committee Room 4',
        conflicts: [],
      },
      {
        start: `${tomorrowIso}T15:00:00.000Z`,
        end: new Date(new Date(`${tomorrowIso}T15:00:00.000Z`).getTime() + durationMin * 60000).toISOString(),
        score: 86,
        officialId: body?.officialIds?.[0]?.id || 'off-1',
        roomId: 'room-2',
        roomName: 'Conference Room Alpha',
        conflicts: [],
      },
    ] as unknown as T;
  }

  if (cleanUrl.includes('/scheduling/check')) {
    return {
      bookable: true,
      isValid: true,
      hasConflicts: false,
      conflicts: [],
    } as unknown as T;
  }

  // 7. Calendar Events & Slots
  if (cleanUrl.includes('/calendar-events') || cleanUrl.includes('/calendar')) {
    const defaultBlocks: any[] = [
      // off-6: Mr. Janardhan (Vice Principal / Admin)
      {
        id: 'cal-block-601',
        calendarId: 'cal-org-1',
        calendarType: 'ORG',
        officialId: 'off-6',
        kind: 'MEETING',
        blockStrength: 'HARD',
        title: 'Academic Time-Table & Classroom Allocation Sync',
        subject: 'Academic Time-Table & Classroom Allocation Sync',
        description: 'Coordination sync with department chairs on lecture hall allocations.',
        location: 'Conference Room Alpha',
        startAt: '2026-09-28T14:00:00.000Z',
        endAt: '2026-09-28T15:30:00.000Z',
        allDay: false,
        visibility: 'INTERNAL',
        appointmentId: null,
        referenceNo: 'MTG-2026-0601',
        requesterName: 'Academic Directorate',
        roomId: 'room-2',
        roomName: 'Conference Room Alpha',
        status: 'CONFIRMED',
        isMasked: false,
      },
      {
        id: 'cal-block-602',
        calendarId: 'cal-org-1',
        calendarType: 'ORG',
        officialId: 'off-6',
        kind: 'SOFT_BLOCK',
        blockStrength: 'SOFT',
        title: 'Protected File & Compliance Review',
        subject: 'Protected File & Compliance Review',
        description: 'Dedicated time for institutional document clearance.',
        location: 'Admin Wing Conference',
        startAt: '2026-09-29T15:00:00.000Z',
        endAt: '2026-09-29T16:00:00.000Z',
        allDay: false,
        visibility: 'INTERNAL',
        appointmentId: null,
        referenceNo: 'BLK-2026-0602',
        requesterName: 'Vice Principal Secretariat',
        roomId: 'room-3',
        roomName: 'Admin Wing Conference',
        status: 'CONFIRMED',
        isMasked: false,
      },
      {
        id: 'cal-block-603',
        calendarId: 'cal-org-1',
        calendarType: 'ORG',
        officialId: 'off-6',
        kind: 'MEETING',
        blockStrength: 'HARD',
        title: 'Campus Protocol & Access Check',
        subject: 'Campus Protocol & Access Check',
        description: 'Mid-week operational review of gate registers and access logs.',
        location: 'Admin Wing Conference',
        startAt: '2026-09-30T14:00:00.000Z',
        endAt: '2026-09-30T15:00:00.000Z',
        allDay: false,
        visibility: 'INTERNAL',
        appointmentId: null,
        referenceNo: 'MTG-2026-0603',
        requesterName: 'Security Administration',
        roomId: 'room-3',
        roomName: 'Admin Wing Conference',
        status: 'CONFIRMED',
        isMasked: false,
      },
      {
        id: 'cal-block-604',
        calendarId: 'cal-org-1',
        calendarType: 'ORG',
        officialId: 'off-6',
        kind: 'MEETING',
        blockStrength: 'HARD',
        title: 'Staff Coordination Sync',
        subject: 'Staff Coordination Sync',
        description: 'Weekly review of institutional milestones and operational requisitions.',
        location: 'Conference Room Alpha',
        startAt: '2026-10-01T12:00:00.000Z',
        endAt: '2026-10-01T12:45:00.000Z',
        allDay: false,
        visibility: 'INTERNAL',
        appointmentId: null,
        referenceNo: 'MTG-2026-0604',
        requesterName: 'Dean of Academics',
        roomId: 'room-2',
        roomName: 'Conference Room Alpha',
        status: 'CONFIRMED',
        isMasked: false,
      },
      {
        id: 'cal-block-605',
        calendarId: 'cal-org-1',
        calendarType: 'ORG',
        officialId: 'off-6',
        kind: 'MEETING',
        blockStrength: 'HARD',
        title: 'Administrative Staff Welfare Review',
        subject: 'Administrative Staff Welfare Review',
        description: 'Monthly welfare and non-teaching staff operations meeting.',
        location: 'Admin Wing Conference',
        startAt: '2026-10-02T14:30:00.000Z',
        endAt: '2026-10-02T15:30:00.000Z',
        allDay: false,
        visibility: 'INTERNAL',
        appointmentId: null,
        referenceNo: 'MTG-2026-0605',
        requesterName: 'Staff Committee',
        roomId: 'room-3',
        roomName: 'Admin Wing Conference',
        status: 'CONFIRMED',
        isMasked: false,
      },

      // off-1: Mr. KVK (Chairman / Founder)
      {
        id: 'cal-block-101',
        calendarId: 'cal-org-1',
        calendarType: 'ORG',
        officialId: 'off-1',
        kind: 'MEETING',
        blockStrength: 'HARD',
        title: 'Executive Leadership Governance Sync',
        subject: 'Executive Leadership Governance Sync',
        description: 'Weekly governance and institutional strategic priorities with executive leadership.',
        location: 'Chamber 101 (Executive Suite)',
        startAt: '2026-09-28T09:30:00.000Z',
        endAt: '2026-09-28T10:30:00.000Z',
        allDay: false,
        visibility: 'INTERNAL',
        appointmentId: null,
        referenceNo: 'MTG-2026-0101',
        requesterName: 'Chairman Secretariat',
        roomId: 'room-1',
        roomName: 'Chamber 101 (Executive Suite)',
        status: 'CONFIRMED',
        isMasked: false,
      },
      {
        id: 'cal-block-102',
        calendarId: 'cal-org-1',
        calendarType: 'ORG',
        officialId: 'off-1',
        kind: 'MEETING',
        blockStrength: 'HARD',
        title: 'Governing Body Assembly Planning',
        subject: 'Governing Body Assembly Planning',
        description: 'Preparation for upcoming institutional governing board session.',
        location: 'Chamber 101',
        startAt: '2026-09-29T10:00:00.000Z',
        endAt: '2026-09-29T11:30:00.000Z',
        allDay: false,
        visibility: 'INTERNAL',
        appointmentId: null,
        referenceNo: 'MTG-2026-0102',
        requesterName: 'Governing Board Secretariat',
        roomId: 'room-1',
        roomName: 'Chamber 101 (Executive Suite)',
        status: 'CONFIRMED',
        isMasked: false,
      },
      {
        id: 'cal-block-103',
        calendarId: 'cal-org-1',
        calendarType: 'ORG',
        officialId: 'off-1',
        kind: 'TRAVEL',
        blockStrength: 'HARD',
        title: 'Regional Campus Inspection — Vijayawada',
        subject: 'Regional Campus Inspection — Vijayawada',
        description: 'Official transit to regional branch for campus infrastructure audit.',
        location: 'Vijayawada Campus',
        startAt: '2026-09-30T09:00:00.000Z',
        endAt: '2026-09-30T12:00:00.000Z',
        allDay: false,
        visibility: 'INTERNAL',
        appointmentId: null,
        referenceNo: 'TRV-2026-0103',
        requesterName: 'Chairman Secretariat',
        roomId: null,
        status: 'CONFIRMED',
        isMasked: false,
      },
      {
        id: 'cal-block-104',
        calendarId: 'cal-per-1',
        calendarType: 'PERSONAL',
        officialId: 'off-1',
        kind: 'BUSY',
        blockStrength: 'HARD',
        title: 'Private Executive Block',
        subject: 'Private Executive Block',
        description: 'Confidential file review and executive focus.',
        location: 'Chamber 101',
        startAt: '2026-10-01T14:00:00.000Z',
        endAt: '2026-10-01T15:00:00.000Z',
        allDay: false,
        visibility: 'PRIVATE',
        appointmentId: null,
        referenceNo: 'BLK-2026-0104',
        requesterName: 'Chairman Secretariat',
        roomId: null,
        status: 'CONFIRMED',
        isMasked: true,
      },
      {
        id: 'cal-block-105',
        calendarId: 'cal-org-1',
        calendarType: 'ORG',
        officialId: 'off-1',
        kind: 'MEETING',
        blockStrength: 'HARD',
        title: 'Board of Trustees Quarterly Finance Review',
        subject: 'Board of Trustees Quarterly Finance Review',
        description: 'Finance controller alignment and capital expenditure review.',
        location: 'Chamber 101',
        startAt: '2026-10-02T15:00:00.000Z',
        endAt: '2026-10-02T16:30:00.000Z',
        allDay: false,
        visibility: 'INTERNAL',
        appointmentId: null,
        referenceNo: 'MTG-2026-0105',
        requesterName: 'Board Secretariat',
        roomId: 'room-1',
        roomName: 'Chamber 101 (Executive Suite)',
        status: 'CONFIRMED',
        isMasked: false,
      },

      // off-2: Mr. Harsha Rao (CEO)
      {
        id: 'cal-block-201',
        calendarId: 'cal-org-1',
        calendarType: 'ORG',
        officialId: 'off-2',
        kind: 'MEETING',
        blockStrength: 'HARD',
        title: 'Institutional Operations Weekly Kickoff',
        subject: 'Institutional Operations Weekly Kickoff',
        description: 'Operations review and cross-departmental sprint planning.',
        location: 'Conference Room Alpha',
        startAt: '2026-09-28T10:00:00.000Z',
        endAt: '2026-09-28T11:00:00.000Z',
        allDay: false,
        visibility: 'INTERNAL',
        appointmentId: null,
        referenceNo: 'MTG-2026-0201',
        requesterName: 'CEO Office',
        roomId: 'room-2',
        roomName: 'Conference Room Alpha',
        status: 'CONFIRMED',
        isMasked: false,
      },
      {
        id: 'cal-block-202',
        calendarId: 'cal-org-1',
        calendarType: 'ORG',
        officialId: 'off-2',
        kind: 'MEETING',
        blockStrength: 'HARD',
        title: 'Campus Infrastructure Expansion Tender Review',
        subject: 'Campus Infrastructure Expansion Tender Review',
        description: 'Evaluation of Phase-3 lab construction bids.',
        location: 'Chamber 101',
        startAt: '2026-09-30T14:00:00.000Z',
        endAt: '2026-09-30T15:00:00.000Z',
        allDay: false,
        visibility: 'INTERNAL',
        appointmentId: null,
        referenceNo: 'MTG-2026-0202',
        requesterName: 'Chief Engineer',
        roomId: 'room-1',
        roomName: 'Chamber 101 (Executive Suite)',
        status: 'CONFIRMED',
        isMasked: false,
      },
      {
        id: 'cal-block-203',
        calendarId: 'cal-org-1',
        calendarType: 'ORG',
        officialId: 'off-2',
        kind: 'MEETING',
        blockStrength: 'HARD',
        title: 'Placement Briefing & Recruiter Relations',
        subject: 'Placement Briefing & Recruiter Relations',
        description: 'Strategy session for upcoming autumn placement season.',
        location: 'Conference Room Alpha',
        startAt: '2026-10-01T15:00:00.000Z',
        endAt: '2026-10-01T16:00:00.000Z',
        allDay: false,
        visibility: 'INTERNAL',
        appointmentId: null,
        referenceNo: 'MTG-2026-0203',
        requesterName: 'Placement Director',
        roomId: 'room-2',
        roomName: 'Conference Room Alpha',
        status: 'CONFIRMED',
        isMasked: false,
      },
      {
        id: 'cal-block-204',
        calendarId: 'cal-org-1',
        calendarType: 'ORG',
        officialId: 'off-2',
        kind: 'MEETING',
        blockStrength: 'HARD',
        title: 'Higher Education Council Accreditation Review',
        subject: 'Higher Education Council Accreditation Review',
        description: 'Compliance verification with council norms and academic guidelines.',
        location: 'Conference Room Alpha',
        startAt: '2026-10-02T10:00:00.000Z',
        endAt: '2026-10-02T11:00:00.000Z',
        allDay: false,
        visibility: 'INTERNAL',
        appointmentId: null,
        referenceNo: 'MTG-2026-0204',
        requesterName: 'Accreditation Head',
        roomId: 'room-2',
        roomName: 'Conference Room Alpha',
        status: 'CONFIRMED',
        isMasked: false,
      },
    ];

    const calendarBlocks: any[] = getStorage('calendar_events', defaultBlocks);
    const appointments: any[] = getStorage('appointments', INITIAL_APPOINTMENTS);

    if (method === 'POST') {
      const newCalEvt = {
        id: `cal-evt-${Date.now()}`,
        calendarId: body?.calendarType === 'PERSONAL' ? 'cal-per-1' : 'cal-org-1',
        calendarType: body?.calendarType || 'ORG',
        officialId: body?.officialId || 'off-1',
        kind: body?.kind || 'MEETING',
        blockStrength: body?.blockStrength || 'HARD',
        title: body?.title || body?.subject || 'New Scheduled Block',
        subject: body?.subject || body?.title || 'New Scheduled Block',
        description: body?.description || '',
        location: body?.location || 'Chamber 101',
        startAt: body?.startAt || new Date().toISOString(),
        endAt: body?.endAt || new Date(Date.now() + 3600000).toISOString(),
        allDay: !!body?.allDay,
        visibility: body?.visibility || 'INTERNAL',
        appointmentId: body?.appointmentId || null,
        referenceNo: body?.referenceNo || `BLK-${Date.now()}`,
        requesterName: body?.requesterName || 'Institutional Staff',
        roomId: body?.roomId || null,
        roomName: body?.roomName || body?.location || 'Chamber 101',
        status: 'CONFIRMED',
        isMasked: !!body?.isMasked,
      };
      calendarBlocks.push(newCalEvt);
      setStorage('calendar_events', calendarBlocks);
      return newCalEvt as unknown as T;
    }

    if (method === 'PATCH') {
      const parts = cleanUrl.split('/');
      const evtId = parts[parts.length - 1];
      const idx = calendarBlocks.findIndex((e) => e.id === evtId);
      if (idx >= 0) {
        calendarBlocks[idx] = { ...calendarBlocks[idx], ...body };
        setStorage('calendar_events', calendarBlocks);
        return calendarBlocks[idx] as unknown as T;
      }
    }

    // Dynamic Synthesis & Deduplication
    const unifiedEvents: any[] = [];
    const seenAptIds = new Set<string>();
    const seenRefNos = new Set<string>();
    const seenSlots = new Set<string>();

    // 1. Map all appointments dynamically
    appointments.forEach((apt: any) => {
      const startIso = apt.scheduledStartTime || apt.startAt || (apt.preferredWindows?.[0]?.date && apt.preferredWindows?.[0]?.from ? `${apt.preferredWindows[0].date}T${apt.preferredWindows[0].from}:00.000Z` : null);
      const endIso = apt.scheduledEndTime || apt.endAt || (apt.preferredWindows?.[0]?.date && apt.preferredWindows?.[0]?.to ? `${apt.preferredWindows[0].date}T${apt.preferredWindows[0].to}:00.000Z` : null);

      if (!startIso) return;
      if (seenAptIds.has(apt.id)) return;
      if (apt.referenceNo && seenRefNos.has(apt.referenceNo)) return;

      const offId = apt.officialId || apt.official?.id || 'off-1';
      const slotKey = `${offId}_${startIso}_${(apt.subject || '').trim().toLowerCase()}`;
      if (seenSlots.has(slotKey)) return;

      seenAptIds.add(apt.id);
      if (apt.referenceNo) seenRefNos.add(apt.referenceNo);
      seenSlots.add(slotKey);

      unifiedEvents.push({
        id: `cal-apt-${apt.id}`,
        calendarId: 'cal-org-1',
        calendarType: 'ORG',
        officialId: offId,
        kind: apt.status === 'UNDER_REVIEW' ? 'HOLD' : 'APPOINTMENT',
        blockStrength: 'HARD',
        title: apt.subject,
        subject: apt.subject,
        description: apt.description || '',
        location: apt.room?.name || apt.location || 'Assigned Location',
        roomName: apt.room?.name || apt.location || undefined,
        roomId: apt.roomId || apt.room?.id || undefined,
        startAt: startIso,
        endAt: endIso || new Date(new Date(startIso).getTime() + (apt.durationMin || 30) * 60000).toISOString(),
        allDay: false,
        visibility: 'INTERNAL',
        appointmentId: apt.id,
        referenceNo: apt.referenceNo,
        requesterName: apt.requesterName || apt.attendees?.[0]?.name || 'Citizen Requester',
        status: apt.status || 'CONFIRMED',
        isMasked: false,
      });
    });

    // 2. Add non-appointment calendar blocks
    calendarBlocks.forEach((cb: any) => {
      if (cb.appointmentId && seenAptIds.has(cb.appointmentId)) return;
      if (cb.referenceNo && seenRefNos.has(cb.referenceNo)) return;

      const slotKey = `${cb.officialId || ''}_${cb.startAt}_${(cb.title || cb.subject || '').trim().toLowerCase()}`;
      if (seenSlots.has(slotKey)) return;

      if (cb.appointmentId) seenAptIds.add(cb.appointmentId);
      if (cb.referenceNo) seenRefNos.add(cb.referenceNo);
      seenSlots.add(slotKey);

      unifiedEvents.push(cb);
    });

    // Filter by query parameters
    const queryParams = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
    const officialIdParam = queryParams.get('officialId');
    const startDateParam = queryParams.get('startDate') || queryParams.get('start');
    const endDateParam = queryParams.get('endDate') || queryParams.get('end');

    let filtered = [...unifiedEvents];

    if (officialIdParam) {
      filtered = filtered.filter((e) => e.officialId === officialIdParam);
    }

    if (startDateParam) {
      const startDay = startDateParam.split('T')[0];
      const endDay = (endDateParam || startDateParam).split('T')[0];
      filtered = filtered.filter((e) => {
        const eDay = (e.startAt || e.scheduledStartTime || '').split('T')[0];
        if (!eDay) return true;
        return eDay >= startDay && eDay <= endDay;
      });
    }

    // Return hybrid Array + Object with .appointments and .events
    const resArr: any = [...filtered];
    resArr.appointments = filtered;
    resArr.events = filtered;
    resArr.total = filtered.length;
    return resArr as unknown as T;
  }

  // 8. Reports & Analytics
  if (cleanUrl.includes('/reports/overview')) {
    const overview = getStorage('reports_overview', DEFAULT_REPORTS_OVERVIEW);
    return overview as unknown as T;
  }
  if (cleanUrl.includes('/reports/export')) {
    const csvContent =
      'Date,ReferenceNo,Subject,Official,Status,Priority,DurationMin\n' +
      '2026-09-24,OAMS-2026-00412,Review of Campus Extension Corridor 3,Mr. KVK,CONFIRMED,HIGH,45\n' +
      '2026-09-25,OAMS-2026-00415,Strategic Executive Briefing on AI & Innovation Center,Mr. Harsha Rao,UNDER_REVIEW,URGENT,30\n' +
      '2026-09-26,OAMS-2026-00418,Academic & Curriculum Modernization Review,VC,UNDER_REVIEW,MEDIUM,30\n';
    return csvContent as unknown as T;
  }

  // 9. Users Administration
  if (cleanUrl.includes('/users')) {
    const DISALLOWED_MOCK_IDS = new Set([
      'usr-hod-cse',
      'usr-hod-ece',
      'usr-fac-anita',
      'usr-fac-anand',
      'usr-stu-arjun',
      'usr-stu-priya',
      'usr-stu-rohan',
      'usr-stu-sneha',
      'usr-reception-pooja',
      'usr-sec-suresh',
      'usr-reception-1',
      'usr-security-1',
      'usr-citizen-1',
    ]);
    const rawUsers: any[] = getStorage('users', INITIAL_USERS);
    let users: any[] = (Array.isArray(rawUsers) ? rawUsers : INITIAL_USERS).filter(
      (u: any) => !DISALLOWED_MOCK_IDS.has(u.id)
    );

    // Toggle disable/activate: /api/v1/users/:id/disable or /api/v1/users/:id/toggle-status
    if (cleanUrl.includes('/disable') || cleanUrl.includes('/toggle-status')) {
      const parts = cleanUrl.split('/');
      const uId = parts[parts.length - 2];
      const idx = users.findIndex((u: any) => u.id === uId);
      if (idx >= 0) {
        users[idx].status = users[idx].status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
        setStorage('users', users);
        return users[idx] as unknown as T;
      }
    }

    // Reset password: /api/v1/users/:id/reset-password
    if (cleanUrl.includes('/reset-password')) {
      return { success: true, message: 'User password reset instructions generated.' } as unknown as T;
    }

    if (method === 'POST') {
      const newUser = {
        id: `usr-${Date.now()}`,
        fullName: body?.fullName || 'New User',
        email: body?.email || `user${Date.now()}@stmarysgroup.com`,
        designation: body?.designation || 'Staff Member',
        department: body?.department || 'Central Administration',
        departmentId: body?.departmentId || 'dept-6',
        status: 'ACTIVE' as const,
        roles: body?.roleCodes || body?.roles || ['STAFF'],
      };
      users.unshift(newUser);
      setStorage('users', users);
      return newUser as unknown as T;
    }

    if (method === 'DELETE') {
      const parts = cleanUrl.split('/');
      const uId = parts[parts.length - 1];
      users = users.filter((u: any) => u.id !== uId);
      setStorage('users', users);
      return { success: true, deletedId: uId } as unknown as T;
    }

    if (method === 'PUT' || method === 'PATCH') {
      const parts = cleanUrl.split('/');
      const uId = parts[parts.length - (parts[parts.length - 1] === 'roles' ? 2 : 1)];
      const idx = users.findIndex((u: any) => u.id === uId);
      if (idx >= 0) {
        if (body?.roleCodes) users[idx].roles = body.roleCodes;
        if (body?.roles) users[idx].roles = body.roles;
        if (body?.status) users[idx].status = body.status;
        if (body?.fullName) users[idx].fullName = body.fullName;
        if (body?.email) users[idx].email = body.email;
        if (body?.designation) users[idx].designation = body.designation;
        if (body?.department) users[idx].department = body.department;
        setStorage('users', users);
        return users[idx] as unknown as T;
      }
    }

    return users as unknown as T;
  }

  // 9.1 Departments Administration
  if (cleanUrl.includes('/departments')) {
    let departments: any[] = getStorage('departments', INITIAL_DEPARTMENTS);

    if (method === 'POST') {
      const newDept = {
        id: `dept-${Date.now()}`,
        name: body?.name || 'New Department',
        code: (body?.code || 'DEPT').toUpperCase(),
        building: body?.building || 'Main Campus',
        hodName: body?.hodName || 'Pending Appointment',
        hodEmail: body?.hodEmail || `hod.${(body?.code || 'dept').toLowerCase()}@stmarysgroup.com`,
        facultyCount: Number(body?.facultyCount) || 1,
        studentCount: Number(body?.studentCount) || 0,
        createdAt: new Date().toISOString(),
      };
      departments.unshift(newDept);
      setStorage('departments', departments);
      return newDept as unknown as T;
    }

    if (method === 'DELETE') {
      const parts = cleanUrl.split('/');
      const dId = parts[parts.length - 1];
      departments = departments.filter((d: any) => d.id !== dId);
      setStorage('departments', departments);
      return { success: true, deletedId: dId } as unknown as T;
    }

    if (method === 'PUT' || method === 'PATCH') {
      const parts = cleanUrl.split('/');
      const dId = parts[parts.length - 1];
      const idx = departments.findIndex((d: any) => d.id === dId);
      if (idx >= 0) {
        departments[idx] = { ...departments[idx], ...body };
        setStorage('departments', departments);
        return departments[idx] as unknown as T;
      }
    }

    return departments as unknown as T;
  }

  // 9.2 Roles Matrix Endpoint
  if (cleanUrl.includes('/roles')) {
    return [
      { code: 'ADMIN', name: 'System Administrator', description: 'Institutional governance and security control' },
      { code: 'FACULTY', name: 'Faculty Member', description: 'Professor/official chamber owner' },
      { code: 'STAFF', name: 'Staff Member', description: 'Administrative and operational support staff' },
    ] as unknown as T;
  }

  // 10. Holidays Administration
  if (cleanUrl.includes('/holidays')) {
    const holidays = getStorage('holidays', INITIAL_HOLIDAYS);
    if (method === 'POST') {
      const newHol = {
        id: `hol-${Date.now()}`,
        name: body?.name || 'Observance Day',
        holidayDate: body?.holidayDate || new Date().toISOString().substring(0, 10),
        isHalfDay: !!body?.isHalfDay,
        halfDayPeriod: body?.halfDayPeriod || null,
        description: body?.description || '',
      };
      holidays.push(newHol);
      setStorage('holidays', holidays);
      return newHol as unknown as T;
    }
    if (method === 'DELETE') {
      const parts = cleanUrl.split('/');
      const holId = parts[parts.length - 1];
      const filtered = holidays.filter((h: any) => h.id !== holId);
      setStorage('holidays', filtered);
      return { success: true } as unknown as T;
    }
    return holidays as unknown as T;
  }

  // 11. Audit Logs & Blockchain Hash Verification
  if (cleanUrl.includes('/audit/verify')) {
    const rawEvents = getStorage('audit_events', INITIAL_AUDIT_EVENTS);
    const events = Array.isArray(rawEvents) && rawEvents.length > 0 ? rawEvents : INITIAL_AUDIT_EVENTS;
    const tipHash = events[0]?.hash || '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d';
    return {
      valid: true,
      verifiedCount: events.length,
      tipHash: tipHash,
      lastVerifiedAt: new Date().toISOString(),
    } as unknown as T;
  }
  if (cleanUrl.includes('/audit')) {
    const rawEvents = getStorage('audit_events', INITIAL_AUDIT_EVENTS);
    let events = (Array.isArray(rawEvents) && rawEvents.length > 0 ? rawEvents : INITIAL_AUDIT_EVENTS).map(
      (ev: any, idx: number) => {
        const fallbackHash =
          '0x' + (ev.id ? ev.id.replace(/[^a-f0-9]/gi, '') : 'hash' + idx).padEnd(32, 'a').slice(0, 34);
        return {
          ...ev,
          actor_id: ev.actor_id || 'system',
          actor_role: ev.actor_role || 'ADMIN',
          prev_hash: ev.prev_hash || '0x0000000000000000',
          hash: ev.hash || fallbackHash,
        };
      }
    );

    // Apply filtering based on URL query parameters
    try {
      const qIndex = url.indexOf('?');
      if (qIndex !== -1) {
        const qp = new URLSearchParams(url.slice(qIndex));
        const entityType = qp.get('entityType')?.trim().toLowerCase();
        const action = qp.get('action')?.trim().toLowerCase();
        const actorId = qp.get('actorId')?.trim().toLowerCase();

        if (entityType) {
          events = events.filter((ev: any) =>
            ev.entity_type?.toLowerCase() === entityType
          );
        }
        if (action) {
          events = events.filter((ev: any) =>
            ev.action?.toLowerCase().includes(action)
          );
        }
        if (actorId) {
          events = events.filter((ev: any) =>
            ev.actor_id?.toLowerCase().includes(actorId)
          );
        }
      }
    } catch {}

    return { items: events, total: events.length } as unknown as T;
  }

  // 12. Admin Ops & Job Runners
  if (cleanUrl.includes('/admin/ops')) {
    const ops = getStorage('ops_overview', INITIAL_OPS_OVERVIEW);
    if (method === 'POST') {
      return { success: true, message: 'Operation executed successfully' } as unknown as T;
    }
    return ops as unknown as T;
  }

  // 13. Support Staff
  if (cleanUrl.includes('/support-staff')) {
    const staff = getStorage('support_staff', INITIAL_SUPPORT_STAFF);
    if (method === 'POST') {
      const newStaff = {
        id: `staff-${Date.now()}`,
        officialId: body?.officialId || 'off-1',
        userId: body?.userId || 'usr-indhu-1',
        userFullName: 'Ms. Indhu',
        userEmail: 'indhu@stmarysgroup.com',
        roleCode: body?.roleCode || 'PA',
        canManageCalendar: !!body?.canManageCalendar,
        canTriageAppointments: !!body?.canTriageAppointments,
        canManageTasks: !!body?.canManageTasks,
      };
      staff.push(newStaff);
      setStorage('support_staff', staff);
      return newStaff as unknown as T;
    }
    if (method === 'DELETE') {
      const parts = cleanUrl.split('/');
      const staffId = parts[parts.length - 1];
      const filtered = staff.filter((s: any) => s.id !== staffId);
      setStorage('support_staff', filtered);
      return { success: true } as unknown as T;
    }
    return staff as unknown as T;
  }

  // 14. Privacy Requests (Export / Erase)
  if (cleanUrl.includes('/privacy')) {
    return {
      success: true,
      message: 'Privacy request successfully processed and archived under §18 compliance standards.',
    } as unknown as T;
  }

  // 15. Notifications System (Role-based Delivery, SSE & Bell)
  if (cleanUrl.includes('/notifications')) {
    const rawNotifs: any[] = getStorage('notifications', INITIAL_NOTIFICATIONS);
    // Normalize notifications to include standard fields
    let allNotifs = rawNotifs.map((n) => ({
      ...n,
      type: n.type || n.eventType || 'system_alert',
      eventType: n.eventType || n.type || 'system_alert',
      message: n.message || n.body || '',
      body: n.body || n.message || '',
      appointmentId: n.appointmentId || (n.entityType === 'APPOINTMENT' ? n.entityId : null) || null,
      officialId: n.officialId || null,
      targetRoles: n.targetRoles && Array.isArray(n.targetRoles) ? n.targetRoles : ['ALL'],
      isRead: n.isRead !== undefined ? Boolean(n.isRead) : Boolean(n.readAt),
      readAt: n.readAt || null,
    }));

    // Extract current user from storage or token
    let currentUser: any = null;
    try {
      const storedUser = typeof sessionStorage !== 'undefined'
        ? (sessionStorage.getItem('oams_user') || (typeof localStorage !== 'undefined' ? localStorage.getItem('oams_user') : null))
        : (typeof localStorage !== 'undefined' ? localStorage.getItem('oams_user') : null);
      if (storedUser) {
        currentUser = JSON.parse(storedUser);
      }
    } catch {}

    if (!currentUser) {
      const tokenStr = typeof localStorage !== 'undefined'
        ? (localStorage.getItem('oams_token') || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('oams_token') : '') || '')
        : (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('oams_token') || '' : '');
      const personaId = tokenStr.replace('demo-token-', '');
      
      if (personaId) {
        currentUser = Object.values(DEMO_PERSONAS).find(p => p.id === personaId || p.email?.toLowerCase() === personaId.toLowerCase());
        if (!currentUser) {
          const users: any[] = getStorage('users', INITIAL_USERS);
          currentUser = users.find((u: any) => u.id === personaId || u.email?.toLowerCase() === personaId.toLowerCase());
        }
      }
    }

    if (!currentUser) {
      currentUser = DEMO_PERSONAS.admin;
    }

    const userRoles = currentUser?.roles || ['ALL'];
    const expandedUserRoles = new Set<string>(['ALL', '*']);

    for (const r of userRoles) {
      const norm = String(r).toUpperCase().trim();
      expandedUserRoles.add(norm);

      if (norm === 'ADMIN' || norm === 'SUPER_ADMIN' || norm === 'APPOINTMENT_ADMIN') {
        expandedUserRoles.add('ADMIN');
        expandedUserRoles.add('SUPER_ADMIN');
        expandedUserRoles.add('APPOINTMENT_ADMIN');
      }
      if (norm === 'FACULTY' || norm === 'OFFICIAL') {
        expandedUserRoles.add('FACULTY');
        expandedUserRoles.add('OFFICIAL');
      }
      if (norm === 'STAFF' || norm === 'PA' || norm === 'EA' || norm === 'EA_PA') {
        expandedUserRoles.add('STAFF');
        expandedUserRoles.add('PA');
        expandedUserRoles.add('EA');
        expandedUserRoles.add('EA_PA');
        expandedUserRoles.add('SUPPORT_STAFF');
      }
      if (norm === 'RECEPTION' || norm === 'RECEPTIONIST') {
        expandedUserRoles.add('RECEPTION');
        expandedUserRoles.add('RECEPTIONIST');
      }
      if (norm === 'SECURITY' || norm === 'SECURITY_OFFICER') {
        expandedUserRoles.add('SECURITY');
        expandedUserRoles.add('SECURITY_OFFICER');
      }
      if (norm === 'EMPLOYEE') {
        expandedUserRoles.add('EMPLOYEE');
      }
      if (norm === 'GUEST') {
        expandedUserRoles.add('GUEST');
      }
    }

    const matchesRole = (n: any): boolean => {
      // 1. Direct recipient match
      if (n.userId && currentUser?.id && n.userId === currentUser.id) return true;

      // 2. Official-specific match (for official or their assigned support staff)
      if (n.officialId) {
        if (currentUser?.officialId && n.officialId === currentUser.officialId) return true;
        if (currentUser?.assignedOfficialIds && Array.isArray(currentUser.assignedOfficialIds) && currentUser.assignedOfficialIds.includes(n.officialId)) return true;
      }

      // 3. Broadcast / no role restriction
      if (!n.targetRoles || !Array.isArray(n.targetRoles) || n.targetRoles.length === 0) return true;
      if (n.targetRoles.includes('ALL') || n.targetRoles.includes('*')) return true;

      // 4. Intersects with user's expanded roles
      return n.targetRoles.some((tr: string) => expandedUserRoles.has(String(tr).toUpperCase().trim()));
    };

    // Filter notifications by current user's role & assignments
    let notifs = allNotifs.filter(matchesRole);

    if (cleanUrl.endsWith('/unread-count')) {
      const unread = notifs.filter((n) => !n.readAt && !n.isRead).length;
      return { count: unread, unreadCount: unread } as unknown as T;
    }

    if (cleanUrl.endsWith('/stream-ticket')) {
      return { ticket: 'demo-sse-ticket-1' } as unknown as T;
    }

    if (cleanUrl.endsWith('/read-all') && (method === 'POST' || method === 'PATCH')) {
      const now = new Date().toISOString();
      const visibleIds = new Set(notifs.map(n => n.id));
      const updatedFull = allNotifs.map((n) => {
        if (visibleIds.has(n.id)) {
          return { ...n, isRead: true, readAt: n.readAt || now };
        }
        return n;
      });
      setStorage('notifications', updatedFull);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('oams-notifications-updated', { detail: { unreadCount: 0 } }));
      }
      return { success: true, count: visibleIds.size } as unknown as T;
    }

    if (cleanUrl.endsWith('/read') && (method === 'POST' || method === 'PATCH')) {
      const parts = cleanUrl.split('/');
      const notifId = parts[parts.length - 2];
      const idx = allNotifs.findIndex((n) => n.id === notifId);
      if (idx >= 0) {
        allNotifs[idx].isRead = true;
        allNotifs[idx].readAt = allNotifs[idx].readAt || new Date().toISOString();
        setStorage('notifications', allNotifs);
        if (typeof window !== 'undefined') {
          const unreadRemaining = allNotifs.filter((n) => matchesRole(n) && !n.readAt && !n.isRead).length;
          window.dispatchEvent(
            new CustomEvent('oams-notifications-updated', { detail: { unreadCount: unreadRemaining } }),
          );
        }
      }
      return { success: true } as unknown as T;
    }

    if (method === 'DELETE') {
      const parts = cleanUrl.split('/');
      const notifId = parts[parts.length - 1];
      const updatedFull = allNotifs.filter((n) => n.id !== notifId);
      setStorage('notifications', updatedFull);
      if (typeof window !== 'undefined') {
        const unreadRemaining = updatedFull.filter((n) => matchesRole(n) && !n.readAt && !n.isRead).length;
        window.dispatchEvent(
          new CustomEvent('oams-notifications-updated', { detail: { unreadCount: unreadRemaining } }),
        );
      }
      return { success: true, message: 'Notification deleted successfully' } as unknown as T;
    }

    if (method === 'POST' && !cleanUrl.endsWith('/read') && !cleanUrl.endsWith('/read-all') && !cleanUrl.endsWith('/stream-ticket')) {
      const newNotif = {
        id: `notif-${Date.now()}`,
        userId: body?.userId || currentUser?.id || 'usr-admin-1',
        officialId: body?.officialId || null,
        targetRoles: body?.targetRoles || (currentUser?.roles ? [...currentUser.roles] : ['ALL']),
        type: body?.type || 'system_alert',
        eventType: body?.eventType || body?.type || 'system_alert',
        title: body?.title || 'Notification',
        message: body?.message || body?.body || '',
        body: body?.body || body?.message || '',
        appointmentId: body?.appointmentId || null,
        entityType: body?.appointmentId ? 'APPOINTMENT' : (body?.entityType || 'SYSTEM'),
        entityId: body?.appointmentId || body?.entityId || null,
        link: body?.link || (body?.appointmentId ? `/app/appointments/${body.appointmentId}` : '/app/notifications'),
        priority: body?.priority || Priority.MEDIUM,
        isRead: false,
        readAt: null,
        createdAt: new Date().toISOString(),
      };
      allNotifs.unshift(newNotif);
      setStorage('notifications', allNotifs);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('oams-notification-created', { detail: newNotif }));
        window.dispatchEvent(new CustomEvent('oams-notifications-updated'));
      }
      return { success: true, data: newNotif } as unknown as T;
    }

    // Handle ?unread=true
    if (url.includes('unread=true')) {
      const unreadList = notifs.filter((n) => !n.readAt && !n.isRead);
      return unreadList as unknown as T;
    }

    const limitMatch = url.match(/[?&]limit=(\d+)/);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1], 10);
      return notifs.slice(0, limit) as unknown as T;
    }

    // Default: list notifications
    return notifs as unknown as T;
  }

  // 16. Auth Requests (Fallback when DB/Redis is not running)
  if (cleanUrl.includes('/auth/otp/request')) {
    return { success: true, message: 'OTP sent successfully (Demo Mode: use 123456)' } as unknown as T;
  }
  if (cleanUrl.includes('/auth/otp/verify')) {
    return {
      success: true,
      accessToken: 'demo-jwt-token-active',
      user: DEMO_PERSONAS.janardhan || DEMO_PERSONAS.kvk,
    } as unknown as T;
  }
  if (cleanUrl.includes('/auth/break-glass')) {
    return {
      success: true,
      accessToken: 'demo-admin-token-active',
      user: DEMO_PERSONAS.admin,
    } as unknown as T;
  }
  if (cleanUrl.includes('/auth/logout')) {
    return { success: true } as unknown as T;
  }
  if (cleanUrl.includes('/auth/me')) {
    let tokenStr = '';
    if (typeof sessionStorage !== 'undefined') {
      tokenStr = sessionStorage.getItem('oams_token') || '';
    }
    if (!tokenStr && typeof localStorage !== 'undefined') {
      tokenStr = localStorage.getItem('oams_token') || '';
    }
    if (!tokenStr) {
      throw new Error('Unauthorized');
    }
    const personaId = tokenStr.replace('demo-token-', '');
    const foundPersona = Object.values(DEMO_PERSONAS).find(
      (p) => p.id === personaId || p.email.toLowerCase() === personaId.toLowerCase(),
    );
    if (foundPersona) {
      return foundPersona as unknown as T;
    }
    throw new Error('Unauthorized');
  }

  // 17. Global Search (§21)
  if (cleanUrl.includes('/search')) {
    const qp = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
    const q = (qp.get('q') || '').toLowerCase().trim();
    const typeFilter = qp.get('types') || 'all';

    if (!q) {
      return { query: q, total: 0, results: [] } as unknown as T;
    }

    const appointments: any[] = getStorage('appointments', INITIAL_APPOINTMENTS);
    const visits: any[] = getStorage('visits', INITIAL_VISITS);
    const officials: any[] = getStorage('officials', INITIAL_OFFICIALS);
    const tasks: any[] = getStorage('tasks', INITIAL_TASKS);

    const results: any[] = [];

    if (typeFilter === 'all' || typeFilter === 'appointment') {
      appointments.forEach((apt) => {
        const ref = (apt.referenceNo || '').toLowerCase();
        const subj = (apt.subject || '').toLowerCase();
        const req = (apt.requesterName || '').toLowerCase();
        const off = (apt.officialName || '').toLowerCase();
        if (ref.includes(q) || subj.includes(q) || req.includes(q) || off.includes(q)) {
          results.push({
            id: apt.id,
            type: 'appointment',
            title: `${apt.referenceNo || apt.id} — ${apt.subject}`,
            subtitle: `${apt.officialName || 'Official'} · ${apt.requesterName || 'Requester'} · ${apt.status}`,
            status: apt.status,
            metadata: { referenceNo: apt.referenceNo },
          });
        }
      });
    }

    if (typeFilter === 'all' || typeFilter === 'visit') {
      visits.forEach((vis) => {
        const ref = (vis.referenceNo || '').toLowerCase();
        const name = (vis.visitorName || '').toLowerCase();
        const host = (vis.hostOfficialName || vis.officialName || '').toLowerCase();
        const badge = (vis.badgeNo || vis.badgeNumber || '').toLowerCase();
        if (ref.includes(q) || name.includes(q) || host.includes(q) || badge.includes(q)) {
          results.push({
            id: vis.id,
            type: 'visit',
            title: `${vis.visitorName} (${vis.referenceNo})`,
            subtitle: `Host: ${vis.hostOfficialName} · Badge: ${vis.badgeNo || 'None'} · ${vis.status}`,
            status: vis.status,
            metadata: { referenceNo: vis.referenceNo },
          });
        }
      });
    }

    if (typeFilter === 'all' || typeFilter === 'official') {
      officials.forEach((off) => {
        const name = (off.fullName || off.full_name || '').toLowerCase();
        const desig = (off.designation || '').toLowerCase();
        const dept = (off.departmentName || off.department_name || '').toLowerCase();
        if (name.includes(q) || desig.includes(q) || dept.includes(q)) {
          results.push({
            id: off.id,
            type: 'official',
            title: `${off.fullName || off.full_name}`,
            subtitle: `${off.designation || 'Official'} · ${off.departmentName || ''}`,
          });
        }
      });
    }

    if (typeFilter === 'all' || typeFilter === 'task') {
      tasks.forEach((tsk) => {
        const title = (tsk.title || '').toLowerCase();
        const desc = (tsk.description || '').toLowerCase();
        if (title.includes(q) || desc.includes(q)) {
          results.push({
            id: tsk.id,
            type: 'task',
            title: tsk.title,
            subtitle: `${tsk.officialName || 'Staff'} · Priority: ${tsk.priority} · ${tsk.status}`,
            status: tsk.status,
          });
        }
      });
    }

    return { query: q, total: results.length, results } as unknown as T;
  }

  // Fallback for any other endpoint
  return [] as unknown as T;
}
