import { useState, type FC, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import { SupportRole, SupportRank } from '@oams/shared';
import { Briefcase, Plus, Trash2, X, Star, Calendar } from 'lucide-react';

interface OfficialItem {
  id: string;
  title: string;
  userFullName: string;
  userEmail: string;
  departmentName?: string;
  defaultDurationMin: number;
  bufferAfterMin: number;
  bookingMode: string;
  isVip: boolean;
  supportStaff?: SupportStaffItem[];
}

interface SupportStaffItem {
  id: string;
  userId: string;
  userFullName: string;
  userEmail: string;
  supportRole: string;
  rank: string;
  canApprove: boolean;
  canViewConfidential: boolean;
  canViewPersonal: boolean;
  canEditPersonal: boolean;
  canManageTasks: boolean;
}

interface UserOption {
  id: string;
  fullName: string;
  email: string;
}

export const OfficialsAdminPage: FC = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [selectedOfficial, setSelectedOfficial] = useState<OfficialItem | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Form states for assigning support staff
  const [staffUserId, setStaffUserId] = useState('');
  const [supportRole, setSupportRole] = useState<string>(SupportRole.PA);
  const [rank, setRank] = useState<string>(SupportRank.PRIMARY);
  const [canApprove, setCanApprove] = useState(false);
  const [canViewConfidential, setCanViewConfidential] = useState(false);
  const [canViewPersonal, setCanViewPersonal] = useState(false);
  const [canEditPersonal, setCanEditPersonal] = useState(false);
  const [canManageTasks, setCanManageTasks] = useState(true);

  // Fetch officials
  const { data: officials = [], isLoading } = useQuery<OfficialItem[]>({
    queryKey: ['admin-officials'],
    queryFn: () =>
      api.get<OfficialItem[]>('/api/v1/officials', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    enabled: !!token,
  });

  // Fetch eligible users for staff assignment
  const { data: eligibleUsers = [] } = useQuery<UserOption[]>({
    queryKey: ['admin-users-eligible'],
    queryFn: () =>
      api.get<UserOption[]>('/api/v1/users', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    enabled: !!token && showAssignModal,
  });

  // Fetch support staff for selected official
  const { data: supportStaff = [], refetch: refetchStaff } = useQuery<SupportStaffItem[]>({
    queryKey: ['admin-official-staff', selectedOfficial?.id],
    queryFn: () =>
      api.get<SupportStaffItem[]>(`/api/v1/officials/${selectedOfficial!.id}/support-staff`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    enabled: !!token && !!selectedOfficial,
  });

  const assignStaffMutation = useMutation({
    mutationFn: (data: any) =>
      api.post(`/api/v1/officials/${selectedOfficial!.id}/support-staff`, data, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    onSuccess: () => {
      refetchStaff();
      queryClient.invalidateQueries({ queryKey: ['admin-officials'] });
      setShowAssignModal(false);
      setStaffUserId('');
    },
  });

  const removeStaffMutation = useMutation({
    mutationFn: (staffId: string) =>
      api.del(`/api/v1/officials/${selectedOfficial!.id}/support-staff/${staffId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    onSuccess: () => {
      refetchStaff();
      queryClient.invalidateQueries({ queryKey: ['admin-officials'] });
    },
  });

  const handleAssign = (e: FormEvent) => {
    e.preventDefault();
    assignStaffMutation.mutate({
      userId: staffUserId,
      supportRole,
      rank,
      canApprove,
      canViewConfidential,
      canViewPersonal,
      canEditPersonal,
      canManageTasks,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2">
          <Briefcase className="w-6 h-6 text-[var(--brand-primary)]" /> Officials & Support Staff
          Directory
        </h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Manage official profiles, dual calendars (ORG & PERSONAL), and assigned Executive &
          Personal Assistants.
        </p>
      </div>

      {/* Officials Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-3 py-12 text-center text-sm text-[var(--text-muted)] animate-pulse">
            Loading officials...
          </div>
        ) : officials.length === 0 ? (
          <div className="col-span-3 py-12 text-center text-xs text-[var(--text-muted)]">
            No officials configured. Run seeds to populate demo officials.
          </div>
        ) : (
          officials.map((off) => (
            <div
              key={off.id}
              className={`p-5 rounded-2xl border transition-all duration-200 cursor-pointer ${
                selectedOfficial?.id === off.id
                  ? 'border-[var(--brand-primary)] bg-[var(--bg-surface)] ring-2 ring-[var(--focus-ring)] shadow-md'
                  : 'border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--border-muted)] hover:shadow-xs'
              }`}
              onClick={() => setSelectedOfficial(off)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-[var(--text-main)]">{off.title}</h3>
                    {off.isVip && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-current" /> VIP
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{off.userFullName}</p>
                </div>

                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-[var(--brand-primary)] flex items-center justify-center font-bold text-xs">
                  {off.title.substring(0, 2)}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--border-default)] grid grid-cols-2 gap-2 text-[11px] text-[var(--text-muted)]">
                <div>
                  <span>Dept:</span>{' '}
                  <strong className="text-[var(--text-main)]">
                    {off.departmentName || 'Executive'}
                  </strong>
                </div>
                <div>
                  <span>Duration:</span>{' '}
                  <strong className="text-[var(--text-main)]">{off.defaultDurationMin}m</strong>
                </div>
                <div>
                  <span>Buffer:</span>{' '}
                  <strong className="text-[var(--text-main)]">{off.bufferAfterMin}m</strong>
                </div>
                <div>
                  <span>Mode:</span>{' '}
                  <strong className="text-[var(--text-main)]">{off.bookingMode}</strong>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)] flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" /> Dual Calendars (Org+Personal)
                </span>
                <span className="font-medium text-[var(--brand-primary)]">Manage Staff →</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Selected Official Detail & Support Staff Tab */}
      {selectedOfficial && (
        <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-default)] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[var(--text-main)]">
                  {selectedOfficial.title} — {selectedOfficial.userFullName}
                </h2>
                <span className="text-xs text-[var(--text-muted)]">
                  ({selectedOfficial.userEmail})
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Support Staff (PA & EA) receive instant notifications and manage
                appointments/delegations.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAssignModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--brand-primary)] text-white text-xs font-semibold hover:bg-[var(--brand-hover)] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Assign Support Staff
            </button>
          </div>

          {/* Assigned Staff Cards */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Assigned Support Staff ({supportStaff.length})
            </h3>

            {supportStaff.length === 0 ? (
              <div className="py-6 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-default)] rounded-xl">
                No support staff currently assigned to this official.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {supportStaff.map((staff) => (
                  <div
                    key={staff.id}
                    className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-main)]">
                          {staff.userFullName}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                          {staff.supportRole} ({staff.rank})
                        </span>
                      </div>
                      <p className="text-[var(--text-muted)]">{staff.userEmail}</p>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {staff.canApprove && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-600">
                            ✓ Approve
                          </span>
                        )}
                        {staff.canViewPersonal && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-600">
                            ✓ View Personal
                          </span>
                        )}
                        {staff.canViewConfidential && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-500/10 text-orange-600">
                            ✓ Confidential
                          </span>
                        )}
                        {staff.canManageTasks && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-500/10 text-slate-600">
                            ✓ Tasks
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      title="Remove assignment"
                      onClick={() => removeStaffMutation.mutate(staff.id)}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-500/10 rounded-md cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Assign Staff Modal */}
      {showAssignModal && selectedOfficial && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="max-w-md w-full rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-3">
              <h3 className="text-base font-bold text-[var(--text-main)]">
                Assign Staff to {selectedOfficial.title}
              </h3>
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-main)] p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssign} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-[var(--text-main)] mb-1">
                  Select User
                </label>
                <select
                  required
                  value={staffUserId}
                  onChange={(e) => setStaffUserId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-main)]"
                >
                  <option value="">-- Choose employee --</option>
                  {eligibleUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[var(--text-main)] mb-1">
                    Support Role
                  </label>
                  <select
                    value={supportRole}
                    onChange={(e) => setSupportRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-main)]"
                  >
                    <option value={SupportRole.PA}>PA (Personal Assistant)</option>
                    <option value={SupportRole.EA}>EA (Executive Assistant)</option>
                    <option value={SupportRole.OFFICE_ADMIN}>Office Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-[var(--text-main)] mb-1">Rank</label>
                  <select
                    value={rank}
                    onChange={(e) => setRank(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-main)]"
                  >
                    <option value={SupportRank.PRIMARY}>PRIMARY</option>
                    <option value={SupportRank.SECONDARY}>SECONDARY</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-[var(--border-default)]">
                <span className="block font-semibold text-[var(--text-main)]">
                  Permissions Granted
                </span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canApprove}
                    onChange={(e) => setCanApprove(e.target.checked)}
                  />
                  <span>Can approve routine appointments (§10.5)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canViewPersonal}
                    onChange={(e) => setCanViewPersonal(e.target.checked)}
                  />
                  <span>Can view personal calendar details (§8.1)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canEditPersonal}
                    onChange={(e) => setCanEditPersonal(e.target.checked)}
                  />
                  <span>Can edit personal calendar entries (§8.1)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canViewConfidential}
                    onChange={(e) => setCanViewConfidential(e.target.checked)}
                  />
                  <span>Can view confidential appointments</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canManageTasks}
                    onChange={(e) => setCanManageTasks(e.target.checked)}
                  />
                  <span>Can manage To-Do tasks (§12.4)</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-default)]">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-default)] hover:bg-[var(--bg-subtle)] font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignStaffMutation.isPending || !staffUserId}
                  className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white font-semibold hover:bg-[var(--brand-hover)] cursor-pointer disabled:opacity-50"
                >
                  Assign Staff
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
