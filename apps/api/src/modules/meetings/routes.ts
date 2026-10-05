import { Router } from 'express';
import { meetingsController } from './controller.js';
import { requireAuth } from '../../core/auth/middleware.js';

export const meetingsRouter: Router = Router();

meetingsRouter.use('/api/v1/meetings', requireAuth);

// Conclude meeting with notes and action items (§16, §22 Track 8)
meetingsRouter.post('/api/v1/meetings/appointments/:appointmentId/complete', (req, res, next) =>
  meetingsController.completeMeeting(req, res).catch(next),
);

// Manual close appointment
meetingsRouter.post('/api/v1/meetings/appointments/:appointmentId/close', (req, res, next) =>
  meetingsController.closeAppointment(req, res).catch(next),
);

// Meeting notes
meetingsRouter.get('/api/v1/meetings/appointments/:appointmentId/notes', (req, res, next) =>
  meetingsController.getNotes(req, res).catch(next),
);

meetingsRouter.post('/api/v1/meetings/appointments/:appointmentId/notes', (req, res, next) =>
  meetingsController.createNote(req, res).catch(next),
);

meetingsRouter.patch('/api/v1/meetings/notes/:id', (req, res, next) =>
  meetingsController.updateNote(req, res).catch(next),
);

// Action items
meetingsRouter.get('/api/v1/meetings/appointments/:appointmentId/action-items', (req, res, next) =>
  meetingsController.getActionItems(req, res).catch(next),
);

meetingsRouter.post('/api/v1/meetings/appointments/:appointmentId/action-items', (req, res, next) =>
  meetingsController.createActionItem(req, res).catch(next),
);

meetingsRouter.patch('/api/v1/meetings/action-items/:id', (req, res, next) =>
  meetingsController.updateActionItem(req, res).catch(next),
);

// Convert action item to task
meetingsRouter.post('/api/v1/meetings/action-items/:id/convert-to-task', (req, res, next) =>
  meetingsController.convertActionItemToTask(req, res).catch(next),
);
