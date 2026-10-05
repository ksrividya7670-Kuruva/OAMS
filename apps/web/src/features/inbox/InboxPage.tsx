import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import type { AppointmentInboxItemDto } from '@oams/shared';
import { STATUS_LABELS, PRIORITY_LABELS } from '../appointments/labels';

export const InboxPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [items, setItems] = useState<AppointmentInboxItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadInbox() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get<AppointmentInboxItemDto[]>('/api/v1/appointments/inbox', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        setItems(res);
      } catch (err: any) {
        setError(err.message || 'Failed to load inbox');
      } finally {
        setLoading(false);
      }
    }
    loadInbox();
  }, [user, token]);

  const renderSlaBadge = (slaDueAt: string | null) => {
    if (!slaDueAt) return null;
    const due = new Date(slaDueAt);
    const now = new Date();
    const isOverdue = due < now;
    const isImminent = !isOverdue && due.getTime() - now.getTime() < 4 * 60 * 60 * 1000; // 4 hours

    let colorClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    if (isOverdue) colorClass = 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400';
    else if (isImminent)
      colorClass = 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400';

    return (
      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${colorClass}`}>
        {isOverdue ? 'SLA Breached' : isImminent ? 'Due Soon' : 'On Track'}
      </span>
    );
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)] tracking-tight">
            Review Inbox
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Appointments requiring your review, routing, or scheduling.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-300 rounded-xl text-red-800 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-[var(--text-muted)]">Loading inbox...</div>
      ) : items.length === 0 ? (
        <div className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">✅</div>
          <h3 className="text-base font-semibold text-[var(--text-main)]">Inbox Zero</h3>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            You have no appointments waiting for review.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((apt) => {
            const statusInfo = STATUS_LABELS[apt.status] || {
              label: apt.status,
              badgeClass: 'bg-slate-100 text-slate-700',
            };
            const priorityInfo = PRIORITY_LABELS[apt.priority];

            return (
              <div
                key={apt.id}
                className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl p-6 transition hover:shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[var(--brand-primary)] bg-[var(--brand-primary)]/10 dark:bg-[var(--brand-primary)]/20 border border-[var(--brand-primary)]/20 dark:border-[var(--brand-primary)]/30 px-2.5 py-0.5 rounded-md">
                      {apt.referenceNo}
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${statusInfo.badgeClass}`}
                    >
                      {statusInfo.label}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-semibold ${priorityInfo.badgeClass}`}
                    >
                      {priorityInfo.label}
                    </span>
                    {renderSlaBadge(apt.slaDueAt)}
                  </div>

                  <h3 className="text-base font-bold text-[var(--text-main)]">{apt.subject}</h3>

                  <div className="flex flex-wrap gap-y-1 gap-x-4 text-xs text-[var(--text-muted)]">
                    <span>
                      <strong className="text-[var(--text-main)]">From:</strong> {apt.requesterName}{' '}
                      ({apt.requesterType})
                    </span>
                    <span>
                      <strong className="text-[var(--text-main)]">With:</strong> {apt.officialTitle}{' '}
                      {apt.officialName}
                    </span>
                    {apt.slaDueAt && (
                      <span>
                        <strong className="text-[var(--text-main)]">SLA Due:</strong>{' '}
                        {new Date(apt.slaDueAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 md:pt-0">
                  <button
                    onClick={() => navigate(`/app/appointments/${apt.id}`)}
                    className="px-4 py-2 bg-[var(--bg-subtle)] hover:bg-[var(--border-subtle)] text-[var(--text-main)] text-xs font-semibold rounded-xl transition cursor-pointer"
                  >
                    Review →
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
