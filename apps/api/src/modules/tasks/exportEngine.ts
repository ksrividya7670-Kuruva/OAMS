import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { DateTime } from 'luxon';
import type { TaskDetailDto, TaskListItemDto } from '@oams/shared';

export interface ExportDataRow {
  referenceNo: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  dueAt: string;
  assignee: string;
  source: string;
  createdAt: string;
  completedAt: string;
}

export function mapTaskToExportRow(task: TaskListItemDto | TaskDetailDto): ExportDataRow {
  return {
    referenceNo: task.referenceNo,
    title: task.title,
    description: 'description' in task && task.description ? task.description : '',
    category: task.category,
    priority: task.priority,
    status: task.status,
    dueAt: task.dueAt ? DateTime.fromISO(task.dueAt).toFormat('yyyy-MM-dd HH:mm') : '-',
    assignee: task.assigneeName || '-',
    source: task.source,
    createdAt: DateTime.fromISO(task.createdAt).toFormat('yyyy-MM-dd HH:mm'),
    completedAt: task.completedAt
      ? DateTime.fromISO(task.completedAt).toFormat('yyyy-MM-dd HH:mm')
      : '-',
  };
}

export async function generateCsvExport(rows: ExportDataRow[]): Promise<Buffer> {
  const headers = [
    'Task No',
    'Title',
    'Description',
    'Category',
    'Priority',
    'Status',
    'Due',
    'Assignee',
    'Source',
    'Created',
    'Completed',
  ];

  const escapeCsv = (val: string) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvLines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((r) =>
      [
        r.referenceNo,
        r.title,
        r.description,
        r.category,
        r.priority,
        r.status,
        r.dueAt,
        r.assignee,
        r.source,
        r.createdAt,
        r.completedAt,
      ]
        .map(escapeCsv)
        .join(','),
    ),
  ];

  return Buffer.from(csvLines.join('\r\n'), 'utf-8');
}

export async function generateXlsxExport(
  rows: ExportDataRow[],
  officialTitle = 'Tasks',
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OAMS System';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(officialTitle.substring(0, 31));

  worksheet.columns = [
    { header: 'Task No', key: 'referenceNo', width: 18 },
    { header: 'Title', key: 'title', width: 35 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Priority', key: 'priority', width: 14 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Due', key: 'dueAt', width: 20 },
    { header: 'Assignee', key: 'assignee', width: 22 },
    { header: 'Source', key: 'source', width: 15 },
    { header: 'Created', key: 'createdAt', width: 20 },
    { header: 'Completed', key: 'completedAt', width: 20 },
  ];

  // Header row styling
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A8A' }, // Deep Navy
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  for (const row of rows) {
    const r = worksheet.addRow(row);
    r.alignment = { vertical: 'middle' };
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generatePdfExport(
  rows: ExportDataRow[],
  officialTitle = 'Official',
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        layout: 'landscape',
        size: 'A4',
        margin: 30,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Title & Header
      doc.fontSize(18).font('Helvetica-Bold').text(`OAMS To-Do List — ${officialTitle}`, 30, 30);
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#64748B')
        .text(
          `Generated on ${DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss')} • Total tasks: ${rows.length}`,
          30,
          52,
        );

      doc.moveDown(1.5);

      // Table layout
      const startX = 30;
      let startY = 75;
      const colWidths = [85, 170, 70, 60, 65, 80, 80, 75, 75];
      const headers = [
        'Task No',
        'Title',
        'Category',
        'Priority',
        'Status',
        'Due',
        'Assignee',
        'Created',
        'Completed',
      ];

      // Draw header row
      doc.rect(startX, startY, 760, 20).fill('#1E293B');
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
      let curX = startX + 4;
      headers.forEach((h, i) => {
        doc.text(h, curX, startY + 5, { width: colWidths[i] - 6, ellipsis: true });
        curX += colWidths[i];
      });

      startY += 20;

      // Draw data rows
      rows.forEach((r, idx) => {
        // Page break if near bottom
        if (startY > 540) {
          doc.addPage({ layout: 'landscape', size: 'A4', margin: 30 });
          startY = 40;
          // Re-draw header
          doc.rect(startX, startY, 760, 20).fill('#1E293B');
          doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
          let hX = startX + 4;
          headers.forEach((h, i) => {
            doc.text(h, hX, startY + 5, { width: colWidths[i] - 6, ellipsis: true });
            hX += colWidths[i];
          });
          startY += 20;
        }

        const isEven = idx % 2 === 0;
        if (!isEven) {
          doc.rect(startX, startY, 760, 18).fill('#F8FAFC');
        }

        doc.fillColor('#1E293B').fontSize(7.5).font('Helvetica');
        let cX = startX + 4;
        const rowVals = [
          r.referenceNo,
          r.title,
          r.category,
          r.priority,
          r.status,
          r.dueAt,
          r.assignee,
          r.createdAt,
          r.completedAt,
        ];

        rowVals.forEach((val, i) => {
          doc.text(String(val), cX, startY + 4, { width: colWidths[i] - 6, ellipsis: true });
          cX += colWidths[i];
        });

        startY += 18;
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
