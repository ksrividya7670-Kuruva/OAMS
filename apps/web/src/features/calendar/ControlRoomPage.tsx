import { useState, useMemo, type FC } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import {
  type CalendarEventItem,
  type ConflictDetail,
  type SchedulingCheckResponse,
} from '@oams/shared';
import {
  Users,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

interface OfficialItem {
  id: string;
  title: string;
  userFullName: string;
}

interface CommonSlot {
  start: Date;
  end: Date;
  label: string;
}

const formatDateToInput = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const ControlRoomPage: FC = () => {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const dateParam = searchParams.get('date');

  // Selected date (syncs with URL ?date=YYYY-MM-DD or defaults to today)
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const [y, m, d] = dateParam.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  });

  // Selected officials for side-by-side grid
  const [selectedOfficialIds, setSelectedOfficialIds] = useState<string[]>([]);

  // Slot finder settings
  const [slotDurationMinutes, setSlotDurationMinutes] = useState<number>(30);
  const [finderCandidates, setFinderCandidates] = useState<CommonSlot[]>([]);
  const [isSearchingSlots, setIsSearchingSlots] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Fetch officials
  const { data: officials = [], isLoading: isLoadingOfficials } = useQuery<OfficialItem[]>({
    queryKey: ['officials-list'],
    queryFn: () =>
      api.get<OfficialItem[]>('/api/v1/officials', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    enabled: !!token,
  });

  // Auto-select first 3 officials if none selected
  useMemo(() => {
    if (officials.length > 0 && selectedOfficialIds.length === 0) {
      setSelectedOfficialIds(officials.slice(0, 3).map((o: OfficialItem) => o.id));
    }
  }, [officials, selectedOfficialIds.length]);

  // Date range for the selected day: 00:00 to 23:59:59
  const { dayStart, dayEnd } = useMemo(() => {
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);
    return { dayStart: start, dayEnd: end };
  }, [selectedDate]);

  // Fetch events for each selected official for this day
  const { data: eventsByOfficial = {}, refetch } = useQuery<Record<string, CalendarEventItem[]>>({
    queryKey: ['control-room-events', selectedOfficialIds, dayStart.toISOString()],
    queryFn: async () => {
      const map: Record<string, CalendarEventItem[]> = {};
      await Promise.all(
        selectedOfficialIds.map(async (officialId) => {
          try {
            const evs = await api.get<CalendarEventItem[]>(
              `/api/v1/calendar-events?officialId=${officialId}&start=${encodeURIComponent(
                dayStart.toISOString(),
              )}&end=${encodeURIComponent(dayEnd.toISOString())}&layers=ORG,PERSONAL`,
              {
                headers: { Authorization: `Bearer ${token}` },
              },
            );
            map[officialId] = evs || [];
          } catch {
            map[officialId] = [];
          }
        }),
      );
      return map;
    },
    enabled: !!token && selectedOfficialIds.length > 0,
  });

  // Time grid slots: 09:30 to 16:00 in 30-min intervals
  const timeSlots = useMemo(() => {
    const slots: { hour: number; minute: number; label: string }[] = [];
    for (let h = 9; h <= 16; h++) {
      if (h === 9) {
        slots.push({ hour: 9, minute: 30, label: '09:30' });
      } else if (h === 16) {
        slots.push({ hour: 16, minute: 0, label: '16:00' });
      } else {
        slots.push({ hour: h, minute: 0, label: `${String(h).padStart(2, '0')}:00` });
        slots.push({ hour: h, minute: 30, label: `${String(h).padStart(2, '0')}:30` });
      }
    }
    return slots;
  }, []);

  // Toggle official selection
  const toggleOfficial = (id: string) => {
    setSelectedOfficialIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    setSelectedOfficialIds(officials.map((o: OfficialItem) => o.id));
  };

  const clearAll = () => {
    setSelectedOfficialIds([]);
  };

  const updateSelectedDate = (d: Date) => {
    setSelectedDate(d);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('date', formatDateToInput(d));
      return next;
    });
  };

  // Date navigation
  const prevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    updateSelectedDate(d);
  };

  const nextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    updateSelectedDate(d);
  };

  const today = () => {
    updateSelectedDate(new Date());
  };

  // Common slot finder using scheduling/check engine
  const findCommonSlots = async () => {
    if (selectedOfficialIds.length < 2) {
      setSearchError('Select at least 2 officials to find common slots.');
      return;
    }

    setIsSearchingSlots(true);
    setSearchError(null);
    setFinderCandidates([]);

    try {
      const candidates: CommonSlot[] = [];
      const testSlots: { start: Date; end: Date }[] = [];
      const base = new Date(selectedDate);

      for (let h = 9; h <= 16; h++) {
        for (const m of [0, 30]) {
          if (h === 9 && m === 0) continue; // standard work starts 09:30
          const s = new Date(base);
          s.setHours(h, m, 0, 0);
          const e = new Date(s.getTime() + slotDurationMinutes * 60 * 1000);
          if (e.getHours() > 17 || (e.getHours() === 17 && e.getMinutes() > 30)) {
            continue;
          }
          testSlots.push({ start: s, end: e });
        }
      }

      for (const slot of testSlots) {
        if (candidates.length >= 6) break;

        const checkRes = await api.post<SchedulingCheckResponse>(
          '/api/v1/scheduling/check',
          {
            officials: selectedOfficialIds.map((id) => ({
              officialId: id,
              requirement: 'REQUIRED',
            })),
            startAt: slot.start.toISOString(),
            endAt: slot.end.toISOString(),
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        const hardConflicts = (checkRes.conflicts || []).filter(
          (r: ConflictDetail) => r.severity === 'HARD',
        );

        if (hardConflicts.length === 0) {
          candidates.push({
            start: slot.start,
            end: slot.end,
            label: `${slot.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${slot.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          });
        }
      }

      setFinderCandidates(candidates);
      if (candidates.length === 0) {
        setSearchError('No common slots found without HARD conflicts for the selected duration.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error finding common slots';
      setSearchError(msg);
    } finally {
      setIsSearchingSlots(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--bg-surface)] p-5 rounded-2xl border border-[var(--border-default)] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-600 font-bold">
              <Users className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-[var(--text-main)]">Control Room Grid</h1>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Side-by-side executive schedule matrix & automated common slot finder (§8.3, §13).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date Navigator */}
          <div className="flex items-center bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-xl p-1">
            <button
              onClick={prevDay}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={today}
              className="px-3 py-1 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--bg-surface)] rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              onClick={nextDay}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <label
            title="Click to select date or pick from calendar"
            className="relative px-3 py-1.5 bg-[var(--bg-subtle)] hover:bg-[var(--bg-surface)] border border-[var(--border-default)] hover:border-[var(--brand-primary)] rounded-xl text-xs font-semibold text-[var(--text-main)] flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs group"
          >
            <CalendarIcon className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0" />
            <span>
              {selectedDate.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            <input
              type="date"
              value={formatDateToInput(selectedDate)}
              onChange={(e) => {
                if (e.target.value) {
                  const [y, m, d] = e.target.value.split('-').map(Number);
                  updateSelectedDate(new Date(y, m - 1, d));
                }
              }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </label>

          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl border border-[var(--border-default)] hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            title="Refresh Grid"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Official Selector Bar */}
      <div className="bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-default)]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Select Principals to Display ({selectedOfficialIds.length} selected)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="text-xs text-[var(--brand-primary)] hover:underline font-medium"
            >
              Select All
            </button>
            <span className="text-[var(--text-muted)]">·</span>
            <button
              onClick={clearAll}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] font-medium"
            >
              Clear
            </button>
          </div>
        </div>

        {isLoadingOfficials ? (
          <div className="text-xs text-[var(--text-muted)] py-2">Loading officials...</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {officials.map((off: OfficialItem) => {
              const isSelected = selectedOfficialIds.includes(off.id);
              return (
                <button
                  key={off.id}
                  onClick={() => toggleOfficial(off.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)] shadow-xs'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border-[var(--border-default)] hover:text-[var(--text-main)]'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-current opacity-70" />
                  {off.userFullName || off.title}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Common Slot Finder Bar */}
      <div className="bg-[var(--bg-surface)] p-4 rounded-xl border border-dashed border-[var(--border-default)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[var(--text-main)]">Common Slot Finder</h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Find conflict-free slots where all selected officials are available.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-muted)]">Duration:</label>
              <select
                value={slotDurationMinutes}
                onChange={(e) => setSlotDurationMinutes(Number(e.target.value))}
                className="px-2.5 py-1 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)]"
              >
                <option value={15}>15 mins</option>
                <option value={30}>30 mins</option>
                <option value={45}>45 mins</option>
                <option value={60}>60 mins</option>
                <option value={90}>90 mins</option>
              </select>
            </div>

            <button
              onClick={findCommonSlots}
              disabled={isSearchingSlots || selectedOfficialIds.length < 2}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {isSearchingSlots ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Checking...
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" /> Find Common Slots
                </>
              )}
            </button>
          </div>
        </div>

        {/* Finder Results */}
        {searchError && (
          <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {searchError}
          </div>
        )}

        {finderCandidates.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[var(--border-default)]">
            <span className="text-[11px] font-semibold text-emerald-600 block mb-2">
              Available Common Slots ({finderCandidates.length} found):
            </span>
            <div className="flex flex-wrap gap-2">
              {finderCandidates.map((slot, idx) => (
                <div
                  key={idx}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  {slot.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Side-by-Side Matrix Grid */}
      {selectedOfficialIds.length === 0 ? (
        <div className="p-12 text-center bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)]">
          <Users className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
          <h3 className="text-sm font-semibold text-[var(--text-main)]">No Principals Selected</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Choose one or more principals from the selector above to inspect schedules side-by-side.
          </p>
        </div>
      ) : (
        <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--bg-subtle)]">
                  <th className="py-3 px-4 w-28 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider sticky left-0 bg-[var(--bg-subtle)] z-10 border-r border-[var(--border-default)]">
                    Time
                  </th>
                  {selectedOfficialIds.map((offId) => {
                    const off = officials.find((o: OfficialItem) => o.id === offId);
                    return (
                      <th
                        key={offId}
                        className="py-3 px-4 min-w-[220px] text-xs font-bold text-[var(--text-main)] border-r border-[var(--border-default)] last:border-r-0"
                      >
                        <div className="flex flex-col">
                          <span>{off?.userFullName || 'Principal'}</span>
                          <span className="text-[10px] font-normal text-[var(--text-muted)]">
                            {off?.title || 'Official'}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {timeSlots.map((slot) => {
                  const slotStart = new Date(selectedDate);
                  slotStart.setHours(slot.hour, slot.minute, 0, 0);
                  const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

                  return (
                    <tr
                      key={slot.label}
                      className="hover:bg-[var(--bg-subtle)]/40 transition-colors"
                    >
                      <td className="py-2.5 px-4 text-xs font-mono font-medium text-[var(--text-muted)] border-r border-[var(--border-default)] sticky left-0 bg-[var(--bg-surface)]">
                        {slot.label}
                      </td>

                      {selectedOfficialIds.map((offId) => {
                        const events = eventsByOfficial[offId] || [];
                        const overlapping = events.filter((ev: CalendarEventItem) => {
                          const evStart = new Date(ev.startAt);
                          const evEnd = new Date(ev.endAt);
                          return evStart < slotEnd && evEnd > slotStart;
                        });

                        return (
                          <td
                            key={offId}
                            className="py-2 px-3 border-r border-[var(--border-default)] last:border-r-0 align-top"
                          >
                            {overlapping.length === 0 ? (
                              <div className="h-7 rounded-md bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600/60 text-[11px] font-medium flex items-center px-2 transition-colors">
                                Free
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {overlapping.map((ev: CalendarEventItem) => {
                                  const isPersonal = ev.calendarType === 'PERSONAL';
                                  const isHold = ev.blockStrength === 'SOFT';

                                  return (
                                    <div
                                      key={ev.id}
                                      className={`px-2 py-1 rounded text-[11px] font-medium leading-tight truncate ${
                                        isPersonal
                                          ? 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-400/20'
                                          : isHold
                                            ? 'bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/40'
                                            : 'bg-[var(--brand-primary)]/15 text-[var(--brand-primary)] border border-[var(--brand-primary)]/30 font-semibold'
                                      }`}
                                      title={`${ev.title} (${new Date(ev.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(ev.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
                                    >
                                      {ev.title}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
