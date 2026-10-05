import type { Request, Response } from 'express';
import { appointmentsService } from './service.js';
import {
  submitAppointmentSchema,
  appointmentDraftSchema,
  duplicateCheckInputSchema,
  requestInfoInputSchema,
  respondInfoInputSchema,
  proposeTimesInputSchema,
  acceptProposalInputSchema,
  declineProposalsInputSchema,
  scheduleAppointmentInputSchema,
  approveAppointmentInputSchema,
  rejectAppointmentInputSchema,
  suggestOtherInputSchema,
  changePriorityInputSchema,
  rescheduleAppointmentSchema,
  removeOfficialInputSchema,
  createChangeRequestSchema,
  proposeChangeRequestSlotsSchema,
  acceptChangeRequestProposalSchema,
} from '@oams/shared';
import crypto from 'crypto';

export class AppointmentsController {
  async checkDuplicate(req: Request, res: Response): Promise<void> {
    const input = duplicateCheckInputSchema.parse(req.body);
    const result = await appointmentsService.checkDuplicate(req.user!.id, input);
    res.json({ success: true, data: result });
  }

  async saveDraft(req: Request, res: Response): Promise<void> {
    const input = appointmentDraftSchema.parse(req.body);
    const result = await appointmentsService.saveDraft(req.user!, input);
    res.json({ success: true, data: result });
  }

  async submit(req: Request, res: Response): Promise<void> {
    const input = submitAppointmentSchema.parse(req.body);
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    const result = await appointmentsService.submit(
      req.user!,
      input,
      correlationId,
      req.ip,
      req.headers['user-agent'],
    );
    res.status(201).json({ success: true, data: result });
  }

  async listMyAppointments(req: Request, res: Response): Promise<void> {
    const list = await appointmentsService.listMyAppointments(req.user!);
    res.json({ success: true, data: list });
  }

  async getMyAppointment(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const detail = await appointmentsService.getMyAppointment(req.user!, id);
    res.json({ success: true, data: detail });
  }

  async listInbox(req: Request, res: Response): Promise<void> {
    const query = {
      status: req.query.status as string | undefined,
      priority: req.query.priority as string | undefined,
      q: req.query.q as string | undefined,
      assignedToMe: req.query.assignedToMe === 'true',
    };
    const list = await appointmentsService.listInbox(req.user!, query);
    res.json({ success: true, data: list });
  }

  async getProposals(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const proposals = await appointmentsService.getProposals(req.user!, id);
    res.json({ success: true, data: proposals });
  }

  async requestInfo(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = requestInfoInputSchema.parse(req.body);
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.requestInfo(req.user!, id, input, correlationId);
    res.json({ success: true, message: 'Information requested from requester' });
  }

  async respondInfo(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = respondInfoInputSchema.parse(req.body);
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.respondInfo(req.user!, id, input, correlationId);
    res.json({ success: true, message: 'Information response submitted' });
  }

  async proposeTimes(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = proposeTimesInputSchema.parse(req.body);
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.proposeTimes(req.user!, id, input, correlationId);
    res.json({ success: true, message: 'Proposed time slots sent to requester' });
  }

  async acceptProposal(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = acceptProposalInputSchema.parse(req.body);
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.acceptProposal(req.user!, id, input, correlationId);
    res.json({ success: true, message: 'Proposed slot accepted successfully' });
  }

  async declineProposals(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = declineProposalsInputSchema.parse(req.body || {});
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.declineProposals(req.user!, id, input, correlationId);
    res.json({ success: true, message: 'Proposed slots declined' });
  }

  async schedule(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = scheduleAppointmentInputSchema.parse(req.body);
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.schedule(req.user!, id, input, correlationId);
    res.json({ success: true, message: 'Appointment scheduled successfully' });
  }

  async approve(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = approveAppointmentInputSchema.parse(req.body || {});
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.approve(req.user!, id, input, correlationId);
    res.json({ success: true, message: 'Appointment approved successfully' });
  }

  async reject(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = rejectAppointmentInputSchema.parse(req.body);
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.reject(req.user!, id, input, correlationId);
    res.json({ success: true, message: 'Appointment rejected' });
  }

  async suggestOther(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = suggestOtherInputSchema.parse(req.body);
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.suggestOther(req.user!, id, input, correlationId);
    res.json({ success: true, message: 'Alternative slots suggested to requester' });
  }

  async changePriority(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = changePriorityInputSchema.parse(req.body);
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.changePriority(req.user!, id, input, correlationId);
    res.json({ success: true, message: 'Priority updated successfully' });
  }

  async getStatusHistory(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const history = await appointmentsService.getStatusHistory(req.user!, id);
    res.json({ success: true, data: history });
  }

  async getIcs(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const icsContent = await appointmentsService.generateIcs(req.user!, id);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="appointment-${id}.ics"`);
    res.send(icsContent);
  }

  async cancelAppointment(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const { reason, note } = req.body;
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.cancelAppointment(req.user!, id, reason, note, correlationId);
    res.json({ success: true, message: 'Appointment cancelled successfully' });
  }

  async reschedule(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = rescheduleAppointmentSchema.parse(req.body);
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.reschedule(req.user!, id, input, correlationId);
    res.json({ success: true, message: 'Appointment rescheduled successfully' });
  }

  async removeOfficial(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const officialId = req.params.officialId as string;
    const input = removeOfficialInputSchema.parse(req.body);
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.removeOfficial(req.user!, id, officialId, input, correlationId);
    res.json({ success: true, message: 'Official removed from appointment successfully' });
  }

  async createChangeRequest(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = createChangeRequestSchema.parse(req.body);
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    const result = await appointmentsService.createChangeRequest(
      req.user!,
      id,
      input,
      correlationId,
    );
    res.status(201).json({ success: true, data: result });
  }

  async getChangeRequests(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const list = await appointmentsService.getChangeRequests(req.user!, id);
    res.json({ success: true, data: list });
  }

  async proposeChangeRequestSlots(req: Request, res: Response): Promise<void> {
    const crId = req.params.crId as string;
    const input = proposeChangeRequestSlotsSchema.parse(req.body);
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.proposeChangeRequestSlots(req.user!, crId, input, correlationId);
    res.json({ success: true, message: 'Slots proposed for change request' });
  }

  async acceptChangeRequestProposal(req: Request, res: Response): Promise<void> {
    const crId = req.params.crId as string;
    const input = acceptChangeRequestProposalSchema.parse(req.body);
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.acceptChangeRequestProposal(req.user!, crId, input, correlationId);
    res.json({
      success: true,
      message: 'Change request proposal accepted. Appointment rescheduled.',
    });
  }

  async withdrawChangeRequest(req: Request, res: Response): Promise<void> {
    const crId = req.params.crId as string;
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.withdrawChangeRequest(req.user!, crId, correlationId);
    res.json({ success: true, message: 'Change request withdrawn' });
  }

  async rejectChangeRequest(req: Request, res: Response): Promise<void> {
    const crId = req.params.crId as string;
    const { reason } = req.body;
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.rejectChangeRequest(
      req.user!,
      crId,
      reason || 'Change request rejected',
      correlationId,
    );
    res.json({ success: true, message: 'Change request rejected' });
  }

  async startMeeting(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.startMeeting(req.user!, id, correlationId);
    res.json({ success: true, message: 'Meeting started' });
  }

  async completeMeeting(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    await appointmentsService.completeMeeting(req.user!, id, correlationId);
    res.json({ success: true, message: 'Meeting completed' });
  }
}

export const appointmentsController = new AppointmentsController();
