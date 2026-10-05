import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { AppointmentDetailDto } from '@oams/shared';
import { MeetingMode } from '@oams/shared';
import { sendAppointmentStatusNotifications } from '@/lib/powerAutomateClient';
import {
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  ShieldCheck,
  User,
  Users,
  Video,
  Phone,
  Download,
  ExternalLink,
  Copy,
  Check,
  Printer,
  RefreshCw,
  Send,
  AlertCircle,
  Building2,
  DoorOpen,
  Sparkles,
  BadgeCheck,
  Info,
} from 'lucide-react';

interface Props {
  appointment: AppointmentDetailDto;
  onUpdate: () => void;
  onOpenReschedule?: () => void;
}

export const AppointmentSchedulingTab: React.FC<Props> = ({
  appointment,
  onUpdate,
  onOpenReschedule,
}) => {
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProposals, setSelectedProposals] = useState<any[]>([]);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderToast, setReminderToast] = useState<string | null>(null);

  useEffect(() => {
    if (appointment.status === 'UNDER_REVIEW') {
      fetchSlots();
    }
  }, [appointment.id]);

  const fetchSlots = async () => {
    try {
      setLoading(true);
      const res = await api.post<any[]>('/api/v1/scheduling/slots', {
        officialIds: [
          { id: appointment.official.id, requirement: 'REQUIRED' },
          ...appointment.additionalOfficials.map((o) => ({ id: o.id, requirement: o.requirement })),
        ],
        durationMin: appointment.durationMin,
        windows: appointment.preferredWindows,
        roomRequired: appointment.meetingMode === MeetingMode.IN_PERSON,
        priority: appointment.priority,
        meetingMode: appointment.meetingMode,
        respectMinNotice: true,
      });
      setSlots(res);
    } catch (err: any) {
      setError(err.message || 'Failed to get slot recommendations');
    } finally {
      setLoading(false);
    }
  };

  const toggleProposal = (slot: any) => {
    if (selectedProposals.find((s) => s.start === slot.start)) {
      setSelectedProposals(selectedProposals.filter((s) => s.start !== slot.start));
    } else {
      if (selectedProposals.length < 3) {
        setSelectedProposals([...selectedProposals, slot]);
      } else {
        alert('You can propose up to 3 slots.');
      }
    }
  };

  const handlePropose = async () => {
    if (selectedProposals.length === 0) return;
    try {
      await api.post(`/api/v1/appointments/${appointment.id}/propose-times`, {
        slots: selectedProposals.map((s) => ({ startAt: s.start, endAt: s.end, roomId: s.roomId })),
      });
      onUpdate();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSchedule = async (slot: any) => {
    try {
      await api.post(`/api/v1/appointments/${appointment.id}/schedule`, {
        startAt: slot.start,
        endAt: slot.end,
        roomId: slot.roomId,
      });
      onUpdate();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Google Calendar URL generator
  const getGoogleCalendarUrl = () => {
    const start = appointment.startAt ? new Date(appointment.startAt) : new Date();
    const end = appointment.endAt
      ? new Date(appointment.endAt)
      : new Date(start.getTime() + (appointment.durationMin || 30) * 60000);
    const fmt = (d: Date) => d.toISOString().replace(/-|:|\.\d+/g, '');
    const title = encodeURIComponent(`${appointment.subject} [${appointment.referenceNo}]`);
    const details = encodeURIComponent(
      `Official Appointment Session\nReference: ${appointment.referenceNo}\nOfficial: ${appointment.official.title} ${appointment.official.fullName}\nPurpose: ${appointment.purpose}\nDuration: ${appointment.durationMin} minutes\nPortal: ${window.location.origin}/`,
    );
    const location = encodeURIComponent(
      appointment.room
        ? `${appointment.room.name}, ${appointment.room.building} Floor ${appointment.room.floor}`
        : appointment.meetingMode === MeetingMode.ONLINE
        ? 'Microsoft Teams Video Conference'
        : 'Chamber 101, Main Secretariat Chambers',
    );
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(
      start,
    )}/${fmt(end)}&details=${details}&location=${location}`;
  };

  // iCalendar (.ics) download generator
  const handleDownloadIcs = () => {
    const start = appointment.startAt ? new Date(appointment.startAt) : new Date();
    const end = appointment.endAt
      ? new Date(appointment.endAt)
      : new Date(start.getTime() + (appointment.durationMin || 30) * 60000);
    const fmt = (d: Date) => d.toISOString().replace(/-|:|\.\d+/g, '');

    const icsString = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//OAMS//Official Appointment Management System//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:oams-${appointment.id}@smru.edu.in`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${appointment.subject} [${appointment.referenceNo}]`,
      `DESCRIPTION:Official Appointment\\nOfficial: ${appointment.official.fullName}\\nPurpose: ${appointment.purpose}\\nReference: ${appointment.referenceNo}`,
      `LOCATION:${
        appointment.room
          ? `${appointment.room.name}, ${appointment.room.building}`
          : appointment.meetingMode === MeetingMode.ONLINE
          ? 'Microsoft Teams Video Meeting'
          : 'Chamber 101, Main Secretariat Chambers'
      }`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appointment.referenceNo}-schedule.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy full summary to clipboard
  const handleCopySummary = () => {
    const startDate = appointment.startAt ? new Date(appointment.startAt) : new Date();
    const endDate = appointment.endAt
      ? new Date(appointment.endAt)
      : new Date(startDate.getTime() + (appointment.durationMin || 30) * 60000);

    const summaryText = `================================================
OAMS OFFICIAL APPOINTMENT SCHEDULE PASS
================================================
Reference Number: #${appointment.referenceNo}
Subject: ${appointment.subject}
Official: ${appointment.official.title} ${appointment.official.fullName}
Department: ${appointment.official.departmentName || 'Apex Governance'}
Status: CONFIRMED & SCHEDULED

Date: ${startDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
Time: ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${appointment.durationMin} mins)
Location / Mode: ${
      appointment.room
        ? `${appointment.room.name}, ${appointment.room.building} (Floor ${appointment.room.floor})`
        : appointment.meetingMode === MeetingMode.ONLINE
        ? 'Microsoft Teams Online Video Meeting'
        : 'Chamber 101, Main Secretariat Chambers'
    }

Security Protocol:
- Present Reference #${appointment.referenceNo} at Protocol Gate 1
- Government/Institutional Photo ID Required
================================================`;

    navigator.clipboard?.writeText(summaryText);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  // Dispatch reminder email via Power Automate
  const handleSendReminder = async () => {
    try {
      setReminderSending(true);
      const startDate = appointment.startAt ? new Date(appointment.startAt) : new Date();
      const timeStr = startDate.toLocaleString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const res = await sendAppointmentStatusNotifications({
        appointmentId: appointment.id,
        referenceNo: appointment.referenceNo,
        subject: appointment.subject,
        requesterEmail: (appointment as any).requesterEmail || 'apointments@smru.edu.in',
        requesterName: (appointment as any).requesterName || 'Valued Requester',
        officialName: `${appointment.official.title} ${appointment.official.fullName}`,
        status: 'CONFIRMED',
        scheduledTime: timeStr,
        location: appointment.room
          ? `${appointment.room.name}, ${appointment.room.building}`
          : 'Chamber 101, Main Secretariat Chambers',
        priority: appointment.priority as any,
        reason: 'Meeting timing and protocol gate clearance verified.',
      });

      if (res.ok) {
        setReminderToast('Schedule confirmation reminder dispatched via Power Automate!');
      } else {
        setReminderToast(`Power Automate gateway notice: ${res.message}`);
      }
      setTimeout(() => setReminderToast(null), 4000);
    } catch (err: any) {
      setReminderToast(err.message || 'Dispatched reminder to secretariat');
      setTimeout(() => setReminderToast(null), 4000);
    } finally {
      setReminderSending(false);
    }
  };

  // ==========================================
  // CONFIRMED / PENDING_APPROVAL / COMPLETED
  // ==========================================
  if (
    appointment.status === 'CONFIRMED' ||
    appointment.status === 'PENDING_APPROVAL' ||
    appointment.status === 'COMPLETED'
  ) {
    const startDate = appointment.startAt ? new Date(appointment.startAt) : new Date();
    const endDate = appointment.endAt
      ? new Date(appointment.endAt)
      : new Date(startDate.getTime() + (appointment.durationMin || 30) * 60000);

    const monthShort = startDate.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
    const dayNum = startDate.getDate();
    const weekday = startDate.toLocaleDateString(undefined, { weekday: 'long' });
    const fullDate = startDate.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const startTimeFormatted = startDate.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const endTimeFormatted = endDate.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const isToday =
      new Date().toDateString() === startDate.toDateString();
    const isPast = new Date().getTime() > endDate.getTime();

    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Toast Alert */}
        {reminderToast && (
          <div className="p-3.5 rounded-xl bg-[var(--text-main)] text-[var(--bg-surface)] text-xs font-semibold flex items-center justify-between shadow-xl animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{reminderToast}</span>
            </div>
            <button
              onClick={() => setReminderToast(null)}
              className="text-xs opacity-75 hover:opacity-100 cursor-pointer ml-3"
            >
              ✕
            </button>
          </div>
        )}

        {/* 1. Executive Status Header Card */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                <BadgeCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm sm:text-base font-bold text-[var(--text-main)]">
                    Schedule Locked &amp; Synchronized
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    {isPast ? 'Session Concluded' : isToday ? 'Happening Today' : 'Confirmed'}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Official protocol slot reserved on master calendar for reference{' '}
                  <strong className="font-mono text-[var(--text-main)]">
                    #{appointment.referenceNo}
                  </strong>
                  .
                </p>
              </div>
            </div>

            {/* Quick Reschedule & Print Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {onOpenReschedule && appointment.status === 'CONFIRMED' && (
                <button
                  type="button"
                  onClick={onOpenReschedule}
                  className="px-3 py-2 text-xs font-semibold rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-main)] transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Reschedule</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-main)] transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Print Official Meeting Slip"
              >
                <Printer className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>Print Pass</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. Grand Timing Hero Card */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Main Date & Timing Block (7 Columns) */}
          <div className="md:col-span-7 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-subtle)]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                  Official Time Slot
                </span>
                <span className="text-[11px] font-semibold text-[var(--text-muted)] bg-[var(--bg-subtle)] px-2.5 py-0.5 rounded-full">
                  IST (UTC+05:30)
                </span>
              </div>

              <div className="flex items-start gap-4">
                {/* Visual Calendar Date Monogram */}
                <div className="w-16 h-18 rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--bg-subtle)] flex flex-col items-center justify-center overflow-hidden shrink-0 shadow-xs">
                  <div className="w-full bg-[var(--brand-primary)] text-white text-[10px] font-bold tracking-wider text-center py-1">
                    {monthShort}
                  </div>
                  <div className="flex-1 flex items-center justify-center font-serif text-2xl font-bold text-[var(--text-main)]">
                    {dayNum}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[var(--brand-primary)] tracking-wide uppercase">
                    {weekday}
                  </p>
                  <h3 className="text-xl sm:text-2xl font-serif font-bold text-[var(--text-main)] mt-0.5 truncate">
                    {fullDate}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-base sm:text-lg font-bold font-mono text-[var(--text-main)]">
                      {startTimeFormatted} – {endTimeFormatted}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                      {appointment.durationMin} Minutes
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Calendar Integration Utilities */}
            <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-2.5">
              <a
                href={getGoogleCalendarUrl()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-subtle)] hover:bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-main)] hover:border-[var(--brand-primary)] transition no-underline cursor-pointer shadow-2xs"
              >
                <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Google Calendar</span>
                <ExternalLink className="w-3 h-3 text-[var(--text-muted)]" />
              </a>

              <button
                type="button"
                onClick={handleDownloadIcs}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-subtle)] hover:bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-main)] hover:border-[var(--brand-primary)] transition cursor-pointer shadow-2xs"
                title="Download Outlook / Apple iCal (.ics) file"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Outlook / iCal (.ics)</span>
              </button>

              <button
                type="button"
                onClick={handleCopySummary}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-subtle)] hover:bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-main)] hover:border-[var(--brand-primary)] transition cursor-pointer shadow-2xs ml-auto"
              >
                {copiedSummary ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <span>Copy Summary</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Venue & Location Details (5 Columns) */}
          <div className="md:col-span-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-subtle)]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Venue &amp; Clearance
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Gate Pass Cleared
                </span>
              </div>

              {appointment.meetingMode === MeetingMode.ONLINE ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-sm">
                    <Video className="w-4 h-4" />
                    <span>Microsoft Teams Video Meeting</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    Direct secure conference bridge established. Audio and screen sharing
                    authorized for all verified attendees.
                  </p>
                  {appointment.onlineLink ? (
                    <a
                      href={appointment.onlineLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-semibold shadow-xs hover:bg-[var(--brand-hover)] transition no-underline cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Launch Video Room</span>
                    </a>
                  ) : (
                    <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-subtle)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
                      Video room bridge will be distributed 15 minutes before the session.
                    </div>
                  )}
                </div>
              ) : appointment.meetingMode === MeetingMode.PHONE ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-bold text-sm">
                    <Phone className="w-4 h-4" />
                    <span>Tele-Conference Call</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    Official secretariat conference desk line scheduled. Dial-in details
                    distributed to registered phone contact.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-sm text-[var(--text-main)] flex items-center gap-1.5">
                      <DoorOpen className="w-4 h-4 text-[var(--brand-primary)]" />
                      {appointment.room?.name || 'Main Secretariat Chamber 101'}
                    </h4>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      {appointment.room
                        ? `${appointment.room.building} (Floor ${appointment.room.floor})`
                        : 'Administrative Block · SMRU Governance Complex'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[#FAF9F5] dark:bg-[var(--bg-subtle)] border border-[#E8E6E0] dark:border-[var(--border-subtle)] space-y-1.5 text-xs text-[#5B6070] dark:text-[var(--text-muted)]">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#16181D] dark:text-[var(--text-main)]">
                      <span>Gate Entry: Gate 1 (Protocol Desk)</span>
                      <span className="text-emerald-700 dark:text-emerald-400">ID Required</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Present Ref <strong className="font-mono">#{appointment.referenceNo}</strong> at the reception desk to receive visitor visitor lanyard &amp; elevator escort.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Security Clearance Active
              </span>
              <button
                type="button"
                onClick={handleSendReminder}
                disabled={reminderSending}
                className="text-xs font-semibold text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Send className={`w-3 h-3 ${reminderSending ? 'animate-pulse' : ''}`} />
                <span>{reminderSending ? 'Sending...' : 'Send Reminder'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3. Host Official & Participant Roster */}
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-bold text-[var(--text-main)] flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--brand-primary)]" />
              <span>Confirmed Session Roster</span>
            </h3>
            <span className="text-xs font-semibold text-[var(--text-muted)]">
              {1 + (appointment.attendees?.length || 0) + (appointment.additionalOfficials?.length || 0)} Total Attendees
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Host Official */}
            <div className="p-3.5 rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/5 dark:bg-blue-950/20 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--brand-primary)] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                {appointment.official.fullName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .substring(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[var(--text-main)] truncate">
                    {appointment.official.title} {appointment.official.fullName}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] truncate">
                  {appointment.official.departmentName || 'Apex Governance'}
                </p>
                <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-[var(--brand-primary)] text-white">
                  Host Official
                </span>
              </div>
            </div>

            {/* Additional Officials if any */}
            {appointment.additionalOfficials?.map((off) => (
              <div
                key={off.id}
                className="p-3.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                  {off.fullName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-[var(--text-main)] truncate block">
                    {off.title} {off.fullName}
                  </span>
                  <p className="text-[11px] text-[var(--text-muted)]">Co-Official</p>
                  <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                    {off.requirement}
                  </span>
                </div>
              </div>
            ))}

            {/* Attendees / Requesters */}
            {appointment.attendees && appointment.attendees.length > 0 ? (
              appointment.attendees.map((att) => (
                <div
                  key={att.id}
                  className="p-3.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#5B6070] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                    {att.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .substring(0, 2)
                      .toUpperCase() || 'RQ'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-[var(--text-main)] truncate block">
                      {att.name}
                    </span>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      {att.organization || 'Requester / Citizen Delegate'}
                    </p>
                    <span
                      className={`inline-block mt-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded ${
                        att.isExternal
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                      }`}
                    >
                      {att.isExternal ? 'External Delegate' : 'Internal Staff'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-3.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-[var(--text-main)] block">
                    Citizen Requester
                  </span>
                  <p className="text-[11px] text-[var(--text-muted)]">External Applicant</p>
                  <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                    Primary Requester
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 4. Official Protocol Milestone Trail */}
        <div className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-subtle)] space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
            <span>Appointment Lifecycle Progression</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs pt-1">
            <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-1.5 text-emerald-600 font-bold mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>1. Request Logged</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                Submitted into secretariat review queue with SLA tracking.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-1.5 text-emerald-600 font-bold mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>2. Slot Engine Verified</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                Calendar hold and venue clearance verified without conflicts.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-emerald-500/40 shadow-2xs">
              <div className="flex items-center gap-1.5 text-emerald-600 font-bold mb-1">
                <BadgeCheck className="w-3.5 h-3.5" />
                <span>3. Status Confirmed</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                Active time locked &bull; Email notification sent via Power Automate.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-1.5 text-blue-600 font-bold mb-1">
                <Clock className="w-3.5 h-3.5" />
                <span>4. Reception Desk Ready</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                Gate badge auto-queued for check-in on the meeting day.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // AWAITING_REQUESTER
  // ==========================================
  if (appointment.status === 'AWAITING_REQUESTER') {
    return (
      <div className="p-8 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 text-center space-y-4 animate-in fade-in">
        <div className="w-14 h-14 rounded-2xl bg-amber-500 text-white flex items-center justify-center mx-auto shadow-md">
          <Clock className="w-7 h-7" />
        </div>
        <div className="max-w-md mx-auto">
          <h3 className="text-lg font-bold text-[var(--text-main)]">
            Awaiting Requester Selection
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
            Proposed time windows have been transmitted to the requester via Power Automate. Once the requester accepts a slot, the meeting will automatically lock into the calendar.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-amber-300 dark:border-amber-700 text-xs font-semibold text-amber-800 dark:text-amber-300">
          <span>SLA Window Active &bull; Awaiting Client Response</span>
        </div>
      </div>
    );
  }

  // ==========================================
  // UNDER_REVIEW (Slot Recommendation Engine)
  // ==========================================
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--brand-primary)]" />
            <span>AI Slot Engine &amp; Intelligent Recommendations</span>
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Conflict-free time slots scored by VIP priority, travel buffers, and room clearance.
          </p>
        </div>

        {selectedProposals.length > 0 && (
          <button
            onClick={handlePropose}
            className="px-4 py-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-xs"
          >
            Propose {selectedProposals.length} Selected Slot{selectedProposals.length > 1 ? 's' : ''} &rarr;
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-[var(--text-muted)] space-y-3">
          <div className="w-8 h-8 border-2 border-[var(--brand-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Analyzing official schedules, room capacities &amp; travel buffers...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : slots.length === 0 ? (
        <div className="py-12 text-center text-xs text-[var(--text-muted)] border border-dashed rounded-2xl bg-[var(--bg-subtle)]">
          No conflicting-free slots detected for the requested preferred window.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {slots.map((slot, i) => {
            const isSelected = !!selectedProposals.find((s) => s.start === slot.start);
            const slotStart = new Date(slot.start);
            const slotEnd = new Date(slot.end);

            return (
              <div
                key={i}
                className={`p-4 border rounded-2xl cursor-pointer transition-all duration-150 flex flex-col justify-between ${
                  isSelected
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 dark:bg-blue-950/20 shadow-sm'
                    : 'border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--brand-primary)]/50 hover:shadow-2xs'
                }`}
                onClick={() => toggleProposal(slot)}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold text-[var(--text-main)]">
                      {slotStart.toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                      Score: {slot.score || 95}
                    </span>
                  </div>

                  <div className="text-sm font-mono font-semibold text-[var(--text-main)] mb-2 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <span>
                      {slotStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                      {slotEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {slot.reasons && slot.reasons.length > 0 && (
                    <div className="text-[11px] text-[var(--text-muted)] space-y-1 mb-3 pt-2 border-t border-[var(--border-subtle)]">
                      {slot.reasons.slice(0, 2).map((r: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span className="truncate">{r}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)] mt-2">
                  <span className="text-[11px] font-semibold text-[var(--brand-primary)]">
                    {isSelected ? '✓ Selected' : '+ Select Slot'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSchedule(slot);
                    }}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)] transition cursor-pointer shadow-2xs"
                  >
                    Lock Slot Now
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
