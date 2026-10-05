import type { Request, Response } from 'express';
import { roomsService } from './service.js';
import { createRoomSchema } from '@oams/shared';

export class RoomsController {
  async list(req: Request, res: Response): Promise<void> {
    const onlyActive = req.query.all !== 'true';
    const rooms = await roomsService.listRooms(req.user!.orgId, onlyActive);
    res.json({ success: true, data: rooms });
  }

  async getById(req: Request, res: Response): Promise<void> {
    const room = await roomsService.getRoom(req.user!.orgId, req.params.id as string);
    res.json({ success: true, data: room });
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = createRoomSchema.parse(req.body);
    const room = await roomsService.createRoom(
      req.user!.orgId,
      input,
      req.user?.id,
      req.user?.roles[0],
      req.correlationId,
    );
    res.status(201).json({ success: true, data: room });
  }

  async update(req: Request, res: Response): Promise<void> {
    const room = await roomsService.updateRoom(
      req.user!.orgId,
      req.params.id as string,
      req.body,
      req.user?.id,
      req.user?.roles[0],
      req.correlationId,
    );
    res.json({ success: true, data: room });
  }
}

export const roomsController = new RoomsController();
