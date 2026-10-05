import { db } from '../../core/db.js';
import { visitsRepo } from './repo.js';
import { generateReferenceNumber } from '../../core/utils/referenceNumber.js';
import { writeAuditEvent } from '../../core/audit/auditWriter.js';
import { writeOutboxEvent } from '../../core/outbox/outboxWriter.js';
import { routeNotificationEvent } from '../../core/notifications/router.js';
import {
  ApiError,
  RoleCode,
  VisitStatus,
  AppointmentStatus,
  Priority,
  type AuthUser,
  type VisitDto,
  type CheckInVisitInput,
  type DenyVisitInput,
  type WalkInVisitInput,
} from '@oams/shared';
import { generateDailyExpectedPdf, generateEmergencyEvacuationPdf } from './exportEngine.js';
import { DateTime } from 'luxon';

export class VisitsService {
  /**
   * Helper to verify if user has permission to manage reception / security visits
   */
  private ensureCanManageVisits(user: AuthUser): void {
    const isAuthorized = user.roles.some((r) =>
      (
        [
          RoleCode.SUPER_ADMIN,
          RoleCode.APPOINTMENT_ADMIN,
          RoleCode.RECEPTION,
          RoleCode.SECURITY,
          RoleCode.OFFICIAL,
          RoleCode.PA,
          RoleCode.EA,
        ] as RoleCode[]
      ).includes(r),
    );

    if (!isAuthorized) {
      throw ApiError.forbidden('Cannot manage visitor check-in');
    }
  }

  /**
   * Mark visitor as arrived at building entrance (§15.2, §15.3)
   */
  async arrive(user: AuthUser, visitId: string, correlationId?: string): Promise<VisitDto> {
    this.ensureCanManageVisits(user);

    return db.transaction(async (trx) => {
      const visit = await trx('visits').where('id', visitId).andWhere('org_id', user.orgId).first();
      if (!visit) {
        throw ApiError.notFound('Visit not found');
      }

      if (visit.status !== VisitStatus.EXPECTED) {
        throw ApiError.badRequest(
          `Cannot mark arrived: visit is currently in status ${visit.status}`,
        );
      }

      const now = new Date();
      await trx('visits').where('id', visitId).update({
        status: VisitStatus.ARRIVED,
        arrived_at: now,
        updated_at: now,
      });

      // Fetch appointment details for notifications
      const apt = await trx('appointments')
        .where('id', visit.appointment_id)
        .select('official_id', 'start_at', 'subject')
        .first();

      // Audit event
      await writeAuditEvent(trx, {
        orgId: user.orgId,
        entityType: 'visit',
        entityId: visitId,
        action: 'visit.arrive',
        actorId: user.id,
        actorRole: user.roles[0],
        correlationId: correlationId || 'sys',
        changes: { status: [visit.status, VisitStatus.ARRIVED] },
      });

      // Domain Event
      const domainEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        eventType: 'VisitorArrived',
        aggregateType: 'visit',
        aggregateId: visitId,
        orgId: user.orgId,
        occurredAt: now,
        payload: {
          visitId,
          appointmentId: visit.appointment_id,
          officialId: apt?.official_id,
          visitorName: visit.visitor_name,
          phone: visit.phone,
          referenceNo: visit.reference_no,
          arrivedAt: now.toISOString(),
        },
      };

      await writeOutboxEvent(trx, domainEvent);
      await routeNotificationEvent(domainEvent);

      const updated = await visitsRepo.getById(visitId, user.orgId, user, trx);
      if (!updated) throw ApiError.internal('Failed to retrieve updated visit');
      return updated;
    });
  }

  /**
   * Check in visitor and assign badge number (§15.2, §15.3)
   */
  async checkIn(
    user: AuthUser,
    visitId: string,
    input: CheckInVisitInput,
    correlationId?: string,
  ): Promise<VisitDto> {
    this.ensureCanManageVisits(user);

    return db.transaction(async (trx) => {
      const visit = await trx('visits').where('id', visitId).andWhere('org_id', user.orgId).first();
      if (!visit) {
        throw ApiError.notFound('Visit not found');
      }

      if (visit.status !== VisitStatus.ARRIVED && visit.status !== VisitStatus.EXPECTED) {
        throw ApiError.badRequest(`Cannot check in: visit is currently in status ${visit.status}`);
      }

      const now = new Date();
      const updates: any = {
        status: VisitStatus.CHECKED_IN,
        badge_no: input.badgeNo.trim(),
        checked_in_at: now,
        updated_at: now,
      };

      if (!visit.arrived_at) {
        updates.arrived_at = now;
      }
      if (input.idType) updates.id_type = input.idType.trim();
      if (input.idLast4) updates.id_last4 = input.idLast4.trim();
      if (input.vehicleNo) updates.vehicle_no = input.vehicleNo.trim();

      await trx('visits').where('id', visitId).update(updates);

      // The first visit to reach CHECKED_IN moves the appointment to CHECKED_IN (§15.2)
      const apt = await trx('appointments')
        .where('id', visit.appointment_id)
        .select('id', 'status', 'official_id', 'subject')
        .first();

      let appointmentStatusChanged = false;
      if (apt && apt.status === AppointmentStatus.CONFIRMED) {
        await trx('appointments').where('id', apt.id).update({
          status: AppointmentStatus.CHECKED_IN,
          updated_at: now,
        });
        appointmentStatusChanged = true;

        await writeAuditEvent(trx, {
          orgId: user.orgId,
          entityType: 'appointment',
          entityId: apt.id,
          action: 'appointment.checkin',
          actorId: user.id,
          actorRole: user.roles[0],
          correlationId: correlationId || 'sys',
          changes: { status: [AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN] },
        });
      }

      // Audit event
      await writeAuditEvent(trx, {
        orgId: user.orgId,
        entityType: 'visit',
        entityId: visitId,
        action: 'visit.checkin',
        actorId: user.id,
        actorRole: user.roles[0],
        correlationId: correlationId || 'sys',
        changes: {
          status: [visit.status, VisitStatus.CHECKED_IN],
          badgeNo: [visit.badge_no, input.badgeNo.trim()],
        },
      });

      // Outbox domain event
      const domainEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        eventType: 'VisitorCheckedIn',
        aggregateType: 'visit',
        aggregateId: visitId,
        orgId: user.orgId,
        occurredAt: now,
        payload: {
          visitId,
          appointmentId: visit.appointment_id,
          officialId: apt?.official_id,
          visitorName: visit.visitor_name,
          badgeNo: input.badgeNo.trim(),
          checkedInAt: now.toISOString(),
          appointmentStatusChanged,
        },
      };

      await writeOutboxEvent(trx, domainEvent);
      // Route notification (PA toast alert!)
      await routeNotificationEvent(domainEvent);

      const updated = await visitsRepo.getById(visitId, user.orgId, user, trx);
      if (!updated) throw ApiError.internal('Failed to retrieve updated visit');
      return updated;
    });
  }

  /**
   * Host accepts visitor / visitor is escorted to official's room (§15.2)
   */
  async withHost(user: AuthUser, visitId: string, correlationId?: string): Promise<VisitDto> {
    this.ensureCanManageVisits(user);

    return db.transaction(async (trx) => {
      const visit = await trx('visits').where('id', visitId).andWhere('org_id', user.orgId).first();
      if (!visit) {
        throw ApiError.notFound('Visit not found');
      }

      if (visit.status !== VisitStatus.CHECKED_IN) {
        throw ApiError.badRequest(
          `Cannot mark with host: visit is currently in status ${visit.status}`,
        );
      }

      const now = new Date();
      await trx('visits').where('id', visitId).update({
        status: VisitStatus.WITH_HOST,
        with_host_at: now,
        updated_at: now,
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        entityType: 'visit',
        entityId: visitId,
        action: 'visit.with_host',
        actorId: user.id,
        actorRole: user.roles[0],
        correlationId: correlationId || 'sys',
        changes: { status: [visit.status, VisitStatus.WITH_HOST] },
      });

      const updated = await visitsRepo.getById(visitId, user.orgId, user, trx);
      if (!updated) throw ApiError.internal('Failed to retrieve updated visit');
      return updated;
    });
  }

  /**
   * Check out visitor upon departure (§15.2)
   */
  async checkOut(user: AuthUser, visitId: string, correlationId?: string): Promise<VisitDto> {
    this.ensureCanManageVisits(user);

    return db.transaction(async (trx) => {
      const visit = await trx('visits').where('id', visitId).andWhere('org_id', user.orgId).first();
      if (!visit) {
        throw ApiError.notFound('Visit not found');
      }

      if (
        visit.status !== VisitStatus.CHECKED_IN &&
        visit.status !== VisitStatus.WITH_HOST &&
        visit.status !== VisitStatus.ARRIVED
      ) {
        throw ApiError.badRequest(`Cannot check out: visit is currently in status ${visit.status}`);
      }

      const now = new Date();
      await trx('visits').where('id', visitId).update({
        status: VisitStatus.CHECKED_OUT,
        checked_out_at: now,
        updated_at: now,
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        entityType: 'visit',
        entityId: visitId,
        action: 'visit.checkout',
        actorId: user.id,
        actorRole: user.roles[0],
        correlationId: correlationId || 'sys',
        changes: { status: [visit.status, VisitStatus.CHECKED_OUT] },
      });

      const updated = await visitsRepo.getById(visitId, user.orgId, user, trx);
      if (!updated) throw ApiError.internal('Failed to retrieve updated visit');
      return updated;
    });
  }

  /**
   * Deny entry to visitor (§15.2)
   */
  async deny(
    user: AuthUser,
    visitId: string,
    input: DenyVisitInput,
    correlationId?: string,
  ): Promise<VisitDto> {
    this.ensureCanManageVisits(user);

    return db.transaction(async (trx) => {
      const visit = await trx('visits').where('id', visitId).andWhere('org_id', user.orgId).first();
      if (!visit) {
        throw ApiError.notFound('Visit not found');
      }

      if (visit.status !== VisitStatus.EXPECTED && visit.status !== VisitStatus.ARRIVED) {
        throw ApiError.badRequest(
          `Cannot deny visit: visit is currently in status ${visit.status}`,
        );
      }

      const now = new Date();
      await trx('visits').where('id', visitId).update({
        status: VisitStatus.DENIED,
        denied_reason: input.reason.trim(),
        updated_at: now,
      });

      const apt = await trx('appointments')
        .where('id', visit.appointment_id)
        .select('official_id', 'subject')
        .first();

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        entityType: 'visit',
        entityId: visitId,
        action: 'visit.deny',
        actorId: user.id,
        actorRole: user.roles[0],
        correlationId: correlationId || 'sys',
        changes: {
          status: [visit.status, VisitStatus.DENIED],
          reason: input.reason.trim(),
        },
      });

      const domainEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        eventType: 'VisitorDenied',
        aggregateType: 'visit',
        aggregateId: visitId,
        orgId: user.orgId,
        occurredAt: now,
        payload: {
          visitId,
          appointmentId: visit.appointment_id,
          officialId: apt?.official_id,
          visitorName: visit.visitor_name,
          reason: input.reason.trim(),
        },
      };

      await writeOutboxEvent(trx, domainEvent);
      await routeNotificationEvent(domainEvent);

      const updated = await visitsRepo.getById(visitId, user.orgId, user, trx);
      if (!updated) throw ApiError.internal('Failed to retrieve updated visit');
      return updated;
    });
  }

  /**
   * Register a Walk-In visitor (§15.3)
   * Creates an appointment in UNDER_REVIEW with source = WALK_IN, priority = MEDIUM,
   * creates visit in ARRIVED, and immediately sends toast alert to support staff.
   */
  async registerWalkIn(
    user: AuthUser,
    input: WalkInVisitInput,
    correlationId?: string,
  ): Promise<{ appointmentId: string; visitId: string; referenceNo: string; visit: VisitDto }> {
    this.ensureCanManageVisits(user);

    return db.transaction(async (trx) => {
      // 1. Verify official exists
      const official = await trx('officials')
        .where('id', input.officialId)
        .andWhere('org_id', user.orgId)
        .first();

      if (!official) {
        throw ApiError.notFound('Official not found');
      }

      // 2. Generate Reference numbers
      const aptRef = await generateReferenceNumber(trx, 'APT');
      const visRef = await generateReferenceNumber(trx, 'VIS');

      const now = new Date();
      const endEstimate = new Date(now.getTime() + 30 * 60 * 1000); // 30 min window

      // 3. Create appointment in UNDER_REVIEW (§15.3)
      const [apt] = await trx('appointments')
        .insert({
          org_id: user.orgId,
          reference_no: aptRef,
          official_id: input.officialId,
          source: 'WALK_IN',
          status: AppointmentStatus.UNDER_REVIEW,
          priority: Priority.MEDIUM,
          subject: `Walk-in: ${input.visitorName}`,
          purpose: input.purpose.trim(),
          purpose_category: input.purposeCategory || 'OTHER',
          start_at: now,
          end_at: endEstimate,
          duration_min: 30,
          meeting_mode: 'IN_PERSON',
          is_walk_in: true,
          requester_snapshot: {
            name: input.visitorName.trim(),
            phone: input.phone.trim(),
            email: input.email ? input.email.trim() : null,
            organization: input.organization ? input.organization.trim() : null,
          },
          created_by: user.id,
          created_at: now,
          updated_at: now,
        })
        .returning('*');

      // 4. Create visit in ARRIVED status (§15.3)
      const [visitRow] = await trx('visits')
        .insert({
          org_id: user.orgId,
          appointment_id: apt.id,
          reference_no: visRef,
          visitor_name: input.visitorName.trim(),
          phone: input.phone.trim(),
          email: input.email ? input.email.trim() : null,
          organization: input.organization ? input.organization.trim() : null,
          id_type: input.idType ? input.idType.trim() : null,
          id_last4: input.idLast4 ? input.idLast4.trim() : null,
          vehicle_no: input.vehicleNo ? input.vehicleNo.trim() : null,
          party_size: input.partySize || 1,
          status: VisitStatus.ARRIVED,
          arrived_at: now,
          created_at: now,
          updated_at: now,
        })
        .returning('*');

      // 5. Audit logs
      await writeAuditEvent(trx, {
        orgId: user.orgId,
        entityType: 'appointment',
        entityId: apt.id,
        action: 'appointment.create_walk_in',
        actorId: user.id,
        actorRole: user.roles[0],
        correlationId: correlationId || 'sys',
        changes: {
          referenceNo: aptRef,
          visitorName: input.visitorName,
          officialId: input.officialId,
        },
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        entityType: 'visit',
        entityId: visitRow.id,
        action: 'visit.walk_in',
        actorId: user.id,
        actorRole: user.roles[0],
        correlationId: correlationId || 'sys',
        changes: {
          referenceNo: visRef,
          status: VisitStatus.ARRIVED,
        },
      });

      // 6. Domain Event & Notification to host PA
      const domainEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        eventType: 'VisitorArrived',
        aggregateType: 'visit',
        aggregateId: visitRow.id,
        orgId: user.orgId,
        occurredAt: now,
        payload: {
          visitId: visitRow.id,
          appointmentId: apt.id,
          officialId: input.officialId,
          visitorName: input.visitorName.trim(),
          phone: input.phone.trim(),
          referenceNo: visRef,
          isWalkIn: true,
          arrivedAt: now.toISOString(),
        },
      };

      await writeOutboxEvent(trx, domainEvent);
      await routeNotificationEvent(domainEvent);

      const visitDto = await visitsRepo.getById(visitRow.id, user.orgId, user, trx);
      if (!visitDto) throw ApiError.internal('Failed to retrieve walk-in visit');

      return {
        appointmentId: apt.id,
        visitId: visitRow.id,
        referenceNo: visRef,
        visit: visitDto,
      };
    });
  }

  /**
   * Generate daily PDF for reception offline fallback (§15.3)
   */
  async exportDailyList(
    user: AuthUser,
    dateStr?: string,
    correlationId?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    this.ensureCanManageVisits(user);

    const targetDate = dateStr || DateTime.now().toFormat('yyyy-MM-dd');
    const { visits } = await visitsRepo.listVisits({ date: targetDate }, user.orgId, user);

    const buffer = await generateDailyExpectedPdf(visits, targetDate);

    await writeAuditEvent(db, {
      orgId: user.orgId,
      entityType: 'visit',
      entityId: user.orgId,
      action: 'visit.export_daily_list',
      actorId: user.id,
      actorRole: user.roles[0],
      correlationId: correlationId || 'sys',
      changes: { date: targetDate, count: visits.length },
    });

    return {
      buffer,
      filename: `OAMS_Daily_Visitor_Register_${targetDate}.pdf`,
    };
  }

  /**
   * Generate emergency evacuation roster PDF (§15.4)
   */
  async exportEmergencyRoster(
    user: AuthUser,
    correlationId?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    this.ensureCanManageVisits(user);

    const groups = await visitsRepo.getEmergencyList(user.orgId);
    const timestampStr = DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss');

    const buffer = await generateEmergencyEvacuationPdf(groups, timestampStr);

    await writeAuditEvent(db, {
      orgId: user.orgId,
      entityType: 'visit',
      entityId: user.orgId,
      action: 'visit.export_emergency_list',
      actorId: user.id,
      actorRole: user.roles[0],
      correlationId: correlationId || 'sys',
      changes: {
        timestamp: timestampStr,
        groupCount: groups.length,
        totalActiveVisitors: groups.reduce((acc, g) => acc + g.count, 0),
      },
    });

    return {
      buffer,
      filename: `OAMS_Emergency_Evacuation_Roster_${DateTime.now().toFormat('yyyy-MM-dd_HHmmss')}.pdf`,
    };
  }
}

export const visitsService = new VisitsService();
