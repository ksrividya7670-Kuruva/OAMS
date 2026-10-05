import { useState, type FC, type FormEvent } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import { User, Moon, Check, Save } from 'lucide-react';

export const SettingsPage: FC = () => {
  const { user, token } = useAuth();

  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('07:00');
  const [digestMode, setDigestMode] = useState<'OFF' | 'DAILY'>('OFF');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

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
    </div>
  );
};
