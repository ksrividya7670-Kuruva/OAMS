import type { Request, Response } from 'express';
import { visitsRepo } from './repo.js';
import { visitsService } from './service.js';
import {
  visitQuerySchema,
  qrLookupSchema,
  checkInVisitSchema,
  denyVisitSchema,
  walkInVisitSchema,
} from '@oams/shared';

export class VisitsController {
  /**
   * GET /api/v1/visits
   */
  async list(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const query = visitQuerySchema.parse(req.query);

    const result = await visitsRepo.listVisits(query, user.orgId, user);
    res.json(result);
  }

  /**
   * GET /api/v1/visits/:id
   */
  async getById(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const id = req.params.id as string;

    const visit = await visitsRepo.getById(id, user.orgId, user);
    if (!visit) {
      res.status(404).json({ error: 'Visit not found' });
      return;
    }

    res.json(visit);
  }

  /**
   * GET or POST /api/v1/visits/lookup
   */
  async lookup(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const input = qrLookupSchema.parse({ ...req.query, ...req.body });

    if (input.qrToken) {
      const visit = await visitsRepo.lookupByQrToken(input.qrToken, user.orgId, user);
      if (!visit) {
        res.status(404).json({ error: 'No visit matching QR token' });
        return;
      }
      res.json({ matchType: 'QR', visit, visits: [visit], total: 1 });
      return;
    }

    if (input.query) {
      const visits = await visitsRepo.lookupByQuery(input.query, user.orgId, user);
      res.json({ matchType: 'SEARCH', visit: visits[0] || null, visits, total: visits.length });
      return;
    }

    res.status(400).json({ error: 'Either qrToken or query parameter is required' });
  }

  /**
   * POST /api/v1/visits/:id/arrive
   */
  async arrive(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const id = req.params.id as string;
    const correlationId = req.headers['x-request-id'] as string;

    const visit = await visitsService.arrive(user, id, correlationId);
    res.json(visit);
  }

  /**
   * POST /api/v1/visits/:id/check-in
   */
  async checkIn(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const id = req.params.id as string;
    const correlationId = req.headers['x-request-id'] as string;
    const input = checkInVisitSchema.parse(req.body);

    const visit = await visitsService.checkIn(user, id, input, correlationId);
    res.json(visit);
  }

  /**
   * POST /api/v1/visits/:id/with-host
   */
  async withHost(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const id = req.params.id as string;
    const correlationId = req.headers['x-request-id'] as string;

    const visit = await visitsService.withHost(user, id, correlationId);
    res.json(visit);
  }

  /**
   * POST /api/v1/visits/:id/check-out
   */
  async checkOut(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const id = req.params.id as string;
    const correlationId = req.headers['x-request-id'] as string;

    const visit = await visitsService.checkOut(user, id, correlationId);
    res.json(visit);
  }

  /**
   * POST /api/v1/visits/:id/deny
   */
  async deny(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const id = req.params.id as string;
    const correlationId = req.headers['x-request-id'] as string;
    const input = denyVisitSchema.parse(req.body);

    const visit = await visitsService.deny(user, id, input, correlationId);
    res.json(visit);
  }

  /**
   * POST /api/v1/visits/walk-in
   */
  async walkIn(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const correlationId = req.headers['x-request-id'] as string;
    const input = walkInVisitSchema.parse(req.body);

    const result = await visitsService.registerWalkIn(user, input, correlationId);
    res.status(201).json(result);
  }

  /**
   * GET /api/v1/visits/today.pdf
   */
  async downloadTodayPdf(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const correlationId = req.headers['x-request-id'] as string;
    const dateStr = req.query.date as string | undefined;

    const { buffer, filename } = await visitsService.exportDailyList(user, dateStr, correlationId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /**
   * GET /api/v1/visits/emergency-list
   */
  async emergencyList(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const correlationId = req.headers['x-request-id'] as string;
    const format = (req.query.format as string)?.toUpperCase();

    if (format === 'PDF') {
      const { buffer, filename } = await visitsService.exportEmergencyRoster(user, correlationId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
      return;
    }

    const groups = await visitsRepo.getEmergencyList(user.orgId);
    const totalActive = groups.reduce((acc, g) => acc + g.count, 0);

    res.json({
      timestamp: new Date().toISOString(),
      totalActive,
      groups,
    });
  }
}

export const visitsController = new VisitsController();
