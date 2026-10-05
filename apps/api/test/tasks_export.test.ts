import { describe, it, expect, vi } from 'vitest';
import {
  generateCsvExport,
  generateXlsxExport,
  generatePdfExport,
  mapTaskToExportRow,
} from '../src/modules/tasks/exportEngine.js';
import { tasksService } from '../src/modules/tasks/service.js';
import { RoleCode, TaskStatus, Priority, type AuthUser, type TaskListItemDto } from '@oams/shared';

const { insertedAudit } = vi.hoisted(() => {
  const audit: any[] = [];
  return { insertedAudit: audit };
});

vi.mock('../src/core/audit/auditWriter.js', () => ({
  writeAuditEvent: vi.fn().mockImplementation(async (_trx, params) => {
    insertedAudit.push(params);
    return 'audit-export-1';
  }),
}));

describe('Task Export Engine & Formats (§12.7)', () => {
  const mockTasks: TaskListItemDto[] = [
    {
      id: 'task-1',
      orgId: 'org-1',
      referenceNo: 'TSK-2026-000001',
      officialId: 'off-1',
      officialName: 'Chief Director',
      title: 'Review Audit Policy',
      category: 'ADMIN',
      priority: Priority.HIGH,
      status: TaskStatus.TODO,
      visibility: 'ORG',
      dueAt: '2026-09-25T14:00:00.000Z',
      estimatedMin: 45,
      ownerUserId: 'user-off-1',
      assigneeUserId: 'user-pa-1',
      assigneeName: 'Primary PA',
      requiresVerification: false,
      source: 'MANUAL',
      position: 1000,
      createdAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T10:00:00.000Z',
      isOverdue: false,
      awaitingVerification: false,
      checklistItemCount: 2,
      checklistDoneCount: 1,
      commentCount: 3,
    },
    {
      id: 'task-2',
      orgId: 'org-1',
      referenceNo: 'TSK-2026-000002',
      officialId: 'off-1',
      officialName: 'Chief Director',
      title: 'Sign MoU Documents',
      category: 'DOCUMENT',
      priority: Priority.URGENT,
      status: TaskStatus.DONE,
      visibility: 'ORG',
      dueAt: '2026-09-22T10:00:00.000Z',
      estimatedMin: 30,
      ownerUserId: 'user-off-1',
      assigneeUserId: null,
      assigneeName: null,
      requiresVerification: false,
      source: 'ACTION_ITEM',
      position: 2000,
      completedAt: '2026-09-22T12:00:00.000Z',
      createdAt: '2026-09-21T09:00:00.000Z',
      updatedAt: '2026-09-22T12:00:00.000Z',
      isOverdue: false,
      awaitingVerification: false,
      checklistItemCount: 0,
      checklistDoneCount: 0,
      commentCount: 0,
    },
  ];

  it('Generates CSV export with expected headers and rows', async () => {
    const rows = mockTasks.map(mapTaskToExportRow);
    const csvBuffer = await generateCsvExport(rows);
    const csvString = csvBuffer.toString('utf-8');

    expect(csvString).toContain(
      '"Task No","Title","Description","Category","Priority","Status","Due","Assignee","Source","Created","Completed"',
    );
    expect(csvString).toContain('TSK-2026-000001');
    expect(csvString).toContain('Review Audit Policy');
    expect(csvString).toContain('TSK-2026-000002');
    expect(csvString).toContain('Sign MoU Documents');
  });

  it('Generates XLSX export with Excel magic header', async () => {
    const rows = mockTasks.map(mapTaskToExportRow);
    const xlsxBuffer = await generateXlsxExport(rows, 'Chief Director');

    // Valid zip/xlsx buffer starts with PK (0x50, 0x4B)
    expect(xlsxBuffer.length).toBeGreaterThan(100);
    expect(xlsxBuffer[0]).toBe(0x50);
    expect(xlsxBuffer[1]).toBe(0x4b);
  });

  it('Generates PDF export starting with %PDF- header', async () => {
    const rows = mockTasks.map(mapTaskToExportRow);
    const pdfBuffer = await generatePdfExport(rows, 'Chief Director');

    expect(pdfBuffer.length).toBeGreaterThan(100);
    const header = pdfBuffer.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  });

  it('Writes audit event upon executing export (§12.7)', async () => {
    insertedAudit.length = 0;

    // Mock repo list
    vi.spyOn(tasksService, 'getAssignedOfficialIds').mockResolvedValue(['off-1']);
    const listSpy = vi.spyOn(
      await import('../src/modules/tasks/repo.js').then((m) => m.tasksRepo),
      'list',
    );
    listSpy.mockResolvedValue({ tasks: mockTasks, total: 2 });

    const user = {
      id: 'user-off-1',
      orgId: 'org-1',
      email: 'official@oams.gov',
      fullName: 'Chief Director',
      roles: [RoleCode.OFFICIAL],
    } as unknown as AuthUser;

    const result = await tasksService.exportTasks(user, {
      format: 'CSV',
      scope: 'ALL',
    });

    expect(result.filename).toMatch(/^OAMS_Todo_Chief_Director_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.mimeType).toBe('text/csv');

    const auditEntry = insertedAudit.find((a) => a.action === 'task.export');
    expect(auditEntry).toBeDefined();
    expect(auditEntry.changes.format).toBe('CSV');
    expect(auditEntry.changes.rowCount).toBe(2);
  });
});
