import { useState, useMemo, type FC, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import { RoleCode } from '@oams/shared';
import {
  Users,
  Plus,
  X,
  Search,
  CheckCircle2,
  Shield,
  KeyRound,
  UserCheck,
  UserX,
  Trash2,
  Loader2,
  Award,
  Briefcase,
} from 'lucide-react';
import { INITIAL_USERS } from '@/lib/mockData';

interface UserRow {
  id: string;
  fullName: string;
  email: string;
  designation?: string;
  department?: string;
  departmentId?: string;
  status: 'ACTIVE' | 'DISABLED';
  roles: string[];
}

type UserFilterCategory = 'ALL' | 'FACULTY' | 'STAFF' | 'ADMIN';

export const UsersAdminPage: FC = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<UserFilterCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserForRoles, setSelectedUserForRoles] = useState<UserRow | null>(null);
  const [selectedUserForPassword, setSelectedUserForPassword] = useState<UserRow | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Add User Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalType, setModalType] = useState<'USER' | 'FACULTY'>('USER');

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [designation, setDesignation] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<RoleCode[]>([RoleCode.FACULTY]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const { data: users = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await api.get<UserRow[]>('/api/v1/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return Array.isArray(res) && res.length > 0 ? res : (INITIAL_USERS as unknown as UserRow[]);
    },
  });

  const createUserMutation = useMutation({
    mutationFn: (data: any) =>
      api.post('/api/v1/users', data, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowAddModal(false);
      resetForm();
      showToast('User enrolled successfully in the system');
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(
        `/api/v1/users/${id}/disable`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      showToast('User status updated');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) =>
      api.del(`/api/v1/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      showToast('User account removed');
    },
  });

  const assignRolesMutation = useMutation({
    mutationFn: ({ id, roles }: { id: string; roles: string[] }) =>
      api.put(
        `/api/v1/users/${id}/roles`,
        { roleCodes: roles },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setSelectedUserForRoles(null);
      showToast('Roles and authorizations updated');
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, newPass }: { id: string; newPass: string }) =>
      api.post(
        `/api/v1/users/${id}/reset-password`,
        { newPassword: newPass },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      ),
    onSuccess: () => {
      setSelectedUserForPassword(null);
      setNewPasswordVal('');
      showToast('User password successfully reset');
    },
  });

  const resetForm = () => {
    setFullName('');
    setEmail('');
    setDesignation('');
    setSelectedRoles([RoleCode.FACULTY]);
  };

  const openAddModal = (type: 'USER' | 'FACULTY') => {
    setModalType(type);
    resetForm();
    if (type === 'FACULTY') {
      setDesignation('Assistant Professor');
      setSelectedRoles([RoleCode.FACULTY]);
    } else {
      setDesignation('Staff Member');
      setSelectedRoles([RoleCode.STAFF]);
    }
    setShowAddModal(true);
  };

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate({
      fullName,
      email,
      designation,
      roleCodes: selectedRoles,
    });
  };

  const handleToggleRole = (role: RoleCode) => {
    if (selectedRoles.includes(role)) {
      setSelectedRoles(selectedRoles.filter((r) => r !== role));
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  // Metrics computation strictly based on Project Roles
  const totalUsers = users.length;
  const totalFaculty = users.filter((u) => u.roles?.includes(RoleCode.FACULTY)).length;
  const totalStaff = users.filter((u) => u.roles?.includes(RoleCode.STAFF)).length;
  const totalAdmins = users.filter((u) => u.roles?.includes(RoleCode.ADMIN)).length;

  // Filtered list strictly by Project Roles
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Category filter
      if (activeTab === 'FACULTY') {
        if (!u.roles?.includes(RoleCode.FACULTY)) return false;
      } else if (activeTab === 'STAFF') {
        if (!u.roles?.includes(RoleCode.STAFF)) return false;
      } else if (activeTab === 'ADMIN') {
        if (!u.roles?.includes(RoleCode.ADMIN)) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          u.fullName?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.designation?.toLowerCase().includes(q) ||
          u.department?.toLowerCase().includes(q) ||
          u.roles?.some((r) => r.toLowerCase().includes(q))
        );
      }

      return true;
    });
  }, [users, activeTab, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-[#16181D] text-white shadow-2xl text-xs font-semibold flex items-center gap-2 border border-[#E5E3DC] dark:border-slate-800 animate-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="p-6 md:p-8 rounded-2xl border border-[#D5D2CA] dark:border-[#2D3342] bg-white dark:bg-[#1B1E26] flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xs">
        <div className="space-y-1.5 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-[#1A3170]/10 text-[#1A3170] dark:text-blue-300 border border-[#1A3170]/20">
            <Shield className="w-3.5 h-3.5" />
            <span>Identity &amp; Role-Based Access Control (RBAC)</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#16181D] dark:text-white font-serif">
            User Administration &amp; Credentials Registry
          </h1>
          <p className="text-xs sm:text-sm text-[#5B6070] dark:text-[#9DA4B5] leading-relaxed">
            Manage institutional users across active project tiers: Faculty, Administrative Staff, and System Administrators. Control account status, assign permissions, and oversee security credentials.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openAddModal('FACULTY')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-white hover:bg-[#FAF9F6] font-semibold text-xs transition cursor-pointer shadow-2xs"
          >
            <Award className="w-3.5 h-3.5 text-emerald-600" />
            <span>Add Faculty</span>
          </button>

          <button
            type="button"
            onClick={() => openAddModal('USER')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1A3170] hover:bg-[#12224D] text-white font-semibold text-xs shadow-xs transition active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {/* User Overview Telemetry Cards Covering Project Roles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setActiveTab('ALL')}
          className={`p-4 rounded-xl border transition cursor-pointer ${
            activeTab === 'ALL'
              ? 'border-[#1A3170] bg-[#1A3170]/5 ring-1 ring-[#1A3170]'
              : 'border-[#E2DFD7] dark:border-[#2D3342] bg-white dark:bg-[#1B1E26]'
          }`}
        >
          <div className="flex items-center justify-between text-[10px] font-bold text-[#8C909C] uppercase tracking-wider">
            <span>Total Users</span>
            <Users className="w-3.5 h-3.5 text-[#1A3170]" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1">
            {totalUsers}
          </div>
          <span className="text-[10px] text-[#5B6070] block mt-0.5">All accounts</span>
        </div>

        <div
          onClick={() => setActiveTab('FACULTY')}
          className={`p-4 rounded-xl border transition cursor-pointer ${
            activeTab === 'FACULTY'
              ? 'border-[#1A3170] bg-[#1A3170]/5 ring-1 ring-[#1A3170]'
              : 'border-[#E2DFD7] dark:border-[#2D3342] bg-white dark:bg-[#1B1E26]'
          }`}
        >
          <div className="flex items-center justify-between text-[10px] font-bold text-[#8C909C] uppercase tracking-wider">
            <span>Faculty</span>
            <Award className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1">
            {totalFaculty}
          </div>
          <span className="text-[10px] text-[#5B6070] block mt-0.5">Professors &amp; Chairs</span>
        </div>

        <div
          onClick={() => setActiveTab('STAFF')}
          className={`p-4 rounded-xl border transition cursor-pointer ${
            activeTab === 'STAFF'
              ? 'border-[#1A3170] bg-[#1A3170]/5 ring-1 ring-[#1A3170]'
              : 'border-[#E2DFD7] dark:border-[#2D3342] bg-white dark:bg-[#1B1E26]'
          }`}
        >
          <div className="flex items-center justify-between text-[10px] font-bold text-[#8C909C] uppercase tracking-wider">
            <span>Staff</span>
            <Briefcase className="w-3.5 h-3.5 text-teal-600" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1">
            {totalStaff}
          </div>
          <span className="text-[10px] text-[#5B6070] block mt-0.5">Support staff</span>
        </div>

        <div
          onClick={() => setActiveTab('ADMIN')}
          className={`p-4 rounded-xl border transition cursor-pointer ${
            activeTab === 'ADMIN'
              ? 'border-[#1A3170] bg-[#1A3170]/5 ring-1 ring-[#1A3170]'
              : 'border-[#E2DFD7] dark:border-[#2D3342] bg-white dark:bg-[#1B1E26]'
          }`}
        >
          <div className="flex items-center justify-between text-[10px] font-bold text-[#8C909C] uppercase tracking-wider">
            <span>Admins</span>
            <Shield className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mt-1">
            {totalAdmins}
          </div>
          <span className="text-[10px] text-[#5B6070] block mt-0.5">System controllers</span>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="p-4 rounded-2xl border border-[#E5E3DC] dark:border-[#2D3342] bg-white dark:bg-[#1B1E26] space-y-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex flex-wrap gap-1 p-1 bg-[#F0EEE6] dark:bg-[#12141A] rounded-xl border border-[#E5E3DC] dark:border-[#2A2F3D] text-[11px] font-semibold">
            {(
              [
                ['ALL', 'All Users'],
                ['FACULTY', 'Faculty'],
                ['STAFF', 'Staff'],
                ['ADMIN', 'Admins'],
              ] as const
            ).map(([tabKey, tabLabel]) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setActiveTab(tabKey)}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === tabKey
                    ? 'bg-[#1A3170] text-white shadow-2xs font-bold'
                    : 'text-[#5B6070] dark:text-[#9DA4B5] hover:text-[#16181D]'
                }`}
              >
                {tabLabel}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-[#8C909C] absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, role, or designation..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-white focus:outline-none focus:ring-1.5 focus:ring-[#1A3170]"
            />
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="border border-[#E5E3DC] dark:border-[#2D3342] rounded-2xl bg-white dark:bg-[#1B1E26] shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#1A3170] mx-auto" />
            <span className="text-xs text-[#5B6070] mt-2 block">Loading user registry...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-8 h-8 text-[#8C909C] mx-auto mb-2" />
            <h3 className="text-sm font-bold text-[#16181D] dark:text-white">No users match this filter</h3>
            <p className="text-xs text-[#5B6070] mt-1">Try resetting the filter or search query</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E5E3DC] dark:border-[#2D3342] bg-[#FAF9F6] dark:bg-[#141720] text-[10px] font-bold text-[#8C909C] uppercase tracking-wider">
                  <th className="py-3 px-4">User Identity</th>
                  <th className="py-3 px-4">Designation</th>
                  <th className="py-3 px-4">Role Authorizations</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E3DC] dark:divide-[#2D3342]">
                {filteredUsers.map((u) => {
                  const isActive = u.status === 'ACTIVE';
                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-[#FAF9F6]/80 dark:hover:bg-[#202530]/50 transition"
                    >
                      {/* Name & Email */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#16181D] dark:text-white flex items-center gap-2">
                          <span>{u.fullName}</span>
                          {u.roles?.includes('ADMIN') ? (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold font-mono bg-[#1A3170] text-white">
                              ADMIN
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-[#8C909C] font-mono mt-0.5">{u.email}</div>
                      </td>

                      {/* Designation */}
                      <td className="py-3.5 px-4">
                        <div className="text-[#16181D] dark:text-white font-medium">
                          {u.designation || 'Staff Member'}
                        </div>
                      </td>

                      {/* Role Badges */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {(u.roles || []).map((r) => (
                            <span
                              key={r}
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold font-mono border ${
                                r === 'ADMIN'
                                  ? 'bg-[#1A3170]/10 text-[#1A3170] dark:text-blue-300 border-[#1A3170]/30 font-bold'
                                  : r === 'FACULTY'
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200'
                                    : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200'
                              }`}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Status Toggle */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => toggleStatusMutation.mutate(u.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border cursor-pointer transition ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300'
                          }`}
                        >
                          {isActive ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                          <span>{isActive ? 'ACTIVE' : 'DISABLED'}</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedUserForRoles(u)}
                          className="px-2.5 py-1 rounded-lg border border-[#D5D2CA] dark:border-[#383E50] hover:bg-[#FAF9F6] text-[#16181D] dark:text-white font-medium text-[11px] cursor-pointer"
                        >
                          Roles
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUserForPassword(u);
                            setNewPasswordVal('');
                          }}
                          className="px-2.5 py-1 rounded-lg border border-[#D5D2CA] dark:border-[#383E50] hover:bg-[#FAF9F6] text-[#16181D] dark:text-white font-medium text-[11px] cursor-pointer"
                          title="Reset Password"
                        >
                          <KeyRound className="w-3 h-3 inline mr-1" />
                          <span>Reset</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Are you sure you want to remove user "${u.fullName}"?`)) {
                              deleteUserMutation.mutate(u.id);
                            }
                          }}
                          className="p-1 rounded-lg text-[#8C909C] hover:text-red-600 hover:bg-red-50 cursor-pointer"
                          title="Delete User"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#1B1E26] rounded-2xl border border-[#D5D2CA] dark:border-[#2D3342] shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E3DC] dark:border-[#2A2F3D] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#1A3170]/10 text-[#1A3170] flex items-center justify-center">
                  {modalType === 'FACULTY' ? (
                    <Award className="w-4 h-4" />
                  ) : (
                    <Users className="w-4 h-4" />
                  )}
                </div>
                <h3 className="text-sm font-bold text-[#16181D] dark:text-white">
                  {modalType === 'FACULTY' ? 'Register Faculty Member' : 'Enroll User Account'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-[#8C909C] hover:text-[#16181D] dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#16181D] dark:text-white mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Dr. Rajesh Kumar"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-white focus:outline-none focus:ring-1.5 focus:ring-[#1A3170]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#16181D] dark:text-white mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@stmarysgroup.com"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-white focus:outline-none focus:ring-1.5 focus:ring-[#1A3170]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#16181D] dark:text-white mb-1">
                  Designation / Title
                </label>
                <input
                  type="text"
                  required
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Associate Professor"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-white focus:outline-none focus:ring-1.5 focus:ring-[#1A3170]"
                />
              </div>

              {/* Roles selection */}
              <div>
                <label className="block text-[11px] font-semibold text-[#16181D] dark:text-white mb-1.5">
                  Select Applicable Role Authorizations:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    RoleCode.FACULTY,
                    RoleCode.STAFF,
                    RoleCode.ADMIN,
                  ].map((role) => {
                    const isSelected = selectedRoles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => handleToggleRole(role)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                          isSelected
                            ? 'bg-[#1A3170] text-white border-[#1A3170]'
                            : 'bg-white dark:bg-[#202530] text-[#5B6070] border-[#D5D2CA] dark:border-[#383E50]'
                        }`}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#E5E3DC] dark:border-[#2A2F3D]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-[#D5D2CA] dark:border-[#383E50] hover:bg-[#FAF9F6] text-[#5B6070] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#1A3170] hover:bg-[#12224D] text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {createUserMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Enroll User</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Assignment Modal */}
      {selectedUserForRoles && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#1B1E26] rounded-2xl border border-[#D5D2CA] dark:border-[#2D3342] shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E3DC] dark:border-[#2A2F3D] pb-3">
              <h3 className="text-sm font-bold text-[#16181D] dark:text-white">
                Authorize Roles: {selectedUserForRoles.fullName}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedUserForRoles(null)}
                className="text-[#8C909C] hover:text-[#16181D] dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-[#5B6070] dark:text-[#9DA4B5]">
                Toggle the RBAC security roles granted to this account. Changes apply immediately upon confirmation.
              </p>

              <div className="flex flex-wrap gap-2 p-1">
                {[
                  RoleCode.ADMIN,
                  RoleCode.FACULTY,
                  RoleCode.STAFF,
                ].map((role) => {
                  const has = selectedUserForRoles.roles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        const newRoles = has
                          ? selectedUserForRoles.roles.filter((r) => r !== role)
                          : [...selectedUserForRoles.roles, role];
                        setSelectedUserForRoles({ ...selectedUserForRoles, roles: newRoles });
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        has
                          ? 'bg-[#1A3170] text-white border-[#1A3170] shadow-2xs font-bold'
                          : 'bg-white dark:bg-[#202530] text-[#5B6070] border-[#D5D2CA] dark:border-[#383E50] hover:bg-[#FAF9F6]'
                      }`}
                    >
                      {role}
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#E5E3DC] dark:border-[#2A2F3D]">
                <button
                  type="button"
                  onClick={() => setSelectedUserForRoles(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-[#D5D2CA] dark:border-[#383E50] hover:bg-[#FAF9F6] text-[#5B6070] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    assignRolesMutation.mutate({
                      id: selectedUserForRoles.id,
                      roles: selectedUserForRoles.roles,
                    })
                  }
                  disabled={assignRolesMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#1A3170] hover:bg-[#12224D] text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {assignRolesMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Role Assignments</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {selectedUserForPassword && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#1B1E26] rounded-2xl border border-[#D5D2CA] dark:border-[#2D3342] shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E3DC] dark:border-[#2A2F3D] pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#1A3170]" />
                <h3 className="text-sm font-bold text-[#16181D] dark:text-white">
                  Reset Password for {selectedUserForPassword.fullName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserForPassword(null)}
                className="text-[#8C909C] hover:text-[#16181D] dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                resetPasswordMutation.mutate({
                  id: selectedUserForPassword.id,
                  newPass: newPasswordVal,
                });
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-[11px] font-semibold text-[#16181D] dark:text-white mb-1">
                  New Password (min 8 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPasswordVal}
                  onChange={(e) => setNewPasswordVal(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-white focus:outline-none focus:ring-1.5 focus:ring-[#1A3170]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUserForPassword(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-[#D5D2CA] dark:border-[#383E50] text-[#5B6070] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetPasswordMutation.isPending}
                  className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-[#1A3170] hover:bg-[#12224D] text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {resetPasswordMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Set Password</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
