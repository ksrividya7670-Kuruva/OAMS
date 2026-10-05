import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import { type AppointmentDetailDto, type ChangeRequestDto, CancelReason } from '@oams/shared';
import { STATUS_LABELS, PRIORITY_LABELS } from './labels';
import { AppointmentSchedulingTab } from './AppointmentSchedulingTab';
import { AppointmentNotesAndActionsTab } from './AppointmentNotesAndActionsTab';
import { RescheduleModal } from './RescheduleModal';
import { UserX, AlertCircle, RefreshCw, XCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { sendAppointmentStatusNotifications } from '@/lib/powerAutomateClient';

interface ProposedSlotInput {
  date: string;
  startTime: string;
  endTime: string;
  roomId?: string;
}

export const AppointmentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [apt, setApt] = useState<AppointmentDetailDto | null>(null);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'scheduling' | 'notes_and_actions' | 'change_requests'
  >('overview');

  // Reschedule modal state
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);

  // Cancellation modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState<string>(CancelReason.OFFICIAL_UNAVAILABLE);
  const [cancelNote, setCancelNote] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Remove official modal state
  const [removeOfficialId, setRemoveOfficialId] = useState<string | null>(null);
  const [removeOfficialReason, setRemoveOfficialReason] = useState('');
  const [removingOfficial, setRemovingOfficial] = useState(false);

  // Propose change request slots modal
  const [proposingCrId, setProposingCrId] = useState<string | null>(null);
  const [proposedSlots, setProposedSlots] = useState<ProposedSlotInput[]>([
    { date: '', startTime: '10:00', endTime: '10:30' },
  ]);
  const [proposingSlots, setProposingSlots] = useState(false);

  // Reject change request state
  const [rejectingCrId, setRejectingCrId] = useState<string | null>(null);
  const [rejectCrReason, setRejectCrReason] = useState('');
  const [rejectingCr, setRejectingCr] = useState(false);

  const fetchAppointment = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [aptRes, crRes] = await Promise.all([
        api.get<AppointmentDetailDto>(`/api/v1/appointments/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
        api
          .get<ChangeRequestDto[]>(`/api/v1/appointments/${id}/change-requests`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
          .catch(() => []),
      ]);
      setApt(aptRes);
      setChangeRequests(crRes);
    } catch (err: any) {
      setError(err.message || 'Failed to load appointment details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointment();
  }, [id, user, token]);

  const getSafeTargetEmail = (item: any) => {
    const raw = (item?.attendees?.[0] as any)?.email || (item as any)?.requesterEmail;
    if (raw && !raw.includes('@apex.') && !raw.includes('@oams.local')) return raw;
    return (typeof window !== 'undefined' ? localStorage.getItem('oams_last_requester_email') : null) || 'apointments@smru.edu.in';
  };

  const handleApprove = async () => {
    if (!id || !apt) return;
    try {
      await api.patch(`/api/v1/appointments/${id}/approve`);
      await fetchAppointment();
      const targetEmail = getSafeTargetEmail(apt);
      const targetName = apt.attendees?.[0]?.name || (apt as any).requesterName || 'Requester';

      sendAppointmentStatusNotifications({
        appointmentId: id,
        referenceNo: apt.referenceNo,
        subject: apt.subject,
        requesterEmail: targetEmail,
        requesterName: targetName,
        officialName: apt.official?.fullName || 'Mr. KVK',
        status: 'CONFIRMED',
        scheduledTime: apt.startAt ? new Date(apt.startAt).toLocaleString() : 'Confirmed Schedule',
        location: apt.room?.name || 'Main Secretariat Chambers',
        priority: apt.priority,
      }).catch(() => {});
    } catch (err: any) {
      alert(err.message || 'Failed to approve appointment');
    }
  };

  const handleReject = async () => {
    if (!id || !apt) return;
    try {
      await api.patch(`/api/v1/appointments/${id}/reject`);
      await fetchAppointment();
      const targetEmail = getSafeTargetEmail(apt);
      const targetName = apt.attendees?.[0]?.name || (apt as any).requesterName || 'Requester';

      sendAppointmentStatusNotifications({
        appointmentId: id,
        referenceNo: apt.referenceNo,
        subject: apt.subject,
        requesterEmail: targetEmail,
        requesterName: targetName,
        officialName: apt.official?.fullName || 'Mr. KVK',
        status: 'REJECTED',
        reason: 'Official schedule constraints and dignitary protocol clearance',
        priority: apt.priority,
      }).catch(() => {});
    } catch (err: any) {
      alert(err.message || 'Failed to reject appointment');
    }
  };

  const handleStaffCancel = async () => {
    if (!id) return;
    try {
      setCancelling(true);
      await api.post(
        `/api/v1/appointments/${id}/cancel`,
        { reason: cancelReason, note: cancelNote },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      setShowCancelModal(false);
      await fetchAppointment();

      const targetEmail = getSafeTargetEmail(apt);
      const targetName = apt?.attendees?.[0]?.name || (apt as any)?.requesterName || 'Requester';

      sendAppointmentStatusNotifications({
        appointmentId: id,
        referenceNo: apt?.referenceNo || id,
        subject: apt?.subject || 'Meeting',
        requesterEmail: targetEmail,
        requesterName: targetName,
        officialName: apt?.official?.fullName || 'Mr. KVK',
        status: 'CANCELLED',
        reason: cancelNote || cancelReason,
        priority: 'MEDIUM',
      }).catch(() => {});
    } catch (err: any) {
      alert(err.message || 'Failed to cancel appointment');
    } finally {
      setCancelling(false);
    }
  };

  const handleRemoveOfficial = async () => {
    if (!id || !removeOfficialId) return;
    if (!removeOfficialReason.trim() || removeOfficialReason.length < 3) {
      alert('Please provide a reason for removing this official (minimum 3 characters).');
      return;
    }
    try {
      setRemovingOfficial(true);
      await api.post(
        `/api/v1/appointments/${id}/officials/${removeOfficialId}/remove`,
        { reason: removeOfficialReason },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      setRemoveOfficialId(null);
      setRemoveOfficialReason('');
      await fetchAppointment();
    } catch (err: any) {
      alert(err.message || 'Failed to remove official');
    } finally {
      setRemovingOfficial(false);
    }
  };

  const handleProposeSlots = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposingCrId) return;
    const invalid = proposedSlots.find((s) => !s.date || !s.startTime || !s.endTime);
    if (invalid) {
      alert('Please complete date, start time, and end time for all proposed slots.');
      return;
    }
    try {
      setProposingSlots(true);
      const slotsPayload = proposedSlots.map((s) => ({
        startAt: new Date(`${s.date}T${s.startTime}:00`).toISOString(),
        endAt: new Date(`${s.date}T${s.endTime}:00`).toISOString(),
        roomId: s.roomId || null,
      }));

      await api.post(
        `/api/v1/appointments/change-requests/${proposingCrId}/propose`,
        { slots: slotsPayload },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      setProposingCrId(null);
      setProposedSlots([{ date: '', startTime: '10:00', endTime: '10:30' }]);
      await fetchAppointment();
    } catch (err: any) {
      alert(err.message || 'Failed to propose slots for change request');
    } finally {
      setProposingSlots(false);
    }
  };

  const handleRejectChangeRequest = async () => {
    if (!rejectingCrId) return;
    try {
      setRejectingCr(true);
      await api.post(
        `/api/v1/appointments/change-requests/${rejectingCrId}/reject`,
        { reason: rejectCrReason || 'Rejected by scheduling staff' },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      setRejectingCrId(null);
      setRejectCrReason('');
      await fetchAppointment();
    } catch (err: any) {
      alert(err.message || 'Failed to reject change request');
    } finally {
      setRejectingCr(false);
    }
  };

  if (loading)
    return (
      <div className="p-8 text-center text-sm text-[var(--text-muted)]">Loading details...</div>
    );
  if (error || !apt) return <div className="p-8 text-red-600">{error || 'Not found'}</div>;

  const statusInfo = STATUS_LABELS[apt.status] || {
    label: apt.status,
    badgeClass: 'bg-slate-100 text-slate-700',
  };
  const priorityInfo = PRIORITY_LABELS[apt.priority];
  const pendingCr = changeRequests.find(
    (cr) => cr.status === 'PENDING' || cr.status === 'AWAITING_REQUESTER',
  );

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-xs text-[#5B6070] hover:text-[#16181D] dark:text-[var(--text-muted)] dark:hover:text-[var(--text-main)] font-semibold mb-4 cursor-pointer transition-colors group"
      >
        <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
        <span>Back to Appointments</span>
      </button>

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-sm font-bold text-[var(--brand-primary)] bg-[var(--brand-primary)]/10 dark:bg-[var(--brand-primary)]/20 border border-[var(--brand-primary)]/20 dark:border-[var(--brand-primary)]/30 px-2.5 py-0.5 rounded-md">
              {apt.referenceNo}
            </span>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${statusInfo.badgeClass}`}
            >
              {statusInfo.label}
            </span>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${priorityInfo.badgeClass}`}
            >
              {priorityInfo.label} Priority
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">{apt.subject}</h1>
        </div>

        <div className="flex items-center gap-2">
          {apt.status === 'UNDER_REVIEW' && (
            <>
              <button
                onClick={handleApprove}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Approve & Confirm</span>
              </button>
              <button
                onClick={handleReject}
                className="px-4 py-2 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Reject</span>
              </button>
            </>
          )}

          {apt.status === 'CONFIRMED' && (
            <button
              onClick={() => setShowRescheduleModal(true)}
              className="px-4 py-2 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reschedule</span>
            </button>
          )}

          {apt.status !== 'CANCELLED' && apt.status !== 'COMPLETED' && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="px-4 py-2 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel Appointment</span>
            </button>
          )}

          <button
            onClick={() => navigate('/app/inbox')}
            className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] transition ml-2"
          >
            ← Back to Inbox
          </button>
        </div>
      </div>

      {/* Active Change Request Notification Banner */}
      {pendingCr && (
        <div className="mb-6 p-4 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Action Required: Reschedule Change Request ({pendingCr.status})
              </div>
              <div className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                Requester submitted a reschedule request: <em>"{pendingCr.reason}"</em>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {pendingCr.status === 'PENDING' && (
              <>
                <button
                  onClick={() => setProposingCrId(pendingCr.id)}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
                >
                  Propose Times
                </button>
                <button
                  onClick={() => setShowRescheduleModal(true)}
                  className="px-3 py-1.5 border border-amber-400 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  Direct Move
                </button>
              </>
            )}
            <button
              onClick={() => setRejectingCrId(pendingCr.id)}
              className="px-3 py-1.5 border border-red-200 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 text-xs font-semibold rounded-lg transition cursor-pointer"
            >
              Reject Change
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[var(--border-subtle)] mb-6 overflow-x-auto">
        {(['overview', 'scheduling', 'notes_and_actions', 'change_requests'] as const).map(
          (tab) => {
            const count = tab === 'change_requests' ? changeRequests.length : 0;
            const label =
              tab === 'overview'
                ? 'Overview'
                : tab === 'scheduling'
                  ? 'Scheduling'
                  : tab === 'notes_and_actions'
                    ? 'Notes & Actions'
                    : `Change Requests ${count > 0 ? `(${count})` : ''}`;

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-[var(--primary)] text-[var(--primary)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--border-default)]'
                }`}
              >
                {label}
              </button>
            );
          },
        )}
      </div>

      {/* Tab Content */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase mb-2">
                Purpose & Description
              </h3>
              <p className="text-sm text-[var(--text-main)] font-medium mb-1">{apt.purpose}</p>
              <p className="text-sm text-[var(--text-muted)] whitespace-pre-wrap">
                {apt.description}
              </p>
            </div>

            {/* Multi-Official Consensus Section (§10.5) */}
            <div className="border-t border-[var(--border-subtle)] pt-6">
              <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase mb-3">
                Assigned Officials ({1 + (apt.additionalOfficials?.length || 0)})
              </h3>

              <div className="space-y-3">
                {/* Primary Official */}
                <div className="flex items-center justify-between p-3.5 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--text-main)]">
                        {apt.official.title} ({apt.official.fullName})
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                        Primary (Required)
                      </span>
                    </div>
                    {apt.official.departmentName && (
                      <div className="text-xs text-[var(--text-muted)]">
                        {apt.official.departmentName}
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Host Official
                  </span>
                </div>

                {/* Additional Officials */}
                {apt.additionalOfficials &&
                  apt.additionalOfficials.map((off) => {
                    const isReq = off.requirement === 'REQUIRED';
                    const dec = off.decision;
                    const decBadge =
                      dec === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : dec === 'REJECTED'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';

                    return (
                      <div
                        key={off.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[var(--text-main)]">
                              {off.title} ({off.fullName})
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                isReq
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {off.requirement}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-[var(--text-muted)]">
                              Consensus Decision:
                            </span>
                            <span
                              className={`text-[11px] px-2 py-0.5 rounded-md font-semibold ${decBadge}`}
                            >
                              {dec}
                            </span>
                          </div>
                        </div>

                        {apt.status !== 'CONFIRMED' &&
                          apt.status !== 'CANCELLED' &&
                          apt.status !== 'COMPLETED' && (
                            <button
                              type="button"
                              onClick={() => setRemoveOfficialId(off.id)}
                              className="px-3 py-1.5 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950 text-red-600 dark:text-red-400 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span>Remove Official</span>
                            </button>
                          )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {apt.status === 'UNDER_REVIEW' && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mt-6">
                <h4 className="text-sm font-bold text-amber-900 dark:text-amber-300 mb-3">
                  Verification Checklist
                </h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-[var(--text-main)]">
                    <input
                      type="checkbox"
                      className="rounded text-[var(--primary)] focus:ring-[var(--primary)]"
                    />
                    Requester identity verified
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[var(--text-main)]">
                    <input
                      type="checkbox"
                      className="rounded text-[var(--primary)] focus:ring-[var(--primary)]"
                    />
                    Purpose is clear and actionable
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[var(--text-main)]">
                    <input
                      type="checkbox"
                      className="rounded text-[var(--primary)] focus:ring-[var(--primary)]"
                    />
                    Correct official assigned
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[var(--text-main)]">
                    <input
                      type="checkbox"
                      className="rounded text-[var(--primary)] focus:ring-[var(--primary)]"
                    />
                    All attachments reviewed
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'scheduling' && (
          <AppointmentSchedulingTab
            appointment={apt}
            onUpdate={fetchAppointment}
            onOpenReschedule={() => setShowRescheduleModal(true)}
          />
        )}

        {activeTab === 'change_requests' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase mb-3">
              Change & Reschedule Requests History
            </h3>

            {changeRequests.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] italic py-4">
                No change requests have been submitted for this appointment.
              </p>
            ) : (
              changeRequests.map((cr) => (
                <div
                  key={cr.id}
                  className="p-4 border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-main)] space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[var(--text-main)]">
                        {cr.requesterName || 'Requester'}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          cr.status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : cr.status === 'REJECTED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {cr.status}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">
                      {new Date(cr.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="text-xs space-y-1">
                    <div>
                      <span className="font-semibold text-[var(--text-muted)]">Reason: </span>
                      <span className="text-[var(--text-main)]">{cr.reason}</span>
                    </div>
                    {cr.preferredWindows && cr.preferredWindows.length > 0 && (
                      <div>
                        <span className="font-semibold text-[var(--text-muted)]">
                          Requested Windows:{' '}
                        </span>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {cr.preferredWindows.map((w, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded font-mono text-[11px]"
                            >
                              {w.date} ({w.from} - {w.to})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {cr.status === 'PENDING' && (
                    <div className="flex gap-2 pt-2 border-t border-[var(--border-subtle)]">
                      <button
                        onClick={() => setProposingCrId(cr.id)}
                        className="px-3 py-1.5 bg-[var(--primary)] text-white text-xs font-semibold rounded-lg"
                      >
                        Propose Candidate Slots
                      </button>
                      <button
                        onClick={() => setRejectingCrId(cr.id)}
                        className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-semibold rounded-lg"
                      >
                        Reject Request
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'notes_and_actions' && (
          <AppointmentNotesAndActionsTab
            appointmentId={apt.id}
            referenceNo={apt.referenceNo}
            subject={apt.subject}
            status={apt.status}
            officialId={apt.official.id}
            officialName={apt.official.fullName}
            canManage={
              user
                ? user.roles.some((r) =>
                    ['SUPER_ADMIN', 'ADMIN', 'OFFICIAL', 'PA', 'EA', 'COS'].includes(r),
                  )
                : false
            }
          />
        )}
      </div>

      {/* Staff Reschedule Modal */}
      {showRescheduleModal && (
        <RescheduleModal
          appointmentId={apt.id}
          referenceNo={apt.referenceNo}
          subject={apt.subject}
          currentStartAt={apt.startAt}
          currentEndAt={apt.endAt}
          currentRoomId={apt.room?.id}
          primaryOfficialId={apt.official.id}
          onClose={() => setShowRescheduleModal(false)}
          onSuccess={() => {
            setShowRescheduleModal(false);
            fetchAppointment();
          }}
        />
      )}

      {/* Staff Cancellation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-[var(--text-main)]">
              Cancel Appointment (Staff)
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              This will cancel the appointment, release the official's calendar slot, release any
              reserved room, and cancel all visitor passes.
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
                <option value={CancelReason.OFFICIAL_UNAVAILABLE}>Official Unavailable</option>
                <option value={CancelReason.EMERGENCY}>Emergency</option>
                <option value={CancelReason.SCHEDULE_CONFLICT}>Schedule Conflict</option>
                <option value={CancelReason.NO_LONGER_REQUIRED}>No Longer Required</option>
                <option value={CancelReason.REQUESTER_CANCELLED}>Requester Cancelled</option>
                <option value={CancelReason.OTHER}>Other Reason</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Internal Note
              </label>
              <textarea
                rows={3}
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value)}
                placeholder="Reason or notes for audit trail..."
                className="w-full px-4 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 border border-[var(--border-subtle)] text-sm font-semibold rounded-xl"
              >
                Go Back
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleStaffCancel}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl"
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Official Modal (§10.5) */}
      {removeOfficialId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-[var(--text-main)]">
              Remove Official from Appointment
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Removing this official will update the multi-official consensus. If all remaining
              required officials are approved, the appointment will be automatically confirmed.
            </p>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Reason for Removal *
              </label>
              <textarea
                rows={3}
                required
                minLength={3}
                value={removeOfficialReason}
                onChange={(e) => setRemoveOfficialReason(e.target.value)}
                placeholder="E.g., Official unavailable, re-routed to deputy..."
                className="w-full px-4 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRemoveOfficialId(null);
                  setRemoveOfficialReason('');
                }}
                className="px-4 py-2 border border-[var(--border-subtle)] text-sm font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removingOfficial}
                onClick={handleRemoveOfficial}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl"
              >
                {removingOfficial ? 'Removing...' : 'Confirm Removal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Propose Slots Modal for Change Request (§10.6) */}
      {proposingCrId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-[var(--text-main)]">
              Propose Times for Change Request
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Propose 1 to 3 candidate slots for the requester to accept. A 24-hour hold will be
              placed on the official's calendar for each proposed slot.
            </p>

            <form onSubmit={handleProposeSlots} className="space-y-4">
              <div className="space-y-3">
                {proposedSlots.map((slot, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--text-main)]">
                        Candidate Slot #{idx + 1}
                      </span>
                      {proposedSlots.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setProposedSlots(proposedSlots.filter((_, i) => i !== idx))
                          }
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
                          value={slot.date}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={(e) =>
                            setProposedSlots(
                              proposedSlots.map((s, i) =>
                                i === idx ? { ...s, date: e.target.value } : s,
                              ),
                            )
                          }
                          className="w-full px-2.5 py-1.5 bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[var(--text-muted)] mb-0.5">
                          Start Time
                        </label>
                        <input
                          type="time"
                          required
                          value={slot.startTime}
                          onChange={(e) =>
                            setProposedSlots(
                              proposedSlots.map((s, i) =>
                                i === idx ? { ...s, startTime: e.target.value } : s,
                              ),
                            )
                          }
                          className="w-full px-2.5 py-1.5 bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[var(--text-muted)] mb-0.5">
                          End Time
                        </label>
                        <input
                          type="time"
                          required
                          value={slot.endTime}
                          onChange={(e) =>
                            setProposedSlots(
                              proposedSlots.map((s, i) =>
                                i === idx ? { ...s, endTime: e.target.value } : s,
                              ),
                            )
                          }
                          className="w-full px-2.5 py-1.5 bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {proposedSlots.length < 3 && (
                <button
                  type="button"
                  onClick={() =>
                    setProposedSlots([
                      ...proposedSlots,
                      { date: '', startTime: '11:00', endTime: '11:30' },
                    ])
                  }
                  className="text-xs font-semibold text-[var(--primary)] hover:underline"
                >
                  + Add Candidate Slot
                </button>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setProposingCrId(null)}
                  className="px-4 py-2 border border-[var(--border-subtle)] text-sm font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={proposingSlots}
                  className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-semibold rounded-xl"
                >
                  {proposingSlots ? 'Submitting...' : 'Send Proposals'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Change Request Modal */}
      {rejectingCrId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-[var(--text-main)]">Reject Change Request</h3>
            <p className="text-xs text-[var(--text-muted)]">
              This will reject the change request. The confirmed appointment will remain scheduled
              at its current time.
            </p>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Reason
              </label>
              <textarea
                rows={3}
                value={rejectCrReason}
                onChange={(e) => setRejectCrReason(e.target.value)}
                placeholder="Explanation for rejecting..."
                className="w-full px-4 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRejectingCrId(null);
                  setRejectCrReason('');
                }}
                className="px-4 py-2 border border-[var(--border-subtle)] text-sm font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectingCr}
                onClick={handleRejectChangeRequest}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl"
              >
                {rejectingCr ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
