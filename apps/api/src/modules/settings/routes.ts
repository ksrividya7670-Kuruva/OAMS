import { Router, type Request, type Response } from 'express';
import { db } from '../../core/db.js';
import { requireAuth, requirePermission } from '../../core/auth/middleware.js';
import { Permission, ApiError } from '@oams/shared';
import { writeAuditEvent } from '../../core/audit/auditWriter.js';
import { powerAutomateService } from '../../core/integrations/powerAutomate.js';

export const settingsRouter: Router = Router();

settingsRouter.use('/api/v1/settings', requireAuth);

settingsRouter.get('/api/v1/settings', async (req: Request, res: Response) => {
  const rows = await db('settings').where('org_id', req.user!.orgId);
  const settingsMap: Record<string, unknown> = {};
  for (const row of rows) {
    settingsMap[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
  }
  res.json({ success: true, data: settingsMap });
});

settingsRouter.put(
  '/api/v1/settings',
  requirePermission(Permission.SETTINGS_MANAGE),
  async (req: Request, res: Response) => {
    const { key, value } = req.body;
    if (!key) {
      throw ApiError.badRequest('Setting key is required');
    }

    await db.transaction(async (trx) => {
      await trx('settings')
        .insert({
          org_id: req.user!.orgId,
          key,
          value: JSON.stringify(value),
        })
        .onConflict(['org_id', 'key'])
        .merge({
          value: JSON.stringify(value),
        });

      await writeAuditEvent(trx, {
        orgId: req.user!.orgId,
        actorId: req.user?.id,
        actorRole: req.user?.roles[0],
        action: 'settings.update',
        entityType: 'settings',
        entityId: key,
        changes: { [key]: value },
        correlationId: req.correlationId,
      });
    });

    res.json({ success: true, data: { [key]: value } });
  },
);

settingsRouter.post(
  '/api/v1/settings/power-automate/test',
  requirePermission(Permission.SETTINGS_MANAGE),
  async (req: Request, res: Response) => {
    const { webhookUrl, secret } = req.body;
    let targetUrl = webhookUrl;
    let targetSecret = secret;

    if (!targetUrl) {
      const currentConfig = await powerAutomateService.getWebhookUrl(req.user!.orgId);
      targetUrl = currentConfig.url;
      targetSecret = currentConfig.secret;
    }

    const testResult = await powerAutomateService.testConnection(targetUrl, targetSecret);
    res.json({ success: testResult.success, data: testResult });
  },
);

