import { Request, Response } from 'express';
import { privacyService } from './service.js';
import { privacyExportInputSchema, privacyEraseInputSchema } from '@oams/shared';

export class PrivacyController {
  async exportData(req: Request, res: Response): Promise<void> {
    const input = privacyExportInputSchema.parse({
      userId: req.query.userId || req.body?.userId,
      email: req.query.email || req.body?.email,
    });
    const result = await privacyService.exportDataPrincipal(req.user!.orgId, input);
    res.json({ success: true, data: result });
  }

  async eraseData(req: Request, res: Response): Promise<void> {
    const input = privacyEraseInputSchema.parse(req.body);
    const result = await privacyService.eraseDataPrincipal(
      req.user!.orgId,
      input,
      req.user?.id,
      req.user?.roles?.[0],
    );
    res.json({ success: true, data: result });
  }
}

export const privacyController = new PrivacyController();
