import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import {
  type AppointmentDetailDto,
  type AppointmentStatusHistoryDto,
  type ChangeRequestDto,
  type PreferredWindow,
  CancelReason,
} from '@oams/shared';
import { STATUS_LABELS, PRIORITY_LABELS } from './labels';
import {
  Loader2,
  ArrowLeft,
  RefreshCw,
  Printer,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  Clock,
  MapPin,
  Building,
  Calendar,
  Info,
  ChevronRight,
  UserCheck,
} from 'lucide-react';
import { sendAppointmentStatusNotifications } from '@/lib/powerAutomateClient';
import { AcceptProposalUI } from './AcceptProposalUI';

const generateQrMatrix = (seed: string): boolean[][] => {
  const size = 21;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const drawFinder = (startX: number, startY: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          matrix[startY + r][startX + c] = true;
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  let prng = Math.abs(hash) || 12345;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= size - 8;
      const inBottomLeft = r >= size - 8 && c < 8;
      const inTiming = r === 6 || c === 6;

      if (!inTopLeft && !inTopRight && !inBottomLeft && !inTiming) {
        prng = (prng * 9301 + 49297) % 233280;
        matrix[r][c] = prng % 2 === 0;
      }
    }
  }

  return matrix;
};

const QrCodeSvg: React.FC<{ value: string; size?: number }> = ({ value, size = 140 }) => {
  const matrix = useMemo(() => generateQrMatrix(value), [value]);
  const cellSize = size / 21;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded-lg bg-white p-1 shadow-2xs shrink-0">
      <rect width={size} height={size} fill="white" />
      {matrix.map((row, r) =>
        row.map((active, c) =>
          active ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize}
              height={cellSize}
              fill="#0F172A"
            />
          ) : null,
        ),
      )}
    </svg>
  );
};

const STEPPER_STAGES = [
  { label: 'Submitted', key: 'SUBMITTED' },
  { label: 'Under Review', key: 'UNDER_REVIEW' },
  { label: 'Scheduled', key: 'SCHEDULED' },
  { label: 'Confirmed', key: 'CONFIRMED' },
  { label: 'Meeting', key: 'IN_PROGRESS' },
  { label: 'Done', key: 'COMPLETED' },
];

export const AppointmentTrackingPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token } = useAuth();

  const isTrackRoute = location.pathname.startsWith('/track');
  const backUrl = isTrackRoute ? '/track' : '/my/appointments';
  const backLabel = isTrackRoute ? 'Back to Track Appointment' : 'Back to My Appointments';

  const [appointment, setAppointment] = useState<AppointmentDetailDto | null>(null);
  const [history, setHistory] = useState<AppointmentStatusHistoryDto[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cancellation modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState<string>(CancelReason.REQUESTER_CANCELLED);
  const [cancelNote, setCancelNote] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Change request modal state
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [changeReason, setChangeReason] = useState('');
  const [changeWindows, setChangeWindows] = useState<PreferredWindow[]>([
    { date: '', from: '09:00', to: '12:00' },
  ]);
  const [changeDuration, setChangeDuration] = useState<number | undefined>(undefined);
  const [submittingChange, setSubmittingChange] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  };

  const handlePrintPass = () => {
    window.print();
  };

  const handleGateCheckIn = async () => {
    if (!id) return;
    try {
      setActionInProgress(true);
      await api.post(
        `/api/v1/appointments/${id}/check-in`,
        {},
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      showToast('Gate Check-In Verified! Visitor badge issued & status updated.');
      await fetchAppointmentData();
    } catch (err: any) {
      showToast(err.message || 'Failed to complete gate check-in');
    } finally {
      setActionInProgress(false);
    }
  };

  const getNextStepsInfo = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return {
          step: 'Stage 1 of 4: Triage & Verification',
          title: 'Request Queued in Secretariat Master Registry',
          description:
            'Your appointment request has been securely recorded. An executive secretariat assistant is reviewing schedule fit and chamber requirements.',
          action: 'No further action required. You will be notified automatically when clearance is granted or if alternate times are proposed.',
          badge: 'In Review Queue',
          badgeColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        };
      case 'UNDER_REVIEW':
        return {
          step: 'Stage 2 of 4: Dignitary Calendar Coordination',
          title: 'Executive Chamber Staff Reviewing Time Slot',
          description:
            'The executive office is evaluating calendar fit and room allocations against dignitary commitments.',
          action: 'Stand by for confirmation. Target response time is governed by official SLA window.',
          badge: 'Staff Reviewing',
          badgeColor: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
        };
      case 'AWAITING_REQUESTER':
        return {
          step: 'Action Required: Slot Selection',
          title: 'Secretariat Proposed Alternative Time Slots',
          description:
            'Due to official executive engagements, the office recommended candidate time slots matching the dignitary’s schedule.',
          action: 'Please select your preferred alternative slot below to confirm and finalize your appointment.',
          badge: 'Action Needed',
          badgeColor: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        };
      case 'CONFIRMED':
        return {
          step: 'Stage 3 of 4: Authorized & Access Ready',
          title: 'Appointment Officially Confirmed',
          description:
            'Your meeting is locked into the master calendar. Your official Digital Visitor Gate Pass with entry QR code is issued below.',
          action: 'Present your Digital Gate Pass & QR code at Security Gate 1 upon campus arrival. Please arrive 15 minutes early.',
          badge: 'Access Cleared',
          badgeColor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        };
      case 'CHECKED_IN':
        return {
          step: 'Stage 4 of 4: Reception Lounge & Ushering',
          title: 'Campus Arrival Verified at Security Gate 1',
          description:
            'Security scan verified. Visitor badge has been assigned and host official’s chamber alerted.',
          action: 'Please wait comfortably in the Executive Secretariat Lounge. A protocol liaison will usher you into the chamber.',
          badge: 'In Reception',
          badgeColor: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-800',
        };
      case 'IN_PROGRESS':
        return {
          step: 'Session Active: Chamber Meeting',
          title: 'Meeting in Progress',
          description:
            'The appointment is currently active in the executive chamber.',
          action: 'Proceedings and action notes are being documented by the secretariat.',
          badge: 'Active Now',
          badgeColor: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300 border-green-200 dark:border-green-800',
        };
      case 'COMPLETED':
      case 'CLOSED':
        return {
          step: 'Archive: Concluded',
          title: 'Official Appointment Concluded',
          description:
            'The meeting ended and minutes / follow-up action items have been archived into the OAMS central registry.',
          action: 'Gate exit pass processed. Thank you for visiting.',
          badge: 'Completed',
          badgeColor: 'bg-slate-50 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300 border-slate-200 dark:border-slate-800',
        };
      case 'REJECTED':
        return {
          step: 'Status: Request Declined',
          title: 'Unable to Accommodate at This Time',
          description:
            'The request could not be cleared due to conflicting dignitary commitments or protocol constraints.',
          action: 'You may submit a revised appointment request for a future available date.',
          badge: 'Declined',
          badgeColor: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800',
        };
      case 'CANCELLED':
        return {
          step: 'Status: Cancelled',
          title: 'Appointment Request Cancelled',
          description:
            'This appointment was cancelled prior to the meeting.',
          action: 'No further action is pending on this record.',
          badge: 'Cancelled',
          badgeColor: 'bg-slate-50 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300 border-slate-200 dark:border-slate-800',
        };
      default:
        return {
          step: 'Appointment Status Tracking',
          title: 'Tracking Status in Central Registry',
          description: 'Appointment status is being monitored in real time.',
          action: 'Check back for progress updates.',
          badge: 'Tracking',
          badgeColor: 'bg-slate-50 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300 border-slate-200 dark:border-slate-800',
        };
    }
  };

  const fetchAppointmentData = async (silent = false) => {
    if (!id) return;
    try {
      if (!silent) setLoading(true);
      else setIsRefreshing(true);
      setError(null);
      const [aptData, histData, crData] = await Promise.all([
        api.get<AppointmentDetailDto>(`/api/v1/appointments/my/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
        api.get<AppointmentStatusHistoryDto[]>(`/api/v1/appointments/my/${id}/history`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
        api
          .get<ChangeRequestDto[]>(`/api/v1/appointments/${id}/change-requests`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
          .catch(() => []),
      ]);
      setAppointment(aptData);
      setHistory(histData);
      setChangeRequests(crData);
    } catch (err: any) {
      if (!silent) setError(err.message || 'Failed to load appointment details');
    } finally {
      if (!silent) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAppointmentData(false);

    // Auto-refresh every 6 seconds to track real-time status transitions
    const interval = setInterval(() => {
      fetchAppointmentData(true);
    }, 6000);

    const handleUpdate = () => {
      fetchAppointmentData(true);
    };
    window.addEventListener('oams-notifications-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('oams-notifications-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [id, user, token]);

  const handleDownloadIcs = () => {
    if (!appointment) return;

    const startDate = appointment.startAt
      ? new Date(appointment.startAt)
      : appointment.preferredWindows?.[0]?.date
      ? new Date(
          `${appointment.preferredWindows[0].date}T${
            appointment.preferredWindows[0].from || '10:00'
          }:00`,
        )
      : new Date(Date.now() + 2 * 3600 * 1000);

    const durationMin = appointment.durationMin || 30;
    const endDate = appointment.endAt
      ? new Date(appointment.endAt)
      : new Date(startDate.getTime() + durationMin * 60 * 1000);

    const formatIcsDate = (d: Date) =>
      d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const locationStr =
      appointment.room?.name ||
      (appointment as any).location ||
      (appointment.meetingMode === 'ONLINE'
        ? appointment.onlineLink || 'Microsoft Teams Online'
        : appointment.meetingMode === 'PHONE'
        ? 'Audio Phone Call'
        : 'Executive Chambers, Main Secretariat');

    const cleanSubject = (appointment.subject || 'Official Appointment').replace(
      /[\r\n]+/g,
      ' ',
    );
    const cleanDesc = (
      appointment.description ||
      `Official Appointment Reference: ${appointment.referenceNo}`
    ).replace(/[\r\n]+/g, '\\n');

    const officialName = appointment.official?.fullName || 'Mr. KVK';

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Apex Protocol//OAMS Appointment Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${appointment.id || appointment.referenceNo || 'apt-' + Date.now()}@oams.apex.gov.in`,
      `DTSTAMP:${formatIcsDate(new Date())}`,
      `DTSTART:${formatIcsDate(startDate)}`,
      `DTEND:${formatIcsDate(endDate)}`,
      `SUMMARY:${cleanSubject}`,
      `DESCRIPTION:${cleanDesc}`,
      `LOCATION:${locationStr}`,
      `ORGANIZER;CN="${officialName}":mailto:secretary@apex.gov.in`,
      `STATUS:${appointment.status === 'CONFIRMED' ? 'CONFIRMED' : 'TENTATIVE'}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `${appointment.referenceNo || 'appointment'}.ics`,
    );
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 500);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  const handleConfirmCancel = async () => {
    if (!id) return;
    try {
      setCancelling(true);
      await api.post(
        `/api/v1/appointments/my/${id}/cancel`,
        { reason: cancelReason, note: cancelNote },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      setShowCancelModal(false);
      await fetchAppointmentData();

      const rawEmail =
        (appointment?.attendees?.[0] as any)?.email ||
        (appointment as any)?.requesterEmail;
      const targetEmail =
        (rawEmail && !rawEmail.includes('@apex.') && !rawEmail.includes('@oams.local') ? rawEmail : null) ||
        (typeof window !== 'undefined' ? localStorage.getItem('oams_last_requester_email') : null) ||
        'apointments@smru.edu.in';
      const targetName =
        appointment?.attendees?.[0]?.name ||
        (appointment as any)?.requesterName ||
        user?.fullName ||
        'Requester';

      sendAppointmentStatusNotifications({
        appointmentId: id,
        referenceNo: appointment?.referenceNo || id,
        subject: appointment?.subject || 'Meeting',
        requesterEmail: targetEmail,
        requesterName: targetName,
        officialName: appointment?.official?.fullName || 'Mr. KVK',
        status: 'CANCELLED',
        reason: cancelNote || cancelReason || 'Cancelled by requester',
        priority: 'MEDIUM',
      }).catch(() => {});
      showToast('Appointment has been successfully cancelled.');
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel appointment');
    } finally {
      setCancelling(false);
    }
  };

  const handleAddWindow = () => {
    if (changeWindows.length < 3) {
      setChangeWindows([...changeWindows, { date: '', from: '09:00', to: '12:00' }]);
    }
  };

  const handleRemoveWindow = (index: number) => {
    setChangeWindows(changeWindows.filter((_, idx) => idx !== index));
  };

  const handleUpdateWindow = (index: number, field: keyof PreferredWindow, val: string) => {
    setChangeWindows(changeWindows.map((w, idx) => (idx === index ? { ...w, [field]: val } : w)));
  };

  const handleSubmitChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!changeReason.trim() || changeReason.length < 5) {
      showToast('Please provide a reason for the change request (at least 5 characters).');
      return;
    }
    const invalidWindow = changeWindows.find((w) => !w.date || !w.from || !w.to);
    if (invalidWindow) {
      showToast('Please provide complete date, start time, and end time for all preferred windows.');
      return;
    }

    try {
      setSubmittingChange(true);
      await api.post(
        `/api/v1/appointments/${id}/change-requests`,
        {
          reason: changeReason,
          preferredWindows: changeWindows,
          newDurationMin: changeDuration,
        },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      setShowChangeModal(false);
      setChangeReason('');
      setChangeWindows([{ date: '', from: '09:00', to: '12:00' }]);
      showToast('Change request submitted for office review.');
      await fetchAppointmentData();
    } catch (err: any) {
      showToast(err.message || 'Failed to submit change request');
    } finally {
      setSubmittingChange(false);
    }
  };

  const handleAcceptProposal = async (crId: string, proposalId: string) => {
    try {
      setActionInProgress(true);
      await api.post(
        `/api/v1/appointments/change-requests/${crId}/accept`,
        { proposalId },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      showToast('Change request proposal accepted! Appointment has been rescheduled.');
      await fetchAppointmentData();
    } catch (err: any) {
      showToast(err.message || 'Failed to accept proposal');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleWithdrawChangeRequest = async (crId: string) => {
    if (!confirm('Are you sure you want to withdraw this change request?')) return;
    try {
      setActionInProgress(true);
      await api.post(
        `/api/v1/appointments/change-requests/${crId}/withdraw`,
        {},
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      showToast('Change request withdrawn.');
      await fetchAppointmentData();
    } catch (err: any) {
      showToast(err.message || 'Failed to withdraw change request');
    } finally {
      setActionInProgress(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-24 text-center text-sm text-[var(--text-muted)] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-primary)]" />
        <span>Loading appointment tracking details...</span>
      </div>
    );
  }

  if (error || !appointment) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <h2 className="text-xl font-bold text-[var(--text-main)] mb-2">Appointment Not Found</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          {error ||
            'The requested appointment record does not exist or you do not have permission to view it.'}
        </p>
        <button
          onClick={() => navigate(backUrl)}
          className="px-6 py-2 bg-[var(--primary)] text-white text-sm font-semibold rounded-xl cursor-pointer"
        >
          {backLabel}
        </button>
      </div>
    );
  }

  const statusMeta = STATUS_LABELS[appointment.status] || {
    label: appointment.status,
    requesterLabel: appointment.status,
    badgeClass: 'bg-slate-100 text-slate-700',
    stepIndex: 1,
  };
  const priorityMeta = PRIORITY_LABELS[appointment.priority];
  const activeChangeRequest = changeRequests.find(
    (cr) => cr.status === 'PENDING' || cr.status === 'AWAITING_REQUESTER',
  );

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      <button
        type="button"
        onClick={() => navigate(backUrl)}
        className="inline-flex items-center gap-1.5 text-xs text-[#5B6070] hover:text-[#16181D] dark:text-[var(--text-muted)] dark:hover:text-[var(--text-main)] font-semibold cursor-pointer transition-colors group"
      >
        <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
        <span>{backLabel}</span>
      </button>

      {/* Top Header Card */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-6 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold text-[var(--brand-primary)] bg-[var(--brand-primary)]/10 dark:bg-[var(--brand-primary)]/20 border border-[var(--brand-primary)]/20 px-2.5 py-0.5 rounded-md">
                {appointment.referenceNo}
              </span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${statusMeta.badgeClass}`}
              >
                {statusMeta.requesterLabel}
              </span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${priorityMeta.badgeClass}`}
              >
                {priorityMeta.label}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-main)] tracking-tight">
              {appointment.subject}
            </h1>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fetchAppointmentData(false)}
              disabled={isRefreshing}
              className="px-3.5 py-2 border border-[var(--border-subtle)] hover:bg-[var(--bg-main)] text-[var(--text-main)] text-xs font-semibold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
              title="Refresh status from central registry"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
              <span className="hidden sm:inline">Refresh Status</span>
            </button>

            <button
              onClick={handleDownloadIcs}
              className={`px-4 py-2 border text-xs font-semibold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                downloadSuccess
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-[var(--border-subtle)] hover:bg-[var(--bg-main)] text-[var(--text-main)]'
              }`}
            >
              <span>{downloadSuccess ? '✓' : '📅'}</span>
              <span>{downloadSuccess ? 'Saved .ics File!' : 'Download .ics'}</span>
            </button>

            {appointment.status === 'CONFIRMED' && !activeChangeRequest && (
              <button
                onClick={() => setShowChangeModal(true)}
                className="px-4 py-2 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Request Reschedule
              </button>
            )}

            {appointment.canCancel && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="px-4 py-2 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Cancel Request
              </button>
            )}
          </div>
        </div>

        {/* Stepper Progress Bar (§9.2) */}
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-4">
            Appointment Progress
          </div>
          <div className="flex items-center justify-between relative">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-[var(--border-subtle)] -translate-y-1/2 z-0" />
            {STEPPER_STAGES.map((stage, idx) => {
              const isPast = statusMeta.stepIndex > idx;
              const isCurrent = statusMeta.stepIndex === idx;

              return (
                <div key={stage.key} className="flex flex-col items-center relative z-10">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${
                      isPast
                        ? 'bg-emerald-500 text-white'
                        : isCurrent
                          ? 'bg-[var(--primary)] text-white ring-4 ring-blue-100 dark:ring-blue-950'
                          : 'bg-[var(--card-bg)] border-2 border-[var(--border-subtle)] text-[var(--text-muted)]'
                    }`}
                  >
                    {isPast ? '✓' : idx + 1}
                  </div>
                  <span
                    className={`text-xs mt-2 font-medium hidden sm:inline ${
                      isCurrent
                        ? 'text-[var(--primary)] font-bold'
                        : isPast
                          ? 'text-[var(--text-main)]'
                          : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Context-Aware Milestone Guidance & Clear Next Steps */}
        {(() => {
          const nextStep = getNextStepsInfo(appointment.status);
          return (
            <div className="mb-6 p-4 sm:p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-main)]/60 dark:bg-slate-900/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-[var(--primary)] shrink-0" />
                  <span className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                    {nextStep.step}
                  </span>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${nextStep.badgeColor} self-start sm:self-auto`}>
                  {nextStep.badge}
                </span>
              </div>
              <div className="text-xs space-y-1.5">
                <div className="font-semibold text-[var(--text-main)] text-sm">
                  {nextStep.title}
                </div>
                <p className="text-[var(--text-muted)] leading-relaxed">
                  {nextStep.description}
                </p>
                <div className="mt-2.5 p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 flex items-start gap-2.5">
                  <ChevronRight className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-950 dark:text-blue-200">
                    <strong>Action & Guidance: </strong>
                    {nextStep.action}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* SLA Resolution / Action Notice */}
        {appointment.slaDueAt && appointment.status === 'UNDER_REVIEW' && (
          <div className="p-4 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl text-xs text-blue-900 dark:text-blue-200 flex items-center justify-between">
            <div>
              <strong className="font-semibold">Review in Progress:</strong> The office is reviewing
              your request. Target response date is{' '}
              <strong>{new Date(appointment.slaDueAt).toLocaleString()}</strong>.
            </div>
            <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
              {priorityMeta.slaText}
            </span>
          </div>
        )}

        {/* Proposals Action when AWAITING_REQUESTER */}
        {appointment.status === 'AWAITING_REQUESTER' && (
          <AcceptProposalUI appointmentId={appointment.id} onUpdate={fetchAppointmentData} />
        )}

        {/* Active Change Request Banner (§10.6) */}
        {activeChangeRequest && (
          <div className="mt-6 p-5 rounded-2xl border bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border-amber-300 dark:border-amber-700/50 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/60 dark:border-amber-800/40 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
                    {activeChangeRequest.status === 'PENDING'
                      ? 'Change Request Pending Office Review'
                      : 'Alternative Times Proposed'}
                  </span>
                </div>
                <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                  Requested on {new Date(activeChangeRequest.createdAt).toLocaleDateString()} at{' '}
                  {new Date(activeChangeRequest.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>

              <button
                type="button"
                disabled={actionInProgress}
                onClick={() => handleWithdrawChangeRequest(activeChangeRequest.id)}
                className="px-3 py-1.5 border border-amber-300 dark:border-amber-700 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 text-amber-900 dark:text-amber-200 text-xs font-semibold rounded-xl transition cursor-pointer self-start sm:self-auto"
              >
                Withdraw Request
              </button>
            </div>

            <div className="text-xs space-y-2">
              <div>
                <span className="font-semibold text-amber-950 dark:text-amber-100">Reason: </span>
                <span className="text-amber-900/90 dark:text-amber-200">
                  {activeChangeRequest.reason}
                </span>
              </div>
              {activeChangeRequest.preferredWindows.length > 0 && (
                <div>
                  <span className="font-semibold text-amber-950 dark:text-amber-100">
                    Preferred Windows:{' '}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {activeChangeRequest.preferredWindows.map((w, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 bg-white/70 dark:bg-black/30 border border-amber-200 dark:border-amber-800 rounded-lg font-mono text-[11px] text-amber-900 dark:text-amber-200"
                      >
                        {w.date} ({w.from} - {w.to})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* When AWAITING_REQUESTER: list proposed candidate slots */}
            {activeChangeRequest.status === 'AWAITING_REQUESTER' &&
              activeChangeRequest.proposals &&
              activeChangeRequest.proposals.length > 0 && (
                <div className="pt-2 border-t border-amber-200/60 dark:border-amber-800/40 space-y-3">
                  <div className="text-xs font-bold text-amber-950 dark:text-amber-100">
                    Please select one of the following available slots to reschedule your
                    appointment:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {activeChangeRequest.proposals.map((prop) => {
                      const start = new Date(prop.startAt);
                      const end = new Date(prop.endAt);
                      const isExpired = new Date(prop.expiresAt).getTime() < Date.now();

                      return (
                        <div
                          key={prop.id}
                          className="p-3 bg-white/90 dark:bg-slate-900/90 border border-amber-300 dark:border-amber-700 rounded-xl flex flex-col justify-between gap-3 shadow-xs"
                        >
                          <div>
                            <div className="font-semibold text-xs text-[var(--text-main)]">
                              {start.toLocaleDateString(undefined, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </div>
                            <div className="text-xs font-mono text-[var(--primary)] font-bold mt-0.5">
                              {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                              – {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            {prop.roomName && (
                              <div className="text-[11px] text-[var(--text-muted)] mt-1">
                                Room: {prop.roomName}
                              </div>
                            )}
                            <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-1">
                              Hold expires:{' '}
                              {new Date(prop.expiresAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={isExpired || actionInProgress}
                            onClick={() => handleAcceptProposal(activeChangeRequest.id, prop.id)}
                            className="w-full py-1.5 bg-[var(--primary)] hover:opacity-90 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition cursor-pointer"
                          >
                            {isExpired
                              ? 'Expired'
                              : actionInProgress
                                ? 'Confirming...'
                                : 'Accept This Slot'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Official Digital Visitor Gate Pass & Protocol Access Card */}
      {(appointment.status === 'CONFIRMED' ||
        appointment.status === 'CHECKED_IN' ||
        appointment.status === 'IN_PROGRESS' ||
        appointment.status === 'COMPLETED' ||
        appointment.status === 'CLOSED') && (
        <div
          id="oams-digital-gate-pass"
          className="bg-white dark:bg-[#1E222B] border border-[#E4E2DC] dark:border-[#2A2F3D] rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
        >
          {/* SMRU Digital ID Header Card (Screen 7 Reference) */}
          <div className="bg-gradient-to-br from-[#1A3170] to-[#2D4C9E] text-white rounded-3xl p-6 sm:p-7 shadow-md relative overflow-hidden space-y-5">
            <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-44 h-44 bg-white/5 rounded-full pointer-events-none" />

            <div className="flex items-center justify-between border-b border-white/15 pb-4">
              <div>
                <div className="text-[10px] tracking-widest uppercase font-mono font-bold text-blue-200">
                  St. Mary's Rehabilitation University
                </div>
                <h3 className="text-lg font-bold font-serif text-white tracking-wide">
                  Digital ID &bull; One Card. All Access.
                </h3>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/20 text-white border border-white/30 backdrop-blur-sm">
                HOSTELLER / VISITOR
              </span>
            </div>

            {/* Student & Card Profile Info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-white text-[#1A3170] font-bold text-xl flex items-center justify-center shadow-xs shrink-0">
                  {(appointment.attendees?.[0]?.name || user?.fullName || 'AR')
                    .substring(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white leading-tight">
                    {appointment.attendees?.[0]?.name ||
                      (appointment as any).requesterName ||
                      user?.fullName ||
                      'Ananya Reddy'}
                  </h4>
                  <div className="text-xs text-blue-100 mt-0.5">
                    B.Tech CSE &bull; 2023–27 &bull; Room B-214
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 font-mono text-[11px] text-blue-200">
                    <span className="px-2 py-0.5 rounded-md bg-white/10">
                      PASS REF: {appointment.referenceNo || 'OAMS-2026-PASS'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-white/10">
                      ACCESS: GATE 1 &bull; ZONE A
                    </span>
                  </div>
                </div>
              </div>

              <div className="sm:text-right text-xs text-blue-100 space-y-0.5 border-t sm:border-t-0 border-white/10 pt-2 sm:pt-0">
                <div className="text-white font-bold text-sm">Chamber Clearance &bull; Active</div>
                <div className="text-[11px] text-blue-200">Electronic Visitor RFID Pass &bull; Biometric Verified</div>
                <div className="text-[10px] text-emerald-300 font-semibold flex sm:justify-end items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Security Gate 1 Clearance Ready</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pass Body: Left Details & Right QR Code */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="md:col-span-2 space-y-4">
              {/* OAMS Official Chamber Entry Clearance Status Banner */}
              <div className="p-4 rounded-2xl pastel-card-emerald border space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                      Chamber Entry Clearance &bull; Approved
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100">
                    Verified
                  </span>
                </div>
                <div className="text-xs text-emerald-900 dark:text-emerald-200">
                  <strong>Scheduled Hearing / Chamber Pass:</strong>{' '}
                  {appointment.startAt
                    ? new Date(appointment.startAt).toLocaleString([], {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Today, 10:00 AM – 10:50 AM'}
                </div>
                <div className="text-[11px] text-emerald-800 dark:text-emerald-300 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 border-t border-emerald-300/40 dark:border-emerald-800/40">
                  <span>✓ Photo ID Verified</span>
                  <span>&bull;</span>
                  <span>✓ Executive Secretariat Approved</span>
                  <span>&bull;</span>
                  <span>Scan QR at Gate 1 for Entry</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Authorized Visitor
                  </span>
                  <div className="font-bold text-[var(--text-main)] text-sm mt-0.5">
                    {appointment.attendees?.[0]?.name ||
                      (appointment as any).requesterName ||
                      user?.fullName ||
                      'Official Guest'}
                  </div>
                  {appointment.attendees?.[0]?.organization && (
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {appointment.attendees[0].organization}
                    </div>
                  )}
                </div>

                <div className="p-3.5 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Host Official
                  </span>
                  <div className="font-bold text-[var(--text-main)] text-sm mt-0.5">
                    {appointment.official?.fullName || 'Mr. KVK'}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {appointment.official?.title || 'Executive Official'} ·{' '}
                    {appointment.official?.departmentName || 'Main Secretariat'}
                  </div>
                </div>

                <div className="p-3.5 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-[var(--text-muted)]" />
                    <span>Scheduled Window</span>
                  </span>
                  <div className="font-bold text-[var(--text-main)] mt-0.5">
                    {appointment.startAt
                      ? new Date(appointment.startAt).toLocaleDateString(undefined, {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : appointment.preferredWindows?.[0]?.date || 'Confirmed Window'}
                  </div>
                  <div className="text-[11px] font-mono text-[var(--primary)] font-bold mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {appointment.startAt
                        ? `${new Date(appointment.startAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })} – ${appointment.endAt ? new Date(appointment.endAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          }) : ''}`
                        : `${appointment.preferredWindows?.[0]?.from || '10:00'} – ${appointment.preferredWindows?.[0]?.to || '10:30'}`}{' '}
                      ({appointment.durationMin} mins)
                    </span>
                  </div>
                </div>

                <div className="p-3.5 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[var(--text-muted)]" />
                    <span>Chamber Venue</span>
                  </span>
                  <div className="font-bold text-[var(--text-main)] mt-0.5">
                    {appointment.room?.name || 'Main Secretariat Chambers'}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
                    <Building className="w-3 h-3" />
                    <span>
                      {appointment.room?.building || 'Administrative Complex'}, Floor{' '}
                      {appointment.room?.floor || 2}
                    </span>
                  </div>
                </div>
              </div>

              {/* Protocol Instructions Notice */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] text-[var(--text-muted)] space-y-1">
                <div className="font-semibold text-[var(--text-main)] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Security Protocol & Access Instructions</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-[10px]">
                  <span>• Valid Government Photo ID required at Gate 1</span>
                  <span>• Electronic RFID badge issued on QR scan</span>
                  <span>• Secretariat escort required in Zone A</span>
                </div>
              </div>
            </div>

            {/* Right QR Code box (SMRU Screen 7 Backup QR) */}
            <div className="flex flex-col items-center justify-center p-5 bg-[#F7F6F2] dark:bg-[#16181F] border border-[#E4E2DC] dark:border-[#2A2F3D] rounded-3xl text-center space-y-2.5 shadow-xs">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#16181D] dark:text-white">
                <QrCode className="w-4 h-4 text-[#2957D6]" />
                <span>Backup QR &bull; One Card</span>
              </div>
              <div className="text-[10px] text-[#5B6070] dark:text-[#8E95A5]">
                Refreshes in <strong>0:24</strong> &bull; Reason needed at gate
              </div>
              <QrCodeSvg
                value={`OAMS-PASS:${appointment.referenceNo}:${appointment.id}`}
                size={144}
              />
              <div className="font-mono text-[11px] text-[#16181D] dark:text-white tracking-widest font-bold">
                {appointment.referenceNo}
              </div>
              <div className="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-300 dark:border-emerald-700">
                {appointment.status === 'CHECKED_IN' ? '✓ GATE CHECK-IN RECORDED' : 'SCAN AT GATE 1'}
              </div>

              <div className="flex items-center gap-2 mt-2 w-full pt-1">
                <button
                  type="button"
                  onClick={handlePrintPass}
                  className="flex-1 py-1.5 px-2 bg-white dark:bg-slate-800 hover:bg-slate-50 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Pass</span>
                </button>
                {appointment.status !== 'CHECKED_IN' && appointment.status !== 'COMPLETED' && (
                  <button
                    type="button"
                    disabled={actionInProgress}
                    onClick={handleGateCheckIn}
                    className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg flex items-center justify-center gap-1 cursor-pointer transition shadow-2xs disabled:opacity-50"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>{actionInProgress ? 'Checking in...' : 'Gate Check-In'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left 2 Cols: Details & Windows */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-[var(--text-main)] border-b border-[var(--border-subtle)] pb-2">
              Appointment Summary
            </h2>
            <div className="text-sm space-y-3">
              <div>
                <span className="text-xs uppercase font-semibold text-[var(--text-muted)]">
                  Official
                </span>
                <div className="font-semibold text-[var(--text-main)]">
                  {appointment.official?.title || (appointment as any).officialTitle || 'Official'} (
                  {appointment.official?.fullName || (appointment as any).officialName || 'Honorable Official'})
                </div>
                {(appointment.official?.departmentName || (appointment as any).departmentName) && (
                  <div className="text-xs text-[var(--text-muted)]">
                    {appointment.official?.departmentName || (appointment as any).departmentName}
                  </div>
                )}
              </div>

              <div>
                <span className="text-xs uppercase font-semibold text-[var(--text-muted)]">
                  Meeting Mode & Duration
                </span>
                <div className="text-[var(--text-main)]">
                  {appointment.meetingMode} · {appointment.durationMin} minutes
                </div>
              </div>

              <div>
                <span className="text-xs uppercase font-semibold text-[var(--text-muted)]">
                  Purpose
                </span>
                <div className="text-[var(--text-main)]">{appointment.purpose}</div>
              </div>

              <div>
                <span className="text-xs uppercase font-semibold text-[var(--text-muted)]">
                  Description
                </span>
                <p className="text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap mt-0.5">
                  {appointment.description}
                </p>
              </div>

              {appointment.room && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase">
                    Location Confirmed
                  </span>
                  <div className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                    {appointment.room.name} — {appointment.room.building}, Floor{' '}
                    {appointment.room.floor}
                  </div>
                </div>
              )}

              {appointment.onlineLink && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <span className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase">
                    Virtual Meeting Link
                  </span>
                  <div>
                    <a
                      href={appointment.onlineLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-[var(--primary)] font-semibold hover:underline"
                    >
                      Join Meeting Link
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Requested Preferred Windows */}
          <div className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-[var(--text-main)] border-b border-[var(--border-subtle)] pb-2">
              Requested Time Windows
            </h2>
            <div className="space-y-2">
              {(appointment.preferredWindows || []).map((win, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm"
                >
                  <span className="font-semibold text-[var(--text-main)]">
                    Option #{idx + 1}: {win.date}
                  </span>
                  <span className="text-xs text-[var(--text-muted)] font-mono">
                    {win.from} – {win.to}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Col: Status History Timeline (§9.2) */}
        <div className="space-y-6">
          <div className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-[var(--text-main)] border-b border-[var(--border-subtle)] pb-2">
              Status History Timeline
            </h2>
            <div className="space-y-4 relative before:absolute before:top-2 before:bottom-2 before:left-2 before:w-0.5 before:bg-[var(--border-subtle)]">
              {(Array.isArray(history) ? history : []).map((h) => (
                <div key={h.id} className="relative pl-6">
                  <div className="absolute left-1 top-1.5 w-2.5 h-2.5 bg-[var(--primary)] rounded-full -translate-x-1/2 ring-2 ring-[var(--card-bg)]" />
                  <div className="text-xs font-bold text-[var(--text-main)] capitalize">
                    {h.action.replace('_', ' ')}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {new Date(h.at).toLocaleDateString()}{' '}
                    {new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {h.note && (
                    <div className="text-xs text-[var(--text-muted)] mt-1 italic">{h.note}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Attendees List */}
          <div className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-sm space-y-3">
            <h2 className="text-base font-bold text-[var(--text-main)] border-b border-[var(--border-subtle)] pb-2">
              Attendees ({(appointment.attendees || []).length})
            </h2>
            {(appointment.attendees || []).length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No additional attendees listed.</p>
            ) : (
              <div className="space-y-2">
                {(appointment.attendees || []).map((att, idx) => (
                  <div key={att.id || idx} className="text-xs p-2 bg-[var(--bg-main)] rounded-lg">
                    <div className="font-semibold text-[var(--text-main)]">{att.name}</div>
                    {att.organization && (
                      <div className="text-[var(--text-muted)]">{att.organization}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cancellation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-[var(--text-main)]">
              Cancel Appointment Request
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Are you sure you want to cancel this request? Once cancelled, it cannot be reopened.
            </p>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Reason *
              </label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm"
              >
                <option value={CancelReason.REQUESTER_CANCELLED}>
                  Schedule Conflict / Change of Plans
                </option>
                <option value={CancelReason.NO_LONGER_REQUIRED}>No Longer Required</option>
                <option value={CancelReason.EMERGENCY}>Personal Emergency</option>
                <option value={CancelReason.OTHER}>Other Reason</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Additional Notes
              </label>
              <textarea
                rows={3}
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value)}
                placeholder="Optional explanation for the office..."
                className="w-full px-4 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 border border-[var(--border-subtle)] text-sm font-semibold rounded-xl"
              >
                Keep Request
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleConfirmCancel}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl"
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Request Modal (§10.6) */}
      {showChangeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div>
              <h3 className="text-lg font-bold text-[var(--text-main)]">
                Request Reschedule / Change
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Submit a request to reschedule this confirmed meeting. Staff will review and propose
                available slots based on your preferred windows.
              </p>
            </div>

            <form onSubmit={handleSubmitChangeRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Reason for Change *
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={5}
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="Explain why you need to reschedule (e.g., travel conflict, urgent conflict)..."
                  className="w-full px-4 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Preferred Windows (1 to 3) *
                  </label>
                  {changeWindows.length < 3 && (
                    <button
                      type="button"
                      onClick={handleAddWindow}
                      className="text-xs font-semibold text-[var(--primary)] hover:underline"
                    >
                      + Add Window
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {changeWindows.map((win, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[var(--text-main)]">
                          Option #{idx + 1}
                        </span>
                        {changeWindows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveWindow(idx)}
                            className="text-red-500 hover:underline text-[11px]"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] text-[var(--text-muted)] mb-0.5">
                            Date
                          </label>
                          <input
                            type="date"
                            required
                            value={win.date}
                            min={new Date().toISOString().split('T')[0]}
                            onChange={(e) => handleUpdateWindow(idx, 'date', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-lg text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--text-muted)] mb-0.5">
                            From
                          </label>
                          <input
                            type="time"
                            required
                            value={win.from}
                            onChange={(e) => handleUpdateWindow(idx, 'from', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-lg text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--text-muted)] mb-0.5">
                            To
                          </label>
                          <input
                            type="time"
                            required
                            value={win.to}
                            onChange={(e) => handleUpdateWindow(idx, 'to', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-lg text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Adjust Meeting Duration (Optional)
                </label>
                <select
                  value={changeDuration || ''}
                  onChange={(e) =>
                    setChangeDuration(e.target.value ? Number(e.target.value) : undefined)
                  }
                  className="w-full px-4 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm"
                >
                  <option value="">Keep current duration ({appointment.durationMin} mins)</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes (1 hr)</option>
                  <option value="90">90 minutes (1.5 hrs)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowChangeModal(false)}
                  className="px-4 py-2 border border-[var(--border-subtle)] text-sm font-semibold rounded-xl text-[var(--text-main)] hover:bg-[var(--bg-main)] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingChange}
                  className="px-4 py-2 bg-[var(--primary)] hover:opacity-90 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition shadow-sm"
                >
                  {submittingChange ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dynamic Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#16181D] dark:bg-slate-800 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Embedded CSS for printable Gate Pass slip */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #oams-digital-gate-pass, #oams-digital-gate-pass * {
            visibility: visible;
          }
          #oams-digital-gate-pass {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 24px;
            box-shadow: none !important;
            border: 2px solid #000 !important;
            background: #fff !important;
            color: #000 !important;
          }
        }
      `}</style>
    </div>
  );
};
