import { useState, useMemo, useEffect, type FC } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import type { NotificationItem } from '@oams/shared';
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Calendar,
  Shield,
  Search,
  X,
  RefreshCw,
  ArrowRight,
  Inbox,
  Filter,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router';

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateString;
  }
}

function getNotificationVisuals(typeOrEventType?: string, priority?: string) {
  if (priority === 'URGENT') {
    return {
      icon: AlertCircle,
      iconColor: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-500/10 border-rose-500/20',
    };
  }

  const type = (typeOrEventType || '').toUpperCase();
  if (type.includes('CONFIRM') || type.includes('APPROV')) {
    return {
      icon: CheckCircle2,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-500/10 border-emerald-500/20',
    };
  }
  if (type.includes('COMPLET') || type.includes('CLOSE')) {
    return {
      icon: CheckCheck,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-500/10 border-blue-500/20',
    };
  }
  if (type.includes('REJECT') || type.includes('CANCEL') || type.includes('DENI')) {
    return {
      icon: XCircle,
      iconColor: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-500/10 border-rose-500/20',
    };
  }
  if (type.includes('REMIND')) {
    return {
      icon: Clock,
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      iconBg: 'bg-indigo-500/10 border-indigo-500/20',
    };
  }
  if (type.includes('UNAVAILABLE') || type.includes('SLOT') || type.includes('RESCHEDULE')) {
    return {
      icon: AlertCircle,
      iconColor: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-500/10 border-amber-500/20',
    };
  }
  if (
    type.includes('SECURITY') ||
    type.includes('BADGE') ||
    type.includes('RECEPTION') ||
    type.includes('GATE')
  ) {
    return {
      icon: Shield,
      iconColor: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-500/10 border-amber-500/20',
    };
  }
  if (
    type.includes('APPOINTMENT') ||
    type.includes('SCHEDULE') ||
    type.includes('MEETING')
  ) {
    return {
      icon: Calendar,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-500/10 border-blue-500/20',
    };
  }

  return {
    icon: Bell,
    iconColor: 'text-[var(--brand-primary)]',
    iconBg: 'bg-[var(--brand-primary)]/10 border-[var(--brand-primary)]/20',
  };
}

function getPriorityBadge(priority?: string) {
  switch (priority) {
    case 'URGENT':
      return {
        label: 'URGENT',
        className: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 font-bold',
      };
    case 'HIGH':
      return {
        label: 'HIGH',
        className:
          'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-semibold',
      };
    case 'MEDIUM':
      return {
        label: 'MEDIUM',
        className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30',
      };
    case 'LOW':
      return {
        label: 'LOW',
        className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30',
      };
    default:
      return null;
  }
}

function getRoleBadge(targetRoles?: string[]) {
  if (!targetRoles || targetRoles.length === 0 || targetRoles.includes('ALL')) {
    return {
      label: 'BROADCAST',
      className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 font-medium',
    };
  }
  const first = targetRoles[0].toUpperCase();
  if (first.includes('ADMIN')) {
    return {
      label: 'ADMIN',
      className: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30 font-semibold',
    };
  }
  if (first.includes('FACULTY') || first.includes('OFFICIAL')) {
    return {
      label: 'OFFICIAL',
      className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30 font-semibold',
    };
  }
  if (first.includes('STAFF') || first.includes('PA') || first.includes('EA')) {
    return {
      label: 'STAFF / PA',
      className: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 font-semibold',
    };
  }
  if (first.includes('RECEPTION')) {
    return {
      label: 'RECEPTION',
      className: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30 font-semibold',
    };
  }
  if (first.includes('SECURITY')) {
    return {
      label: 'SECURITY',
      className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-semibold',
    };
  }
  return {
    label: first,
    className: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20 font-medium',
  };
}

export const NotificationCenter: FC = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [filterUnread, setFilterUnread] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'APPOINTMENTS' | 'SECURITY' | 'SYSTEM'>('ALL');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'ADMIN' | 'FACULTY' | 'STAFF' | 'RECEPTION' | 'SECURITY' | 'BROADCAST'>('ALL');
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  const {
    data: rawNotifications = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery<NotificationItem[]>({
    queryKey: ['notifications', filterUnread],
    queryFn: async () => {
      const res = await api.get<any>(
        `/api/v1/notifications?limit=100${filterUnread ? '&unread=true' : ''}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.items)) return res.items;
      if (res && Array.isArray(res.data)) return res.data;
      return [];
    },
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
  });

  const notifications = useMemo(() => {
    return (rawNotifications || []).map((n) => ({
      ...n,
      type: n.type || n.eventType || 'system_alert',
      message: n.message || n.body || '',
      body: n.body || n.message || '',
      targetRoles: n.targetRoles && Array.isArray(n.targetRoles) ? n.targetRoles : ['ALL'],
      isRead: n.isRead !== undefined ? Boolean(n.isRead) : Boolean(n.readAt),
    }));
  }, [rawNotifications]);

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ['notifications-unread-count'],
    queryFn: () =>
      api.get<{ count: number }>('/api/v1/notifications/unread-count', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
  });

  const unreadCount = unreadData?.count ?? notifications.filter((n) => !n.isRead && !n.readAt).length;

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(
        `/api/v1/notifications/${id}/read`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-bell'] });
      window.dispatchEvent(new CustomEvent('oams-notifications-updated'));
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () =>
      api.post(
        '/api/v1/notifications/read-all',
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      ),
    onSuccess: () => {
      queryClient.setQueryData(['notifications-unread-count'], { count: 0 });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-bell'] });
      window.dispatchEvent(new CustomEvent('oams-notifications-updated'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.del(
        `/api/v1/notifications/${id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-bell'] });
      window.dispatchEvent(new CustomEvent('oams-notifications-updated'));
    },
  });

  // Listen for live system/application events to update dynamically in real time
  useEffect(() => {
    const handleNotificationEvent = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-bell'] });
    };
    window.addEventListener('oams-notification-created', handleNotificationEvent);
    window.addEventListener('oams-notifications-updated', handleNotificationEvent);
    window.addEventListener('storage', handleNotificationEvent);
    return () => {
      window.removeEventListener('oams-notification-created', handleNotificationEvent);
      window.removeEventListener('oams-notifications-updated', handleNotificationEvent);
      window.removeEventListener('storage', handleNotificationEvent);
    };
  }, [queryClient]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filterUnread, searchQuery, typeFilter, roleFilter]);

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      const isUnread = !n.isRead && !n.readAt;
      if (filterUnread && !isUnread) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = n.title?.toLowerCase().includes(q);
        const matchesBody = (n.message || n.body || '')?.toLowerCase().includes(q);
        const matchesType = (n.type || n.eventType || '')?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesBody && !matchesType) return false;
      }

      if (typeFilter !== 'ALL') {
        const type = ((n.type || n.eventType) || '').toUpperCase();
        if (typeFilter === 'APPOINTMENTS') {
          if (
            !type.includes('APPOINTMENT') &&
            !type.includes('SCHEDULE') &&
            !type.includes('MEETING') &&
            !type.includes('SLOT')
          ) {
            return false;
          }
        } else if (typeFilter === 'SECURITY') {
          if (
            !type.includes('SECURITY') &&
            !type.includes('BADGE') &&
            !type.includes('RECEPTION') &&
            !type.includes('GATE')
          ) {
            return false;
          }
        } else if (typeFilter === 'SYSTEM') {
          if (
            type.includes('APPOINTMENT') ||
            type.includes('SECURITY') ||
            type.includes('BADGE') ||
            type.includes('MEETING')
          ) {
            return false;
          }
        }
      }

      if (roleFilter !== 'ALL') {
        const roles = (n.targetRoles || ['ALL']).map((r: string) => r.toUpperCase());
        if (roleFilter === 'BROADCAST') {
          if (!roles.includes('ALL') && !roles.includes('*')) return false;
        } else if (roleFilter === 'ADMIN') {
          if (!roles.includes('ADMIN') && !roles.includes('SUPER_ADMIN') && !roles.includes('APPOINTMENT_ADMIN')) return false;
        } else if (roleFilter === 'FACULTY') {
          if (!roles.includes('FACULTY') && !roles.includes('OFFICIAL')) return false;
        } else if (roleFilter === 'STAFF') {
          if (!roles.includes('STAFF') && !roles.includes('EA_PA') && !roles.includes('PA') && !roles.includes('EA')) return false;
        } else if (roleFilter === 'RECEPTION') {
          if (!roles.includes('RECEPTION') && !roles.includes('RECEPTIONIST')) return false;
        } else if (roleFilter === 'SECURITY') {
          if (!roles.includes('SECURITY')) return false;
        }
      }

      return true;
    });
  }, [notifications, filterUnread, searchQuery, typeFilter, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / itemsPerPage));
  const paginatedNotifications = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredNotifications.slice(start, start + itemsPerPage);
  }, [filteredNotifications, page, itemsPerPage]);

  const hasActiveFilters = searchQuery.trim() !== '' || typeFilter !== 'ALL' || roleFilter !== 'ALL' || filterUnread;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-default)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] border border-[var(--brand-primary)]/20 relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
              )}
            </span>
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 animate-in fade-in zoom-in">
                {unreadCount} unread
              </span>
            )}
            {user?.roles && user.roles.length > 0 && (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] border border-[var(--brand-primary)]/30 flex items-center gap-1 shadow-2xs">
                <Shield className="w-3 h-3" />
                Role: {user.roles.join(', ')}
              </span>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1">
            Notifications delivered based on your active role ({user?.roles?.join(', ') || 'Employee'}) and official duties.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh notifications"
            className="p-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-[var(--brand-primary)]' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending || unreadCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-main)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
          >
            <CheckCheck className="w-4 h-4 text-emerald-600" />
            <span>Mark All as Read</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--bg-surface)] p-3 rounded-2xl border border-[var(--border-default)] shadow-2xs">
        {/* Status Tabs */}
        <div className="inline-flex rounded-xl p-1 bg-[var(--bg-subtle)] border border-[var(--border-default)] text-xs font-medium self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setFilterUnread(false)}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              !filterUnread
                ? 'bg-[var(--bg-surface)] text-[var(--text-main)] shadow-xs font-semibold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <span>All</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[var(--bg-muted)] text-[var(--text-muted)]">
              {notifications.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setFilterUnread(true)}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              filterUnread
                ? 'bg-[var(--bg-surface)] text-[var(--text-main)] shadow-xs font-semibold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <span>Unread</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Search, Role Filter & Category Filter */}
        <div className="flex flex-wrap items-center gap-2 flex-1 sm:max-w-xl justify-end">
          {/* Role Audience Filter */}
          <div className="relative">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="appearance-none pl-7 pr-8 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-xs text-[var(--text-main)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] cursor-pointer"
              title="Filter by target role audience"
            >
              <option value="ALL">All Roles</option>
              <option value="ADMIN">Admin & System</option>
              <option value="FACULTY">Faculty & Officials</option>
              <option value="STAFF">Staff & EA/PA</option>
              <option value="RECEPTION">Reception & Desk</option>
              <option value="SECURITY">Gate Security</option>
              <option value="BROADCAST">Broadcast Notices</option>
            </select>
            <Shield className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Category Dropdown */}
          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="appearance-none pl-7 pr-8 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-xs text-[var(--text-main)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              <option value="APPOINTMENTS">Appointments</option>
              <option value="SECURITY">Security / Pass</option>
              <option value="SYSTEM">System Alerts</option>
            </select>
            <Filter className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {isLoading ? (
          /* Loading Skeletons */
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 sm:p-5 flex items-start gap-4 animate-pulse"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-subtle)] shrink-0" />
                <div className="flex-1 space-y-2.5">
                  <div className="h-4 bg-[var(--bg-subtle)] rounded w-1/3" />
                  <div className="h-3 bg-[var(--bg-subtle)] rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          /* Clean Empty State */
          <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-default)] flex items-center justify-center mx-auto mb-3.5 text-[var(--text-muted)]">
              {hasActiveFilters ? <Inbox className="w-6 h-6" /> : <Bell className="w-6 h-6" />}
            </div>
            <h3 className="text-base font-semibold text-[var(--text-main)]">
              {hasActiveFilters ? 'No matching notifications' : 'All caught up!'}
            </h3>
            <p className="text-xs sm:text-sm text-[var(--text-muted)] max-w-sm mx-auto mt-1">
              {hasActiveFilters
                ? 'Try adjusting your search query or filters to see more results.'
                : 'You have no notifications right now. Any upcoming updates or notices will appear here.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setFilterUnread(false);
                  setSearchQuery('');
                  setTypeFilter('ALL');
                  setRoleFilter('ALL');
                }}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-main)] transition-colors cursor-pointer"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          /* Notification Cards */
          <>
            {paginatedNotifications.map((n) => {
              const isUnread = !n.isRead && !n.readAt;
              const visuals = getNotificationVisuals(n.type || n.eventType, n.priority);
              const PriorityIcon = visuals.icon;
              const priorityBadge = getPriorityBadge(n.priority);
              const targetLink =
                n.link || (n.appointmentId ? `/app/appointments/${n.appointmentId}` : undefined);

              return (
                <div
                  key={n.id}
                  className={`group relative rounded-xl border p-4 sm:p-5 transition-all duration-150 ${
                    isUnread
                      ? 'bg-blue-500/[0.03] dark:bg-blue-500/[0.06] border-blue-500/30 shadow-xs'
                      : 'bg-[var(--bg-surface)] border-[var(--border-default)] hover:border-[var(--border-strong)] hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-start gap-3.5 sm:gap-4">
                    {/* Icon Column */}
                    <div
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${visuals.iconBg} ${visuals.iconColor}`}
                    >
                      <PriorityIcon className="w-5 h-5" />
                    </div>

                    {/* Main Content Column */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className={`text-sm font-semibold text-[var(--text-main)] ${
                            isUnread ? 'font-bold' : ''
                          }`}
                        >
                          {n.title}
                        </span>

                        {isUnread && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white shadow-xs">
                            NEW
                          </span>
                        )}

                        {priorityBadge && (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider ${priorityBadge.className}`}
                          >
                            {priorityBadge.label}
                          </span>
                        )}

                        {(() => {
                          const roleBadge = getRoleBadge(n.targetRoles);
                          return (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] tracking-wide ${roleBadge.className}`}
                              title={`Target Audience: ${(n.targetRoles || ['ALL']).join(', ')}`}
                            >
                              {roleBadge.label}
                            </span>
                          );
                        })()}

                        <span
                          className="text-[11px] text-[var(--text-muted)] ml-auto flex items-center gap-1 shrink-0"
                          title={new Date(n.createdAt).toLocaleString()}
                        >
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(n.createdAt)}
                        </span>
                      </div>

                      <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed mt-1 break-words">
                        {n.message || n.body}
                      </p>

                      {/* Bottom Actions Row */}
                      <div className="flex items-center justify-between gap-3 mt-3 pt-2.5 border-t border-[var(--border-default)]/60">
                        <span className="text-[11px] font-mono text-[var(--text-muted)] capitalize">
                          {(n.type || n.eventType || 'NOTIFICATION').replace(/_/g, ' ').toLowerCase()}
                        </span>

                        <div className="flex items-center gap-2">
                          {isUnread && (
                            <button
                              type="button"
                              onClick={() => markReadMutation.mutate(n.id)}
                              disabled={markReadMutation.isPending}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] border border-transparent hover:border-[var(--border-default)] transition-colors cursor-pointer"
                              title="Mark as read"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Mark as read</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => deleteMutation.mutate(n.id)}
                            disabled={deleteMutation.isPending}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors cursor-pointer"
                            title="Delete notification"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            <span className="hidden sm:inline">Delete</span>
                          </button>

                          {targetLink && (
                            <button
                              type="button"
                              onClick={() => {
                                if (isUnread) markReadMutation.mutate(n.id);
                                navigate(targetLink);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold text-white bg-[var(--brand-primary)] hover:opacity-90 transition-opacity shadow-xs cursor-pointer"
                            >
                              <span>View Details</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-[var(--border-default)]">
                <span className="text-xs text-[var(--text-muted)]">
                  Showing {(page - 1) * itemsPerPage + 1} to{' '}
                  {Math.min(page * itemsPerPage, filteredNotifications.length)} of{' '}
                  {filteredNotifications.length} notifications
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-[var(--text-main)] transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <span className="text-xs font-semibold px-2 text-[var(--text-main)]">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-[var(--text-main)] transition-colors cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
