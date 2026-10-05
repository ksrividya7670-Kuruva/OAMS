import { Request, Response } from 'express';
import { auditService } from './service.js';

export class AuditController {
  async list(req: Request, res: Response): Promise<void> {
    const result = await auditService.listEvents(req.user!.orgId, {
      entityType: req.query.entityType as string,
      entityId: req.query.entityId as string,
      actorId: req.query.actorId as string,
      action: req.query.action as string,
      from: req.query.from as string,
      to: req.query.to as string,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      cursor: req.query.cursor as string,
    });
    res.json({ success: true, data: result });
  }

  async verifyChain(req: Request, res: Response): Promise<void> {
    const result = await auditService.verifyHashChain(req.user!.orgId);
    res.json({ success: true, data: result });
  }
}

export const auditController = new AuditController();
