import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskDetailDrawer } from '../src/features/todo/TaskDetailDrawer';
import { AuthProvider } from '../src/features/auth/AuthContext';
import { TaskStatus, Priority, TaskCategory } from '@oams/shared';
import * as apiModule from '../src/lib/api';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

const mockTask = {
  id: 'tsk-test-1',
  referenceNo: 'TSK-2026-0042',
  title: 'Conduct Q3 operational spend audit with finance secretariat',
  description: 'Comprehensive review of operational expenditure vs approved budget caps.',
  status: TaskStatus.IN_PROGRESS,
  priority: Priority.HIGH,
  category: TaskCategory.REVIEW,
  officialId: 'off-2',
  officialName: 'Mr. Harsha Rao',
  assignedToId: 'usr-officer-1',
  assignedToName: 'Ms. Indhu',
  assigneeName: 'Ms. Indhu',
  dueAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  visibility: 'ORG',
  isPersonal: false,
  checklistItems: [
    { id: 'chk-1', taskId: 'tsk-test-1', text: 'Review agenda documentation', done: true },
    { id: 'chk-2', taskId: 'tsk-test-1', text: 'Confirm room allocation', done: false },
  ],
  comments: [
    {
      id: 'com-1',
      taskId: 'tsk-test-1',
      authorName: 'Ms. Indhu',
      body: 'Preliminary brief prepared for executive review.',
      text: 'Preliminary brief prepared for executive review.',
      createdAt: new Date().toISOString(),
    },
  ],
  reminders: [
    {
      id: 'rem-1',
      taskId: 'tsk-test-1',
      remindAt: new Date(Date.now() + 3600000).toISOString(),
      channel: 'IN_APP',
      createdAt: new Date().toISOString(),
    },
  ],
};

describe('TaskDetailDrawer Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(apiModule.api, 'get').mockResolvedValue(mockTask);
  });

  const renderDrawer = (taskId: string = 'tsk-test-1', onClose = vi.fn()) => {
    const queryClient = createTestQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TaskDetailDrawer taskId={taskId} onClose={onClose} />
        </AuthProvider>
      </QueryClientProvider>
    );
  };

  it('renders task reference number and details without showing Loading badge', async () => {
    renderDrawer();

    await waitFor(() => {
      expect(screen.getByText('TSK-2026-0042')).toBeDefined();
    });

    expect(screen.getByText('Conduct Q3 operational spend audit with finance secretariat')).toBeDefined();
    expect(screen.getByText('Comprehensive review of operational expenditure vs approved budget caps.')).toBeDefined();
  });

  it('renders checklist items with correct progress calculation and item text', async () => {
    renderDrawer();

    await waitFor(() => {
      expect(screen.getByText('Checklist (1/2)')).toBeDefined();
    });

    expect(screen.getByText('50%')).toBeDefined();
    expect(screen.getByText('Review agenda documentation')).toBeDefined();
    expect(screen.getByText('Confirm room allocation')).toBeDefined();
  });

  it('renders comment author and comment body text properly without blank text', async () => {
    renderDrawer();

    await waitFor(() => {
      expect(screen.getByText('Comments (1)')).toBeDefined();
    });

    expect(screen.getAllByText('Ms. Indhu').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Preliminary brief prepared for executive review.')).toBeDefined();
  });

  it('renders reminder time in the reminders section', async () => {
    renderDrawer();

    await waitFor(() => {
      expect(screen.getByText('Reminders')).toBeDefined();
    });

    expect(screen.queryByText('No reminders set')).toBeNull();
  });

  it('renders action buttons for an IN_PROGRESS task', async () => {
    renderDrawer();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Mark Done/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Block/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeDefined();
    });
  });
});
