import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import type { AppointmentListItemDto } from '@oams/shared';
import { STATUS_LABELS, PRIORITY_LABELS } from './labels';
import {
  Search,
  Plus,
  Calendar,
  MapPin,
  Video,
  Phone,
  Check,
  Copy,
  ArrowRight,
  Shield,
  Landmark,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Filter,
} from 'lucide-react';

export const MyAppointmentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<
    'all' | 'under_review' | 'confirmed' | 'completed' | 'cancelled'
  >('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    async function loadAppointments(silent = false) {
      try {
        if (!silent) setLoading(true);
        setError(null);
        const res = await api.get<AppointmentListItemDto[]>('/api/v1/appointments/my', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        setAppointments(res);
      } catch (err: any) {
        if (!silent) setError(err.message || 'Failed to load your appointments');
      } finally {
        if (!silent) setLoading(false);
      }
    }
    loadAppointments(false);

    const interval = setInterval(() => loadAppointments(true), 8000);
    const handleUpdate = () => loadAppointments(true);
    window.addEventListener('oams-notifications-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('oams-notifications-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [user, token]);

  // Clean up double titles like "Ms. (Ms. Bharathi)" or "Mr. (Mr. KVK)"
  const formatOfficialDisplay = (title?: string, name?: string): string => {
    const t = (title || '').trim();
    const n = (name || '').trim();
    if (!t) return n || 'Chamber Official';
    if (!n) return t;
    if (n.toLowerCase().startsWith(t.toLowerCase())) {
      return n;
    }
    return `${t} ${n}`;
  };

  // Clean format display for meeting mode
  const formatMeetingMode = (mode?: string, duration?: number): string => {
    const dur = duration ? `${duration}m` : '30m';
    if (mode === 'ONLINE') return `Online Video Conference (${dur})`;
    if (mode === 'IN_PERSON') return `Offline Chamber Visit (${dur})`;
    if (mode === 'PHONE') return `Teleconference Briefing (${dur})`;
    return `${mode || 'In-Person'} (${dur})`;
  };

  // Clean date formatting
  const formatDateDisplay = (dateStr?: string): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Copy reference code with live tactile feedback
  const handleCopy = (refNo: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(refNo);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Status statistics for metrics strip & tab counters
  const stats = useMemo(() => {
    let underReview = 0;
    let confirmed = 0;
    let completed = 0;
    let cancelled = 0;

    appointments.forEach((apt) => {
      const s = apt.status;
      if (
        [
          'SUBMITTED',
          'UNDER_REVIEW',
          'PENDING_APPROVAL',
          'INFO_REQUESTED',
          'AWAITING_REQUESTER',
        ].includes(s)
      ) {
        underReview++;
      } else if (['CONFIRMED', 'SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS'].includes(s)) {
        confirmed++;
      } else if (['COMPLETED', 'CLOSED'].includes(s)) {
        completed++;
      } else if (['CANCELLED', 'REJECTED'].includes(s)) {
        cancelled++;
      }
    });

    return {
      total: appointments.length,
      underReview,
      confirmed,
      completed,
      cancelled,
    };
  }, [appointments]);

  // Filtered list based on active tab and search query
  const filteredAppointments = useMemo(() => {
    return appointments.filter((apt) => {
      // Tab filter
      if (activeTab === 'under_review') {
        if (
          ![
            'SUBMITTED',
            'UNDER_REVIEW',
            'PENDING_APPROVAL',
            'INFO_REQUESTED',
            'AWAITING_REQUESTER',
          ].includes(apt.status)
        ) {
          return false;
        }
      } else if (activeTab === 'confirmed') {
        if (!['CONFIRMED', 'SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS'].includes(apt.status)) {
          return false;
        }
      } else if (activeTab === 'completed') {
        if (!['COMPLETED', 'CLOSED'].includes(apt.status)) {
          return false;
        }
      } else if (activeTab === 'cancelled') {
        if (!['CANCELLED', 'REJECTED'].includes(apt.status)) {
          return false;
        }
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchRef = (apt.referenceNo || '').toLowerCase().includes(q);
        const matchSubj = (apt.subject || '').toLowerCase().includes(q);
        const matchOff =
          (apt.officialName || '').toLowerCase().includes(q) ||
          (apt.officialTitle || '').toLowerCase().includes(q);
        if (!matchRef && !matchSubj && !matchOff) return false;
      }

      return true;
    });
  }, [appointments, activeTab, searchQuery]);

  return (
    <div className="max-w-5xl mx-auto py-4 sm:py-6 px-3 sm:px-6 space-y-6">
      {/* Institutional Top Header */}
      <div className="bg-white dark:bg-[var(--bg-surface)] border border-[#E4E2DC] dark:border-[var(--border-default)] rounded-2xl p-6 sm:p-7 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#1A3170]/10 dark:bg-blue-950/60 text-[#1A3170] dark:text-blue-300 font-mono text-[10px] font-bold uppercase tracking-wider border border-[#1A3170]/20">
                <Shield className="w-3 h-3" />
                Petition Registry &bull; Track 8
              </span>
              <span className="text-[11px] text-[#8C93A4]">&bull; Central Secretariat Ledger</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-serif text-[#16181D] dark:text-white">
              Official Appointment Petitions
            </h1>
            <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)] mt-1 max-w-xl leading-relaxed">
              Monitor review progress, secretariat triage status, digital security gate passes, and confirmed chamber schedules for your official audience requests.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/request')}
            className="h-10 px-5 bg-[#1A3170] hover:bg-[#132554] text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs inline-flex items-center gap-2 shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Request Official Appointment</span>
          </button>
        </div>

        {/* Metric Overview Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-[#EFEDE7] dark:border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
              activeTab === 'all'
                ? 'border-[#1A3170] bg-[#1A3170]/5 dark:bg-blue-950/30 ring-1 ring-[#1A3170]'
                : 'border-[#E4E2DC] dark:border-[var(--border-default)] bg-[#FBFAF7] dark:bg-[var(--bg-main)] hover:border-[#1A3170]/50'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#8C93A4]">
              Total Petitions
            </div>
            <div className="text-xl font-bold font-serif text-[#16181D] dark:text-white mt-0.5">
              {stats.total}
            </div>
            <div className="text-[10px] text-[#5B6070] dark:text-[var(--text-muted)] mt-0.5">
              All lodged requests
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('under_review')}
            className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
              activeTab === 'under_review'
                ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30 ring-1 ring-indigo-600'
                : 'border-[#E4E2DC] dark:border-[var(--border-default)] bg-[#FBFAF7] dark:bg-[var(--bg-main)] hover:border-indigo-400'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
              Under Review
            </div>
            <div className="text-xl font-bold font-serif text-[#16181D] dark:text-white mt-0.5">
              {stats.underReview}
            </div>
            <div className="text-[10px] text-[#5B6070] dark:text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
              <span>Secretariat triage</span>
              {stats.underReview > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('confirmed')}
            className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
              activeTab === 'confirmed'
                ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/30 ring-1 ring-emerald-600'
                : 'border-[#E4E2DC] dark:border-[var(--border-default)] bg-[#FBFAF7] dark:bg-[var(--bg-main)] hover:border-emerald-400'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Confirmed &amp; Scheduled
            </div>
            <div className="text-xl font-bold font-serif text-[#16181D] dark:text-white mt-0.5">
              {stats.confirmed}
            </div>
            <div className="text-[10px] text-[#5B6070] dark:text-[var(--text-muted)] mt-0.5">
              Security pass issued
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
              activeTab === 'completed'
                ? 'border-slate-600 bg-slate-100/50 dark:bg-slate-800/40 ring-1 ring-slate-600'
                : 'border-[#E4E2DC] dark:border-[var(--border-default)] bg-[#FBFAF7] dark:bg-[var(--bg-main)] hover:border-slate-400'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Completed / Closed
            </div>
            <div className="text-xl font-bold font-serif text-[#16181D] dark:text-white mt-0.5">
              {stats.completed}
            </div>
            <div className="text-[10px] text-[#5B6070] dark:text-[var(--text-muted)] mt-0.5">
              Concluded hearings
            </div>
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white dark:bg-[var(--bg-surface)] border border-[#E4E2DC] dark:border-[var(--border-default)] rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#8C93A4] absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by reference code (e.g. OAMS-2026), subject, or official name..."
              className="w-full pl-10 pr-9 py-2.5 bg-[#FBFAF7] dark:bg-[var(--bg-main)] border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-xl text-xs text-[#16181D] dark:text-white placeholder:text-[#8C93A4] focus:outline-none focus:ring-1 focus:ring-[#1A3170]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 text-[#8C93A4] hover:text-[#16181D] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Clear Filter if active */}
          {(activeTab !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('all');
                setSearchQuery('');
              }}
              className="px-3 py-2 border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-xl text-xs font-medium text-[#5B6070] hover:text-[#16181D] hover:bg-[#F7F6F2] transition cursor-pointer inline-flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Tab Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-t border-[#F5F4F0] dark:border-[var(--border-subtle)] pt-3 text-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C93A4] mr-1 hidden sm:inline-flex items-center gap-1">
            <Filter className="w-3 h-3" />
            Filter:
          </span>

          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-xs ${
              activeTab === 'all'
                ? 'bg-[#1A3170] text-white shadow-2xs font-semibold'
                : 'text-[#5B6070] hover:text-[#16181D] hover:bg-[#F7F6F2] dark:hover:bg-[var(--bg-main)]'
            }`}
          >
            All Petitions ({stats.total})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('under_review')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-xs ${
              activeTab === 'under_review'
                ? 'bg-[#1A3170] text-white shadow-2xs font-semibold'
                : 'text-[#5B6070] hover:text-[#16181D] hover:bg-[#F7F6F2] dark:hover:bg-[var(--bg-main)]'
            }`}
          >
            Under Review ({stats.underReview})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('confirmed')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-xs ${
              activeTab === 'confirmed'
                ? 'bg-[#1A3170] text-white shadow-2xs font-semibold'
                : 'text-[#5B6070] hover:text-[#16181D] hover:bg-[#F7F6F2] dark:hover:bg-[var(--bg-main)]'
            }`}
          >
            Confirmed ({stats.confirmed})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-xs ${
              activeTab === 'completed'
                ? 'bg-[#1A3170] text-white shadow-2xs font-semibold'
                : 'text-[#5B6070] hover:text-[#16181D] hover:bg-[#F7F6F2] dark:hover:bg-[var(--bg-main)]'
            }`}
          >
            Completed ({stats.completed})
          </button>

          {stats.cancelled > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('cancelled')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-xs ${
                activeTab === 'cancelled'
                  ? 'bg-[#1A3170] text-white shadow-2xs font-semibold'
                  : 'text-[#5B6070] hover:text-[#16181D] hover:bg-[#F7F6F2] dark:hover:bg-[var(--bg-main)]'
              }`}
            >
              Cancelled ({stats.cancelled})
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-xl text-red-900 dark:text-red-300 text-xs flex items-start gap-2.5 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{error}</div>
        </div>
      )}

      {/* Appointments List */}
      {loading ? (
        <div className="bg-white dark:bg-[var(--bg-surface)] border border-[#E4E2DC] dark:border-[var(--border-default)] rounded-2xl p-16 text-center shadow-2xs space-y-3">
          <div className="w-8 h-8 border-2 border-[#1A3170] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium text-[#5B6070] dark:text-[var(--text-muted)]">
            Loading your official appointment ledger...
          </p>
        </div>
      ) : appointments.length === 0 ? (
        /* Empty State (No appointments ever submitted) */
        <div className="bg-white dark:bg-[var(--bg-surface)] border border-[#E4E2DC] dark:border-[var(--border-default)] rounded-2xl p-12 sm:p-16 text-center shadow-2xs">
          <div className="w-14 h-14 bg-[#1A3170]/10 text-[#1A3170] dark:bg-blue-950/50 dark:text-blue-300 rounded-full flex items-center justify-center mx-auto mb-4 shadow-2xs">
            <FileText className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold font-serif text-[#16181D] dark:text-white">
            No Appointment Petitions Lodged Yet
          </h3>
          <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)] mt-1 mb-6 max-w-md mx-auto leading-relaxed">
            You do not have any active or past appointment petitions recorded in the institutional registry. Request an audience with leadership chambers or department heads to begin.
          </p>
          <button
            type="button"
            onClick={() => navigate('/request')}
            className="px-6 py-2.5 bg-[#1A3170] hover:bg-[#132554] text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Submit Formal Appointment Request</span>
          </button>
        </div>
      ) : filteredAppointments.length === 0 ? (
        /* Zero Results matching Search/Filter */
        <div className="bg-white dark:bg-[var(--bg-surface)] border border-[#E4E2DC] dark:border-[var(--border-default)] rounded-2xl p-12 text-center shadow-2xs space-y-3">
          <Search className="w-8 h-8 text-[#8C93A4] mx-auto opacity-70" />
          <h3 className="text-sm font-bold text-[#16181D] dark:text-white">
            No Petitions Found Matching Filters
          </h3>
          <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)] max-w-sm mx-auto">
            No appointment records matched your search query or selected status filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setActiveTab('all');
              setSearchQuery('');
            }}
            className="px-4 py-2 border border-[#D5D2CA] dark:border-[var(--border-default)] hover:bg-[#F7F6F2] text-xs font-semibold rounded-xl transition cursor-pointer inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Search &amp; Filters</span>
          </button>
        </div>
      ) : (
        /* Rendered Ledger List */
        <div className="space-y-3.5">
          <div className="flex items-center justify-between text-xs text-[#8C93A4] px-1">
            <span>
              Showing {filteredAppointments.length} of {appointments.length} recorded petition dockets
            </span>
            <span className="hidden sm:inline">Click any docket to track live protocol status</span>
          </div>

          {filteredAppointments.map((apt) => {
            const statusInfo = STATUS_LABELS[apt.status] || {
              label: apt.status,
              requesterLabel: apt.status,
              badgeClass: 'bg-slate-100 text-slate-700',
            };
            const priorityInfo = PRIORITY_LABELS[apt.priority];

            return (
              <div
                key={apt.id}
                onClick={() => navigate(`/my/appointments/${apt.id}`)}
                className="bg-white dark:bg-[var(--bg-surface)] border border-[#E4E2DC] dark:border-[var(--border-default)] rounded-2xl p-5 sm:p-6 hover:border-[#1A3170]/40 transition-all cursor-pointer shadow-2xs hover:shadow-xs group space-y-3.5"
              >
                {/* Meta Row: Reference Code, Status Pill, Priority Pill */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1A3170]/10 dark:bg-blue-950/60 border border-[#1A3170]/20 font-mono text-xs font-bold text-[#1A3170] dark:text-blue-300">
                      <span>{apt.referenceNo}</span>
                      <button
                        type="button"
                        onClick={(e) => handleCopy(apt.referenceNo, apt.id, e)}
                        className="hover:text-blue-800 dark:hover:text-white transition cursor-pointer ml-0.5"
                        title="Copy Reference Code"
                      >
                        {copiedId === apt.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 opacity-60 hover:opacity-100" />
                        )}
                      </button>
                    </div>

                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${statusInfo.badgeClass}`}
                    >
                      {statusInfo.requesterLabel}
                    </span>

                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${priorityInfo.badgeClass}`}
                    >
                      {priorityInfo.label} Priority
                    </span>
                  </div>

                  <span className="text-[11px] text-[#8C93A4] font-medium hidden sm:inline-flex items-center gap-1.5">
                    <span>Active Docket</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  </span>
                </div>

                {/* Subject Heading */}
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[#16181D] dark:text-white group-hover:text-[#1A3170] dark:group-hover:text-blue-400 transition leading-snug">
                    {apt.subject}
                  </h3>
                </div>

                {/* Metadata Row: Chamber, Engagement Mode, Lodged Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-4 pt-1 text-xs text-[#5B6070] dark:text-[var(--text-muted)] border-t border-[#F5F4F0] dark:border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <Landmark className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400 shrink-0" />
                    <span className="truncate">
                      <strong className="text-[#16181D] dark:text-white font-semibold">Chamber:</strong>{' '}
                      {formatOfficialDisplay(apt.officialTitle, apt.officialName)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {apt.meetingMode === 'ONLINE' ? (
                      <Video className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                    ) : apt.meetingMode === 'PHONE' ? (
                      <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <MapPin className="w-3.5 h-3.5 text-[#1A3170] dark:text-blue-400 shrink-0" />
                    )}
                    <span>
                      <strong className="text-[#16181D] dark:text-white font-semibold">Format:</strong>{' '}
                      {formatMeetingMode(apt.meetingMode, apt.durationMin)}
                    </span>
                  </div>

                  {apt.submittedAt && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-[#8C93A4] shrink-0" />
                      <span>
                        <strong className="text-[#16181D] dark:text-white font-semibold">Lodged:</strong>{' '}
                        {formatDateDisplay(apt.submittedAt)}
                      </span>
                    </div>
                  )}
                </div>

                {/* If Confirmed Hearing is Scheduled */}
                {apt.scheduledStartAt && (
                  <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-medium">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>
                        Confirmed Hearing:{' '}
                        <strong>
                          {new Date(apt.scheduledStartAt).toLocaleString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </strong>
                      </span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded self-start sm:self-auto border border-emerald-200 dark:border-emerald-800">
                      Security Pass Active
                    </span>
                  </div>
                )}

                {/* Bottom Action Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-[#F5F4F0] dark:border-[var(--border-subtle)]">
                  <span className="text-[11px] text-[#8C93A4]">
                    Official petition registered under Track 8 governance protocol
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/my/appointments/${apt.id}`);
                    }}
                    className="px-4 py-2 border border-[#D5D2CA] dark:border-[var(--border-default)] group-hover:border-[#1A3170] group-hover:bg-[#1A3170] text-[#16181D] dark:text-white group-hover:text-white text-xs font-semibold rounded-xl transition inline-flex items-center gap-1.5 shadow-2xs"
                  >
                    <span>View Details &amp; Track</span>
                    <ArrowRight className="w-3.5 h-3.5" />
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
