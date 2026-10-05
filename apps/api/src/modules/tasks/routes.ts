import { Router } from 'express';
import { tasksController } from './controller.js';
import { requireAuth } from '../../core/auth/middleware.js';

export const tasksRouter: Router = Router();

tasksRouter.use('/api/v1/tasks', requireAuth);

// Summary & Export (must be before :id routes)
tasksRouter.get('/api/v1/tasks/summary', (req, res, next) =>
  tasksController.getSummary(req, res).catch(next),
);

tasksRouter.get('/api/v1/tasks/export', (req, res, next) =>
  tasksController.exportTasks(req, res).catch(next),
);

// Bulk & Reorder
tasksRouter.post('/api/v1/tasks/reorder', (req, res, next) =>
  tasksController.reorderTasks(req, res).catch(next),
);

tasksRouter.post('/api/v1/tasks/bulk', (req, res, next) =>
  tasksController.bulkAction(req, res).catch(next),
);

// List & Create
tasksRouter.get('/api/v1/tasks', (req, res, next) =>
  tasksController.listTasks(req, res).catch(next),
);

tasksRouter.post('/api/v1/tasks', (req, res, next) =>
  tasksController.createTask(req, res).catch(next),
);

// Detail & Update
tasksRouter.get('/api/v1/tasks/:id', (req, res, next) =>
  tasksController.getTask(req, res).catch(next),
);

tasksRouter.patch('/api/v1/tasks/:id', (req, res, next) =>
  tasksController.updateTask(req, res).catch(next),
);

// Lifecycle actions (§12.2)
tasksRouter.post('/api/v1/tasks/:id/start', (req, res, next) =>
  tasksController.startTask(req, res).catch(next),
);

tasksRouter.post('/api/v1/tasks/:id/complete', (req, res, next) =>
  tasksController.completeTask(req, res).catch(next),
);

tasksRouter.post('/api/v1/tasks/:id/verify', (req, res, next) =>
  tasksController.verifyTask(req, res).catch(next),
);

tasksRouter.post('/api/v1/tasks/:id/block', (req, res, next) =>
  tasksController.blockTask(req, res).catch(next),
);

tasksRouter.post('/api/v1/tasks/:id/unblock', (req, res, next) =>
  tasksController.unblockTask(req, res).catch(next),
);

tasksRouter.post('/api/v1/tasks/:id/cancel', (req, res, next) =>
  tasksController.cancelTask(req, res).catch(next),
);

tasksRouter.post('/api/v1/tasks/:id/reopen', (req, res, next) =>
  tasksController.reopenTask(req, res).catch(next),
);

// Checklist items (§12.3)
tasksRouter.post('/api/v1/tasks/:id/checklist', (req, res, next) =>
  tasksController.addChecklistItem(req, res).catch(next),
);

tasksRouter.patch('/api/v1/tasks/:id/checklist/:itemId', (req, res, next) =>
  tasksController.updateChecklistItem(req, res).catch(next),
);

tasksRouter.delete('/api/v1/tasks/:id/checklist/:itemId', (req, res, next) =>
  tasksController.deleteChecklistItem(req, res).catch(next),
);

// Comments (§12.3)
tasksRouter.post('/api/v1/tasks/:id/comments', (req, res, next) =>
  tasksController.addComment(req, res).catch(next),
);

// Reminders (§12.3)
tasksRouter.post('/api/v1/tasks/:id/reminders', (req, res, next) =>
  tasksController.addReminder(req, res).catch(next),
);

tasksRouter.delete('/api/v1/tasks/:id/reminders/:reminderId', (req, res, next) =>
  tasksController.deleteReminder(req, res).catch(next),
);
