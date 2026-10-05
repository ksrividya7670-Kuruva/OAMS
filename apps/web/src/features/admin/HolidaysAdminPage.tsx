import { useState, type FC, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import { type HolidayItem } from '@oams/shared';
import { CalendarDays, Plus, Trash2, AlertCircle, Flag, Sun, Sunrise, Sunset } from 'lucide-react';

export const HolidaysAdminPage: FC = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [holidayDate, setHolidayDate] = useState('');
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDayPeriod, setHalfDayPeriod] = useState<'MORNING' | 'AFTERNOON'>('MORNING');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch holidays for the selected year
  const { data: holidays = [], isLoading } = useQuery<HolidayItem[]>({
    queryKey: ['admin-holidays', selectedYear],
    queryFn: () =>
      api.get<HolidayItem[]>(`/api/v1/holidays?year=${selectedYear}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    enabled: !!token,
  });

  // Create holiday mutation
  const createMutation = useMutation({
    mutationFn: () => {
      return api.post(
        '/api/v1/holidays',
        {
          name,
          holidayDate,
          isHalfDay,
          halfDayPeriod: isHalfDay ? halfDayPeriod : null,
          description: description || null,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-holidays', selectedYear] });
      setShowModal(false);
      setName('');
      setHolidayDate('');
      setIsHalfDay(false);
      setDescription('');
      setFormError(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to create holiday';
      setFormError(msg);
    },
  });

  // Delete holiday mutation
  const deleteMutation = useMutation({
    mutationFn: (holidayId: string) => {
      return api.del(`/api/v1/holidays/${holidayId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-holidays', selectedYear] });
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !holidayDate) {
      setFormError('Please fill in holiday name and date.');
      return;
    }
    createMutation.mutate();
  };

  const years = [selectedYear - 1, selectedYear, selectedYear + 1];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bg-surface)] p-6 rounded-2xl border border-[var(--border-default)] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-rose-500/10 text-rose-600 font-bold">
              <CalendarDays className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-[var(--text-main)]">Official Holidays</h1>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Organization-wide holiday calendar. Automatically enforces HARD conflict scheduling
            checks (§7.3, §11.2).
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Year selector */}
          <div className="flex items-center bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-xl p-1">
            {years.map((y) => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  selectedYear === y
                    ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setHolidayDate(`${selectedYear}-01-01`);
              setShowModal(true);
            }}
            className="px-3.5 py-1.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Holiday
          </button>
        </div>
      </div>

      {/* Holidays List */}
      <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[var(--border-default)] flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {selectedYear} Official Calendar ({holidays.length} observed dates)
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)]">
            Loading holidays...
          </div>
        ) : holidays.length === 0 ? (
          <div className="p-12 text-center">
            <Flag className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
            <h3 className="text-sm font-semibold text-[var(--text-main)]">No Holidays Listed</h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Add national or gazetted holidays for {selectedYear}.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Holiday Name</th>
                <th className="py-3 px-4">Scope</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-default)] text-xs">
              {holidays.map((h: HolidayItem) => {
                const dateObj = new Date(h.holidayDate);
                return (
                  <tr key={h.id} className="hover:bg-[var(--bg-subtle)]/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-[var(--text-main)] whitespace-nowrap">
                      {dateObj.toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-4 font-semibold text-[var(--text-main)]">{h.name}</td>
                    <td className="py-3 px-4">
                      {h.isHalfDay ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-semibold text-[10px]">
                          {h.halfDayPeriod === 'MORNING' ? (
                            <Sunrise className="w-3 h-3" />
                          ) : (
                            <Sunset className="w-3 h-3" />
                          )}
                          Half Day ({h.halfDayPeriod})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 font-semibold text-[10px]">
                          <Sun className="w-3 h-3" /> Full Day
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-muted)]">{h.description || '—'}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => deleteMutation.mutate(h.id)}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Delete Holiday"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-[var(--border-default)] flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--text-main)]">Add Official Holiday</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-main)] text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Holiday Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Independence Day"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  required
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)]"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isHalfDay}
                    onChange={(e) => setIsHalfDay(e.target.checked)}
                    className="rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                  />
                  <span className="text-xs font-semibold text-[var(--text-main)]">
                    Is Half-Day Holiday
                  </span>
                </label>
              </div>

              {isHalfDay && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Half-Day Period
                  </label>
                  <select
                    value={halfDayPeriod}
                    onChange={(e) => setHalfDayPeriod(e.target.value as 'MORNING' | 'AFTERNOON')}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)]"
                  >
                    <option value="MORNING">Morning Half</option>
                    <option value="AFTERNOON">Afternoon Half</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Description / Gazetted Notice
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Central Government Gazetted Holiday"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] resize-none"
                />
              </div>

              <div className="pt-4 border-t border-[var(--border-default)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--border-default)] text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-1.5 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-semibold hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 cursor-pointer"
                >
                  {createMutation.isPending ? 'Saving...' : 'Add Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
