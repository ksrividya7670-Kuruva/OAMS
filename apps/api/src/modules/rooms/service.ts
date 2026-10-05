import { db } from '../../core/db.js';
import { ApiError, type CreateRoomInput } from '@oams/shared';
import { writeAuditEvent } from '../../core/audit/auditWriter.js';

export class RoomsService {
  async listRooms(orgId: string, onlyActive = true) {
    let qb = db('rooms').where('org_id', orgId);
    if (onlyActive) {
      qb = qb.where('is_active', true);
    }
    return qb.orderBy('name', 'asc');
  }

  async getRoom(orgId: string, id: string) {
    const room = await db('rooms').where({ id, org_id: orgId }).first();
    if (!room) {
      throw ApiError.notFound('Room not found');
    }
    return room;
  }

  async createRoom(
    orgId: string,
    input: CreateRoomInput,
    actorId?: string,
    actorRole?: string,
    correlationId = '',
  ) {
    return db.transaction(async (trx) => {
      const [room] = await trx('rooms')
        .insert({
          org_id: orgId,
          name: input.name,
          building: input.building,
          floor: input.floor,
          capacity: input.capacity,
          equipment: JSON.stringify(input.equipment || []),
          is_active: input.isActive !== undefined ? input.isActive : true,
          setup_min: input.setupMin || 0,
          cleanup_min: input.cleanupMin || 0,
        })
        .returning('*');

      await writeAuditEvent(trx, {
        orgId,
        actorId,
        actorRole,
        action: 'room.create',
        entityType: 'room',
        entityId: room.id,
        changes: input,
        correlationId,
      });

      return room;
    });
  }

  async updateRoom(
    orgId: string,
    id: string,
    input: Partial<CreateRoomInput>,
    actorId?: string,
    actorRole?: string,
    correlationId = '',
  ) {
    const existing = await db('rooms').where({ id, org_id: orgId }).first();
    if (!existing) {
      throw ApiError.notFound('Room not found');
    }

    return db.transaction(async (trx) => {
      const updateData: Record<string, unknown> = {
        updated_at: trx.fn.now(),
        version: existing.version + 1,
      };

      if (input.name !== undefined) updateData.name = input.name;
      if (input.building !== undefined) updateData.building = input.building;
      if (input.floor !== undefined) updateData.floor = input.floor;
      if (input.capacity !== undefined) updateData.capacity = input.capacity;
      if (input.equipment !== undefined) updateData.equipment = JSON.stringify(input.equipment);
      if (input.isActive !== undefined) updateData.is_active = input.isActive;
      if (input.setupMin !== undefined) updateData.setup_min = input.setupMin;
      if (input.cleanupMin !== undefined) updateData.cleanup_min = input.cleanupMin;

      const [updated] = await trx('rooms')
        .where({ id, org_id: orgId })
        .update(updateData)
        .returning('*');

      await writeAuditEvent(trx, {
        orgId,
        actorId,
        actorRole,
        action: 'room.update',
        entityType: 'room',
        entityId: id,
        changes: input,
        correlationId,
      });

      return updated;
    });
  }
}

export const roomsService = new RoomsService();
