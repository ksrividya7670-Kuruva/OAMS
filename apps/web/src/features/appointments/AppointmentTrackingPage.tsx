import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
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
import { Loader2, ArrowLeft, RefreshCw } from 'lucide-react';
import { sendAppointmentStatusNotifications } from '@/lib/powerAutomateClient';
import { AcceptProposalUI } from './AcceptProposalUI';

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
  const { user, token } = useAuth();

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
    } catch (err: any) {
      alert(err.message || 'Failed to cancel appointment');
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
      alert('Please provide a reason for the change request (at least 5 characters).');
      return;
    }
    const invalidWindow = changeWindows.find((w) => !w.date || !w.from || !w.to);
    if (invalidWindow) {
      alert('Please provide complete date, start time, and end time for all preferred windows.');
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
      await fetchAppointmentData();
    } catch (err: any) {
      alert(err.message || 'Failed to submit change request');
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
      alert('Change request proposal accepted! Appointment has been rescheduled.');
      await fetchAppointmentData();
    } catch (err: any) {
      alert(err.message || 'Failed to accept proposal');
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
      await fetchAppointmentData();
    } catch (err: any) {
      alert(err.message || 'Failed to withdraw change request');
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
          onClick={() => navigate('/my/appointments')}
          className="px-6 py-2 bg-[var(--primary)] text-white text-sm font-semibold rounded-xl"
        >
          Back to My Appointments
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
        onClick={() => navigate('/my/appointments')}
        className="inline-flex items-center gap-1.5 text-xs text-[#5B6070] hover:text-[#16181D] dark:text-[var(--text-muted)] dark:hover:text-[var(--text-main)] font-semibold cursor-pointer transition-colors group"
      >
        <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
        <span>Back to My Appointments</span>
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

          <div className="flex items-center gap-2">
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
    </div>
  );
};
