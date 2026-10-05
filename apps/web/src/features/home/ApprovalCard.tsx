import React from 'react';
import { api } from '@/lib/api';
import type { AppointmentInboxItemDto } from '@oams/shared';
import { useNavigate } from 'react-router';

interface Props {
  appointment: AppointmentInboxItemDto;
  onActionComplete: () => void;
}

export const ApprovalCard: React.FC<Props> = ({ appointment, onActionComplete }) => {
  const navigate = useNavigate();

  const handleApprove = async () => {
    try {
      await api.post(`/api/v1/appointments/${appointment.id}/approve`);
      onActionComplete();
    } catch (err: any) {
      alert(err.message || 'Failed to approve');
    }
  };

  const handleReject = async () => {
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason) return;
    try {
      await api.post(`/api/v1/appointments/${appointment.id}/reject`, { reason });
      onActionComplete();
    } catch (err: any) {
      alert(err.message || 'Failed to reject');
    }
  };

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-[var(--text-main)]">Approval Needed</h3>
        <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">
          Pending
        </span>
      </div>

      <div className="space-y-1 mb-6">
        <div className="text-sm text-[var(--text-main)] font-medium">{appointment.subject}</div>
        <div className="text-xs text-[var(--text-muted)]">
          Requested by {appointment.requesterName}
        </div>
        {appointment.scheduledStartAt && (
          <div className="text-xs text-[var(--text-main)] mt-2">
            📅 {new Date(appointment.scheduledStartAt).toLocaleString()}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleApprove}
          className="flex-1 py-2 bg-[var(--primary)] text-white text-xs font-semibold rounded-lg transition hover:bg-[var(--primary-hover)]"
        >
          Approve
        </button>
        <button
          onClick={handleReject}
          className="flex-1 py-2 border border-[var(--border-default)] text-[var(--text-main)] text-xs font-semibold rounded-lg transition hover:bg-[var(--bg-subtle)]"
        >
          Reject
        </button>
      </div>
      <div className="mt-3 text-center">
        <button
          onClick={() => navigate(`/app/appointments/${appointment.id}`)}
          className="text-xs text-[var(--primary)] font-semibold hover:underline"
        >
          View Full Details
        </button>
      </div>
    </div>
  );
};
