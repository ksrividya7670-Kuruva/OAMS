import type { Request, Response } from 'express';
import { usersService } from './service.js';
import {
  createUserSchema,
  updateUserSchema,
  assignRolesSchema,
  userQuerySchema,
  type RoleCode,
} from '@oams/shared';

export class UsersController {
  async list(req: Request, res: Response): Promise<void> {
    const query = userQuerySchema.parse(req.query);
    const result = await usersService.listUsers(req.user!.orgId, query);
    res.json({
      success: true,
      data: result.items,
      meta: { nextCursor: result.nextCursor },
    });
  }

  async getById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const user = await usersService.getUser(req.user!.orgId, id);
    res.json({ success: true, data: user });
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = createUserSchema.parse(req.body);
    const user = await usersService.createUser(
      req.user!.orgId,
      input,
      req.user?.id,
      req.user?.roles[0],
      req.correlationId,
    );
    res.status(201).json({ success: true, data: user });
  }

  async update(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = updateUserSchema.parse(req.body);
    const updated = await usersService.updateUser(
      req.user!.orgId,
      id,
      input,
      req.user?.id,
      req.user?.roles[0],
      req.correlationId,
    );
    res.json({ success: true, data: updated });
  }

  async disable(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const updated = await usersService.disableUser(
      req.user!.orgId,
      id,
      req.user?.id,
      req.user?.roles[0],
      req.correlationId,
    );
    res.json({ success: true, data: updated });
  }

  async assignRoles(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = assignRolesSchema.parse(req.body);
    const result = await usersService.assignRoles(
      req.user!.orgId,
      id,
      input.roleCodes as RoleCode[],
      req.user?.id,
      req.user?.roles[0],
      req.correlationId,
    );
    res.json({ success: true, data: result });
  }

  async listRoles(_req: Request, res: Response): Promise<void> {
    const roles = await usersService.listRoles();
    res.json({ success: true, data: roles });
  }

  async listDepartments(req: Request, res: Response): Promise<void> {
    const departments = await usersService.listDepartments(req.user!.orgId);
    res.json({ success: true, data: departments });
  }

  async createDepartment(req: Request, res: Response): Promise<void> {
    const { name, headUserId } = req.body;
    const dept = await usersService.createDepartment(req.user!.orgId, name, headUserId);
    res.status(201).json({ success: true, data: dept });
  }
}

export const usersController = new UsersController();
