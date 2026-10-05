import { useState, useEffect, FC } from 'react';
import {
  Wrench,
  RotateCw,
  Mail,
  Play,
  CheckCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Layers,
  Calendar,
} from 'lucide-react';
import { api } from '@/lib/api';
import { INITIAL_OPS_OVERVIEW } from '@/lib/mockData';

interface FailedDelivery {
  id: string;
  notification_id: string;
  channel: string;
  recipient: string;
  status: string;
  error_message: string;
  attempt_count: number;
  created_at: string;
}

interface BackgroundJob {
  name: string;
  description: string;
  schedule: string;
}

interface StuckAppointment {
  id: string;
  reference_number: string;
  subject: string;
  requester_name: string;
  status: string;
  submitted_at: string;
}

interface SyncErrorItem {
  id: string;
  referenceNo: string;
  subject: string;
  syncStatus: string;
  syncError: string;
  officialTitle: string;
  updatedAt: string;
}

interface OpsOverview {
  failedDeliveries: FailedDelivery[];
  stuckAppointments: StuckAppointment[];
  backgroundJobs: BackgroundJob[];
  syncErrors?: SyncErrorItem[];
}

export const AdminOpsPage: FC = () => {
  const [data, setData] = useState<OpsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingSyncId, setRetryingSyncId] = useState<string | null>(null);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const fetchOpsData = async () => {
    setLoading(true);
    try {
      const res = await api.get<OpsOverview>('/api/v1/admin/ops');
      if (res && res.backgroundJobs) {
        setData(res);
      } else {
        setData(INITIAL_OPS_OVERVIEW as unknown as OpsOverview);
      }
    } catch {
      setData(INITIAL_OPS_OVERVIEW as unknown as OpsOverview);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpsData();
  }, []);

  const handleRetryDelivery = async (id: string) => {
    setRetryingId(id);
    setActionMessage(null);
    try {
      const res = await api.post<{ message?: string }>(`/api/v1/admin/ops/retry-delivery/${id}`);
      setActionMessage({
        type: 'success',
        text: res.message || 'Notification delivery retry triggered successfully',
      });
      await fetchOpsData();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to retry delivery',
      });
    } finally {
      setRetryingId(null);
    }
  };

  const handleRunJob = async (jobName: string) => {
    setRunningJob(jobName);
    setActionMessage(null);
    try {
      const res = await api.post<{ result?: any }>(`/api/v1/admin/ops/run-job/${jobName}`);
      setActionMessage({
        type: 'success',
        text: `Job "${jobName}" completed successfully: ${JSON.stringify(res.result)}`,
      });
      await fetchOpsData();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err?.message || `Failed to run job ${jobName}`,
      });
    } finally {
      setRunningJob(null);
    }
  };

  const handleRetrySync = async (id: string) => {
    setRetryingSyncId(id);
    setActionMessage(null);
    try {
      const res = await api.post<{ message?: string }>(`/api/v1/admin/ops/retry-sync/${id}`);
      setActionMessage({
        type: 'success',
        text: res.message || 'Calendar / Teams sync retried successfully',
      });
      await fetchOpsData();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to retry sync',
      });
    } finally {
      setRetryingSyncId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-default)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2">
            <Wrench className="w-6 h-6 text-[var(--brand-primary)]" />
            Operations Console & Background Jobs
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Retry failed email dispatches, monitor queue health, and run scheduled workers on demand
            (§22 Track 10).
          </p>
        </div>

        <button
          type="button"
          onClick={fetchOpsData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-main)] transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 text-xs ${
            actionMessage.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
          )}
          <span className="font-medium">{actionMessage.text}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="py-20 text-center text-sm text-[var(--text-muted)] flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[var(--brand-primary)]" />
          Loading operations data...
        </div>
      ) : data ? (
        <>
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs">
              <span className="text-xs font-medium text-[var(--text-muted)]">
                Failed Deliveries
              </span>
              <div className="text-2xl font-bold mt-1 text-[var(--text-main)]">
                {data.failedDeliveries.length}
              </div>
              <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                Pending manual retry or review
              </span>
            </div>

            <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs">
              <span className="text-xs font-medium text-[var(--text-muted)]">
                Registered Background Jobs
              </span>
              <div className="text-2xl font-bold mt-1 text-[var(--text-main)]">
                {data.backgroundJobs.length}
              </div>
              <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                Cron workers available on-demand
              </span>
            </div>

            <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs">
              <span className="text-xs font-medium text-[var(--text-muted)]">
                Stuck Appointments (&gt;48h)
              </span>
              <div className="text-2xl font-bold mt-1 text-[var(--text-main)]">
                {data.stuckAppointments.length}
              </div>
              <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                Awaiting review beyond threshold
              </span>
            </div>
          </div>

          {/* Section 1: On-Demand Background Jobs */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-[var(--text-main)] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--brand-primary)]" />
              Background Worker Jobs (Execute On-Demand)
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.backgroundJobs.map((job) => (
                <div
                  key={job.name}
                  className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-[var(--brand-primary)]">
                        {job.name}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)] font-mono">
                        {job.schedule}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-2">{job.description}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[var(--border-default)] flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRunJob(job.name)}
                      disabled={runningJob === job.name}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)] transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <Play
                        className={`w-3 h-3 ${runningJob === job.name ? 'animate-spin' : ''}`}
                      />
                      {runningJob === job.name ? 'Running...' : 'Run Now'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Failed Deliveries */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--text-main)] flex items-center gap-2">
                <Mail className="w-4 h-4 text-red-500" />
                Failed Email & Notification Deliveries
              </h2>
            </div>

            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs overflow-hidden">
              {data.failedDeliveries.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--text-muted)] flex flex-col items-center justify-center gap-2">
                  <CheckCircle className="w-6 h-6 text-emerald-500" />
                  <span>All notification deliveries are healthy. No failed dispatches found.</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--bg-subtle)] text-[var(--text-muted)] border-b border-[var(--border-default)]">
                      <tr>
                        <th className="py-2.5 px-4 font-medium">Channel</th>
                        <th className="py-2.5 px-4 font-medium">Recipient</th>
                        <th className="py-2.5 px-4 font-medium">Error Reason</th>
                        <th className="py-2.5 px-4 font-medium">Attempts</th>
                        <th className="py-2.5 px-4 font-medium">Failed At</th>
                        <th className="py-2.5 px-4 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-default)]">
                      {data.failedDeliveries.map((delivery) => (
                        <tr key={delivery.id} className="hover:bg-[var(--bg-subtle)]/40">
                          <td className="py-3 px-4 font-semibold text-[var(--text-main)]">
                            {delivery.channel}
                          </td>
                          <td className="py-3 px-4 text-[var(--text-main)] font-mono text-[11px]">
                            {delivery.recipient}
                          </td>
                          <td className="py-3 px-4 text-red-600 dark:text-red-400 text-[11px] max-w-xs truncate">
                            {delivery.error_message || 'Connection / SMTP failure'}
                          </td>
                          <td className="py-3 px-4 text-[var(--text-muted)]">
                            {delivery.attempt_count}
                          </td>
                          <td className="py-3 px-4 text-[var(--text-muted)] whitespace-nowrap">
                            {new Date(delivery.created_at).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleRetryDelivery(delivery.id)}
                              disabled={retryingId === delivery.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <RotateCw
                                className={`w-3 h-3 ${retryingId === delivery.id ? 'animate-spin' : ''}`}
                              />
                              {retryingId === delivery.id ? 'Retrying...' : 'Retry'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Stuck Appointments */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-[var(--text-main)] flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              Stuck Appointments (&gt;48h in Review)
            </h2>

            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs overflow-hidden">
              {data.stuckAppointments.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--text-muted)] flex flex-col items-center justify-center gap-2">
                  <CheckCircle className="w-6 h-6 text-emerald-500" />
                  <span>No stuck appointments detected. All review queues are healthy.</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--bg-subtle)] text-[var(--text-muted)] border-b border-[var(--border-default)]">
                      <tr>
                        <th className="py-2.5 px-4 font-medium">Ref #</th>
                        <th className="py-2.5 px-4 font-medium">Subject</th>
                        <th className="py-2.5 px-4 font-medium">Requester</th>
                        <th className="py-2.5 px-4 font-medium">Status</th>
                        <th className="py-2.5 px-4 font-medium">Submitted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-default)]">
                      {data.stuckAppointments.map((apt) => (
                        <tr key={apt.id} className="hover:bg-[var(--bg-subtle)]/40">
                          <td className="py-3 px-4 font-mono font-bold text-[var(--brand-primary)]">
                            {apt.reference_number || apt.id.slice(0, 8)}
                          </td>
                          <td className="py-3 px-4 font-medium text-[var(--text-main)]">
                            {apt.subject}
                          </td>
                          <td className="py-3 px-4 text-[var(--text-muted)]">
                            {apt.requester_name}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600">
                              {apt.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[var(--text-muted)]">
                            {new Date(apt.submitted_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Calendar & Integration Sync Errors */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-[var(--text-main)] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-violet-500" />
              Calendar &amp; Teams Sync Status (§8.4)
            </h2>

            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs overflow-hidden">
              {!data.syncErrors || data.syncErrors.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--text-muted)] flex flex-col items-center justify-center gap-2">
                  <CheckCircle className="w-6 h-6 text-emerald-500" />
                  <span>
                    All Outlook calendar and Teams integrations are in sync. No errors or
                    mismatches.
                  </span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--bg-subtle)] text-[var(--text-muted)] border-b border-[var(--border-default)]">
                      <tr>
                        <th className="py-2.5 px-4 font-medium">Ref #</th>
                        <th className="py-2.5 px-4 font-medium">Official</th>
                        <th className="py-2.5 px-4 font-medium">Subject</th>
                        <th className="py-2.5 px-4 font-medium">Sync State</th>
                        <th className="py-2.5 px-4 font-medium">Details</th>
                        <th className="py-2.5 px-4 font-medium">Updated</th>
                        <th className="py-2.5 px-4 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-default)]">
                      {data.syncErrors.map((sync) => (
                        <tr key={sync.id} className="hover:bg-[var(--bg-subtle)]/40">
                          <td className="py-3 px-4 font-mono font-bold text-[var(--brand-primary)]">
                            {sync.referenceNo || sync.id.slice(0, 8)}
                          </td>
                          <td className="py-3 px-4 text-[var(--text-main)] font-medium">
                            {sync.officialTitle}
                          </td>
                          <td className="py-3 px-4 text-[var(--text-main)]">{sync.subject}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                sync.syncStatus === 'MISMATCH'
                                  ? 'bg-amber-500/10 text-amber-600'
                                  : sync.syncStatus === 'PENDING'
                                    ? 'bg-blue-500/10 text-blue-600'
                                    : 'bg-red-500/10 text-red-600'
                              }`}
                            >
                              {sync.syncStatus}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[var(--text-muted)] max-w-xs truncate text-[11px]">
                            {sync.syncError}
                          </td>
                          <td className="py-3 px-4 text-[var(--text-muted)] whitespace-nowrap">
                            {new Date(sync.updatedAt).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleRetrySync(sync.id)}
                              disabled={retryingSyncId === sync.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <RotateCw
                                className={`w-3 h-3 ${retryingSyncId === sync.id ? 'animate-spin' : ''}`}
                              />
                              {retryingSyncId === sync.id ? 'Syncing...' : 'Retry Sync'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
