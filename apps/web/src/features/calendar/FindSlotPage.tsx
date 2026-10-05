import React, { useState } from 'react';
import { api } from '@/lib/api';

export const FindSlotPage: React.FC = () => {
  const [officialIds, setOfficialIds] = useState('');
  const [durationMin, setDurationMin] = useState(30);
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const ids = officialIds.split(',').map((id) => ({ id: id.trim(), requirement: 'REQUIRED' }));
      const res = await api.post<any[]>('/api/v1/scheduling/slots', {
        officialIds: ids,
        durationMin,
        windows: [],
        roomRequired: false,
        priority: 'MEDIUM',
        meetingMode: 'IN_PERSON',
        respectMinNotice: false,
      });
      setSlots(res);
    } catch (err: any) {
      setError(err.message || 'Failed to search slots');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6">
      <h1 className="text-2xl font-bold text-[var(--text-main)] mb-6">Find Common Slot</h1>

      <div className="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl p-6 mb-8">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-[var(--text-main)] mb-1">
              Official IDs (comma separated)
            </label>
            <input
              type="text"
              value={officialIds}
              onChange={(e) => setOfficialIds(e.target.value)}
              className="w-full px-4 py-2 bg-[var(--bg-main)] border border-[var(--border-default)] rounded-xl text-sm focus:ring-2 focus:ring-[var(--primary)] outline-none"
              placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
              required
            />
          </div>
          <div className="w-32">
            <label className="block text-sm font-medium text-[var(--text-main)] mb-1">
              Duration (min)
            </label>
            <input
              type="number"
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              className="w-full px-4 py-2 bg-[var(--bg-main)] border border-[var(--border-default)] rounded-xl text-sm focus:ring-2 focus:ring-[var(--primary)] outline-none"
              required
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2 bg-[var(--primary)] text-white text-sm font-semibold rounded-xl hover:bg-[var(--primary-hover)] transition"
          >
            Find Slots
          </button>
        </form>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">
          Searching across calendars...
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>
      ) : slots.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {slots.map((slot, i) => (
            <div
              key={i}
              className="p-4 border border-[var(--border-subtle)] bg-[var(--card-bg)] rounded-xl"
            >
              <div className="text-sm font-bold text-[var(--text-main)] mb-1">
                {new Date(slot.start).toLocaleDateString()}
              </div>
              <div className="text-xs text-[var(--text-muted)] mb-3">
                {new Date(slot.start).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                -{new Date(slot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full inline-block">
                Score: {slot.score}
              </div>
            </div>
          ))}
        </div>
      ) : (
        slots && (
          <div className="text-center text-sm text-[var(--text-muted)] mt-8">
            No slots found or not searched yet.
          </div>
        )
      )}
    </div>
  );
};
