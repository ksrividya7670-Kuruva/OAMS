import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthContext';
import { type ConflictCode, type RescheduleAppointmentInput } from '@oams/shared';
import { Calendar, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { sendAppointmentStatusNotifications } from '@/lib/powerAutomateClient';

interface Room {
  id: string;
  name: string;
  building: string;
  floor: string;
  capacity: number;
}

interface ConflictResult {
  bookable: boolean;
  conflicts: Array<{
    code: ConflictCode;
    severity: 'HARD' | 'SOFT';
    message: string;
  }>;
}

interface Props {
  appointmentId: string;
  referenceNo?: string;
  subject?: string;
  requesterEmail?: string;
  requesterName?: string;
  officialName?: string;
  currentStartAt?: string | null;
  currentEndAt?: string | null;
  currentRoomId?: string | null;
  primaryOfficialId?: string;
  defaultDate?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const RescheduleModal: React.FC<Props> = ({
  appointmentId,
  referenceNo,
  subject,
  requesterEmail,
  requesterName,
  officialName,
  currentStartAt,
  currentEndAt,
  currentRoomId,
  primaryOfficialId,
  defaultDate,
  defaultStartTime,
  defaultEndTime,
  onClose,
  onSuccess,
}) => {
  const { token } = useAuth();

  const [dateStr, setDateStr] = useState<string>(() => {
    if (defaultDate) return defaultDate;
    if (currentStartAt) return new Date(currentStartAt).toISOString().substring(0, 10);
    const tomorrow = new Date(Date.now() + 86400000);
    return tomorrow.toISOString().substring(0, 10);
  });

  const [startTimeStr, setStartTimeStr] = useState<string>(() => {
    if (defaultStartTime) return defaultStartTime;
    if (currentStartAt) {
      const d = new Date(currentStartAt);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return '10:00';
  });

  const [endTimeStr, setEndTimeStr] = useState<string>(() => {
    if (defaultEndTime) return defaultEndTime;
    if (currentEndAt) {
      const d = new Date(currentEndAt);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return '10:30';
  });

  const [roomId, setRoomId] = useState<string>(currentRoomId || '');
  const [reason, setReason] = useState<string>('Schedule adjustment');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [checkingConflict, setCheckingConflict] = useState(false);
  const [conflictResult, setConflictResult] = useState<ConflictResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Fetch rooms
  useEffect(() => {
    async function loadRooms() {
      try {
        const data = await api.get<Room[]>('/api/v1/rooms', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        setRooms(data);
      } catch (e) {
        console.error('Failed to load rooms:', e);
      }
    }
    loadRooms();
  }, [token]);

  // Live conflict checking
  useEffect(() => {
    if (!dateStr || !startTimeStr || !endTimeStr) return;

    const startIso = `${dateStr}T${startTimeStr}:00Z`;
    const endIso = `${dateStr}T${endTimeStr}:00Z`;

    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      setConflictResult({
        bookable: false,
        conflicts: [
          {
            code: 'OUTSIDE_WORKING_HOURS' as ConflictCode,
            severity: 'HARD',
            message: 'End time must be after start time',
          },
        ],
      });
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setCheckingConflict(true);
        setErrorBanner(null);

        const officialsPayload = primaryOfficialId
          ? [{ officialId: primaryOfficialId, requirement: 'REQUIRED' }]
          : [];

        const res = await api.post<ConflictResult>(
          '/api/v1/scheduling/check',
          {
            officials: officialsPayload,
            startAt: startIso,
            endAt: endIso,
            roomId: roomId || null,
            excludeAppointmentId: appointmentId,
          },
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        setConflictResult(res);
      } catch (err: any) {
        // If conflict check endpoint fails, soft ignore or show message
        console.warn('Conflict check check failed:', err);
      } finally {
        setCheckingConflict(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [dateStr, startTimeStr, endTimeStr, roomId, primaryOfficialId, appointmentId, token]);

  const handleConfirmReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorBanner('Please provide a reason for rescheduling');
      return;
    }

    const startIso = `${dateStr}T${startTimeStr}:00Z`;
    const endIso = `${dateStr}T${endTimeStr}:00Z`;

    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      setErrorBanner('End time must be strictly after start time');
      return;
    }

    try {
      setSubmitting(true);
      setErrorBanner(null);

      const payload: RescheduleAppointmentInput = {
        startAt: startIso,
        endAt: endIso,
        roomId: roomId || null,
        reason: reason.trim(),
      };

      await api.post(`/api/v1/appointments/${appointmentId}/reschedule`, payload, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const selectedRoom = rooms.find((r) => r.id === roomId);
      sendAppointmentStatusNotifications({
        appointmentId,
        referenceNo: referenceNo || appointmentId,
        subject: subject || 'Meeting',
        requesterEmail:
          (requesterEmail && !requesterEmail.includes('@apex.') && !requesterEmail.includes('@oams.local') ? requesterEmail : null) ||
          (typeof window !== 'undefined' ? localStorage.getItem('oams_last_requester_email') : null) ||
          'apointments@smru.edu.in',
        requesterName: requesterName || 'Requester',
        officialName: officialName || 'Office of the Official',
        status: 'RESCHEDULED',
        scheduledTime: `${dateStr} (${startTimeStr} - ${endTimeStr})`,
        location: selectedRoom
          ? `${selectedRoom.name} (${selectedRoom.building}, Fl ${selectedRoom.floor})`
          : 'Main Secretariat Chambers',
        reason: reason.trim(),
        priority: 'HIGH',
      }).catch(() => {});

      onSuccess();
      onClose();
    } catch (err: any) {
      if (err.code === 'SLOT_TAKEN' || err.status === 409 || err.message?.includes('SLOT_TAKEN')) {
        setErrorBanner(
          'Slot Taken: The official or selected room is already booked for that time. Your current appointment remains intact. Please select another slot.',
        );
      } else {
        setErrorBanner(err.message || 'Failed to reschedule appointment');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const hasHardConflict = conflictResult?.conflicts?.some((c) => c.severity === 'HARD');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-main)]">
                Reschedule Appointment
              </h3>
              {referenceNo && (
                <span className="font-mono text-xs font-semibold text-[var(--text-muted)]">
                  {referenceNo} {subject ? `· ${subject}` : ''}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error banner */}
        {errorBanner && (
          <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorBanner}</span>
          </div>
        )}

        <form onSubmit={handleConfirmReschedule} className="space-y-4 text-xs">
          {/* Date Picker */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              New Date *
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
          </div>

          {/* Time Picker */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                Start Time *
              </label>
              <div className="relative">
                <input
                  type="time"
                  required
                  value={startTimeStr}
                  onChange={(e) => setStartTimeStr(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                End Time *
              </label>
              <div className="relative">
                <input
                  type="time"
                  required
                  value={endTimeStr}
                  onChange={(e) => setEndTimeStr(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
            </div>
          </div>

          {/* Room Selection (§13) */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Meeting Room (Optional)
            </label>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="">No Room (Virtual / Requester Space)</option>
              {rooms.map((rm) => (
                <option key={rm.id} value={rm.id}>
                  {rm.name} — {rm.building} (Cap: {rm.capacity})
                </option>
              ))}
            </select>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Reason for Reschedule *
            </label>
            <textarea
              rows={2}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Official travel, urgent conflict..."
              className="w-full px-3.5 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          {/* Live Conflict Feedback (§11.2) */}
          <div className="p-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-[var(--text-main)]">Slot Conflict Status</span>
              {checkingConflict ? (
                <span className="text-[11px] text-[var(--text-muted)] animate-pulse">
                  Checking...
                </span>
              ) : hasHardConflict ? (
                <span className="text-[11px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Hard Conflict
                </span>
              ) : conflictResult?.bookable !== false ? (
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Slot Available
                </span>
              ) : null}
            </div>

            {conflictResult?.conflicts?.map((c, idx) => (
              <div
                key={idx}
                className={`text-[11px] mt-1 flex items-center gap-1.5 ${
                  c.severity === 'HARD'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                <span>• {c.message}</span>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[var(--border-subtle)] hover:bg-[var(--bg-main)] text-[var(--text-main)] text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || hasHardConflict}
              className={`px-5 py-2 text-white text-xs font-semibold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer ${
                hasHardConflict
                  ? 'bg-slate-400 cursor-not-allowed opacity-60'
                  : 'bg-[var(--primary)] hover:bg-[var(--primary-hover)]'
              }`}
            >
              {submitting ? 'Rescheduling...' : 'Confirm Reschedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
