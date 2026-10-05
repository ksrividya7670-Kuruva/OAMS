import type { Request, Response } from 'express';
import { schedulingEngine } from './engine.js';
import { smartSlotEngine } from './slots.js';
import { schedulingCheckInputSchema, smartSlotInputSchema } from '@oams/shared';

export class SchedulingController {
  async checkConflicts(req: Request, res: Response): Promise<void> {
    const input = schedulingCheckInputSchema.parse(req.body);
    const result = await schedulingEngine.checkConflicts(req.user!.orgId, input);
    res.json({ success: true, data: result });
  }

  async recommendSlots(req: Request, res: Response): Promise<void> {
    const input = smartSlotInputSchema.parse(req.body);
    const result = await smartSlotEngine.recommendSlots(req.user!.orgId, input);
    res.json({ success: true, data: result });
  }
}

export const schedulingController = new SchedulingController();
