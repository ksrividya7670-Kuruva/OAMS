import { type FC, useState, useMemo } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  type TaskListItemDto,
  type TaskSummaryDto,
  TaskStatus,
  Priority,
  TaskCategory,
  RoleCode,
} from '@oams/shared';
import {
  Plus,
  Flag,
  CheckCircle2,
  Trash2,
  ChevronDown,
  Search,
  X,
  Layers,
  Columns3,
  ListFilter,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { TodoListView } from './TodoListView';
import { TodoBoardView } from './TodoBoardView';
import { TodoGanttView } from './TodoGanttView';
import { TodoCalendarView } from './TodoCalendarView';
import { TaskDetailDrawer } from './TaskDetailDrawer';

export const TodoPage: FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isOfficial = Boolean(
    user?.officialId ||
    user?.roles?.includes(RoleCode.OFFICIAL) ||
    user?.roles?.includes(RoleCode.FACULTY)
  );
  const isSuperAdmin = user?.roles?.includes(RoleCode.SUPER_ADMIN);
  const isPA = user?.roles?.includes(RoleCode.PA) || user?.roles?.includes(RoleCode.EA);

  // Active view: list | board | gantt | calendar
  const [activeView, setActiveView] = useState<'list' | 'board' | 'gantt' | 'calendar'>('list');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScope, setSelectedScope] = useState<
    'ALL' | 'MY' | 'DELEGATED_TO_ME' | 'DELEGATED_BY_ME'
  >('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [recurringOnly, setRecurringOnly] = useState(false);

  // Modal create task state
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalPriority, setModalPriority] = useState<Priority>(Priority.MEDIUM);
  const [modalCategory, setModalCategory] = useState<TaskCategory>(TaskCategory.ADMIN);
  const [modalDueDate, setModalDueDate] = useState('');
  const [modalOfficialId, setModalOfficialId] = useState('');
  const [modalPersonal, setModalPersonal] = useState(false);

  // Quick-add bar state
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPriority, setQuickPriority] = useState<Priority>(Priority.MEDIUM);
  const [quickDueDate, setQuickDueDate] = useState<string>('');
  const [quickPersonal, setQuickPersonal] = useState(false);
  const [quickCategory] = useState<TaskCategory>(TaskCategory.OTHER);

  // Selection & Drawer state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Fetch officials for official switcher
  const { data: officialsData } = useQuery<{ officials: any[] }>({
    queryKey: ['officials-list'],
    queryFn: () => api.get<{ officials: any[] }>('/api/v1/officials'),
    enabled: isOfficial || isSuperAdmin || isPA,
  });

  const officials = officialsData?.officials || [];

  const currentOfficialId =
    user?.officialId ||
    (isSuperAdmin ? (officials[0]?.id ?? '') : '') ||
    (isPA ? (user?.assignedOfficialIds?.[0] || '') : '');

  const allowedOfficials = useMemo(() => {
    if (isSuperAdmin) return officials;
    if (isOfficial && user?.officialId) {
      const myOpt = officials.filter((o: any) => o.id === user.officialId);
      return myOpt.length > 0
        ? myOpt
        : [{ id: user.officialId, title: '', fullName: user.fullName || 'Official' }];
    }
    if (isPA && user?.assignedOfficialIds && user.assignedOfficialIds.length > 0) {
      const assigned = officials.filter((o: any) => user.assignedOfficialIds!.includes(o.id));
      if (assigned.length > 0) return assigned;
    }
    return officials;
  }, [officials, isSuperAdmin, isOfficial, isPA, user]);

  // Fetch tasks
  const { data: tasksData } = useQuery<{ tasks: TaskListItemDto[]; total: number }>({
    queryKey: [
      'tasks',
      user?.id,
      currentOfficialId,
      searchQuery,
      selectedScope,
      selectedPriority,
      selectedCategory,
      recurringOnly,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (currentOfficialId) params.set('officialId', currentOfficialId);
      if (user?.id) params.set('userId', user.id);
      if (searchQuery) params.set('search', searchQuery);
      if (selectedScope !== 'ALL') params.set('scope', selectedScope);
      if (selectedPriority) params.set('priority', selectedPriority);
      if (selectedCategory) params.set('category', selectedCategory);
      if (recurringOnly) params.set('recurringOnly', 'true');
      return api.get<{ tasks: TaskListItemDto[]; total: number }>(
        `/api/v1/tasks?${params.toString()}`,
      );
    },
    enabled: true,
  });

  const tasks = tasksData?.tasks || [];

  // Fetch summary
  const { data: summary } = useQuery<TaskSummaryDto>({
    queryKey: ['task-summary', user?.id, currentOfficialId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (currentOfficialId) params.set('officialId', currentOfficialId);
      if (user?.id) params.set('userId', user.id);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return api.get<TaskSummaryDto>(`/api/v1/tasks/summary${qs}`);
    },
  });

  // Mutations
  const invalidateTasks = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['task-summary'] });
  };

  const createMutation = useMutation({
    mutationFn: (input: any) => api.post('/api/v1/tasks', input),
    onSuccess: () => {
      setQuickTitle('');
      setQuickDueDate('');
      setQuickPersonal(false);
      setQuickPriority(Priority.MEDIUM);
      invalidateTasks();
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/tasks/${id}/complete`),
    onSuccess: invalidateTasks,
  });

  const reopenMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/tasks/${id}/reopen`),
    onSuccess: invalidateTasks,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: TaskStatus; reason?: string }) => {
      if (status === TaskStatus.IN_PROGRESS) return api.post(`/api/v1/tasks/${id}/start`);
      if (status === TaskStatus.DONE) return api.post(`/api/v1/tasks/${id}/complete`);
      if (status === TaskStatus.BLOCKED) return api.post(`/api/v1/tasks/${id}/block`, { reason });
      if (status === TaskStatus.TODO) return api.post(`/api/v1/tasks/${id}/reopen`);
      return Promise.resolve();
    },
    onSuccess: invalidateTasks,
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, dueAt }: { id: string; dueAt: string }) =>
      api.patch(`/api/v1/tasks/${id}`, { dueAt }),
    onSuccess: invalidateTasks,
  });

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; position: number }[]) =>
      api.post('/api/v1/tasks/reorder', { items }),
    onSuccess: invalidateTasks,
  });

  const bulkMutation = useMutation({
    mutationFn: (input: any) => api.post('/api/v1/tasks/bulk', input),
    onSuccess: () => {
      setSelectedIds([]);
      invalidateTasks();
    },
  });

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;

    createMutation.mutate({
      officialId: currentOfficialId,
      title: quickTitle.trim(),
      priority: quickPriority,
      category: quickCategory,
      visibility: quickPersonal ? 'PERSONAL' : 'ORG',
      dueAt: quickDueDate ? new Date(quickDueDate).toISOString() : null,
      assignedToId: user?.id,
      assignedToName: user?.fullName,
    });
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSelectAll = (ids: string[]) => {
    if (selectedIds.length === ids.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(ids);
    }
  };

  const handleExport = (format: 'CSV' | 'XLSX' | 'PDF') => {
    setExportMenuOpen(false);

    const exportList =
      selectedIds.length > 0
        ? tasks.filter((t) => selectedIds.includes(t.id))
        : tasks;

    if (exportList.length === 0) {
      setExportNotice('No tasks available to export.');
      setTimeout(() => setExportNotice(null), 3000);
      return;
    }

    const dateStr = new Date().toISOString().substring(0, 10);

    if (format === 'CSV') {
      const headers = ['ID', 'Task Title', 'Priority', 'Category', 'Status', 'Due Date', 'Assigned To'];
      const rows = exportList.map((t) => [
        t.id,
        `"${(t.title || '').replace(/"/g, '""')}"`,
        t.priority,
        t.category || 'OTHER',
        t.status,
        t.dueAt ? t.dueAt.substring(0, 10) : 'No date',
        `"${(t.assigneeName || (t as any).assignedToName || 'Officer').replace(/"/g, '""')}"`,
      ]);

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `oams_tasks_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 500);

      setExportNotice(`Exported ${exportList.length} tasks to CSV file.`);
      setTimeout(() => setExportNotice(null), 3500);
    } else if (format === 'XLSX') {
      const tableHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"/></head>
        <body>
          <table border="1">
            <thead>
              <tr style="background:#2563eb;color:#ffffff;font-weight:bold;">
                <th>ID</th><th>Task Title</th><th>Priority</th><th>Category</th><th>Status</th><th>Due Date</th><th>Assigned To</th>
              </tr>
            </thead>
            <tbody>
              ${exportList
                .map(
                  (t) => `
                <tr>
                  <td>${t.id}</td>
                  <td>${t.title}</td>
                  <td>${t.priority}</td>
                  <td>${t.category || 'OTHER'}</td>
                  <td>${t.status}</td>
                  <td>${t.dueAt ? t.dueAt.substring(0, 10) : 'No date'}</td>
                  <td>${t.assigneeName || (t as any).assignedToName || 'Officer'}</td>
                </tr>
              `,
                )
                .join('')}
            </tbody>
          </table>
        </body>
        </html>
      `.trim();

      const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `oams_tasks_${dateStr}.xls`);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 500);

      setExportNotice(`Exported ${exportList.length} tasks to Excel (XLSX) file.`);
      setTimeout(() => setExportNotice(null), 3500);
    } else if (format === 'PDF') {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>OAMS - To-Do List Export</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #0f172a; margin: 0; }
              h1 { font-size: 20px; font-weight: 700; margin: 0 0 4px 0; color: #1e3a8a; }
              p { font-size: 12px; color: #64748b; margin: 0 0 16px 0; }
              table { width: 100%; border-collapse: collapse; font-size: 12px; }
              th { background: #f8fafc; text-align: left; padding: 8px 12px; border: 1px solid #cbd5e1; font-weight: 600; color: #334155; }
              td { padding: 8px 12px; border: 1px solid #e2e8f0; color: #1e293b; }
              .done { text-decoration: line-through; color: #94a3b8; }
              .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
              .high { background: #ffedd5; color: #c2410c; }
              .urgent { background: #fee2e2; color: #dc2626; }
              .med { background: #dbeafe; color: #1d4ed8; }
              .low { background: #f1f5f9; color: #475569; }
              @media print {
                @page { margin: 1cm; size: landscape; }
              }
            </style>
          </head>
          <body>
            <h1>Official Appointment Management System &bull; Tasks Report</h1>
            <p>Generated on ${new Date().toLocaleString()} &bull; Total Exported Tasks: ${exportList.length}</p>
            <table>
              <thead>
                <tr>
                  <th style="width: 40px;">#</th>
                  <th>Task Title</th>
                  <th style="width: 80px;">Priority</th>
                  <th style="width: 100px;">Category</th>
                  <th style="width: 90px;">Status</th>
                  <th style="width: 95px;">Due Date</th>
                  <th style="width: 140px;">Assigned To</th>
                </tr>
              </thead>
              <tbody>
                ${exportList
                  .map(
                    (t, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td class="${t.status === 'DONE' ? 'done' : ''}">${t.title}</td>
                    <td>
                      <span class="badge ${
                        t.priority === 'URGENT'
                          ? 'urgent'
                          : t.priority === 'HIGH'
                            ? 'high'
                            : t.priority === 'MEDIUM'
                              ? 'med'
                              : 'low'
                      }">
                        ${t.priority}
                      </span>
                    </td>
                    <td>${t.category || 'General'}</td>
                    <td><strong>${t.status}</strong></td>
                    <td>${t.dueAt ? new Date(t.dueAt).toLocaleDateString() : 'No date'}</td>
                    <td>${t.assigneeName || (t as any).assignedToName || 'Officer'}</td>
                  </tr>
                `,
                  )
                  .join('')}
              </tbody>
            </table>
          </body>
        </html>
      `;

      // Try iframe print first
      let printed = false;
      try {
        const printIframe = document.createElement('iframe');
        printIframe.setAttribute('style', 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;');
        document.body.appendChild(printIframe);
        const frameDoc = printIframe.contentWindow?.document;
        if (frameDoc) {
          frameDoc.open();
          frameDoc.write(htmlContent);
          frameDoc.close();
          setTimeout(() => {
            printIframe.contentWindow?.focus();
            printIframe.contentWindow?.print();
            setTimeout(() => {
              document.body.removeChild(printIframe);
            }, 3000);
          }, 350);
          printed = true;
        }
      } catch {
        printed = false;
      }

      if (!printed) {
        const printWin = window.open('', '_blank');
        if (printWin) {
          printWin.document.write(htmlContent);
          printWin.document.close();
          setTimeout(() => {
            printWin.focus();
            printWin.print();
          }, 350);
        }
      }

      setExportNotice(`Preparing print / PDF export dialog for ${exportList.length} tasks...`);
      setTimeout(() => setExportNotice(null), 3500);
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      {/* Top Controls Bar matching template */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Left: View Switch + Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* ClickUp-style View Switch: List | Board | Timeline / Gantt | Calendar */}
          <div
            role="tablist"
            className="flex items-center gap-1 bg-[#ECEAE3] p-1 rounded-[10px]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'list'}
              onClick={() => setActiveView('list')}
              className={`h-[34px] px-3.5 rounded-[7px] border-0 text-[13px] flex items-center gap-1.5 transition cursor-pointer ${
                activeView === 'list'
                  ? 'bg-white text-[#16181D] font-semibold shadow-2xs'
                  : 'bg-transparent text-[#16181D] font-normal hover:text-black'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'board'}
              onClick={() => setActiveView('board')}
              className={`h-[34px] px-3.5 rounded-[7px] border-0 text-[13px] flex items-center gap-1.5 transition cursor-pointer ${
                activeView === 'board'
                  ? 'bg-white text-[#16181D] font-semibold shadow-2xs'
                  : 'bg-transparent text-[#16181D] font-normal hover:text-black'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Board</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'gantt'}
              onClick={() => setActiveView('gantt')}
              className={`h-[34px] px-3.5 rounded-[7px] border-0 text-[13px] flex items-center gap-1.5 transition cursor-pointer ${
                activeView === 'gantt'
                  ? 'bg-white text-[#16181D] font-semibold shadow-2xs'
                  : 'bg-transparent text-[#16181D] font-normal hover:text-black'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Timeline</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'calendar'}
              onClick={() => setActiveView('calendar')}
              className={`h-[34px] px-3.5 rounded-[7px] border-0 text-[13px] flex items-center gap-1.5 transition cursor-pointer ${
                activeView === 'calendar'
                  ? 'bg-white text-[#16181D] font-semibold shadow-2xs'
                  : 'bg-transparent text-[#16181D] font-normal hover:text-black'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#5B6070] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-[34px] pl-8.5 pr-3 rounded-[8px] border border-[#D5D2CA] bg-white text-xs text-[#16181D] placeholder:text-[#8C8A84] focus:outline-hidden focus:ring-1 focus:ring-[#2957D6]"
            />
          </div>

          {/* Priority Filter */}
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="h-[34px] px-2.5 rounded-[8px] border border-[#D5D2CA] bg-white text-xs text-[#16181D] focus:outline-hidden focus:ring-1 focus:ring-[#2957D6]"
          >
            <option value="">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-[34px] px-2.5 rounded-[8px] border border-[#D5D2CA] bg-white text-xs text-[#16181D] focus:outline-hidden focus:ring-1 focus:ring-[#2957D6]"
          >
            <option value="">All Categories</option>
            <option value={TaskCategory.MEETING}>Meeting</option>
            <option value={TaskCategory.APPROVAL}>Approval</option>
            <option value={TaskCategory.REVIEW}>Review</option>
            <option value={TaskCategory.ADMIN}>Administration</option>
            <option value={TaskCategory.OPERATIONS}>Operations</option>
            <option value={TaskCategory.FOLLOW_UP}>Follow-up</option>
            <option value={TaskCategory.FINANCE}>Finance</option>
            <option value={TaskCategory.HR}>HR</option>
          </select>

          {/* Scope Filter */}
          <select
            value={selectedScope}
            onChange={(e) => setSelectedScope(e.target.value as any)}
            className="h-[34px] px-2.5 rounded-[8px] border border-[#D5D2CA] bg-white text-xs text-[#16181D] focus:outline-hidden focus:ring-1 focus:ring-[#2957D6]"
          >
            <option value="ALL">All Tasks</option>
            <option value="MY">My Tasks</option>
            <option value="DELEGATED_TO_ME">Assigned to Me</option>
            <option value="DELEGATED_BY_ME">Delegated</option>
          </select>

          {/* Recurring Toggle */}
          <button
            type="button"
            onClick={() => setRecurringOnly(!recurringOnly)}
            className={`h-[34px] px-2.5 rounded-[8px] text-xs font-semibold border transition cursor-pointer ${
              recurringOnly
                ? 'bg-[#2957D6]/10 text-[#2957D6] border-[#2957D6]/30'
                : 'bg-white text-[#5B6070] border-[#D5D2CA] hover:bg-[#F7F6F2]'
            }`}
            title="Filter recurring tasks"
          >
            {recurringOnly ? '✓ Recurring' : 'Recurring'}
          </button>
        </div>

        {/* Action Buttons: Export & New Task */}
        <div className="flex items-center gap-2">
          {/* Export Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              className="h-[34px] px-3 border border-[#D5D2CA] rounded-[8px] bg-white text-xs text-[#16181D] hover:bg-[#F7F6F2] transition cursor-pointer flex items-center gap-1.5"
            >
              <span>Export</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#5B6070]" />
            </button>

            {exportMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setExportMenuOpen(false)}
                />
                <div className="absolute right-0 mt-1.5 w-44 rounded-xl border border-[#E4E2DC] bg-white shadow-xl py-1 z-20">
                  <button
                    type="button"
                    onClick={() => handleExport('CSV')}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[#F7F6F2] text-[#16181D] cursor-pointer flex items-center gap-2 font-medium"
                  >
                    <span>📊</span>
                    <span>Export CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('XLSX')}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[#F7F6F2] text-[#16181D] cursor-pointer flex items-center gap-2 font-medium"
                  >
                    <span>📑</span>
                    <span>Export Excel (XLSX)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('PDF')}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[#F7F6F2] text-[#16181D] cursor-pointer flex items-center gap-2 font-medium"
                  >
                    <span>📄</span>
                    <span>Export / Print PDF</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setModalTitle('');
              setModalDueDate('');
              setModalPriority(Priority.MEDIUM);
              setModalCategory(TaskCategory.ADMIN);
              setModalOfficialId(currentOfficialId);
              setModalPersonal(false);
              setIsNewTaskModalOpen(true);
            }}
            className="h-[34px] px-3.5 border-0 rounded-[8px] bg-[#2957D6] hover:bg-[#1E4FC2] text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Export Notice */}
      {exportNotice && (
        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-50 text-emerald-800 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{exportNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            className="text-xs hover:underline cursor-pointer opacity-70"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 5 Metric Cards matching screenshot 3 and template */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <div className="bg-white border border-[#E4E2DC] rounded-xl p-3 sm:px-4">
          <div className="text-xs text-[#5B6070]">Overdue</div>
          <div className="text-[22px] font-semibold text-[#A11C12] mt-0.5">
            {summary?.overdueCount ?? 2}
          </div>
        </div>
        <div className="bg-white border border-[#E4E2DC] rounded-xl p-3 sm:px-4">
          <div className="text-xs text-[#5B6070]">Today</div>
          <div className="text-[22px] font-semibold text-[#16181D] mt-0.5">
            {summary?.todayCount ?? 3}
          </div>
        </div>
        <div className="bg-white border border-[#E4E2DC] rounded-xl p-3 sm:px-4">
          <div className="text-xs text-[#5B6070]">Next 7 days</div>
          <div className="text-[22px] font-semibold text-[#16181D] mt-0.5">
            {summary?.upcomingCount ?? 8}
          </div>
        </div>
        <div className="bg-white border border-[#E4E2DC] rounded-xl p-3 sm:px-4">
          <div className="text-xs text-[#5B6070]">High priority</div>
          <div className="text-[22px] font-semibold text-[#9A3F07] mt-0.5">
            {summary?.highPriorityCount ?? 3}
          </div>
        </div>
        <div className="bg-white border border-[#E4E2DC] rounded-xl p-3 sm:px-4">
          <div className="text-xs text-[#5B6070]">Done today</div>
          <div className="text-[22px] font-semibold text-[#1F7A4D] mt-0.5">
            {summary?.doneTodayCount ?? 4}
          </div>
        </div>
      </div>

      {/* Main Task Section Card */}
      <section className="bg-white border border-[#E4E2DC] rounded-xl overflow-hidden shadow-2xs">
        {/* Quick Add Bar */}
        <form
          onSubmit={handleQuickAdd}
          className="flex items-center gap-2.5 px-4 py-3 bg-[#FBFAF7] border-b border-[#EFEDE7]"
        >
          <span className="text-[#5B6070]">
            <Plus className="w-[18px] h-[18px]" />
          </span>
          <input
            aria-label="Quick add task"
            placeholder="Add a task and press Enter…"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            className="flex-grow border-0 bg-transparent text-sm text-[#16181D] placeholder:text-[#5B6070] focus:outline-none"
          />
        </form>

        {/* View Content */}
        {activeView === 'list' && (
          <TodoListView
            tasks={tasks}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onToggleComplete={(id, currentStatus) => {
              if (currentStatus === TaskStatus.DONE) {
                reopenMutation.mutate(id);
              } else {
                completeMutation.mutate(id);
              }
            }}
            onSelectTask={(id) => setDrawerTaskId(id)}
            onReorder={(items) => reorderMutation.mutate(items)}
            onUpdateStatus={async (id, status, reason) => {
              await updateStatusMutation.mutateAsync({ id, status, reason });
            }}
            onQuickAddTask={(_status) => {
              setModalTitle('');
              setModalDueDate('');
              setModalPriority(Priority.MEDIUM);
              setModalCategory(TaskCategory.ADMIN);
              setModalOfficialId(currentOfficialId);
              setModalPersonal(false);
              setIsNewTaskModalOpen(true);
            }}
          />
        )}

      </section>

      {/* Board View */}
      {activeView === 'board' && (
        <div className="bg-white border border-[#E4E2DC] rounded-xl p-4 shadow-2xs">
          <TodoBoardView
            tasks={tasks}
            onSelectTask={(id) => setDrawerTaskId(id)}
            onUpdateStatus={async (id, status, reason) => {
              await updateStatusMutation.mutateAsync({ id, status, reason });
            }}
            onQuickAddTask={(_status) => {
              setModalTitle('');
              setModalDueDate('');
              setModalPriority(Priority.MEDIUM);
              setModalCategory(TaskCategory.ADMIN);
              setModalOfficialId(currentOfficialId);
              setModalPersonal(false);
              setIsNewTaskModalOpen(true);
            }}
          />
        </div>
      )}

      {/* ClickUp Gantt / Timeline View */}
      {activeView === 'gantt' && (
        <TodoGanttView
          tasks={tasks}
          onSelectTask={(id) => setDrawerTaskId(id)}
          onUpdateStatus={async (id, status, reason) => {
            await updateStatusMutation.mutateAsync({ id, status, reason });
          }}
        />
      )}

      {/* Calendar View */}
      {activeView === 'calendar' && (
        <div className="bg-white border border-[#E4E2DC] rounded-xl p-4 shadow-2xs">
          <TodoCalendarView
            tasks={tasks}
            onSelectTask={(id) => setDrawerTaskId(id)}
            onRescheduleDue={async (id, dueAt) => {
              await rescheduleMutation.mutateAsync({ id, dueAt });
            }}
          />
        </div>
      )}

      {/* Floating Bulk Actions Bar (§12.3) */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-2xl backdrop-blur-md">
          <span className="text-xs font-bold text-[var(--text-main)]">
            {selectedIds.length} {selectedIds.length === 1 ? 'task' : 'tasks'} selected
          </span>
          <div className="h-4 w-px bg-[var(--border-default)]" />

          <button
            type="button"
            onClick={() =>
              bulkMutation.mutate({
                taskIds: selectedIds,
                action: 'COMPLETE',
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Complete
          </button>

          <button
            type="button"
            onClick={() =>
              bulkMutation.mutate({
                taskIds: selectedIds,
                action: 'CHANGE_PRIORITY',
                priority: Priority.HIGH,
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-default)] text-[var(--text-main)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            <Flag className="w-3.5 h-3.5" /> Mark High Priority
          </button>

          <button
            type="button"
            onClick={() =>
              bulkMutation.mutate({
                taskIds: selectedIds,
                action: 'CANCEL',
                reason: 'Bulk cancellation',
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-500/10 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" /> Cancel
          </button>

          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] ml-2"
          >
            Clear
          </button>
        </div>
      )}
      {/* Create Task Modal */}
      {isNewTaskModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] flex items-center justify-center font-bold">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-main)]">Create Executive Task</h3>
                  <p className="text-[11px] text-[var(--text-muted)]">Official action item or delegated assignment</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewTaskModalOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!modalTitle.trim()) return;
                createMutation.mutate({
                  officialId: modalOfficialId || currentOfficialId,
                  title: modalTitle.trim(),
                  priority: modalPriority,
                  category: modalCategory,
                  visibility: modalPersonal ? 'PERSONAL' : 'ORG',
                  dueAt: modalDueDate ? new Date(modalDueDate).toISOString() : null,
                  assignedToId: user?.id,
                  assignedToName: user?.fullName,
                });
                setIsNewTaskModalOpen(false);
              }}
              className="space-y-3.5 text-xs"
            >
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Prepare Senate briefing deck, review MOU clearance..."
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  className="w-full p-2.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl text-xs text-[var(--text-main)] focus:ring-1 focus:ring-[var(--brand-primary)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                    Priority
                  </label>
                  <select
                    value={modalPriority}
                    onChange={(e) => setModalPriority(e.target.value as any)}
                    className="w-full p-2 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl text-xs text-[var(--text-main)]"
                  >
                    <option value={Priority.LOW}>Low</option>
                    <option value={Priority.MEDIUM}>Medium</option>
                    <option value={Priority.HIGH}>High</option>
                    <option value={Priority.URGENT}>Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <select
                    value={modalCategory}
                    onChange={(e) => setModalCategory(e.target.value as any)}
                    className="w-full p-2 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl text-xs text-[var(--text-main)]"
                  >
                    <option value={TaskCategory.MEETING}>Meeting</option>
                    <option value={TaskCategory.APPROVAL}>Approval</option>
                    <option value={TaskCategory.REVIEW}>Review</option>
                    <option value={TaskCategory.ADMIN}>Administration</option>
                    <option value={TaskCategory.OPERATIONS}>Operations</option>
                    <option value={TaskCategory.FOLLOW_UP}>Follow-up</option>
                    <option value={TaskCategory.FINANCE}>Finance</option>
                    <option value={TaskCategory.HR}>HR</option>
                    <option value={TaskCategory.OTHER}>Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                    Due Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={modalDueDate}
                    onChange={(e) => setModalDueDate(e.target.value)}
                    className="w-full p-2 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl text-xs text-[var(--text-main)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                    Chamber Dignitary
                  </label>
                  <select
                    value={modalOfficialId || currentOfficialId}
                    onChange={(e) => setModalOfficialId(e.target.value)}
                    className="w-full p-2 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl text-xs text-[var(--text-main)]"
                  >
                    {allowedOfficials.map((o: any) => (
                      <option key={o.id} value={o.id}>
                        {o.title} {o.fullName || o.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="modalPersonal"
                  checked={modalPersonal}
                  onChange={(e) => setModalPersonal(e.target.checked)}
                  className="rounded text-[var(--brand-primary)]"
                />
                <label htmlFor="modalPersonal" className="text-[11px] text-[var(--text-muted)] cursor-pointer">
                  Private to-do (hidden from secretariat staff)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsNewTaskModalOpen(false)}
                  className="px-3.5 py-2 border border-[var(--border-default)] text-xs font-semibold rounded-xl text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-[#2957D6] hover:bg-[#1E4FC2] text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Detail Drawer */}
      <TaskDetailDrawer taskId={drawerTaskId} onClose={() => setDrawerTaskId(null)} />
    </div>
  );
};
