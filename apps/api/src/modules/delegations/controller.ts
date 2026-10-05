import { Request, Response } from 'express';
import { delegationsService } from './service.js';
import { createDelegationSchema } from '@oams/shared';

export class DelegationsController {
  async list(req: Request, res: Response): Promise<void> {
    const officialId = (req.params.officialId || req.params.id) as string;
    const result = await delegationsService.listDelegations(officialId);
    res.json({ success: true, data: result });
  }

  async create(req: Request, res: Response): Promise<void> {
    const officialId = (req.params.officialId || req.params.id) as string;
    const input = createDelegationSchema.parse(req.body);

    const result = await delegationsService.createDelegation(
      req.user!.orgId,
      officialId,
      input,
      req.user?.id,
      req.user?.roles?.[0],
      (req.user as any)?.permissions || [],
      req.correlationId,
    );

    res.status(201).json({ success: true, data: result });
  }

  async revoke(req: Request, res: Response): Promise<void> {
    const officialId = (req.params.officialId || req.params.id) as string;
    const delegationId = (req.params.delegationId || req.params.id) as string;

    const result = await delegationsService.revokeDelegation(
      req.user!.orgId,
      officialId,
      delegationId,
      req.user?.id,
      req.user?.roles?.[0],
      (req.user as any)?.permissions || [],
      req.correlationId,
    );

    res.json({ success: true, data: result });
  }
}

export const delegationsController = new DelegationsController();
