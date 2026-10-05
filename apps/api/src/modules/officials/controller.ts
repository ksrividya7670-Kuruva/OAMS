import type { Request, Response } from 'express';
import { officialsService } from './service.js';
import {
  createOfficialSchema,
  updateOfficialSchema,
  assignSupportStaffSchema,
  updateSupportStaffSchema,
} from '@oams/shared';

export class OfficialsController {
  async list(req: Request, res: Response): Promise<void> {
    const onlyActive = req.query.all !== 'true';
    const officials = await officialsService.listOfficials(req.user!.orgId, onlyActive);
    res.json({ success: true, data: officials });
  }

  async getById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const official = await officialsService.getOfficial(req.user!.orgId, id);
    res.json({ success: true, data: official });
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = createOfficialSchema.parse(req.body);
    const official = await officialsService.createOfficial(
      req.user!.orgId,
      input,
      req.user?.id,
      req.user?.roles[0],
      req.correlationId,
    );
    res.status(201).json({ success: true, data: official });
  }

  async update(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = updateOfficialSchema.parse(req.body);
    const updated = await officialsService.updateOfficial(
      req.user!.orgId,
      id,
      input,
      req.user?.id,
      req.user?.roles[0],
      req.correlationId,
    );
    res.json({ success: true, data: updated });
  }

  async listSupportStaff(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const staff = await officialsService.listSupportStaff(id);
    res.json({ success: true, data: staff });
  }

  async assignSupportStaff(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = assignSupportStaffSchema.parse(req.body);
    const result = await officialsService.assignSupportStaff(
      req.user!.orgId,
      id,
      input,
      req.user?.id,
      req.user?.roles[0],
      req.correlationId,
    );
    res.status(201).json({ success: true, data: result });
  }

  async updateSupportStaff(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const staffId = req.params.staffId as string;
    const input = updateSupportStaffSchema.parse(req.body);
    const existing = await officialsService.listSupportStaff(id);
    const target = existing.find((s) => s.id === staffId);
    if (!target) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Staff assignment not found' },
      });
      return;
    }

    const merged = { ...target, ...input, userId: target.userId };
    const result = await officialsService.assignSupportStaff(
      req.user!.orgId,
      id,
      merged,
      req.user?.id,
      req.user?.roles[0],
      req.correlationId,
    );
    res.json({ success: true, data: result });
  }

  async removeSupportStaff(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const staffId = req.params.staffId as string;
    const result = await officialsService.removeSupportStaff(
      req.user!.orgId,
      id,
      staffId,
      req.user?.id,
      req.user?.roles[0],
      req.correlationId,
    );
    res.json({ success: true, data: result });
  }
}

export const officialsController = new OfficialsController();
