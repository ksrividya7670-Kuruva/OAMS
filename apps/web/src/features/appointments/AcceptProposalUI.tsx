import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Proposal {
  id: string;
  startAt: string;
  endAt: string;
  roomId: string | null;
  proposedBy: string;
  expiresAt: string;
}

interface Props {
  appointmentId: string;
  onUpdate: () => void;
}

export const AcceptProposalUI: React.FC<Props> = ({ appointmentId, onUpdate }) => {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProposals();
  }, [appointmentId]);

  const fetchProposals = async () => {
    try {
      setLoading(true);
      const res = await api.get<Proposal[]>(`/api/v1/appointments/${appointmentId}/proposals`);
      setProposals(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load proposals');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (proposalId: string) => {
    try {
      await api.post(`/api/v1/appointments/${appointmentId}/accept-proposal`, { proposalId });
      onUpdate();
    } catch (err: any) {
      alert(err.message || 'Failed to accept proposal');
    }
  };

  const handleDeclineAll = async () => {
    try {
      await api.post(`/api/v1/appointments/${appointmentId}/decline-proposals`);
      onUpdate();
    } catch (err: any) {
      alert(err.message || 'Failed to decline proposals');
    }
  };

  if (loading)
    return <div className="text-sm text-[var(--text-muted)]">Loading proposed times...</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (proposals.length === 0) return null;

  return (
    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-6 mt-6">
      <h3 className="text-base font-bold text-blue-900 dark:text-blue-300 mb-4">Proposed Times</h3>
      <p className="text-sm text-blue-800 dark:text-blue-400 mb-6">
        The office has proposed the following times. Please select one that works for you, or
        decline them all.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {proposals.map((prop) => (
          <div
            key={prop.id}
            className="bg-[var(--card-bg)] border border-[var(--border-subtle)] p-4 rounded-xl flex flex-col justify-between"
          >
            <div>
              <div className="text-sm font-bold text-[var(--text-main)]">
                {new Date(prop.startAt).toLocaleDateString()}
              </div>
              <div className="text-sm text-[var(--text-muted)] mt-1">
                {new Date(prop.startAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                -
                {new Date(prop.endAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              <div className="text-xs text-amber-600 mt-2">
                Expires: {new Date(prop.expiresAt).toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => handleAccept(prop.id)}
              className="mt-4 w-full py-2 bg-[var(--primary)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--primary-hover)] transition"
            >
              Accept this time
            </button>
          </div>
        ))}
      </div>

      <div className="text-right">
        <button
          onClick={handleDeclineAll}
          className="text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] underline"
        >
          None of these times work for me
        </button>
      </div>
    </div>
  );
};
