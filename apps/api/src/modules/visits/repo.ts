import { db } from '../../core/db.js';
import crypto from 'node:crypto';
import {
  RoleCode,
  VisitStatus,
  type AuthUser,
  type VisitDto,
  type VisitQuery,
  type EmergencyGroupDto,
} from '@oams/shared';
import { DateTime } from 'luxon';

export class VisitsRepo {
  /**
   * Determine if caller has restricted role (Reception or Security only)
   */
  private isReceptionOrSecurityOnly(roles: RoleCode[]): boolean {
    const isStaffOrAdmin = roles.some((r) =>
      (
        [
          RoleCode.SUPER_ADMIN,
          RoleCode.OFFICIAL,
          RoleCode.PA,
          RoleCode.EA,
          RoleCode.APPOINTMENT_ADMIN,
        ] as RoleCode[]
      ).includes(r),
    );
    if (isStaffOrAdmin) return false;
    return roles.includes(RoleCode.RECEPTION) || roles.includes(RoleCode.SECURITY);
  }

  /**
   * Base query joining visit, appointment, host official, and room
   */
  private buildBaseQuery(trx = db) {
    return trx('visits')
      .join('appointments', 'visits.appointment_id', 'appointments.id')
      .leftJoin('officials', 'appointments.official_id', 'officials.id')
      .leftJoin('users as host_users', 'officials.user_id', 'host_users.id')
      .leftJoin('rooms', 'appointments.room_id', 'rooms.id')
      .select(
        'visits.*',
        'appointments.start_at as scheduled_start_time',
        'appointments.end_at as scheduled_end_time',
        'appointments.subject',
        'appointments.purpose',
        'appointments.purpose_category',
        'appointments.description',
        'appointments.official_id as host_official_id',
        'host_users.full_name as host_official_name',
        'officials.title as host_official_title',
        'rooms.name as room_name',
        'rooms.building',
        'rooms.floor',
      );
  }

  /**
   * Format a raw DB row to VisitDto, strictly omitting subject/purpose for Reception & Security (§15, §22)
   */
  mapRowToDto(row: any, isRestricted: boolean): VisitDto {
    const checkedInAt = row.checked_in_at ? new Date(row.checked_in_at).toISOString() : undefined;
    let waitingMinutes: number | undefined = undefined;

    if (row.status === VisitStatus.CHECKED_IN && row.checked_in_at) {
      const startMs = new Date(row.checked_in_at).getTime();
      waitingMinutes = Math.max(0, Math.floor((Date.now() - startMs) / 60000));
    }

    const dto: VisitDto = {
      id: row.id,
      orgId: row.org_id,
      appointmentId: row.appointment_id,
      referenceNo: row.reference_no,
      visitorName: row.visitor_name,
      phone: row.phone || undefined,
      email: row.email || undefined,
      organization: row.organization || undefined,
      idType: row.id_type || undefined,
      idLast4: row.id_last4 || undefined,
      vehicleNo: row.vehicle_no || undefined,
      partySize: Number(row.party_size || 1),
      status: row.status,
      badgeNo: row.badge_no || undefined,
      arrivedAt: row.arrived_at ? new Date(row.arrived_at).toISOString() : undefined,
      checkedInAt,
      withHostAt: row.with_host_at ? new Date(row.with_host_at).toISOString() : undefined,
      checkedOutAt: row.checked_out_at ? new Date(row.checked_out_at).toISOString() : undefined,
      deniedReason: row.denied_reason || undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),

      hostOfficialId: row.host_official_id || undefined,
      hostOfficialName: row.host_official_name || undefined,
      hostOfficialTitle: row.host_official_title || undefined,
      scheduledStartTime: row.scheduled_start_time
        ? new Date(row.scheduled_start_time).toISOString()
        : undefined,
      scheduledEndTime: row.scheduled_end_time
        ? new Date(row.scheduled_end_time).toISOString()
        : undefined,
      roomName: row.room_name || undefined,
      building: row.building || undefined,
      floor: row.floor || undefined,
      waitingMinutes,
    };

    // For Reception & Security, NEVER return subject, purpose, or description (§15, §22)
    if (!isRestricted) {
      dto.subject = row.subject || undefined;
      dto.purpose = row.purpose || undefined;
      dto.purposeCategory = row.purpose_category || undefined;
      dto.description = row.description || undefined;
    }

    return dto;
  }

  /**
   * Get visit by ID
   */
  async getById(id: string, orgId: string, caller: AuthUser, trx = db): Promise<VisitDto | null> {
    const query = this.buildBaseQuery(trx).where('visits.id', id).andWhere('visits.org_id', orgId);

    const isRestricted = this.isReceptionOrSecurityOnly(caller.roles);

    // Apply role scoping
    if (!caller.roles.includes(RoleCode.SUPER_ADMIN) && !isRestricted) {
      if (caller.roles.includes(RoleCode.OFFICIAL) && caller.officialId) {
        query.andWhere('appointments.official_id', caller.officialId);
      } else if (
        (caller.roles.includes(RoleCode.PA) || caller.roles.includes(RoleCode.EA)) &&
        caller.assignedOfficialIds &&
        caller.assignedOfficialIds.length > 0
      ) {
        query.whereIn('appointments.official_id', caller.assignedOfficialIds);
      } else if (
        caller.roles.includes(RoleCode.EMPLOYEE) ||
        caller.roles.includes(RoleCode.GUEST)
      ) {
        query.andWhere((qb) => {
          qb.where('appointments.requester_user_id', caller.id)
            .orWhere('visits.email', caller.email);
        });
      }
    }

    const row = await query.first();
    if (!row) return null;

    return this.mapRowToDto(row, isRestricted);
  }

  /**
   * Look up visit by QR token (hashed with sha256)
   */
  async lookupByQrToken(
    qrToken: string,
    orgId: string,
    caller: AuthUser,
    trx = db,
  ): Promise<VisitDto | null> {
    const hash = crypto.createHash('sha256').update(qrToken.trim()).digest('hex');
    const isRestricted = this.isReceptionOrSecurityOnly(caller.roles);

    const row = await this.buildBaseQuery(trx)
      .where('visits.qr_token_hash', hash)
      .andWhere('visits.org_id', orgId)
      .first();

    if (!row) return null;
    return this.mapRowToDto(row, isRestricted);
  }

  /**
   * Look up visit by text query (reference_no, visitor_name, phone)
   */
  async lookupByQuery(
    search: string,
    orgId: string,
    caller: AuthUser,
    trx = db,
  ): Promise<VisitDto[]> {
    const term = `%${search.trim()}%`;
    const isRestricted = this.isReceptionOrSecurityOnly(caller.roles);

    const rows = await this.buildBaseQuery(trx)
      .where('visits.org_id', orgId)
      .andWhere((qb) => {
        qb.whereILike('visits.reference_no', term)
          .orWhereILike('visits.visitor_name', term)
          .orWhereILike('visits.phone', term)
          .orWhereILike('visits.badge_no', term);
      })
      .orderBy('appointments.start_at', 'asc')
      .limit(10);

    return rows.map((r) => this.mapRowToDto(r, isRestricted));
  }

  /**
   * Query visits list with filters
   */
  async listVisits(
    filters: VisitQuery,
    orgId: string,
    caller: AuthUser,
    trx = db,
  ): Promise<{ visits: VisitDto[]; total: number }> {
    const isRestricted = this.isReceptionOrSecurityOnly(caller.roles);
    const query = this.buildBaseQuery(trx).where('visits.org_id', orgId);

    // Apply role-based scoping
    if (!caller.roles.includes(RoleCode.SUPER_ADMIN) && !isRestricted) {
      if (caller.roles.includes(RoleCode.OFFICIAL) && caller.officialId) {
        query.andWhere('appointments.official_id', caller.officialId);
      } else if (
        (caller.roles.includes(RoleCode.PA) || caller.roles.includes(RoleCode.EA)) &&
        caller.assignedOfficialIds &&
        caller.assignedOfficialIds.length > 0
      ) {
        query.whereIn('appointments.official_id', caller.assignedOfficialIds);
      } else if (
        caller.roles.includes(RoleCode.EMPLOYEE) ||
        caller.roles.includes(RoleCode.GUEST)
      ) {
        query.andWhere((qb) => {
          qb.where('appointments.requester_user_id', caller.id)
            .orWhere('visits.email', caller.email);
        });
      }
    }

    if (filters.officialId) {
      query.andWhere('appointments.official_id', filters.officialId);
    }

    if (filters.status) {
      query.andWhere('visits.status', filters.status);
    }

    if (filters.search) {
      const term = `%${filters.search.trim()}%`;
      query.andWhere((qb) => {
        qb.whereILike('visits.reference_no', term)
          .orWhereILike('visits.visitor_name', term)
          .orWhereILike('visits.phone', term)
          .orWhereILike('visits.organization', term)
          .orWhereILike('visits.badge_no', term);
      });
    }

    // Date filtering (defaults to given date or full day if provided)
    if (filters.date) {
      const startOfDay = DateTime.fromISO(filters.date, { zone: 'utc' }).startOf('day').toJSDate();
      const endOfDay = DateTime.fromISO(filters.date, { zone: 'utc' }).endOf('day').toJSDate();
      query.andWhereBetween('appointments.start_at', [startOfDay, endOfDay]);
    }

    // Next X hours filtering (e.g. next 2h for Reception "Expected" column)
    if (filters.nextHours) {
      const now = new Date();
      const future = new Date(now.getTime() + filters.nextHours * 60 * 60 * 1000);
      query.andWhereBetween('appointments.start_at', [now, future]);
    }

    // Order by appointment start time
    query.orderBy('appointments.start_at', 'asc');

    const rows = await query;
    const visits = rows.map((r) => this.mapRowToDto(r, isRestricted));

    return {
      visits,
      total: visits.length,
    };
  }

  /**
   * Get all active visitors for emergency evacuation roster (§15.4)
   * Grouped by building and floor
   */
  async getEmergencyList(orgId: string, trx = db): Promise<EmergencyGroupDto[]> {
    const rows = await this.buildBaseQuery(trx)
      .where('visits.org_id', orgId)
      .whereIn('visits.status', [VisitStatus.CHECKED_IN, VisitStatus.WITH_HOST])
      .orderBy('rooms.building', 'asc')
      .orderBy('rooms.floor', 'asc')
      .orderBy('visits.checked_in_at', 'asc');

    const groupsMap = new Map<string, { building: string; floor: string; visitors: any[] }>();

    for (const r of rows) {
      const building = r.building || 'Main Building';
      const floor = r.floor || 'Ground Floor';
      const key = `${building}::${floor}`;

      if (!groupsMap.has(key)) {
        groupsMap.set(key, { building, floor, visitors: [] });
      }

      groupsMap.get(key)!.visitors.push({
        id: r.id,
        referenceNo: r.reference_no,
        visitorName: r.visitor_name,
        phone: r.phone || undefined,
        organization: r.organization || undefined,
        badgeNo: r.badge_no || undefined,
        checkedInAt: r.checked_in_at ? new Date(r.checked_in_at).toISOString() : undefined,
        status: r.status,
        hostOfficialName: r.host_official_name || undefined,
        roomName: r.room_name || undefined,
        building: r.building || undefined,
        floor: r.floor || undefined,
      });
    }

    return Array.from(groupsMap.values()).map((g) => ({
      building: g.building,
      floor: g.floor,
      visitors: g.visitors,
      count: g.visitors.length,
    }));
  }
}

export const visitsRepo = new VisitsRepo();
