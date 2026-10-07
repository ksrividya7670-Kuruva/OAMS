import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import { type AppointmentInboxItemDto, RoleCode } from '@oams/shared';
import { STATUS_LABELS, PRIORITY_LABELS } from '../appointments/labels';
import {
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  User,
} from 'lucide-react';

export const InboxPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [items, setItems] = useState<AppointmentInboxItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNDER_REVIEW' | 'PENDING_APPROVAL' | 'URGENT'>('ALL');

  // Quick Action Modal states
  const [quickActionApt, setQuickActionApt] = useState<AppointmentInboxItemDto | null>(null);
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadInbox = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      const params = new URLSearchParams();
      if (user?.officialId) params.append('officialId', user.officialId);
      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const res = await api.get<AppointmentInboxItemDto[]>(`/api/v1/appointments/inbox${queryStr}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setItems(Array.isArray(res) ? res : []);
    } catch (err: any) {
      if (!silent) setError(err.message || 'Failed to load inbox');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadInbox(false);

    const handleUpdate = () => loadInbox(true);
    window.addEventListener('oams-notifications-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('oams-notifications-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [user, token]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleQuickApprove = async (apt: AppointmentInboxItemDto) => {
    try {
      setProcessing(true);
      await api.patch(`/api/v1/appointments/${apt.id}/approve`);
      showToast(`Appointment ${apt.referenceNo} approved successfully!`);
      setQuickActionApt(null);
      setActionType(null);
      await loadInbox(true);
    } catch (err: any) {
      alert(err.message || 'Failed to approve appointment');
    } finally {
      setProcessing(false);
    }
  };

  const handleQuickReject = async (apt: AppointmentInboxItemDto) => {
    try {
      setProcessing(true);
      await api.patch(`/api/v1/appointments/${apt.id}/reject`, { reason: rejectReason || 'Schedule constraint' });
      showToast(`Appointment ${apt.referenceNo} has been rejected.`);
      setQuickActionApt(null);
      setActionType(null);
      setRejectReason('');
      await loadInbox(true);
    } catch (err: any) {
      alert(err.message || 'Failed to reject appointment');
    } finally {
      setProcessing(false);
    }
  };

  // Chamber-scoped items
  const chamberItems = useMemo(() => {
    if (user?.officialId) {
      return items.filter((apt) => {
        const offId = apt.officialId || (apt as any).official?.id;
        if (offId && offId === user.officialId) return true;
        if (user.fullName && apt.officialName) {
          const u = user.fullName.toLowerCase().replace(/^(mr\.|dr\.|prof\.|ms\.|mrs\.)\s*/i, '').trim();
          const h = apt.officialName.toLowerCase().replace(/^(mr\.|dr\.|prof\.|ms\.|mrs\.)\s*/i, '').trim();
          if (u && h && (h.includes(u) || u.includes(h))) return true;
        }
        return false;
      });
    }
    if (user?.assignedOfficialIds && user.assignedOfficialIds.length > 0) {
      return items.filter((apt) => {
        const offId = apt.officialId || (apt as any).official?.id;
        return offId && user.assignedOfficialIds!.includes(offId);
      });
    }
    const isCitizen =
      !user?.officialId &&
      (!user?.roles ||
        user.roles.includes(RoleCode.GUEST) ||
        (user.roles as any).includes('CITIZEN') ||
        (user.roles as any).includes('STUDENT')) &&
      !user?.roles?.some((r) =>
        [
          RoleCode.ADMIN,
          RoleCode.SUPER_ADMIN,
          RoleCode.APPOINTMENT_ADMIN,
          RoleCode.RECEPTION,
          RoleCode.SECURITY,
          RoleCode.STAFF,
          RoleCode.PA,
          RoleCode.EA,
          RoleCode.FACULTY,
          RoleCode.OFFICIAL,
        ].includes(r as any),
      );
    if (isCitizen) {
      return items.filter((apt) => {
        const cId = (apt as any).citizenUserId || (apt as any).userId;
        const reqEmail = (apt.requesterEmail || (apt as any).email || '').toLowerCase();
        const uEmail = (user?.email || '').toLowerCase();
        const reqName = (apt.requesterName || '').toLowerCase();
        const uName = (user?.fullName || '').toLowerCase();
        return (
          (cId && cId === user?.id) ||
          (uEmail && reqEmail === uEmail) ||
          (uName && reqName.includes(uName))
        );
      });
    }
    return items;
  }, [items, user]);

  // Metrics summary
  const metrics = useMemo(() => {
    const total = chamberItems.length;
    let urgent = 0;
    let underReview = 0;
    let pendingApproval = 0;

    chamberItems.forEach((item) => {
      if (item.priority === 'URGENT' || item.priority === 'HIGH') urgent++;
      if (item.status === 'UNDER_REVIEW') underReview++;
      if (item.status === 'PENDING_APPROVAL' || item.status === 'SUBMITTED') pendingApproval++;
    });

    return { total, urgent, underReview, pendingApproval };
  }, [chamberItems]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return chamberItems.filter((apt) => {
      // Tab filter
      if (activeTab === 'UNDER_REVIEW' && apt.status !== 'UNDER_REVIEW') return false;
      if (activeTab === 'PENDING_APPROVAL' && apt.status !== 'PENDING_APPROVAL') return false;
      if (activeTab === 'URGENT' && apt.priority !== 'URGENT' && apt.priority !== 'HIGH') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const refMatch = (apt.referenceNo || '').toLowerCase().includes(q);
        const subjMatch = (apt.subject || '').toLowerCase().includes(q);
        const reqMatch = (apt.requesterName || '').toLowerCase().includes(q);
        const offMatch = (apt.officialName || '').toLowerCase().includes(q);
        if (!refMatch && !subjMatch && !reqMatch && !offMatch) return false;
      }

      return true;
    });
  }, [chamberItems, activeTab, searchQuery]);

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 p-4 bg-emerald-600 text-white rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)] tracking-tight">
            Secretariat Review &amp; Triage Inbox
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Appointments requiring administrative verification, slot matching, and chamber clearance.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadInbox(false)}
          disabled={refreshing || loading}
          className="px-3 py-1.5 border border-[var(--border-default)] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-main)] transition cursor-pointer flex items-center gap-1.5 self-start sm:self-auto shadow-2xs disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[var(--brand-primary)]' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Metric KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xs">
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Total In Queue
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--text-main)] mt-1">{metrics.total}</div>
        </div>

        <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 shadow-2xs">
          <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Urgent / High Priority</span>
          </div>
          <div className="text-2xl font-bold font-mono text-amber-900 dark:text-amber-200 mt-1">{metrics.urgent}</div>
        </div>

        <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-2xs">
          <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Under Active Review</span>
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-900 dark:text-indigo-200 mt-1">{metrics.underReview}</div>
        </div>

        <div className="p-4 rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/20 shadow-2xs">
          <div className="text-[11px] font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Awaiting Clearance</span>
          </div>
          <div className="text-2xl font-bold font-mono text-purple-900 dark:text-purple-200 mt-1">{metrics.pendingApproval}</div>
        </div>
      </div>

      {/* Search Bar & Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-2xl">
        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'ALL'
                ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)]'
            }`}
          >
            All Pending ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('UNDER_REVIEW')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'UNDER_REVIEW'
                ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)]'
            }`}
          >
            Under Review
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('PENDING_APPROVAL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'PENDING_APPROVAL'
                ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)]'
            }`}
          >
            Pending Approval
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('URGENT')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'URGENT'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)]'
            }`}
          >
            Urgent Triage ({metrics.urgent})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search reference, subject, requester..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8.5 pr-3 py-1.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-xs text-[var(--text-main)] placeholder:text-[var(--text-muted)] focus:outline-hidden focus:ring-1 focus:ring-[var(--brand-primary)]"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-300 rounded-xl text-red-800 text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-xs text-[var(--text-muted)] flex flex-col items-center justify-center gap-3">
          <div className="w-7 h-7 border-2 border-[var(--brand-primary)] border-t-transparent rounded-full animate-spin" />
          <span>Loading secretariat triage queue...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-12 text-center shadow-2xs">
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center text-xl mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[var(--text-main)]">Inbox Triage Clear</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm mx-auto">
            {searchQuery
              ? 'No appointments matched your search query. Try clearing your search filters.'
              : 'All submitted appointments for your assigned chambers have been reviewed.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredItems.map((apt) => {
            const statusInfo = STATUS_LABELS[apt.status] || {
              label: apt.status,
              badgeClass: 'bg-slate-100 text-slate-700',
            };
            const priorityInfo = PRIORITY_LABELS[apt.priority] || {
              label: apt.priority,
              badgeClass: 'bg-slate-100 text-slate-700',
            };

            return (
              <div
                key={apt.id}
                className="bg-[var(--bg-surface)] border border-[var(--border-default)] hover:border-[var(--brand-primary)]/40 rounded-2xl p-5 transition shadow-2xs hover:shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[var(--brand-primary)] bg-[var(--brand-primary)]/10 dark:bg-[var(--brand-primary)]/20 border border-[var(--brand-primary)]/20 px-2.5 py-0.5 rounded-md">
                      {apt.referenceNo}
                    </span>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${statusInfo.badgeClass}`}>
                      {statusInfo.label}
                    </span>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${priorityInfo.badgeClass}`}>
                      {priorityInfo.label}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-[var(--text-main)] tracking-tight">{apt.subject}</h3>

                  <div className="flex flex-wrap gap-y-1 gap-x-5 text-xs text-[var(--text-muted)] pt-0.5">
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      <span>
                        <strong className="text-[var(--text-main)] font-semibold">Requester:</strong> {apt.requesterName} ({apt.requesterType})
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                      <span>
                        <strong className="text-[var(--text-main)] font-semibold">Chamber:</strong> {apt.officialTitle} {apt.officialName}
                      </span>
                    </span>
                    {apt.status === 'UNDER_REVIEW' && apt.slaDueAt && (
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        <span>
                          <strong className="text-[var(--text-main)] font-semibold">Target Response:</strong> {new Date(apt.slaDueAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 md:pt-0 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setQuickActionApt(apt);
                      setActionType('APPROVE');
                    }}
                    className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold rounded-xl transition cursor-pointer shadow-2xs"
                  >
                    Approve
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setQuickActionApt(apt);
                      setActionType('REJECT');
                    }}
                    className="px-3 py-2 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 text-xs font-semibold rounded-xl transition cursor-pointer shadow-2xs"
                  >
                    Reject
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate(`/app/appointments/${apt.id}`)}
                    className="px-3.5 py-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <span>Full Review</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal for Quick Approve / Reject */}
      {quickActionApt && actionType && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5">
              {actionType === 'APPROVE' ? (
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <XCircle className="w-5 h-5" />
                </div>
              )}
              <div>
                <h3 className="text-base font-bold text-[var(--text-main)]">
                  {actionType === 'APPROVE' ? 'Confirm Appointment Approval' : 'Reject Appointment Request'}
                </h3>
                <p className="text-xs text-[var(--text-muted)] font-mono">{quickActionApt.referenceNo}</p>
              </div>
            </div>

            <div className="p-3 bg-[var(--bg-subtle)] rounded-xl border border-[var(--border-subtle)] text-xs space-y-1.5">
              <div><strong className="text-[var(--text-main)]">Subject:</strong> {quickActionApt.subject}</div>
              <div><strong className="text-[var(--text-main)]">Official:</strong> {quickActionApt.officialTitle} {quickActionApt.officialName}</div>
              <div><strong className="text-[var(--text-main)]">Requester:</strong> {quickActionApt.requesterName}</div>
            </div>

            {actionType === 'REJECT' && (
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Reason for Rejection *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g., Chamber dignitary official tour constraint, protocol schedule clash..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full p-2.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl text-xs text-[var(--text-main)] focus:ring-1 focus:ring-red-500"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                disabled={processing}
                onClick={() => {
                  setQuickActionApt(null);
                  setActionType(null);
                }}
                className="px-3.5 py-2 border border-[var(--border-default)] text-xs font-semibold rounded-xl text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition cursor-pointer"
              >
                Cancel
              </button>

              {actionType === 'APPROVE' ? (
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => handleQuickApprove(quickActionApt)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {processing ? 'Approving...' : 'Confirm Approval'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => handleQuickReject(quickActionApt)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {processing ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
