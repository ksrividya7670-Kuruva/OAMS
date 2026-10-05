import type { Request, Response } from 'express';
import { meetingsService } from './service.js';
import {
  completeMeetingWithNotesSchema,
  createMeetingNoteSchema,
  updateMeetingNoteSchema,
  createActionItemSchema,
  updateActionItemSchema,
  convertActionItemToTaskSchema,
} from '@oams/shared';

export class MeetingsController {
  /**
   * POST /api/v1/meetings/appointments/:appointmentId/complete
   * Conclude a meeting, capturing notes and action items (§16, §22 Track 8)
   */
  async completeMeeting(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const appointmentId = req.params.appointmentId as string;
    const input = completeMeetingWithNotesSchema.parse(req.body);

    const result = await meetingsService.completeMeetingWithNotes(user, appointmentId, input);
    res.json(result);
  }

  /**
   * GET /api/v1/meetings/appointments/:appointmentId/notes
   */
  async getNotes(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const appointmentId = req.params.appointmentId as string;

    const notes = await meetingsService.getNotes(user, appointmentId);
    res.json(notes);
  }

  /**
   * POST /api/v1/meetings/appointments/:appointmentId/notes
   */
  async createNote(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const appointmentId = req.params.appointmentId as string;
    const input = createMeetingNoteSchema.parse(req.body);

    const note = await meetingsService.createNote(user, appointmentId, input);
    res.status(201).json(note);
  }

  /**
   * PATCH /api/v1/meetings/notes/:id
   */
  async updateNote(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const noteId = req.params.id as string;
    const input = updateMeetingNoteSchema.parse(req.body);

    const note = await meetingsService.updateNote(user, noteId, input);
    res.json(note);
  }

  /**
   * GET /api/v1/meetings/appointments/:appointmentId/action-items
   */
  async getActionItems(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const appointmentId = req.params.appointmentId as string;

    const actionItems = await meetingsService.getActionItems(user, appointmentId);
    res.json(actionItems);
  }

  /**
   * POST /api/v1/meetings/appointments/:appointmentId/action-items
   */
  async createActionItem(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const appointmentId = req.params.appointmentId as string;
    const input = createActionItemSchema.parse(req.body);

    const actionItem = await meetingsService.createActionItem(user, appointmentId, input);
    res.status(201).json(actionItem);
  }

  /**
   * PATCH /api/v1/meetings/action-items/:id
   */
  async updateActionItem(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const actionItemId = req.params.id as string;
    const input = updateActionItemSchema.parse(req.body);

    const actionItem = await meetingsService.updateActionItem(user, actionItemId, input);
    res.json(actionItem);
  }

  /**
   * POST /api/v1/meetings/action-items/:id/convert-to-task
   * Convert an action item to a task with bidirectional linkage (§16, §22 Track 8)
   */
  async convertActionItemToTask(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const actionItemId = req.params.id as string;
    const input = convertActionItemToTaskSchema.parse(req.body || {});

    const result = await meetingsService.convertActionItemToTask(user, actionItemId, input);
    res.status(201).json(result);
  }

  /**
   * POST /api/v1/meetings/appointments/:appointmentId/close
   * Transition COMPLETED appointment to CLOSED
   */
  async closeAppointment(req: Request, res: Response): Promise<void> {
    const user = (req as any).user;
    const appointmentId = req.params.appointmentId as string;
    const { reason } = req.body || {};

    const appointment = await meetingsService.closeAppointment(user, appointmentId, reason);
    res.json(appointment);
  }
}

export const meetingsController = new MeetingsController();
