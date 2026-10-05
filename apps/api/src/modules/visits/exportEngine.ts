import PDFDocument from 'pdfkit';
import { DateTime } from 'luxon';
import type { VisitDto, EmergencyGroupDto } from '@oams/shared';

/**
 * Generate PDF of the day's expected visitors for Reception offline fallback (§15.3)
 */
export async function generateDailyExpectedPdf(
  visits: VisitDto[],
  dateStr: string,
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

      // Header
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .fillColor('#0F172A')
        .text(`OAMS Daily Visitor Register`, 30, 30);

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#64748B')
        .text(
          `Date: ${dateStr} • Total Visitors: ${visits.length} • Generated on ${DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss')} IST`,
          30,
          50,
        );

      let startY = 70;
      const startX = 30;
      const colWidths = [75, 85, 120, 80, 110, 120, 90, 80];
      const headers = [
        'Time',
        'Ref #',
        'Visitor Name',
        'Phone',
        'Organization',
        'Host Official',
        'Room / Floor',
        'Status',
      ];

      const drawHeader = (y: number) => {
        doc.rect(startX, y, 760, 20).fill('#1E293B');
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
        let curX = startX + 4;
        headers.forEach((h, i) => {
          doc.text(h, curX, y + 6, { width: colWidths[i] - 6, ellipsis: true });
          curX += colWidths[i];
        });
      };

      drawHeader(startY);
      startY += 20;

      for (let index = 0; index < visits.length; index++) {
        const v = visits[index];
        if (startY > 530) {
          doc.addPage();
          startY = 30;
          drawHeader(startY);
          startY += 20;
        }

        const isEven = index % 2 === 0;
        if (isEven) {
          doc.rect(startX, startY, 760, 18).fill('#F8FAFC');
        }

        doc.fillColor('#1E293B').fontSize(7.5).font('Helvetica');

        const timeStr = v.scheduledStartTime
          ? `${DateTime.fromISO(v.scheduledStartTime).toFormat('HH:mm')}`
          : '—';
        const roomStr =
          [v.roomName, v.floor ? `Fl ${v.floor}` : null].filter(Boolean).join(', ') || '—';

        const rowValues = [
          timeStr,
          v.referenceNo,
          v.visitorName,
          v.phone || '—',
          v.organization || '—',
          v.hostOfficialName ? `${v.hostOfficialName} (${v.hostOfficialTitle || ''})` : '—',
          roomStr,
          v.status,
        ];

        let curX = startX + 4;
        rowValues.forEach((val, i) => {
          doc.text(String(val), curX, startY + 4, {
            width: colWidths[i] - 6,
            ellipsis: true,
          });
          curX += colWidths[i];
        });

        startY += 18;
      }

      // Footer
      const totalPages = doc.bufferedPageRange().count || 1;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc
          .fontSize(7)
          .font('Helvetica')
          .fillColor('#94A3B8')
          .text(
            `OAMS Reception Offline Fallback • Page ${i + 1} of ${totalPages} • Subject/Purpose Redacted (§15, §22)`,
            30,
            560,
            { align: 'center', width: 760 },
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generate PDF of active visitors for Emergency Evacuation Roster (§15.4)
 */
export async function generateEmergencyEvacuationPdf(
  groups: EmergencyGroupDto[],
  timestampStr: string,
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

      const totalActive = groups.reduce((acc, g) => acc + g.count, 0);

      // Emergency Header Banner
      doc.rect(30, 25, 760, 42).fill('#DC2626'); // High-visibility red
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#FFFFFF')
        .text('EMERGENCY EVACUATION VISITOR ROSTER (§15.4)', 40, 32);

      doc
        .fontSize(8.5)
        .font('Helvetica')
        .fillColor('#FEF2F2')
        .text(
          `Generated: ${timestampStr} • Active On-Site Visitors: ${totalActive} • All Personnel Accounting Required`,
          40,
          50,
        );

      let startY = 80;
      const startX = 30;
      const colWidths = [70, 85, 125, 85, 115, 125, 80, 75];
      const headers = [
        'Badge #',
        'Ref #',
        'Visitor Name',
        'Phone',
        'Organization',
        'Host Official',
        'Room',
        'Checked-in',
      ];

      const drawHeader = (y: number) => {
        doc.rect(startX, y, 760, 18).fill('#1E293B');
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
        let curX = startX + 4;
        headers.forEach((h, i) => {
          doc.text(h, curX, y + 5, { width: colWidths[i] - 6, ellipsis: true });
          curX += colWidths[i];
        });
      };

      for (const group of groups) {
        if (startY > 480) {
          doc.addPage();
          startY = 35;
        }

        // Group heading bar (Building + Floor)
        doc.rect(startX, startY, 760, 20).fill('#E2E8F0');
        doc
          .fillColor('#0F172A')
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(
            `Location: ${group.building} — Floor: ${group.floor} (${group.count} ${group.count === 1 ? 'visitor' : 'visitors'})`,
            startX + 8,
            startY + 5,
          );
        startY += 20;

        drawHeader(startY);
        startY += 18;

        for (let idx = 0; idx < group.visitors.length; idx++) {
          const v = group.visitors[idx];
          if (startY > 530) {
            doc.addPage();
            startY = 35;
            drawHeader(startY);
            startY += 18;
          }

          if (idx % 2 === 0) {
            doc.rect(startX, startY, 760, 16).fill('#F8FAFC');
          }

          doc.fillColor('#0F172A').fontSize(7.5).font('Helvetica');

          const checkinTime = v.checkedInAt
            ? DateTime.fromISO(v.checkedInAt).toFormat('HH:mm:ss')
            : '—';

          const rowValues = [
            v.badgeNo || 'UNASSIGNED',
            v.referenceNo,
            v.visitorName,
            v.phone || '—',
            v.organization || '—',
            v.hostOfficialName || '—',
            v.roomName || '—',
            checkinTime,
          ];

          let curX = startX + 4;
          rowValues.forEach((val, i) => {
            doc.text(String(val), curX, startY + 4, {
              width: colWidths[i] - 6,
              ellipsis: true,
            });
            curX += colWidths[i];
          });

          startY += 16;
        }

        startY += 12; // Gap between building groups
      }

      // Footer
      const totalPages = doc.bufferedPageRange().count || 1;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc
          .fontSize(7)
          .font('Helvetica')
          .fillColor('#64748B')
          .text(
            `OAMS Incident Management & Security • Page ${i + 1} of ${totalPages} • Handover to Incident Commander immediately upon evacuation`,
            30,
            560,
            { align: 'center', width: 760 },
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
