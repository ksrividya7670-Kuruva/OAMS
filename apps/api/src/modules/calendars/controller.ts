import type { Request, Response } from 'express';
import { calendarsService } from './service.js';
import {
  createCalendarEventSchema,
  updateCalendarEventSchema,
  calendarEventsQuerySchema,
  personalAccessUpdateSchema,
} from '@oams/shared';

export class CalendarsController {
  async listEvents(req: Request, res: Response): Promise<void> {
    const query = calendarEventsQuerySchema.parse({
      officialId: req.query.officialId,
      start: req.query.start,
      end: req.query.end,
      layers: req.query.layers,
    });

    const events = await calendarsService.listCalendarEvents(req.user!.orgId, req.user!, query);
    res.json({ success: true, data: events });
  }

  async createEvent(req: Request, res: Response): Promise<void> {
    const input = createCalendarEventSchema.parse(req.body);
    const event = await calendarsService.createCalendarEvent(
      req.user!.orgId,
      req.user!,
      input,
      req.correlationId,
    );
    res.status(201).json({ success: true, data: event });
  }

  async updateEvent(req: Request, res: Response): Promise<void> {
    const eventId = req.params.id as string;
    const input = updateCalendarEventSchema.parse(req.body);
    const updated = await calendarsService.updateCalendarEvent(
      req.user!.orgId,
      req.user!,
      eventId,
      input,
      req.correlationId,
    );
    res.json({ success: true, data: updated });
  }

  async deleteEvent(req: Request, res: Response): Promise<void> {
    const eventId = req.params.id as string;
    const result = await calendarsService.deleteCalendarEvent(
      req.user!.orgId,
      req.user!,
      eventId,
      req.correlationId,
    );
    res.json({ success: true, data: result });
  }

  async updatePersonalAccess(req: Request, res: Response): Promise<void> {
    const officialId = req.params.officialId as string;
    const staffId = req.params.staffId as string;
    const input = personalAccessUpdateSchema.parse(req.body);

    const result = await calendarsService.updatePersonalAccess(
      req.user!.orgId,
      officialId,
      staffId,
      input.canViewPersonal,
      input.canEditPersonal,
      req.user!.id,
      req.user!.roles[0],
      req.correlationId,
    );
    res.json({ success: true, data: result });
  }
}

export const calendarsController = new CalendarsController();
