import { db } from '../../core/db.js';
import { ApiError, type HolidayInput } from '@oams/shared';
import { writeAuditEvent } from '../../core/audit/auditWriter.js';

export class HolidaysService {
  async listHolidays(orgId: string, year?: number) {
    let qb = db('holidays').where('org_id', orgId);
    if (year) {
      qb = qb.where('date', '>=', `${year}-01-01`).where('date', '<=', `${year}-12-31`);
    }
    return qb.orderBy('date', 'asc');
  }

  async createHoliday(
    orgId: string,
    input: HolidayInput,
    actorId?: string,
    actorRole?: string,
    correlationId = '',
  ) {
    return db.transaction(async (trx) => {
      const [holiday] = await trx('holidays')
        .insert({
          org_id: orgId,
          date: input.date,
          name: input.name,
          is_optional: input.isOptional || false,
        })
        .onConflict(['org_id', 'date'])
        .merge({
          name: input.name,
          is_optional: input.isOptional || false,
          updated_at: trx.fn.now(),
        })
        .returning('*');

      await writeAuditEvent(trx, {
        orgId,
        actorId,
        actorRole,
        action: 'holiday.create',
        entityType: 'holiday',
        entityId: holiday.id,
        changes: input,
        correlationId,
      });

      return holiday;
    });
  }

  async deleteHoliday(
    orgId: string,
    id: string,
    actorId?: string,
    actorRole?: string,
    correlationId = '',
  ) {
    const existing = await db('holidays').where({ id, org_id: orgId }).first();
    if (!existing) {
      throw ApiError.notFound('Holiday not found');
    }

    return db.transaction(async (trx) => {
      await trx('holidays').where({ id, org_id: orgId }).delete();

      await writeAuditEvent(trx, {
        orgId,
        actorId,
        actorRole,
        action: 'holiday.delete',
        entityType: 'holiday',
        entityId: id,
        changes: { date: existing.date, name: existing.name },
        correlationId,
      });

      return { success: true };
    });
  }
}

export const holidaysService = new HolidaysService();
