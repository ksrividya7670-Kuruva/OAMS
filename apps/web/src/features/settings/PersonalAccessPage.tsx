import { useState, type FC, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import {
  Shield,
  UserPlus,
  Trash2,
  Edit3,
  AlertCircle,
  CheckCircle,
  Clock,
  CheckSquare,
  Users,
  ArrowRightLeft,
  XCircle,
} from 'lucide-react';

interface SupportStaffMember {
  id: string;
  officialId: string;
  userId: string;
  role: string;
  canViewPersonal: boolean;
  canEditPersonal: boolean;
  canManageTasks?: boolean;
  userFullName?: string;
  userEmail?: string;
}

interface DelegationItem {
  id: string;
  officialId: string;
  fromUserId: string;
  fromUserName?: string;
  toUserId: string;
  toUserName?: string;
  toUserEmail?: string;
  scope: 'ALL' | 'APPOINTMENTS' | 'TASKS';
  startsAt: string;
  endsAt: string;
  reason?: string | null;
  revokedAt?: string | null;
  isActive: boolean;
  createdAt: string;
}

interface UserOption {
  id: string;
  fullName: string;
  email: string;
  roles: string[];
}

interface OfficialOption {
  id: string;
  title: string;
  userFullName: string;
}

export const PersonalAccessPage: FC = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'staff' | 'delegations'>('staff');
  const [selectedOfficialId, setSelectedOfficialId] = useState<string>('');

  // Staff Modal state
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [granteeUserId, setGranteeUserId] = useState('');
  const [canViewPersonal, setCanViewPersonal] = useState(true);
  const [canEditPersonal, setCanEditPersonal] = useState(false);
  const [canManageTasks, setCanManageTasks] = useState(true);
  const [staffFormError, setStaffFormError] = useState<string | null>(null);

  // Delegation Modal state
  const [showAddDelegationModal, setShowAddDelegationModal] = useState(false);
  const [delegateUserId, setDelegateUserId] = useState('');
  const [delegationScope, setDelegationScope] = useState<'ALL' | 'APPOINTMENTS' | 'TASKS'>('ALL');
  const [delegationStartsAt, setDelegationStartsAt] = useState('');
  const [delegationEndsAt, setDelegationEndsAt] = useState('');
  const [delegationReason, setDelegationReason] = useState('');
  const [delegationFormError, setDelegationFormError] = useState<string | null>(null);

  // Fetch officials
  const { data: officials = [] } = useQuery<OfficialOption[]>({
    queryKey: ['officials-list'],
    queryFn: () =>
      api.get<OfficialOption[]>('/api/v1/officials', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    enabled: !!token,
  });

  // Default official ID
  const activeOfficialId = selectedOfficialId || (officials.length > 0 ? officials[0].id : '');

  // Fetch support staff for active official
  const { data: staffList = [], isLoading: isLoadingStaff } = useQuery<SupportStaffMember[]>({
    queryKey: ['personal-access-staff', activeOfficialId],
    queryFn: () =>
      api.get<SupportStaffMember[]>(`/api/v1/officials/${activeOfficialId}/support-staff`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    enabled: !!token && !!activeOfficialId,
  });

  // Fetch delegations for active official
  const { data: delegationsList = [], isLoading: isLoadingDelegations } = useQuery<
    DelegationItem[]
  >({
    queryKey: ['official-delegations', activeOfficialId],
    queryFn: () =>
      api.get<DelegationItem[]>(`/api/v1/officials/${activeOfficialId}/delegations`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    enabled: !!token && !!activeOfficialId,
  });

  // Fetch available users for dialogs
  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ['users-list-grants'],
    queryFn: () =>
      api.get<UserOption[]>('/api/v1/users', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    enabled: !!token && (showAddStaffModal || showAddDelegationModal),
  });

  // Assign staff mutation
  const assignStaffMutation = useMutation({
    mutationFn: (payload: {
      userId: string;
      supportRole: string;
      canViewPersonal: boolean;
      canEditPersonal: boolean;
      canManageTasks: boolean;
    }) => {
      return api.post(`/api/v1/officials/${activeOfficialId}/support-staff`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-access-staff', activeOfficialId] });
      setShowAddStaffModal(false);
      setGranteeUserId('');
      setCanViewPersonal(true);
      setCanEditPersonal(false);
      setCanManageTasks(true);
      setStaffFormError(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to save staff permissions';
      setStaffFormError(msg);
    },
  });

  // Toggle permission directly (immediate effect §22 Track 9)
  const togglePermissionMutation = useMutation({
    mutationFn: (payload: {
      staffId: string;
      canViewPersonal?: boolean;
      canEditPersonal?: boolean;
      canManageTasks?: boolean;
    }) => {
      return api.post(
        `/api/v1/officials/${activeOfficialId}/personal-access/${payload.staffId}`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-access-staff', activeOfficialId] });
    },
  });

  // Remove staff
  const deleteStaffMutation = useMutation({
    mutationFn: (staffId: string) => {
      return api.del(`/api/v1/officials/${activeOfficialId}/support-staff/${staffId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-access-staff', activeOfficialId] });
    },
  });

  // Create delegation mutation
  const createDelegationMutation = useMutation({
    mutationFn: (payload: {
      toUserId: string;
      scope: 'ALL' | 'APPOINTMENTS' | 'TASKS';
      startsAt: string;
      endsAt: string;
      reason?: string;
    }) => {
      return api.post(`/api/v1/officials/${activeOfficialId}/delegations`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['official-delegations', activeOfficialId] });
      setShowAddDelegationModal(false);
      setDelegateUserId('');
      setDelegationScope('ALL');
      setDelegationStartsAt('');
      setDelegationEndsAt('');
      setDelegationReason('');
      setDelegationFormError(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to create delegation window';
      setDelegationFormError(msg);
    },
  });

  // Revoke delegation mutation
  const revokeDelegationMutation = useMutation({
    mutationFn: (delegationId: string) => {
      return api.post(
        `/api/v1/officials/${activeOfficialId}/delegations/${delegationId}/revoke`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['official-delegations', activeOfficialId] });
    },
  });

  const handleCreateStaff = (e: FormEvent) => {
    e.preventDefault();
    if (!granteeUserId) {
      setStaffFormError('Please select a user to assign.');
      return;
    }
    assignStaffMutation.mutate({
      userId: granteeUserId,
      supportRole: 'PA',
      canViewPersonal,
      canEditPersonal,
      canManageTasks,
    });
  };

  const handleCreateDelegation = (e: FormEvent) => {
    e.preventDefault();
    if (!delegateUserId) {
      setDelegationFormError('Please select a delegate user.');
      return;
    }
    if (!delegationStartsAt || !delegationEndsAt) {
      setDelegationFormError('Start and end date-times are required.');
      return;
    }
    if (new Date(delegationStartsAt) >= new Date(delegationEndsAt)) {
      setDelegationFormError('Start date-time must be earlier than end date-time.');
      return;
    }
    createDelegationMutation.mutate({
      toUserId: delegateUserId,
      scope: delegationScope,
      startsAt: new Date(delegationStartsAt).toISOString(),
      endsAt: new Date(delegationEndsAt).toISOString(),
      reason: delegationReason || undefined,
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bg-surface)] p-6 rounded-2xl border border-[var(--border-default)] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600 font-bold">
              <Shield className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-[var(--text-main)]">
              Delegation & Access Control
            </h1>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Manage personal calendar access, task management privileges, and temporary delegation
            rerouting (§7.2, §8.1, §10.3).
          </p>
        </div>

        {/* Official selector & Add Action */}
        <div className="flex items-center gap-3">
          {officials.length > 1 && (
            <select
              value={activeOfficialId}
              onChange={(e) => setSelectedOfficialId(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] font-medium"
            >
              {officials.map((o: OfficialOption) => (
                <option key={o.id} value={o.id}>
                  {o.userFullName} ({o.title})
                </option>
              ))}
            </select>
          )}

          {activeTab === 'staff' ? (
            <button
              onClick={() => setShowAddStaffModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> Grant Access
            </button>
          ) : (
            <button
              onClick={() => setShowAddDelegationModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <ArrowRightLeft className="w-4 h-4" /> New Delegation
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--border-default)] pb-1">
        <button
          onClick={() => setActiveTab('staff')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-xl transition-colors cursor-pointer ${
            activeTab === 'staff'
              ? 'bg-[var(--bg-surface)] text-[var(--brand-primary)] border border-b-0 border-[var(--border-default)] shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
          }`}
        >
          <Users className="w-4 h-4" />
          Staff Permissions & Privacy ({staffList.length})
        </button>
        <button
          onClick={() => setActiveTab('delegations')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-xl transition-colors cursor-pointer ${
            activeTab === 'delegations'
              ? 'bg-[var(--bg-surface)] text-[var(--brand-primary)] border border-b-0 border-[var(--border-default)] shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          Delegation Windows & Rerouting ({delegationsList.length})
        </button>
      </div>

      {activeTab === 'staff' ? (
        <div className="space-y-6">
          {/* Privacy Invariant Banner */}
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-300 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <Shield className="w-4 h-4" /> Strict Privacy Invariant (§8.1, §17.2, §22 Track 9)
            </p>
            <p className="opacity-90">
              Without{' '}
              <code className="font-mono bg-blue-500/10 px-1 py-0.5 rounded">
                can_view_personal
              </code>
              , assistants and colleagues only see a grey block labeled <strong>"Busy"</strong>. All
              personal titles and details are scrubbed on the server. Officials can grant or revoke
              these permissions with <strong>immediate effect</strong>.
            </p>
          </div>

          {/* Grants Table */}
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] overflow-hidden shadow-xs">
            <div className="p-4 border-b border-[var(--border-default)] flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Assigned Support Staff ({staffList.length})
              </span>
            </div>

            {isLoadingStaff ? (
              <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                Loading authorized staff members...
              </div>
            ) : staffList.length === 0 ? (
              <div className="p-12 text-center">
                <Shield className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                <h3 className="text-sm font-semibold text-[var(--text-main)]">
                  No Grants Configured
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Only the principal and super admins can view personal calendar details. Click
                  "Grant Access" to delegate access to an assistant.
                </p>
              </div>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--border-default)] bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    <th className="py-3 px-4">Delegate Name</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4 text-center">can_view_personal</th>
                    <th className="py-3 px-4 text-center">can_edit_personal</th>
                    <th className="py-3 px-4 text-center">can_manage_tasks</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)] text-xs">
                  {staffList.map((staff: SupportStaffMember) => (
                    <tr key={staff.id} className="hover:bg-[var(--bg-subtle)]/40 transition-colors">
                      <td className="py-3 px-4 font-semibold text-[var(--text-main)]">
                        {staff.userFullName || staff.userId}
                        {staff.userEmail && (
                          <span className="block text-[11px] font-mono text-[var(--text-muted)]">
                            {staff.userEmail}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-muted)] font-mono text-[11px]">
                        {staff.role}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() =>
                            togglePermissionMutation.mutate({
                              staffId: staff.id,
                              canViewPersonal: !staff.canViewPersonal,
                            })
                          }
                          className="cursor-pointer"
                          title="Click to toggle personal viewing access immediately"
                        >
                          {staff.canViewPersonal ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold text-[10px]">
                              <CheckCircle className="w-3 h-3" /> Can View
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 font-semibold text-[10px]">
                              Masked (Busy)
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() =>
                            togglePermissionMutation.mutate({
                              staffId: staff.id,
                              canEditPersonal: !staff.canEditPersonal,
                            })
                          }
                          className="cursor-pointer"
                          title="Click to toggle personal editing access immediately"
                        >
                          {staff.canEditPersonal ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-semibold text-[10px]">
                              <Edit3 className="w-3 h-3" /> Can Edit
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 font-semibold text-[10px]">
                              Read Only
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() =>
                            togglePermissionMutation.mutate({
                              staffId: staff.id,
                              canManageTasks: staff.canManageTasks === false ? true : false,
                            })
                          }
                          className="cursor-pointer"
                          title="Click to toggle task management rights immediately"
                        >
                          {staff.canManageTasks !== false ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 font-semibold text-[10px]">
                              <CheckSquare className="w-3 h-3" /> Tasks Enabled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 font-semibold text-[10px]">
                              Disabled
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => deleteStaffMutation.mutate(staff.id)}
                          disabled={deleteStaffMutation.isPending}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                          title="Revoke Delegation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Automatic Rerouting Invariant Banner */}
          <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-700 dark:text-purple-300 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <ArrowRightLeft className="w-4 h-4" /> Automatic Rerouting Engine (§10.3, §22 Track 9)
            </p>
            <p className="opacity-90">
              During an active delegation window, review-stage appointments and tasks automatically
              reroute to the selected delegate. When a delegation window starts or expires,
              appointment assignments are re-evaluated and reassigned immediately.
            </p>
          </div>

          {/* Delegations Table */}
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] overflow-hidden shadow-xs">
            <div className="p-4 border-b border-[var(--border-default)] flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Delegations & Authority Windows ({delegationsList.length})
              </span>
            </div>

            {isLoadingDelegations ? (
              <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                Loading delegations...
              </div>
            ) : delegationsList.length === 0 ? (
              <div className="p-12 text-center">
                <ArrowRightLeft className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                <h3 className="text-sm font-semibold text-[var(--text-main)]">
                  No Active or Past Delegations
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Click "New Delegation" to temporarily delegate appointment reviews or task duties
                  during leave.
                </p>
              </div>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--border-default)] bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    <th className="py-3 px-4">Delegate</th>
                    <th className="py-3 px-4">Scope</th>
                    <th className="py-3 px-4">Window (Start &rarr; End)</th>
                    <th className="py-3 px-4">Reason</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)] text-xs">
                  {delegationsList.map((del: DelegationItem) => {
                    const starts = new Date(del.startsAt);
                    const ends = new Date(del.endsAt);
                    const now = new Date();
                    const isUpcoming = !del.revokedAt && starts > now;
                    const isExpired = !del.revokedAt && ends < now;

                    return (
                      <tr key={del.id} className="hover:bg-[var(--bg-subtle)]/40 transition-colors">
                        <td className="py-3 px-4 font-semibold text-[var(--text-main)]">
                          {del.toUserName || del.toUserId}
                          {del.toUserEmail && (
                            <span className="block text-[11px] font-mono text-[var(--text-muted)]">
                              {del.toUserEmail}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              del.scope === 'ALL'
                                ? 'bg-blue-500/10 text-blue-600'
                                : del.scope === 'APPOINTMENTS'
                                  ? 'bg-amber-500/10 text-amber-600'
                                  : 'bg-purple-500/10 text-purple-600'
                            }`}
                          >
                            {del.scope}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[11px] text-[var(--text-muted)]">
                          <div className="flex items-center gap-1 text-[var(--text-main)] font-medium">
                            <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                            {starts.toLocaleString('en-IN', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}{' '}
                            &rarr;{' '}
                            {ends.toLocaleString('en-IN', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[var(--text-muted)] max-w-xs truncate">
                          {del.reason || (
                            <span className="italic text-slate-400">None specified</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {del.revokedAt ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 font-semibold text-[10px]">
                              <XCircle className="w-3 h-3" /> Revoked
                            </span>
                          ) : del.isActive ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active Now
                            </span>
                          ) : isUpcoming ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-semibold text-[10px]">
                              Scheduled
                            </span>
                          ) : isExpired ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 font-semibold text-[10px]">
                              Expired
                            </span>
                          ) : null}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {!del.revokedAt && !isExpired && (
                            <button
                              onClick={() => revokeDelegationMutation.mutate(del.id)}
                              disabled={revokeDelegationMutation.isPending}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer"
                              title="Revoke delegation and reroute immediately"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Grant Access Modal */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-[var(--border-default)] flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--text-main)]">
                Grant Personal Access & Role
              </h3>
              <button
                onClick={() => setShowAddStaffModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-main)] text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="p-5 space-y-4">
              {staffFormError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {staffFormError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  User to Assign (PA / Assistant)
                </label>
                <select
                  value={granteeUserId}
                  onChange={(e) => setGranteeUserId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-1 focus:ring-[var(--brand-primary)]"
                  required
                >
                  <option value="">-- Select user --</option>
                  {users.map((u: UserOption) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canViewPersonal}
                    onChange={(e) => setCanViewPersonal(e.target.checked)}
                    className="mt-0.5 rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                  />
                  <div>
                    <span className="text-xs font-bold text-[var(--text-main)] block">
                      can_view_personal
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Allow viewing personal calendar event titles and descriptions.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canEditPersonal}
                    onChange={(e) => setCanEditPersonal(e.target.checked)}
                    className="mt-0.5 rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                  />
                  <div>
                    <span className="text-xs font-bold text-[var(--text-main)] block">
                      can_edit_personal
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Allow creating, modifying, and rescheduling personal calendar events.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canManageTasks}
                    onChange={(e) => setCanManageTasks(e.target.checked)}
                    className="mt-0.5 rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                  />
                  <div>
                    <span className="text-xs font-bold text-[var(--text-main)] block">
                      can_manage_tasks
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Allow creating, updating, and completing tasks for this office.
                    </span>
                  </div>
                </label>
              </div>

              <div className="pt-4 border-t border-[var(--border-default)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--border-default)] text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignStaffMutation.isPending}
                  className="px-4 py-1.5 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-semibold hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 cursor-pointer"
                >
                  {assignStaffMutation.isPending ? 'Saving...' : 'Authorize Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Delegation Modal */}
      {showAddDelegationModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-[var(--border-default)] flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--text-main)] flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-[var(--brand-primary)]" />
                Create Authority Delegation
              </h3>
              <button
                onClick={() => setShowAddDelegationModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-main)] text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDelegation} className="p-5 space-y-4">
              {delegationFormError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {delegationFormError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Delegate User
                </label>
                <select
                  value={delegateUserId}
                  onChange={(e) => setDelegateUserId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-1 focus:ring-[var(--brand-primary)]"
                  required
                >
                  <option value="">-- Select delegate user --</option>
                  {users.map((u: UserOption) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Delegation Scope (§7.2)
                </label>
                <select
                  value={delegationScope}
                  onChange={(e) => setDelegationScope(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-1 focus:ring-[var(--brand-primary)]"
                >
                  <option value="ALL">ALL (Appointments + Tasks)</option>
                  <option value="APPOINTMENTS">APPOINTMENTS (Review Queue Only)</option>
                  <option value="TASKS">TASKS (Task Assignment & Management Only)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Starts At
                  </label>
                  <input
                    type="datetime-local"
                    value={delegationStartsAt}
                    onChange={(e) => setDelegationStartsAt(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-1 focus:ring-[var(--brand-primary)]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Ends At
                  </label>
                  <input
                    type="datetime-local"
                    value={delegationEndsAt}
                    onChange={(e) => setDelegationEndsAt(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-1 focus:ring-[var(--brand-primary)]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Reason for Delegation
                </label>
                <textarea
                  value={delegationReason}
                  onChange={(e) => setDelegationReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. On official international delegation; covering reviews"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] focus:outline-hidden focus:ring-1 focus:ring-[var(--brand-primary)]"
                />
              </div>

              <div className="pt-4 border-t border-[var(--border-default)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddDelegationModal(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--border-default)] text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createDelegationMutation.isPending}
                  className="px-4 py-1.5 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-semibold hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 cursor-pointer"
                >
                  {createDelegationMutation.isPending ? 'Activating...' : 'Activate Delegation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
