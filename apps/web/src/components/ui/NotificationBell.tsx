import { useState, useEffect, useRef, type FC } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  Shield,
  ExternalLink,
  X,
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import type { NotificationItem } from '@oams/shared';
import { useNavigate } from 'react-router';

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return '';
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
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function getCategoryVisual(typeOrEventType?: string, priority?: string) {
  if (priority === 'URGENT') {
    return {
      icon: AlertCircle,
      iconColor: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50',
    };
  }
  const type = (typeOrEventType || '').toUpperCase();
  if (type.includes('CONFIRM') || type.includes('APPROV') || type.includes('BOOKED')) {
    return {
      icon: CheckCircle2,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50',
    };
  }
  if (type.includes('COMPLET') || type.includes('CLOSE')) {
    return {
      icon: CheckCheck,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/50',
    };
  }
  if (type.includes('REJECT') || type.includes('CANCEL') || type.includes('DENI')) {
    return {
      icon: XCircle,
      iconColor: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50',
    };
  }
  if (type.includes('REMIND') || type.includes('WAIT')) {
    return {
      icon: Clock,
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      iconBg: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/50',
    };
  }
  if (type.includes('UNAVAILABLE') || type.includes('SLOT') || type.includes('RESCHEDULE')) {
    return {
      icon: AlertCircle,
      iconColor: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50',
    };
  }
  if (type.includes('SECURITY') || type.includes('BADGE') || type.includes('GATE') || type.includes('RECEPTION')) {
    return {
      icon: Shield,
      iconColor: 'text-amber-700 dark:text-amber-300',
      iconBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50',
    };
  }
  return {
    icon: Bell,
    iconColor: 'text-[#2957D6] dark:text-blue-400',
    iconBg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/50',
  };
}

export const NotificationBell: FC = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [activeToast, setActiveToast] = useState<NotificationItem | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Dynamic Query for Unread Count with auto-refetch & tab focus sync
  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const res = await api.get<any>('/api/v1/notifications/unread-count', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const count = typeof res === 'number' ? res : (res?.count ?? res?.unreadCount ?? 0);
      return { count };
    },
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
  });

  // Dynamic Query for Notifications List
  const { data: bellList = [] } = useQuery<NotificationItem[]>({
    queryKey: ['notifications-bell'],
    queryFn: async () => {
      const res = await api.get<any>('/api/v1/notifications?limit=10', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.items)) return res.items;
      if (res && Array.isArray(res.data)) return res.data;
      return [];
    },
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
  });

  const unreadCount = unreadData?.count ?? bellList.filter((n) => !n.readAt && !n.isRead).length;
  const notifications = bellList;

  // Real-time synchronization: SSE stream & local application events
  useEffect(() => {
    const handleDynamicUpdate = (e?: Event) => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-bell'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });

      if (e && (e as CustomEvent).detail) {
        const item = (e as CustomEvent).detail;
        if (item && (item.priority === 'HIGH' || item.priority === 'URGENT')) {
          setActiveToast(item);
        }
      }
    };

    window.addEventListener('oams-notification-created', handleDynamicUpdate);
    window.addEventListener('oams-notifications-updated', handleDynamicUpdate);
    window.addEventListener('storage', handleDynamicUpdate);

    // Setup live SSE stream per §14.2 if authenticated
    let eventSource: EventSource | null = null;

    async function connectSSE() {
      if (!token) return;
      try {
        const { ticket } = await api.post<{ ticket: string }>(
          '/api/v1/notifications/stream-ticket',
          {},
          { headers: { Authorization: `Bearer ${token}` } },
        );

        eventSource = new EventSource(`/api/v1/notifications/stream?ticket=${ticket}`);

        eventSource.addEventListener('unread-count', (event) => {
          try {
            const data = JSON.parse(event.data);
            queryClient.setQueryData(['notifications-unread-count'], { count: data.count });
          } catch {}
        });

        eventSource.addEventListener('notification', (event) => {
          try {
            const newItem: NotificationItem = JSON.parse(event.data);
            queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
            queryClient.invalidateQueries({ queryKey: ['notifications-bell'] });
            queryClient.invalidateQueries({ queryKey: ['notifications'] });

            if (newItem.priority === 'HIGH' || newItem.priority === 'URGENT') {
              setActiveToast(newItem);
            }
          } catch {}
        });

        eventSource.onerror = () => {
          if (eventSource) eventSource.close();
        };
      } catch {}
    }

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      window.removeEventListener('oams-notification-created', handleDynamicUpdate);
      window.removeEventListener('oams-notifications-updated', handleDynamicUpdate);
      window.removeEventListener('storage', handleDynamicUpdate);
    };
  }, [user, token, queryClient]);

  // Click outside to close popover
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const markAsReadOnly = async (id: string) => {
    try {
      // Optimistically mark as read in local cache
      queryClient.setQueryData(['notifications-unread-count'], (old: any) => ({
        count: Math.max(0, (old?.count || 1) - 1),
      }));
      queryClient.setQueryData(['notifications-bell'], (old: any) => {
        if (!Array.isArray(old)) return [];
        return old.map((n: any) =>
          n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n,
        );
      });

      await api.post(
        `/api/v1/notifications/${id}/read`,
        {},
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-bell'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      window.dispatchEvent(new CustomEvent('oams-notifications-updated'));
    } catch {}
  };

  const markAsRead = async (id: string, link: string) => {
    try {
      queryClient.setQueryData(['notifications-unread-count'], (old: any) => ({
        count: Math.max(0, (old?.count || 1) - 1),
      }));
      queryClient.setQueryData(['notifications-bell'], (old: any) => {
        if (!Array.isArray(old)) return [];
        return old.map((n: any) =>
          n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n,
        );
      });

      await api.post(
        `/api/v1/notifications/${id}/read`,
        {},
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-bell'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      window.dispatchEvent(new CustomEvent('oams-notifications-updated'));
      setIsOpen(false);
      
      const cleanLink = link?.startsWith('http') ? new URL(link).pathname : (link || '/');
      navigate(cleanLink);
    } catch {
      setIsOpen(false);
      const cleanLink = link?.startsWith('http') ? new URL(link).pathname : (link || '/');
      navigate(cleanLink);
    }
  };

  const markAllRead = async () => {
    try {
      // Optimistically update all items to read immediately
      queryClient.setQueryData(['notifications-unread-count'], { count: 0 });
      queryClient.setQueryData(['notifications-bell'], (old: any) => {
        if (!Array.isArray(old)) return [];
        return old.map((n: any) => ({ ...n, isRead: true, readAt: new Date().toISOString() }));
      });

      await api.post(
        '/api/v1/notifications/read-all',
        {},
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-bell'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      window.dispatchEvent(new CustomEvent('oams-notifications-updated'));
    } catch {}
  };

  return (
    <div className="relative" ref={popoverRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        role="button"
        id="oams-notification-bell-btn"
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className={`relative w-11 h-11 border rounded-xl flex items-center justify-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2957D6] ${
          isOpen
            ? 'bg-[#F7F6F2] dark:bg-[var(--bg-subtle)] border-[#2957D6]/40 text-[#2957D6] shadow-inner'
            : 'bg-white hover:bg-[#F7F6F2] dark:bg-[var(--bg-surface)] border-[#E4E2DC] dark:border-[var(--border-default)] text-[#16181D] dark:text-[var(--text-main)] hover:border-[#D5D2CA]'
        }`}
      >
        <Bell className={`w-5 h-5 transition-transform ${isOpen ? 'scale-105' : ''}`} />
        {unreadCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#B42318] text-white text-[10px] font-bold flex items-center justify-center shadow-xs animate-in fade-in zoom-in transition-all duration-300"
            aria-live="polite"
          >
            <span className="absolute -inset-0.5 rounded-full bg-red-500 animate-ping opacity-25 pointer-events-none" />
            <span className="relative z-10 leading-none">{unreadCount > 99 ? '99+' : unreadCount}</span>
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Notification center popover"
          className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl border border-[#E4E2DC] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E4E2DC] dark:border-[var(--border-default)] bg-[#FAF9F5] dark:bg-[var(--bg-subtle)]">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-[#16181D] dark:text-[var(--text-main)]">Notifications</span>
              {user?.roles && user.roles.length > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] border border-[var(--brand-primary)]/20">
                  {user.roles[0]}
                </span>
              )}
              {unreadCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#B42318] text-white tracking-wide">
                  {unreadCount} new
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#ECEAE3] dark:bg-[var(--bg-pill)] text-[#5B6070] dark:text-[var(--text-muted)]">
                  All caught up
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-[#2957D6] hover:text-[#1E4FC2] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>

          {/* Notifications Scroll List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-[#E4E2DC]/70 dark:divide-[var(--border-default)]">
            {notifications.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <div className="w-10 h-10 rounded-full bg-[#F7F6F2] dark:bg-[var(--bg-subtle)] text-[#5B6070] dark:text-[var(--text-muted)] flex items-center justify-center mx-auto mb-2.5">
                  <Bell className="w-5 h-5 opacity-40" />
                </div>
                <p className="text-xs font-semibold text-[#16181D] dark:text-[var(--text-main)]">No notifications yet</p>
                <p className="text-[11px] text-[#5B6070] dark:text-[var(--text-muted)] mt-1 max-w-[220px] mx-auto">
                  Alerts for meetings, visitor check-ins, and schedule updates for your role will appear here.
                </p>
              </div>
            ) : (
              notifications.map((n) => {
                const isUnread = !n.readAt && !n.isRead;
                const link =
                  n.link || (n.appointmentId ? `/app/appointments/${n.appointmentId}` : '/app/notifications');
                const visual = getCategoryVisual((n as any).type || (n as any).eventType, n.priority);
                const IconComponent = visual.icon;
                const timeString = formatRelativeTime(n.createdAt);

                return (
                  <div
                    key={n.id}
                    onClick={() => markAsRead(n.id, link)}
                    className={`p-3.5 text-left transition-colors cursor-pointer hover:bg-[#F7F6F2] dark:hover:bg-[var(--bg-subtle)] flex items-start gap-3 relative group ${
                      isUnread ? 'bg-[#F2F6FE] dark:bg-blue-950/20' : ''
                    }`}
                  >
                    {/* Category Icon */}
                    <div
                      className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${visual.iconBg} ${visual.iconColor}`}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <p
                          className={`text-xs truncate ${
                            isUnread
                              ? 'font-bold text-[#16181D] dark:text-[var(--text-main)]'
                              : 'font-medium text-[#383C49] dark:text-[var(--text-main)]'
                          }`}
                        >
                          {n.title}
                        </p>
                        {timeString && (
                          <span className="text-[10px] text-[#5B6070] dark:text-[var(--text-muted)] shrink-0 font-medium">
                            {timeString}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 mt-1">
                        {n.targetRoles && n.targetRoles.length > 0 && !n.targetRoles.includes('ALL') ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] border border-[var(--brand-primary)]/20 uppercase shrink-0">
                            {n.targetRoles[0]}
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-slate-500/10 text-slate-500 uppercase shrink-0">
                            ALL
                          </span>
                        )}
                        <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)] line-clamp-1 leading-relaxed truncate">
                          {n.message || (n as any).body}
                        </p>
                      </div>
                    </div>

                    {/* Unread dot / Mark read button */}
                    <div className="flex flex-col items-center justify-between self-stretch shrink-0">
                      {isUnread ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-[#2957D6] shrink-0" title="Unread" />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsReadOnly(n.id);
                            }}
                            title="Mark as read"
                            className="p-1 rounded-md text-[#5B6070] hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <div className="w-2" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Link */}
          <div className="p-2.5 border-t border-[#E4E2DC] dark:border-[var(--border-default)] bg-[#FAF9F5] dark:bg-[var(--bg-subtle)] text-center">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate('/app/notifications');
              }}
              className="text-xs font-semibold text-[#2957D6] hover:text-[#1E4FC2] hover:underline inline-flex items-center gap-1.5 cursor-pointer py-1 px-3 rounded-lg hover:bg-white dark:hover:bg-[var(--bg-surface)] transition-all"
            >
              <span>View All Notifications</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Toast Notification (§14.2) */}
      {activeToast && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-4 right-4 z-50 max-w-sm p-4 rounded-xl border border-red-500/30 bg-white dark:bg-[var(--bg-surface)] shadow-2xl flex items-start gap-3 animate-in fade-in slide-from-bottom-3 duration-200"
        >
          <div className="p-2 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
            <Bell className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-[#16181D] dark:text-[var(--text-main)]">{activeToast.title}</h4>
            <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)] mt-0.5">{activeToast.message || (activeToast as any).body}</p>
          </div>
          <button
            type="button"
            aria-label="Dismiss toast"
            onClick={() => setActiveToast(null)}
            className="text-[#5B6070] hover:text-[#16181D] dark:text-[var(--text-muted)] dark:hover:text-[var(--text-main)] p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
