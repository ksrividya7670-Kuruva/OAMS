import type { Request, Response } from 'express';
import { tasksRepo } from './repo.js';
import { tasksService } from './service.js';
import {
  createTaskSchema,
  updateTaskSchema,
  blockTaskSchema,
  cancelTaskSchema,
  reorderTaskSchema,
  bulkTaskActionSchema,
  createChecklistItemSchema,
  updateChecklistItemSchema,
  createTaskCommentSchema,
  createTaskReminderSchema,
  taskListQuerySchema,
  taskExportQuerySchema,
  RoleCode,
  ApiError,
} from '@oams/shared';

export class TasksController {
  async listTasks(req: Request, res: Response) {
    const user = req.user!;
    const query = taskListQuerySchema.parse(req.query);

    const isOfficialUser = user.roles.includes(RoleCode.OFFICIAL);
    const assignedIds = await tasksService.getAssignedOfficialIds(user.id);

    const result = await tasksRepo.list({
      ...query,
      orgId: user.orgId,
      currentUserId: user.id,
      userRoles: user.roles,
      isOfficial: isOfficialUser,
      assignedOfficialIds: assignedIds,
    });

    res.json({
      success: true,
      data: {
        tasks: result.tasks,
        total: result.total,
        page: query.page,
        limit: query.limit,
      },
    });
  }

  async getSummary(req: Request, res: Response) {
    const user = req.user!;
    const officialId = req.query.officialId as string | undefined;
    const isOfficialUser = user.roles.includes(RoleCode.OFFICIAL);

    const summary = await tasksRepo.getSummary(officialId, user.orgId, user.id, isOfficialUser);

    res.json({
      success: true,
      data: summary,
    });
  }

  async getTask(req: Request, res: Response) {
    const user = req.user!;
    const id = req.params.id as string;

    const task = await tasksRepo.getWithDetails(id, user.orgId, user.id, user.roles);
    if (!task) {
      throw ApiError.notFound('Task not found');
    }

    res.json({
      success: true,
      data: task,
    });
  }

  async createTask(req: Request, res: Response) {
    const user = req.user!;
    const input = createTaskSchema.parse(req.body);

    const task = await tasksService.createTask(user, input);
    res.status(201).json({
      success: true,
      data: task,
    });
  }

  async updateTask(req: Request, res: Response) {
    const user = req.user!;
    const id = req.params.id as string;
    const input = updateTaskSchema.parse(req.body);

    const task = await tasksService.updateTask(user, id, input);
    res.json({
      success: true,
      data: task,
    });
  }

  async startTask(req: Request, res: Response) {
    const user = req.user!;
    const id = req.params.id as string;

    const task = await tasksService.startTask(user, id);
    res.json({
      success: true,
      data: task,
    });
  }

  async completeTask(req: Request, res: Response) {
    const user = req.user!;
    const id = req.params.id as string;

    const task = await tasksService.completeTask(user, id);
    res.json({
      success: true,
      data: task,
    });
  }

  async verifyTask(req: Request, res: Response) {
    const user = req.user!;
    const id = req.params.id as string;

    const task = await tasksService.verifyTask(user, id);
    res.json({
      success: true,
      data: task,
    });
  }

  async blockTask(req: Request, res: Response) {
    const user = req.user!;
    const id = req.params.id as string;
    const input = blockTaskSchema.parse(req.body);

    const task = await tasksService.blockTask(user, id, input);
    res.json({
      success: true,
      data: task,
    });
  }

  async unblockTask(req: Request, res: Response) {
    const user = req.user!;
    const id = req.params.id as string;

    const task = await tasksService.unblockTask(user, id);
    res.json({
      success: true,
      data: task,
    });
  }

  async cancelTask(req: Request, res: Response) {
    const user = req.user!;
    const id = req.params.id as string;
    const input = cancelTaskSchema.parse(req.body);

    const task = await tasksService.cancelTask(user, id, input);
    res.json({
      success: true,
      data: task,
    });
  }

  async reopenTask(req: Request, res: Response) {
    const user = req.user!;
    const id = req.params.id as string;

    const task = await tasksService.reopenTask(user, id);
    res.json({
      success: true,
      data: task,
    });
  }

  async reorderTasks(req: Request, res: Response) {
    const user = req.user!;
    const input = reorderTaskSchema.parse(req.body);

    await tasksService.reorderTasks(user, input);
    res.json({ success: true });
  }

  async bulkAction(req: Request, res: Response) {
    const user = req.user!;
    const input = bulkTaskActionSchema.parse(req.body);

    const result = await tasksService.bulkAction(user, input);
    res.json({
      success: true,
      data: result,
    });
  }

  async addChecklistItem(req: Request, res: Response) {
    const user = req.user!;
    const id = req.params.id as string;
    const input = createChecklistItemSchema.parse(req.body);

    const item = await tasksService.addChecklistItem(user, id, input);
    res.status(201).json({
      success: true,
      data: item,
    });
  }

  async updateChecklistItem(req: Request, res: Response) {
    const user = req.user!;
    const id = req.params.id as string;
    const itemId = req.params.itemId as string;
    const input = updateChecklistItemSchema.parse(req.body);

    const item = await tasksService.updateChecklistItem(user, id, itemId, input);
    res.json({
      success: true,
      data: item,
    });
  }

  async deleteChecklistItem(req: Request, res: Response) {
    const user = req.user!;
    const id = req.params.id as string;
    const itemId = req.params.itemId as string;

    await tasksService.deleteChecklistItem(user, id, itemId);
    res.json({ success: true });
  }

  async addComment(req: Request, res: Response) {
    const user = req.user!;
    const id = req.params.id as string;
    const input = createTaskCommentSchema.parse(req.body);

    const comment = await tasksService.addComment(user, id, input);
    res.status(201).json({
      success: true,
      data: comment,
    });
  }

  async addReminder(req: Request, res: Response) {
    const user = req.user!;
    const id = req.params.id as string;
    const input = createTaskReminderSchema.parse(req.body);

    const reminder = await tasksService.addReminder(user, id, input);
    res.status(201).json({
      success: true,
      data: reminder,
    });
  }

  async deleteReminder(req: Request, res: Response) {
    const user = req.user!;
    const id = req.params.id as string;
    const reminderId = req.params.reminderId as string;

    await tasksService.deleteReminder(user, id, reminderId);
    res.json({ success: true });
  }

  async exportTasks(req: Request, res: Response) {
    const user = req.user!;
    const query = taskExportQuerySchema.parse(req.query);

    const exportResult = await tasksService.exportTasks(user, query);

    res.setHeader('Content-Type', exportResult.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    res.send(exportResult.buffer);
  }
}

export const tasksController = new TasksController();
