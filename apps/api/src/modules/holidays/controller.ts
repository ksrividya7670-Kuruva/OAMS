import type { Request, Response } from 'express';
import { holidaysService } from './service.js';
import { holidaySchema } from '@oams/shared';

export class HolidaysController {
  async list(req: Request, res: Response): Promise<void> {
    const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
    const holidays = await holidaysService.listHolidays(req.user!.orgId, year);
    res.json({ success: true, data: holidays });
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = holidaySchema.parse(req.body);
    const holiday = await holidaysService.createHoliday(
      req.user!.orgId,
      input,
      req.user?.id,
      req.user?.roles[0],
      req.correlationId,
    );
    res.status(201).json({ success: true, data: holiday });
  }

  async delete(req: Request, res: Response): Promise<void> {
    const result = await holidaysService.deleteHoliday(
      req.user!.orgId,
      req.params.id as string,
      req.user?.id,
      req.user?.roles[0],
      req.correlationId,
    );
    res.json({ success: true, data: result });
  }
}

export const holidaysController = new HolidaysController();
