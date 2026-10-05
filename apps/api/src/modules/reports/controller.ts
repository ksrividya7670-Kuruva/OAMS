import { Request, Response } from 'express';
import { reportsService } from './service.js';
import { reportOverviewQuerySchema } from '@oams/shared';

export class ReportsController {
  async getOverview(req: Request, res: Response): Promise<void> {
    const query = reportOverviewQuerySchema.parse(req.query);
    const result = await reportsService.getOverview(req.user!.orgId, query);
    res.json({ success: true, data: result });
  }

  async exportCsv(req: Request, res: Response): Promise<void> {
    const query = reportOverviewQuerySchema.parse(req.query);
    const csv = await reportsService.exportAppointmentsCsv(req.user!.orgId, query);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="appointments-report.csv"');
    res.send(csv);
  }
}

export const reportsController = new ReportsController();
