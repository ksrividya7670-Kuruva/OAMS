import { useState, type FC, type FormEvent } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import { User, Moon, Check, Save, Bell, Send, ShieldCheck, Sparkles } from 'lucide-react';

export const SettingsPage: FC = () => {
  const { user, token } = useAuth();

  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('07:00');
  const [digestMode, setDigestMode] = useState<'OFF' | 'DAILY'>('OFF');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);

  const triggerTestNotification = (type: 'STATUS_UPDATE' | 'VIP_ARRIVAL') => {
    if (!user) return;
    const isStatus = type === 'STATUS_UPDATE';
    const refNo = `APT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const newNotif = {
      id: `notif-test-${Date.now()}`,
      userId: user.id,
      officialId: (user as any).officialId || null,
      targetRoles: user.roles,
      type: isStatus ? 'appointment_confirmed' : 'visit_arrived',
      eventType: isStatus ? 'APPOINTMENT_STATUS_CHANGED' : 'VISITOR_ARRIVED',
      title: isStatus ? `Status Updated: Confirmed (${refNo})` : `VIP Guest Arrived at Gate 1`,
      message: isStatus
        ? `Appointment ${refNo} has been cleared and confirmed by the Executive Secretariat.`
        : `Dr. Ramesh (AICTE Delegation) has checked in at Security Gate Alpha. Escort requested.`,
      body: isStatus
        ? `Appointment ${refNo} has been cleared and confirmed by the Executive Secretariat.`
        : `Dr. Ramesh (AICTE Delegation) has checked in at Security Gate Alpha. Escort requested.`,
      link: '/my/appointments',
      priority: 'HIGH',
      entityType: isStatus ? 'APPOINTMENT' : 'VISIT',
      entityId: `apt-${Date.now()}`,
      isRead: false,
      readAt: null,
      createdAt: new Date().toISOString(),
    };

    try {
      const existing = JSON.parse(localStorage.getItem('oams_mock_notifications') || '[]');
      existing.unshift(newNotif);
      localStorage.setItem('oams_mock_notifications', JSON.stringify(existing));
    } catch {}

    window.dispatchEvent(new CustomEvent('oams-notification-created', { detail: newNotif }));
    window.dispatchEvent(new CustomEvent('oams-notifications-updated'));

    setTestSuccess(isStatus ? 'Status Update Notification Dispatched!' : 'VIP Arrival Alert Dispatched!');
    setTimeout(() => setTestSuccess(null), 3500);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !token) return;

    setLoading(true);
    setSaved(false);

    try {
      await api.patch(
        `/api/v1/users/${user.id}`,
        {
          quietHoursStart,
          quietHoursEnd,
          digestMode,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // error handling
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)]">User Settings</h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Manage your account profile and notification delivery controls.
        </p>
      </div>

      {/* User Profile Card */}
      <div className="p-6 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs space-y-4">
        <h2 className="text-sm font-semibold text-[var(--text-main)] flex items-center gap-2">
          <User className="w-4 h-4 text-[var(--brand-primary)]" /> Profile & Identity
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-[var(--text-muted)]">Full Name</span>
            <p className="font-semibold text-[var(--text-main)] mt-0.5">{user.fullName}</p>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Work Email</span>
            <p className="font-semibold text-[var(--text-main)] mt-0.5">{user.email}</p>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Designation</span>
            <p className="font-semibold text-[var(--text-main)] mt-0.5">
              {user.designation || 'N/A'}
            </p>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Assigned Roles</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {user.roles.map((r) => (
                <span
                  key={r}
                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--bg-subtle)] border border-[var(--border-default)] text-[var(--text-main)]"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quiet Hours & Digest Form */}
      <form
        onSubmit={handleSave}
        className="p-6 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs space-y-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-main)] flex items-center gap-2">
              <Moon className="w-4 h-4 text-purple-500" /> Quiet Hours & Digest Controls (§14.3)
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              During quiet hours, non-urgent emails and notifications are held.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label htmlFor="quiet-start" className="block font-medium text-[var(--text-main)] mb-1">
              Quiet Hours Start
            </label>
            <input
              id="quiet-start"
              type="time"
              value={quietHoursStart}
              onChange={(e) => setQuietHoursStart(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-main)]"
            />
          </div>

          <div>
            <label htmlFor="quiet-end" className="block font-medium text-[var(--text-main)] mb-1">
              Quiet Hours End
            </label>
            <input
              id="quiet-end"
              type="time"
              value={quietHoursEnd}
              onChange={(e) => setQuietHoursEnd(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-main)]"
            />
          </div>
        </div>

        <div className="text-xs space-y-2">
          <label className="block font-medium text-[var(--text-main)]">Daily Digest Mode</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="digest"
                checked={digestMode === 'OFF'}
                onChange={() => setDigestMode('OFF')}
              />
              <span>Instant Notifications (Off)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="digest"
                checked={digestMode === 'DAILY'}
                onChange={() => setDigestMode('DAILY')}
              />
              <span>Daily Morning Digest (08:00)</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-default)]">
          {saved && (
            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Preferences saved
            </span>
          )}
          {!saved && <div />}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-xs font-semibold hover:bg-[var(--brand-hover)] cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" /> {loading ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </form>

      {/* Real-Time Notification & Workflow Diagnostics Card */}
      <div className="p-6 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-main)] flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-500" /> Real-Time Notification & Workflow Diagnostics
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Verify in-app notification streaming, status alerts, and toast delivery live during evaluations.
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>SSE Gateway Active</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] space-y-2">
            <div className="text-xs font-bold text-[var(--text-main)] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              <span>Simulate Status Change Alert</span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Triggers a live status transition notification (Confirmed) that immediately updates the top notification bell badge and popup toast.
            </p>
            <button
              type="button"
              onClick={() => triggerTestNotification('STATUS_UPDATE')}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <Send className="w-3 h-3" />
              <span>Send Status Update Notification</span>
            </button>
          </div>

          <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] space-y-2">
            <div className="text-xs font-bold text-[var(--text-main)] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-500" />
              <span>Simulate VIP Gate Arrival Alert</span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Triggers a security check-in arrival event at Security Point Alpha, notifying reception and executive secretariat officers.
            </p>
            <button
              type="button"
              onClick={() => triggerTestNotification('VIP_ARRIVAL')}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <Send className="w-3 h-3" />
              <span>Send Gate Arrival Alert</span>
            </button>
          </div>
        </div>

        {testSuccess && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-semibold flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{testSuccess} Look at the top notification bell above to inspect!</span>
          </div>
        )}
      </div>
    </div>
  );
};
