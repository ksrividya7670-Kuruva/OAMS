import { db } from '../../core/db.js';
import { TerminalStatuses, type AppointmentStatus } from '@oams/shared';

export interface DuplicateResult {
  id: string;
  reference_no: string;
  subject: string;
  submitted_at: Date | string | null;
  status: AppointmentStatus;
  preferred_windows: any;
  start_at: Date | string | null;
}

export class AppointmentsRepo {
  /**
   * Finds active appointments for the same requester and official to evaluate duplicate rules (§9.1)
   */
  async findActiveAppointmentsForRequesterAndOfficial(
    requesterUserId: string,
    officialId: string,
  ): Promise<DuplicateResult[]> {
    const rows = await db('appointments')
      .where('primary_official_id', officialId)
      .where('requester_user_id', requesterUserId)
      .whereNotIn('status', TerminalStatuses as any)
      .select(
        'id',
        'reference_no',
        'subject',
        'submitted_at',
        'status',
        'preferred_windows',
        'start_at',
      );

    return rows;
  }

  async getById(id: string, orgId?: string) {
    let q = db('appointments').where('id', id);
    if (orgId) {
      q = q.where('org_id', orgId);
    }
    return q.first();
  }

  async getByReferenceNo(referenceNo: string, orgId?: string) {
    let q = db('appointments').where('reference_no', referenceNo);
    if (orgId) {
      q = q.where('org_id', orgId);
    }
    return q.first();
  }

  async listByRequester(requesterUserId: string, orgId?: string) {
    let q = db('appointments')
      .where('requester_user_id', requesterUserId)
      .orderBy('created_at', 'desc');

    if (orgId) {
      q = q.where('org_id', orgId);
    }
    return q;
  }

  async getAttendees(appointmentId: string) {
    return db('appointment_attendees')
      .where('appointment_id', appointmentId)
      .orderBy('created_at', 'asc');
  }

  async getOfficials(appointmentId: string) {
    return db('appointment_officials')
      .join('officials', 'appointment_officials.official_id', 'officials.id')
      .join('users', 'officials.user_id', 'users.id')
      .leftJoin('departments', 'officials.department_id', 'departments.id')
      .where('appointment_officials.appointment_id', appointmentId)
      .select(
        'appointment_officials.*',
        'officials.title as official_title',
        'users.full_name as official_name',
        'departments.name as department_name',
      );
  }

  async getStatusHistory(appointmentId: string) {
    return db('appointment_status_history')
      .leftJoin('users', 'appointment_status_history.actor_id', 'users.id')
      .where('appointment_id', appointmentId)
      .orderBy('at', 'asc')
      .select('appointment_status_history.*', 'users.full_name as actor_name');
  }

  async getAttachments(appointmentId: string) {
    return db('attachments').where('owner_type', 'APPOINTMENT').where('owner_id', appointmentId);
  }

  async getProposals(appointmentId: string) {
    return db('appointment_proposals')
      .leftJoin('rooms', 'appointment_proposals.room_id', 'rooms.id')
      .where('appointment_proposals.appointment_id', appointmentId)
      .select('appointment_proposals.*', 'rooms.name as room_name')
      .orderBy('appointment_proposals.start_at', 'asc');
  }

  async listInbox(params: {
    orgId: string;
    assignedToUserId?: string;
    officialIds?: string[];
    status?: string;
    priority?: string;
    q?: string;
  }) {
    let q = db('appointments')
      .join('officials', 'appointments.primary_official_id', 'officials.id')
      .join('users as official_users', 'officials.user_id', 'official_users.id')
      .join('users as requester_users', 'appointments.requester_user_id', 'requester_users.id')
      .leftJoin('users as assigned_users', 'appointments.assigned_to_user_id', 'assigned_users.id')
      .leftJoin('rooms', 'appointments.room_id', 'rooms.id')
      .where('appointments.org_id', params.orgId);

    if (params.status) {
      q = q.where('appointments.status', params.status);
    } else {
      q = q.whereIn('appointments.status', [
        'UNDER_REVIEW',
        'AWAITING_REQUESTER',
        'INFO_REQUESTED',
        'PENDING_APPROVAL',
      ]);
    }

    if (params.assignedToUserId) {
      q = q.where('appointments.assigned_to_user_id', params.assignedToUserId);
    }

    if (params.officialIds && params.officialIds.length > 0) {
      q = q.whereIn('appointments.primary_official_id', params.officialIds);
    }

    if (params.priority) {
      q = q.where('appointments.priority', params.priority);
    }

    if (params.q) {
      const search = `%${params.q.toLowerCase()}%`;
      q = q.where((builder) => {
        builder
          .whereILike('appointments.reference_no', search)
          .orWhereILike('appointments.subject', search)
          .orWhereILike('requester_users.full_name', search);
      });
    }

    return q.select(
      'appointments.*',
      'officials.title as official_title',
      'official_users.full_name as official_name',
      'requester_users.full_name as requester_name',
      'requester_users.email as requester_email',
      'assigned_users.full_name as assigned_to_name',
      'rooms.name as room_name',
    ).orderByRaw(`
        CASE appointments.priority
          WHEN 'URGENT' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
          ELSE 5
        END ASC,
        appointments.sla_due_at ASC NULLS LAST
      `);
  }

  async listPendingApprovals(officialId: string, orgId?: string) {
    let q = db('appointments')
      .join('appointment_officials', 'appointments.id', 'appointment_officials.appointment_id')
      .join('users as requester_users', 'appointments.requester_user_id', 'requester_users.id')
      .leftJoin('rooms', 'appointments.room_id', 'rooms.id')
      .where('appointment_officials.official_id', officialId)
      .where('appointments.status', 'PENDING_APPROVAL');

    if (orgId) {
      q = q.where('appointments.org_id', orgId);
    }

    return q.select(
      'appointments.*',
      'appointment_officials.decision as official_decision',
      'requester_users.full_name as requester_name',
      'requester_users.email as requester_email',
      'rooms.name as room_name',
    );
  }
}

export const appointmentsRepo = new AppointmentsRepo();
