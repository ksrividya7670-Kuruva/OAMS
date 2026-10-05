import { Router } from 'express';
import { appointmentsController } from './controller.js';
import { requireAuth } from '../../core/auth/middleware.js';
import { publicRequestsRateLimiter } from '../../core/middleware/rateLimiter.js';

export const appointmentsRouter: Router = Router();

// All appointment intake, review, scheduling and approval routes require authentication
appointmentsRouter.use('/api/v1/appointments', requireAuth);

// --- Requester Routes (§9) ---

// 1. Duplicate check pre-submission (§9.1)
appointmentsRouter.post('/api/v1/appointments/check-duplicate', (req, res, next) =>
  appointmentsController.checkDuplicate(req, res).catch(next),
);

// 2. Draft save/autosave (§9)
appointmentsRouter.post('/api/v1/appointments/draft', publicRequestsRateLimiter, (req, res, next) =>
  appointmentsController.saveDraft(req, res).catch(next),
);

// 3. Final submission (§9, §10.1, §10.4)
appointmentsRouter.post(
  '/api/v1/appointments/submit',
  publicRequestsRateLimiter,
  (req, res, next) => appointmentsController.submit(req, res).catch(next),
);

// 4. Requester appointments list (§9.2)
appointmentsRouter.get('/api/v1/appointments/my', (req, res, next) =>
  appointmentsController.listMyAppointments(req, res).catch(next),
);

// 5. Requester appointment status detail (§9.2)
appointmentsRouter.get('/api/v1/appointments/my/:id', (req, res, next) =>
  appointmentsController.getMyAppointment(req, res).catch(next),
);

// 6. Requester status history timeline (§9.2)
appointmentsRouter.get('/api/v1/appointments/my/:id/history', (req, res, next) =>
  appointmentsController.getStatusHistory(req, res).catch(next),
);

// 7. Calendar invite download (.ics) (§9.2)
appointmentsRouter.get('/api/v1/appointments/my/:id/ics', (req, res, next) =>
  appointmentsController.getIcs(req, res).catch(next),
);

// 8. Requester cancellation (§9.2, §10.2)
appointmentsRouter.post('/api/v1/appointments/my/:id/cancel', (req, res, next) =>
  appointmentsController.cancelAppointment(req, res).catch(next),
);

// --- Staff Review & Scheduling Queue Routes (§10.2–10.5, §18) ---

// 9. PA/EA review queue list (/app/inbox)
appointmentsRouter.get('/api/v1/appointments/inbox', (req, res, next) =>
  appointmentsController.listInbox(req, res).catch(next),
);

// 10. List proposals for an appointment (§10.7)
appointmentsRouter.get('/api/v1/appointments/:id/proposals', (req, res, next) =>
  appointmentsController.getProposals(req, res).catch(next),
);

// 11. Request more information (§10.2)
appointmentsRouter.post('/api/v1/appointments/:id/request-info', (req, res, next) =>
  appointmentsController.requestInfo(req, res).catch(next),
);

// 12. Requester responds with info (§10.2)
appointmentsRouter.post('/api/v1/appointments/:id/respond-info', (req, res, next) =>
  appointmentsController.respondInfo(req, res).catch(next),
);

// 13. Propose 1–3 time slots (§10.2, §10.7)
appointmentsRouter.post('/api/v1/appointments/:id/propose-times', (req, res, next) =>
  appointmentsController.proposeTimes(req, res).catch(next),
);

// 14. Requester accepts proposed slot (§10.2)
appointmentsRouter.post('/api/v1/appointments/:id/accept-proposal', (req, res, next) =>
  appointmentsController.acceptProposal(req, res).catch(next),
);

// 15. Requester declines all proposals (§10.2)
appointmentsRouter.post('/api/v1/appointments/:id/decline-proposals', (req, res, next) =>
  appointmentsController.declineProposals(req, res).catch(next),
);

// 16. Schedule directly (§10.2)
appointmentsRouter.post('/api/v1/appointments/:id/schedule', (req, res, next) =>
  appointmentsController.schedule(req, res).catch(next),
);

// 17. Approve appointment (§10.2)
appointmentsRouter.post('/api/v1/appointments/:id/approve', (req, res, next) =>
  appointmentsController.approve(req, res).catch(next),
);

// 18. Reject appointment (§10.2)
appointmentsRouter.post('/api/v1/appointments/:id/reject', (req, res, next) =>
  appointmentsController.reject(req, res).catch(next),
);

// 19. Official suggests other times (§10.2)
appointmentsRouter.post('/api/v1/appointments/:id/suggest-other', (req, res, next) =>
  appointmentsController.suggestOther(req, res).catch(next),
);

// 20. Change priority (§10.2, §14.4)
appointmentsRouter.post('/api/v1/appointments/:id/priority', (req, res, next) =>
  appointmentsController.changePriority(req, res).catch(next),
);

// --- Track 5: Change Requests, Rescheduling & Multi-Official Routes (§10.5, §10.6, §22) ---

// 21. Staff direct reschedule (§10.6)
appointmentsRouter.post('/api/v1/appointments/:id/reschedule', (req, res, next) =>
  appointmentsController.reschedule(req, res).catch(next),
);

// 22. Staff/general cancel (§10.2, §22 Track 5)
appointmentsRouter.post('/api/v1/appointments/:id/cancel', (req, res, next) =>
  appointmentsController.cancelAppointment(req, res).catch(next),
);

// 23. Remove official from multi-official appointment (§10.5)
appointmentsRouter.post('/api/v1/appointments/:id/officials/:officialId/remove', (req, res, next) =>
  appointmentsController.removeOfficial(req, res).catch(next),
);

// 24. Create change request (§10.6)
appointmentsRouter.post('/api/v1/appointments/:id/change-requests', (req, res, next) =>
  appointmentsController.createChangeRequest(req, res).catch(next),
);

// 25. List change requests for appointment (§10.6)
appointmentsRouter.get('/api/v1/appointments/:id/change-requests', (req, res, next) =>
  appointmentsController.getChangeRequests(req, res).catch(next),
);

// 26. Propose candidate slots for change request (§10.6)
appointmentsRouter.post('/api/v1/appointments/change-requests/:crId/propose', (req, res, next) =>
  appointmentsController.proposeChangeRequestSlots(req, res).catch(next),
);

// 27. Accept proposed slot for change request (§10.6)
appointmentsRouter.post('/api/v1/appointments/change-requests/:crId/accept', (req, res, next) =>
  appointmentsController.acceptChangeRequestProposal(req, res).catch(next),
);

// 28. Withdraw change request (§10.6)
appointmentsRouter.post('/api/v1/appointments/change-requests/:crId/withdraw', (req, res, next) =>
  appointmentsController.withdrawChangeRequest(req, res).catch(next),
);

// 29. Reject change request (§10.6)
appointmentsRouter.post('/api/v1/appointments/change-requests/:crId/reject', (req, res, next) =>
  appointmentsController.rejectChangeRequest(req, res).catch(next),
);

// 30. Start meeting (§16.1)
appointmentsRouter.post('/api/v1/appointments/:id/start', (req, res, next) =>
  appointmentsController.startMeeting(req, res).catch(next),
);

// 31. Complete meeting (§16.1)
appointmentsRouter.post('/api/v1/appointments/:id/complete', (req, res, next) =>
  appointmentsController.completeMeeting(req, res).catch(next),
);
