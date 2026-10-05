import { Request, Response } from 'express';
import { adminOpsService } from './service.js';
import { runJobSchema } from '@oams/shared';

export class AdminOpsController {
  async getOverview(req: Request, res: Response): Promise<void> {
    const result = await adminOpsService.getOpsOverview(req.user!.orgId);
    res.json({ success: true, data: result });
  }

  async retryDelivery(req: Request, res: Response): Promise<void> {
    const deliveryId = req.params.id as string;
    const result = await adminOpsService.retryDelivery(req.user!.orgId, deliveryId);
    res.json({ success: true, data: result });
  }

  async retrySync(req: Request, res: Response): Promise<void> {
    const appointmentId = req.params.id as string;
    const result = await adminOpsService.retrySync(req.user!.orgId, appointmentId);
    res.json({ success: true, data: result });
  }

  async runJob(req: Request, res: Response): Promise<void> {
    const { jobName } = runJobSchema.parse({ jobName: req.params.jobName });
    const result = await adminOpsService.runJob(jobName);
    res.json({ success: true, data: result });
  }
}

export const adminOpsController = new AdminOpsController();
