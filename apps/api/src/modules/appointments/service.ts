import crypto from 'crypto';
import { db } from '../../core/db.js';
import { appointmentsRepo } from './repo.js';
import { resolveAssignee } from './routing.js';
import { calculateSlaDueDate } from './sla.js';
import { generateReferenceNumber } from '../../core/utils/referenceNumber.js';
import { writeAuditEvent } from '../../core/audit/auditWriter.js';
import { writeOutboxEvent } from '../../core/outbox/outboxWriter.js';
import { routeNotificationEvent } from '../../core/notifications/router.js';
import { assertCan } from '../../core/rbac/can.js';
import { validateTransition } from './state-machine.js';
import { schedulingEngine } from '../scheduling/engine.js';
import { calendarSyncService } from '../calendars/syncService.js';
import {
  ApiError,
  ConflictCode,
  Priority,
  AppointmentStatus,
  Visibility,
  Requirement,
  OfficialDecision,
  RoleCode,
  Permission,
  MeetingMode,
  submitAppointmentSchema,
  type AttendeeInput,
  type AuthUser,
  type SubmitAppointmentInput,
  type AppointmentDraftInput,
  type DuplicateCheckInput,
  type DuplicateCheckResponse,
  type AppointmentDetailDto,
  type AppointmentListItemDto,
  type AppointmentStatusHistoryDto,
  type AppointmentInboxItemDto,
  type AppointmentProposalDto,
  type RequestInfoInput,
  type RespondInfoInput,
  type ProposeTimesInput,
  type AcceptProposalInput,
  type DeclineProposalsInput,
  type ScheduleAppointmentInput,
  type ApproveAppointmentInput,
  type RejectAppointmentInput,
  type SuggestOtherInput,
  type ChangePriorityInput,
  ChangeRequestStatus,
  type CreateChangeRequestInput,
  type ChangeRequestDto,
  type ProposeChangeRequestSlotsInput,
  type AcceptChangeRequestProposalInput,
  type RescheduleAppointmentInput,
  type RemoveOfficialInput,
  type CancelAppointmentStaffInput,
} from '@oams/shared';
import { logger } from '../../core/logger.js';

export class AppointmentsService {
  /**
   * Pre-submission duplicate check (§9.1)
   * - warn if requester has active appointment with same official within 7 days
   * - block if that duplicate was submitted in the last 24h with the same subject
   */
  async checkDuplicate(
    requesterUserId: string,
    input: DuplicateCheckInput,
  ): Promise<DuplicateCheckResponse> {
    const activeAppointments = await appointmentsRepo.findActiveAppointmentsForRequesterAndOfficial(
      requesterUserId,
      input.officialId,
    );

    if (!activeAppointments || activeAppointments.length === 0) {
      return { isDuplicate: false, isBlocked: false, isWarning: false };
    }

    const proposedDate = new Date(input.preferredDate);
    const now = new Date();
    const normalizedSubject = input.subject.trim().toLowerCase();

    for (const apt of activeAppointments) {
      // Find candidate dates for this existing appointment
      const dates: Date[] = [];
      if (apt.start_at) {
        dates.push(new Date(apt.start_at));
      }
      if (apt.preferred_windows) {
        const windows =
          typeof apt.preferred_windows === 'string'
            ? JSON.parse(apt.preferred_windows)
            : apt.preferred_windows;
        if (Array.isArray(windows)) {
          for (const w of windows) {
            if (w.date) dates.push(new Date(w.date));
          }
        }
      }

      // Check if any date is within 7 days of proposedDate
      const isWithin7Days = dates.some((d) => {
        const diffMs = Math.abs(d.getTime() - proposedDate.getTime());
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        return diffDays <= 7;
      });

      if (isWithin7Days) {
        // Check if submitted within last 24h with same subject (§9.1)
        const submittedTime = apt.submitted_at ? new Date(apt.submitted_at).getTime() : 0;
        const isWithin24h = now.getTime() - submittedTime <= 24 * 60 * 60 * 1000;
        const isSameSubject = (apt.subject || '').trim().toLowerCase() === normalizedSubject;

        if (isWithin24h && isSameSubject) {
          return {
            isDuplicate: true,
            isBlocked: true,
            isWarning: false,
            message:
              'Duplicate request submitted in the last 24h with the same subject is blocked (§9.1)',
            existingAppointmentId: apt.id,
            existingReferenceNo: apt.reference_no,
          };
        }

        return {
          isDuplicate: true,
          isBlocked: false,
          isWarning: true,
          message: `You already have an active appointment request (${apt.reference_no}) with this official within 7 days (§9.1).`,
          existingAppointmentId: apt.id,
          existingReferenceNo: apt.reference_no,
        };
      }
    }

    return { isDuplicate: false, isBlocked: false, isWarning: false };
  }

  /**
   * Save or auto-save appointment draft (§9)
   */
  async saveDraft(user: AuthUser, input: AppointmentDraftInput): Promise<{ id: string }> {
    const isGuest = user.roles.includes(RoleCode.GUEST);
    const visibility = isGuest ? Visibility.INTERNAL : input.visibility || Visibility.INTERNAL;

    if (input.id) {
      const existing = await appointmentsRepo.getById(input.id, user.orgId);
      if (!existing) {
        throw ApiError.notFound('Draft appointment not found');
      }
      if (existing.requester_user_id !== user.id) {
        throw ApiError.forbidden('Cannot modify drafts created by another user');
      }
      if (existing.status !== AppointmentStatus.DRAFT) {
        throw ApiError.stateConflict('Cannot modify appointment that is already submitted');
      }

      await db('appointments')
        .where('id', input.id)
        .update({
          primary_official_id: input.officialId || existing.primary_official_id,
          subject: input.subject || existing.subject,
          purpose: input.purpose || existing.purpose,
          description: input.description || existing.description,
          priority: input.priority || existing.priority,
          priority_reason: input.priorityReason ?? existing.priority_reason,
          meeting_mode: input.meetingMode || existing.meeting_mode,
          visibility,
          duration_min: input.durationMin || existing.duration_min,
          attendee_count: (input.attendees?.length || 0) + 1,
          preferred_windows: JSON.stringify(input.preferredWindows || []),
          updated_at: db.fn.now(),
          updated_by: user.id,
        });

      return { id: input.id };
    }

    // Insert new draft
    const tempRef = `DRAFT-${Date.now().toString().slice(-6)}`;
    const [inserted] = await db('appointments')
      .insert({
        org_id: user.orgId,
        reference_no: tempRef,
        requester_user_id: user.id,
        requester_type: isGuest ? 'VISITOR' : 'EMPLOYEE',
        requester_snapshot: JSON.stringify({
          name: user.fullName,
          email: user.email,
        }),
        primary_official_id: input.officialId,
        subject: input.subject || 'Draft Appointment',
        purpose: input.purpose || 'BUSINESS_DISCUSSION',
        description: input.description || 'Draft description',
        priority: input.priority || Priority.MEDIUM,
        priority_reason: input.priorityReason || null,
        meeting_mode: input.meetingMode || 'IN_PERSON',
        visibility,
        duration_min: input.durationMin || 30,
        attendee_count: (input.attendees?.length || 0) + 1,
        preferred_windows: JSON.stringify(input.preferredWindows || []),
        status: AppointmentStatus.DRAFT,
        status_changed_at: db.fn.now(),
        created_by: user.id,
      })
      .returning('id');

    return { id: inserted.id || inserted };
  }

  /**
   * Submit appointment request with full auto-checks, SLA, auto-routing, consent, and transaction (§9, §10.1, §10.4)
   */
  async submit(
    user: AuthUser,
    input: SubmitAppointmentInput,
    correlationId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{
    id: string;
    referenceNo: string;
    slaDueAt: Date;
    status: AppointmentStatus;
  }> {
    // 1. Invariant & Validation Checks via Zod Schema
    const valid = submitAppointmentSchema.parse(input);

    if (
      valid.priority === Priority.URGENT &&
      !user.roles.some(
        (r) =>
          r === RoleCode.SUPER_ADMIN ||
          r === RoleCode.APPOINTMENT_ADMIN ||
          r === RoleCode.PA ||
          r === RoleCode.EA,
      )
    ) {
      throw ApiError.forbidden('Only authorized staff may request urgent priority');
    }

    const isGuest = user.roles.includes(RoleCode.GUEST);
    const visibility = isGuest ? Visibility.INTERNAL : valid.visibility;

    // 2. Synchronous Auto-Checks (§10.4)
    // Check 2.1: Duplicate check
    const preferredDate = valid.preferredWindows[0]?.date;
    if (preferredDate) {
      const dupCheck = await this.checkDuplicate(user.id, {
        officialId: valid.officialId,
        subject: valid.subject,
        preferredDate,
      });

      if (dupCheck.isBlocked) {
        throw ApiError.conflict(
          dupCheck.message || 'Duplicate request submitted in the last 24h with the same subject',
          ConflictCode.DUPLICATE_REQUEST,
        );
      }
    }

    // Check 2.2: Official exists and is active
    const official = await db('officials')
      .join('users', 'officials.user_id', 'users.id')
      .leftJoin('departments', 'officials.department_id', 'departments.id')
      .where('officials.id', valid.officialId)
      .select(
        'officials.*',
        'users.full_name as official_name',
        'departments.name as department_name',
      )
      .first();

    if (!official || !official.is_active) {
      throw ApiError.badRequest(
        'Selected official is not active or not available for appointments',
      );
    }

    // 3. Resolve Auto-Routing (§10.3)
    const assignedToUserId = await resolveAssignee(valid.officialId);

    // 4. Calculate Working Hours SLA (§9, §24 Q8)
    const holidayRows = await db('holidays')
      .where('org_id', user.orgId)
      .where('is_optional', false)
      .select('date');
    const holidayDates = holidayRows.map((h) =>
      typeof h.date === 'string' ? h.date : h.date.toISOString().substring(0, 10),
    );

    const submittedAt = new Date();
    const slaDueAt = calculateSlaDueDate(submittedAt, valid.priority, holidayDates);

    // 5. Execute DB Transaction (§0 rule 6)
    let appointmentId = valid.draftId || '';
    let referenceNo = '';
    let outboxEventPayload: any = null;

    await db.transaction(async (trx) => {
      // Atomic sequential reference number: APT-YYYY-XXXXXX (§4.2)
      referenceNo = await generateReferenceNumber(trx, 'APT');

      const appointmentData = {
        org_id: user.orgId,
        reference_no: referenceNo,
        requester_user_id: user.id,
        requester_type: isGuest ? 'VISITOR' : 'EMPLOYEE',
        requester_snapshot: JSON.stringify({
          name: user.fullName,
          email: user.email,
        }),
        primary_official_id: valid.officialId,
        subject: valid.subject.trim(),
        purpose: valid.purpose,
        description: valid.description.trim(),
        priority: valid.priority,
        priority_reason: valid.priorityReason?.trim() || null,
        meeting_mode: valid.meetingMode,
        visibility,
        duration_min: valid.durationMin,
        attendee_count: (valid.attendees?.length || 0) + 1,
        preferred_windows: JSON.stringify(valid.preferredWindows),
        status: AppointmentStatus.UNDER_REVIEW,
        status_changed_at: trx.fn.now(),
        submitted_at: trx.fn.now(),
        assigned_to_user_id: assignedToUserId,
        sla_due_at: slaDueAt,
        consent_given: true,
        consent_notice_version: valid.consentNoticeVersion,
        parent_appointment_id: valid.parentAppointmentId || null,
        updated_at: trx.fn.now(),
        updated_by: user.id,
      };

      if (valid.draftId) {
        const existingDraft = await trx('appointments')
          .where({ id: valid.draftId, org_id: user.orgId, requester_user_id: user.id })
          .first();

        if (existingDraft) {
          await trx('appointments').where('id', valid.draftId).update(appointmentData);
          appointmentId = valid.draftId;
        } else {
          const [inserted] = await trx('appointments')
            .insert({ ...appointmentData, created_by: user.id })
            .returning('id');
          appointmentId = inserted.id || inserted;
        }
      } else {
        const [inserted] = await trx('appointments')
          .insert({ ...appointmentData, created_by: user.id })
          .returning('id');
        appointmentId = inserted.id || inserted;
      }

      // Record DPDP Notice Consent (§17.6)
      await trx('consents').insert({
        user_id: user.id,
        email: user.email,
        purpose: 'APPOINTMENT_REQUEST',
        notice_version: valid.consentNoticeVersion,
        granted_at: trx.fn.now(),
      });

      // Clear & insert appointment_officials
      await trx('appointment_officials').where('appointment_id', appointmentId).delete();
      await trx('appointment_officials').insert({
        appointment_id: appointmentId,
        official_id: valid.officialId,
        requirement: Requirement.REQUIRED,
        decision: OfficialDecision.PENDING,
      });

      if (valid.additionalOfficials && valid.additionalOfficials.length > 0) {
        for (const addOff of valid.additionalOfficials) {
          if (addOff.officialId !== valid.officialId) {
            await trx('appointment_officials').insert({
              appointment_id: appointmentId,
              official_id: addOff.officialId,
              requirement: addOff.requirement || Requirement.REQUIRED,
              decision: OfficialDecision.PENDING,
            });
          }
        }
      }

      // Clear & insert attendees
      await trx('appointment_attendees').where('appointment_id', appointmentId).delete();
      if (valid.attendees && valid.attendees.length > 0) {
        const attendeeRows = valid.attendees.map((att: AttendeeInput) => ({
          appointment_id: appointmentId,
          name: att.name.trim(),
          email: att.email?.trim() || null,
          phone: att.phone?.trim() || null,
          organization: att.organization?.trim() || null,
          is_external: att.isExternal ?? true,
          needs: att.needs?.trim() || null,
          created_at: trx.fn.now(),
        }));
        await trx('appointment_attendees').insert(attendeeRows);
      }

      // Record Status History transition: DRAFT -> UNDER_REVIEW (§10.2)
      await trx('appointment_status_history').insert({
        appointment_id: appointmentId,
        from_status: input.draftId ? AppointmentStatus.DRAFT : null,
        to_status: AppointmentStatus.UNDER_REVIEW,
        action: 'submit',
        actor_id: user.id,
        note: 'Appointment request submitted by requester',
        at: trx.fn.now(),
      });

      // Audit Trail (§17.4)
      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0] || 'GUEST',
        action: 'appointment.submit',
        entityType: 'appointment',
        entityId: appointmentId,
        changes: {
          status: [input.draftId ? AppointmentStatus.DRAFT : null, AppointmentStatus.UNDER_REVIEW],
          reference_no: referenceNo,
          priority: input.priority,
        },
        correlationId,
        ip,
        userAgent,
      });

      // Domain Event to Outbox (§14.4 T3)
      outboxEventPayload = {
        appointmentId,
        referenceNo,
        requesterUserId: user.id,
        requesterEmail: user.email,
        requesterName: user.fullName,
        officialTitle: official.title,
        subject: input.subject.trim(),
        assignedToUserId,
        priority: input.priority,
      };

      await writeOutboxEvent(trx, {
        orgId: user.orgId,
        eventType: 'AppointmentSubmitted',
        aggregateType: 'appointment',
        aggregateId: appointmentId,
        payload: outboxEventPayload,
      });
    });

    // 6. Real-time Notification Dispatch (§14.1 & §14.4 T3)
    try {
      await routeNotificationEvent({
        id: `event-${Date.now()}`,
        orgId: user.orgId,
        eventType: 'AppointmentSubmitted',
        aggregateType: 'appointment',
        aggregateId: appointmentId,
        payload: outboxEventPayload,
        occurredAt: new Date(),
      });
    } catch (notifErr) {
      logger.warn({ notifErr, appointmentId }, 'Failed to immediately route notification event');
    }

    return {
      id: appointmentId,
      referenceNo,
      slaDueAt,
      status: AppointmentStatus.UNDER_REVIEW,
    };
  }

  /**
   * Requester status view (§9.2, §21)
   * Strictly hides internal notes, which staff member is handling the request,
   * or official's other commitments.
   */
  async getMyAppointment(user: AuthUser, id: string): Promise<AppointmentDetailDto> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    if (apt.requester_user_id !== user.id && !user.roles.includes(RoleCode.SUPER_ADMIN)) {
      throw ApiError.notFound('Appointment not found');
    }

    const officialRow = await db('officials')
      .join('users', 'officials.user_id', 'users.id')
      .leftJoin('departments', 'officials.department_id', 'departments.id')
      .where('officials.id', apt.primary_official_id)
      .select(
        'officials.*',
        'users.full_name as official_name',
        'departments.name as department_name',
      )
      .first();

    const additionalOfficialsRows = await appointmentsRepo.getOfficials(apt.id);
    const additional = additionalOfficialsRows
      .filter((o) => o.official_id !== apt.primary_official_id)
      .map((o) => ({
        id: o.official_id,
        title: o.official_title,
        fullName: o.official_name,
        requirement: o.requirement,
        decision: o.decision,
      }));

    const attendeesRows = await appointmentsRepo.getAttendees(apt.id);
    const attachmentsRows = await appointmentsRepo.getAttachments(apt.id);

    let roomObj = null;
    if (apt.room_id) {
      const room = await db('rooms').where('id', apt.room_id).first();
      if (room) {
        roomObj = {
          id: room.id,
          name: room.name,
          building: room.building,
          floor: room.floor,
        };
      }
    }

    const preferredWindows =
      typeof apt.preferred_windows === 'string'
        ? JSON.parse(apt.preferred_windows)
        : apt.preferred_windows || [];

    const canCancel =
      apt.status !== AppointmentStatus.CLOSED &&
      apt.status !== AppointmentStatus.REJECTED &&
      apt.status !== AppointmentStatus.CANCELLED &&
      apt.status !== AppointmentStatus.NO_SHOW &&
      apt.status !== AppointmentStatus.CHECKED_IN &&
      apt.status !== AppointmentStatus.IN_PROGRESS &&
      apt.status !== AppointmentStatus.COMPLETED;

    return {
      id: apt.id,
      referenceNo: apt.reference_no,
      subject: apt.subject,
      purpose: apt.purpose,
      description: apt.description,
      priority: apt.priority,
      meetingMode: apt.meeting_mode,
      durationMin: apt.duration_min,
      status: apt.status,
      statusChangedAt: new Date(apt.status_changed_at).toISOString(),
      submittedAt: apt.submitted_at ? new Date(apt.submitted_at).toISOString() : null,
      confirmedAt: apt.confirmed_at ? new Date(apt.confirmed_at).toISOString() : null,
      slaDueAt: apt.sla_due_at ? new Date(apt.sla_due_at).toISOString() : null,
      official: {
        id: officialRow?.id || apt.primary_official_id,
        title: officialRow?.title || 'Official',
        fullName: officialRow?.official_name || 'Official',
        departmentName: officialRow?.department_name,
      },
      additionalOfficials: additional,
      preferredWindows,
      startAt: apt.start_at ? new Date(apt.start_at).toISOString() : null,
      endAt: apt.end_at ? new Date(apt.end_at).toISOString() : null,
      timezone: apt.timezone || 'Asia/Kolkata',
      onlineLink: apt.online_link || null,
      room: roomObj,
      attendees: attendeesRows.map((a) => ({
        id: a.id,
        name: a.name,
        organization: a.organization,
        isExternal: Boolean(a.is_external),
      })),
      attachments: attachmentsRows.map((att) => ({
        id: att.id,
        fileName: att.file_name,
        sizeBytes: att.size_bytes,
        mime: att.mime,
      })),
      cancelReason: apt.cancel_reason,
      cancelNote: apt.cancel_note,
      canCancel,
    };
  }

  /**
   * List requester's appointments (§9.2)
   */
  async listMyAppointments(user: AuthUser): Promise<AppointmentListItemDto[]> {
    const rows = await db('appointments')
      .join('officials', 'appointments.primary_official_id', 'officials.id')
      .join('users as official_user', 'officials.user_id', 'official_user.id')
      .where('appointments.requester_user_id', user.id)
      .where('appointments.org_id', user.orgId)
      .orderBy('appointments.created_at', 'desc')
      .select(
        'appointments.*',
        'officials.title as official_title',
        'official_user.full_name as official_name',
      );

    return rows.map((r) => ({
      id: r.id,
      referenceNo: r.reference_no,
      subject: r.subject,
      officialTitle: r.official_title,
      officialName: r.official_name,
      status: r.status,
      priority: r.priority,
      submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : null,
      scheduledStartAt: r.start_at ? new Date(r.start_at).toISOString() : null,
      durationMin: r.duration_min,
      meetingMode: r.meeting_mode,
    }));
  }

  /**
   * Status history timeline for requester (§9.2)
   */
  async getStatusHistory(user: AuthUser, id: string): Promise<AppointmentStatusHistoryDto[]> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt || (apt.requester_user_id !== user.id && !user.roles.includes(RoleCode.SUPER_ADMIN))) {
      throw ApiError.notFound('Appointment not found');
    }

    const rows = await appointmentsRepo.getStatusHistory(id);
    return rows.map((r) => ({
      id: r.id,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      action: r.action,
      actorId: r.actor_id,
      actorName: r.actor_name,
      note: r.note,
      at: new Date(r.at).toISOString(),
    }));
  }

  /**
   * Cancel appointment request by requester or authorized staff (§9.2, §10.2, §22 Track 5)
   * Cancelling releases:
   * 1. Calendar events (status -> CANCELLED)
   * 2. Room bookings (status -> RELEASED)
   * 3. Visits (status -> CANCELLED)
   */
  async cancelAppointment(
    user: AuthUser,
    id: string,
    reason: string,
    note?: string,
    correlationId?: string,
  ): Promise<void> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    const isRequester = apt.requester_user_id === user.id;
    if (!isRequester) {
      assertCan(
        user,
        Permission.APPOINTMENT_CANCEL,
        { orgId: apt.org_id, officialId: apt.primary_official_id },
        false,
      );
    }

    // Terminal statuses cannot be cancelled
    if (
      apt.status === AppointmentStatus.CANCELLED ||
      apt.status === AppointmentStatus.REJECTED ||
      apt.status === AppointmentStatus.NO_SHOW ||
      apt.status === AppointmentStatus.CLOSED ||
      apt.status === AppointmentStatus.COMPLETED
    ) {
      throw ApiError.badRequest('Appointment cannot be cancelled in its current state');
    }

    // Requester cannot cancel if already CHECKED_IN or IN_PROGRESS (§10.2)
    if (
      isRequester &&
      (apt.status === AppointmentStatus.CHECKED_IN || apt.status === AppointmentStatus.IN_PROGRESS)
    ) {
      throw ApiError.badRequest('Requester cannot cancel appointment after visitor check-in');
    }

    const corrId = correlationId || crypto.randomUUID();

    await db.transaction(async (trx) => {
      // 1. Update appointment status
      await trx('appointments')
        .where('id', id)
        .update({
          status: AppointmentStatus.CANCELLED,
          status_changed_at: trx.fn.now(),
          cancel_reason: reason,
          cancel_note: note || null,
          updated_at: trx.fn.now(),
          updated_by: user.id,
        });

      // 2. Release any active calendar events (§22 Track 5)
      await trx('calendar_events')
        .where({ appointment_id: id, status: 'ACTIVE' })
        .update({ status: 'CANCELLED', updated_at: trx.fn.now() });

      // 3. Release any active room bookings (§22 Track 5)
      await trx('room_bookings')
        .where({ appointment_id: id, status: 'ACTIVE' })
        .update({ status: 'RELEASED', updated_at: trx.fn.now() });

      // 4. Mark visits CANCELLED (§22 Track 5)
      await trx('visits')
        .where({ appointment_id: id })
        .whereNotIn('status', ['CANCELLED', 'CHECKED_OUT', 'DENIED'])
        .update({ status: 'CANCELLED', updated_at: trx.fn.now() });

      // 5. Expire any pending change requests
      await trx('change_requests')
        .where({ appointment_id: id })
        .whereIn('status', ['PENDING', 'AWAITING_REQUESTER'])
        .update({ status: 'EXPIRED', updated_at: trx.fn.now() });

      // 6. Record status history
      await trx('appointment_status_history').insert({
        appointment_id: id,
        from_status: apt.status,
        to_status: AppointmentStatus.CANCELLED,
        action: 'cancel',
        actor_id: user.id,
        note: `${isRequester ? 'Cancelled by requester' : 'Cancelled by staff'}: ${reason}`,
        at: trx.fn.now(),
      });

      // 7. Write audit log
      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0] || (isRequester ? 'GUEST' : 'PA'),
        action: 'appointment.cancel',
        entityType: 'appointment',
        entityId: id,
        changes: { status: [apt.status, AppointmentStatus.CANCELLED] },
        reason,
        correlationId: corrId,
      });

      // 8. Write outbox event
      await writeOutboxEvent(trx, {
        orgId: user.orgId,
        eventType: 'AppointmentCancelled',
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          requesterUserId: apt.requester_user_id,
          officialId: apt.primary_official_id,
          reason,
          cancelledBy: user.id,
        },
      });
    });

    try {
      await routeNotificationEvent({
        id: `event-${Date.now()}`,
        orgId: user.orgId,
        eventType: 'AppointmentCancelled',
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          requesterUserId: apt.requester_user_id,
          officialId: apt.primary_official_id,
          reason,
          cancelledBy: user.id,
        },
        occurredAt: new Date(),
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to route AppointmentCancelled notification');
    }
  }

  /**
   * Generate RFC 5545 iCalendar (.ics) string for appointment (§9.2, §21)
   */
  async generateIcs(user: AuthUser, id: string): Promise<string> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt || (apt.requester_user_id !== user.id && !user.roles.includes(RoleCode.SUPER_ADMIN))) {
      throw ApiError.notFound('Appointment not found');
    }

    const officialRow = await db('officials')
      .join('users', 'officials.user_id', 'users.id')
      .where('officials.id', apt.primary_official_id)
      .select('officials.title', 'users.full_name')
      .first();

    const start = apt.start_at ? new Date(apt.start_at) : new Date();
    const end = apt.end_at
      ? new Date(apt.end_at)
      : new Date(start.getTime() + apt.duration_min * 60 * 1000);

    const formatIcsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const officialTitle = officialRow
      ? `${officialRow.title} (${officialRow.full_name})`
      : 'Official';

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//OAMS//Appointment System//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${apt.id}@oams.local`,
      `DTSTAMP:${formatIcsDate(new Date())}`,
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:Meeting with ${officialTitle}: ${apt.subject}`,
      `DESCRIPTION:Appointment Reference: ${apt.reference_no}\\nPurpose: ${apt.purpose}\\n${apt.description}`,
      `STATUS:${apt.status === AppointmentStatus.CONFIRMED ? 'CONFIRMED' : 'TENTATIVE'}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  /**
   * Helper to check if an appointment qualifies as routine (§10.5)
   */
  private async isRoutine(apt: any): Promise<boolean> {
    const official = await db('officials').where('id', apt.primary_official_id).first();
    if (!official || official.approval_mode !== 'STAFF_CONFIRMS_ROUTINE') {
      return false;
    }

    const additionalOfficials = await db('appointment_officials')
      .where('appointment_id', apt.id)
      .whereNot('official_id', apt.primary_official_id);

    return (
      (apt.priority === Priority.LOW || apt.priority === Priority.MEDIUM) &&
      apt.duration_min <= 30 &&
      apt.visibility !== Visibility.CONFIDENTIAL &&
      additionalOfficials.length === 0
    );
  }

  /**
   * List staff review queue inbox items (§19.1 /app/inbox)
   */
  async listInbox(
    user: AuthUser,
    query: {
      status?: string;
      priority?: string;
      q?: string;
      assignedToMe?: boolean;
    },
  ): Promise<AppointmentInboxItemDto[]> {
    const assignedToUserId = query.assignedToMe ? user.id : undefined;
    const officialIds =
      user.assignedOfficialIds && user.assignedOfficialIds.length > 0
        ? user.assignedOfficialIds
        : undefined;

    const rows = await appointmentsRepo.listInbox({
      orgId: user.orgId,
      assignedToUserId,
      officialIds,
      status: query.status,
      priority: query.priority,
      q: query.q,
    });

    return rows.map((r: any) => ({
      id: r.id,
      referenceNo: r.reference_no,
      subject: r.subject,
      purpose: r.purpose,
      requesterName: r.requester_name,
      requesterEmail: r.requester_email,
      requesterType: r.requester_type,
      officialId: r.primary_official_id,
      officialTitle: r.official_title,
      officialName: r.official_name,
      status: r.status,
      priority: r.priority,
      priorityReason: r.priority_reason,
      submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : null,
      slaDueAt: r.sla_due_at ? new Date(r.sla_due_at).toISOString() : null,
      escalationLevel: r.escalation_level ?? 0,
      durationMin: r.duration_min,
      meetingMode: r.meeting_mode,
      assignedToUserId: r.assigned_to_user_id,
      assignedToName: r.assigned_to_name,
      preferredWindows:
        typeof r.preferred_windows === 'string'
          ? JSON.parse(r.preferred_windows)
          : r.preferred_windows || [],
      scheduledStartAt: r.start_at ? new Date(r.start_at).toISOString() : null,
      scheduledEndAt: r.end_at ? new Date(r.end_at).toISOString() : null,
      roomName: r.room_name,
    }));
  }

  /**
   * Get appointment proposals (§10.7)
   */
  async getProposals(user: AuthUser, appointmentId: string): Promise<AppointmentProposalDto[]> {
    const apt = await appointmentsRepo.getById(appointmentId, user.orgId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    if (apt.requester_user_id !== user.id && !user.roles.includes(RoleCode.SUPER_ADMIN)) {
      assertCan(user, Permission.APPOINTMENT_READ, {
        orgId: apt.org_id,
        officialId: apt.primary_official_id,
      });
    }

    const rows = await appointmentsRepo.getProposals(appointmentId);
    return rows.map((p: any) => ({
      id: p.id,
      appointmentId: p.appointment_id,
      startAt: new Date(p.start_at).toISOString(),
      endAt: new Date(p.end_at).toISOString(),
      roomId: p.room_id,
      roomName: p.room_name,
      expiresAt: new Date(p.expires_at).toISOString(),
      chosen: Boolean(p.chosen),
      proposedBy: p.proposed_by,
      createdAt: new Date(p.created_at).toISOString(),
    }));
  }

  /**
   * Request more info from requester (§10.2: UNDER_REVIEW -> INFO_REQUESTED, pauses SLA)
   */
  async requestInfo(
    user: AuthUser,
    id: string,
    input: RequestInfoInput,
    correlationId?: string,
  ): Promise<void> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    assertCan(
      user,
      Permission.APPOINTMENT_REVIEW,
      {
        orgId: apt.org_id,
        officialId: apt.primary_official_id,
      },
      false,
    );

    validateTransition(apt.status, 'requestInfo', { note: input.note });
    const corrId = correlationId || crypto.randomUUID();

    await db.transaction(async (trx) => {
      await trx('appointments').where('id', id).update({
        status: AppointmentStatus.INFO_REQUESTED,
        status_changed_at: trx.fn.now(),
        info_request_note: input.note.trim(),
        sla_paused_at: trx.fn.now(),
        updated_at: trx.fn.now(),
        updated_by: user.id,
      });

      await trx('appointment_status_history').insert({
        appointment_id: id,
        from_status: apt.status,
        to_status: AppointmentStatus.INFO_REQUESTED,
        action: 'requestInfo',
        actor_id: user.id,
        note: input.note.trim(),
        at: trx.fn.now(),
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0] || 'PA',
        action: 'appointment.request_info',
        entityType: 'appointment',
        entityId: id,
        changes: { status: [apt.status, AppointmentStatus.INFO_REQUESTED], note: input.note },
        correlationId: corrId,
      });

      await writeOutboxEvent(trx, {
        orgId: user.orgId,
        eventType: 'InfoRequested',
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          requesterUserId: apt.requester_user_id,
          note: input.note.trim(),
        },
      });
    });

    try {
      await routeNotificationEvent({
        id: `event-${Date.now()}`,
        orgId: user.orgId,
        eventType: 'InfoRequested',
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          requesterUserId: apt.requester_user_id,
          note: input.note.trim(),
        },
        occurredAt: new Date(),
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to route InfoRequested event');
    }
  }

  /**
   * Requester responds to information request (§10.2: INFO_REQUESTED -> UNDER_REVIEW, resumes SLA)
   */
  async respondInfo(
    user: AuthUser,
    id: string,
    input: RespondInfoInput,
    correlationId?: string,
  ): Promise<void> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt || apt.requester_user_id !== user.id) {
      throw ApiError.notFound('Appointment not found');
    }

    validateTransition(apt.status, 'respondInfo', { note: input.note });
    const corrId = correlationId || crypto.randomUUID();

    await db.transaction(async (trx) => {
      // Calculate SLA extension based on elapsed pause time
      let newSlaDueAt = apt.sla_due_at;
      if (apt.sla_paused_at && apt.sla_due_at) {
        const pauseDurationMs = Math.max(0, Date.now() - new Date(apt.sla_paused_at).getTime());
        newSlaDueAt = new Date(new Date(apt.sla_due_at).getTime() + pauseDurationMs);
      }

      await trx('appointments').where('id', id).update({
        status: AppointmentStatus.UNDER_REVIEW,
        status_changed_at: trx.fn.now(),
        sla_due_at: newSlaDueAt,
        sla_paused_at: null,
        updated_at: trx.fn.now(),
        updated_by: user.id,
      });

      await trx('appointment_status_history').insert({
        appointment_id: id,
        from_status: apt.status,
        to_status: AppointmentStatus.UNDER_REVIEW,
        action: 'respondInfo',
        actor_id: user.id,
        note: input.note.trim(),
        at: trx.fn.now(),
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0] || 'GUEST',
        action: 'appointment.respond_info',
        entityType: 'appointment',
        entityId: id,
        changes: { status: [apt.status, AppointmentStatus.UNDER_REVIEW], note: input.note },
        correlationId: corrId,
      });

      await writeOutboxEvent(trx, {
        orgId: user.orgId,
        eventType: 'InfoProvided',
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          assignedToUserId: apt.assigned_to_user_id,
          note: input.note.trim(),
        },
      });
    });

    try {
      await routeNotificationEvent({
        id: `event-${Date.now()}`,
        orgId: user.orgId,
        eventType: 'InfoProvided',
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          assignedToUserId: apt.assigned_to_user_id,
          note: input.note.trim(),
        },
        occurredAt: new Date(),
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to route InfoProvided event');
    }
  }

  /**
   * Propose 1-3 candidate slots with 24h holds (§10.2: UNDER_REVIEW -> AWAITING_REQUESTER)
   */
  async proposeTimes(
    user: AuthUser,
    id: string,
    input: ProposeTimesInput,
    correlationId?: string,
  ): Promise<void> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    assertCan(
      user,
      Permission.APPOINTMENT_REVIEW,
      {
        orgId: apt.org_id,
        officialId: apt.primary_official_id,
      },
      false,
    );

    validateTransition(apt.status, 'proposeTimes', { slotsCount: input.slots.length });

    // Validate that each proposed slot passes conflict checks
    for (const slot of input.slots) {
      const check = await schedulingEngine.checkConflicts(user.orgId, {
        officials: [{ officialId: apt.primary_official_id, requirement: Requirement.REQUIRED }],
        startAt: slot.startAt,
        endAt: slot.endAt,
        roomId: slot.roomId || null,
        priority: apt.priority,
        meetingMode: apt.meeting_mode,
        excludeAppointmentId: apt.id,
        respectMinNotice: true,
      });

      const hardConflict = check.conflicts.find((c) => c.severity === 'HARD');
      if (hardConflict) {
        throw ApiError.badRequest(
          `Proposed slot ${slot.startAt} has a conflict: ${hardConflict.message}`,
        );
      }
    }

    const corrId = correlationId || crypto.randomUUID();

    try {
      await db.transaction(async (trx) => {
        // Find official's ORG calendar
        const officialCalendar = await trx('calendars')
          .where({ official_id: apt.primary_official_id, type: 'ORG' })
          .first();

        const calendarId = officialCalendar ? officialCalendar.id : crypto.randomUUID();
        const holdExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        for (const slot of input.slots) {
          // 1. Insert HOLD event into calendar_events
          const [holdEvent] = await trx('calendar_events')
            .insert({
              org_id: apt.org_id,
              calendar_id: calendarId,
              official_id: apt.primary_official_id,
              kind: 'HOLD',
              block_strength: 'HARD',
              title: `Hold: ${apt.subject}`,
              start_at: slot.startAt,
              end_at: slot.endAt,
              occupied_range: trx.raw(`tstzrange(?, ?, '[)')`, [slot.startAt, slot.endAt]),
              appointment_id: apt.id,
              hold_expires_at: holdExpiresAt,
              status: 'ACTIVE',
              visibility: apt.visibility || 'INTERNAL',
              created_by: user.id,
            })
            .returning('*');

          const holdEventId = holdEvent ? holdEvent.id || holdEvent : crypto.randomUUID();

          // 2. Insert into appointment_proposals
          await trx('appointment_proposals').insert({
            appointment_id: apt.id,
            start_at: slot.startAt,
            end_at: slot.endAt,
            room_id: slot.roomId || null,
            hold_event_id: holdEventId,
            proposed_by: user.id,
            expires_at: holdExpiresAt,
            chosen: false,
          });
        }

        // Update appointment status to AWAITING_REQUESTER
        await trx('appointments').where('id', id).update({
          status: AppointmentStatus.AWAITING_REQUESTER,
          status_changed_at: trx.fn.now(),
          updated_at: trx.fn.now(),
          updated_by: user.id,
        });

        await trx('appointment_status_history').insert({
          appointment_id: id,
          from_status: apt.status,
          to_status: AppointmentStatus.AWAITING_REQUESTER,
          action: 'proposeTimes',
          actor_id: user.id,
          note: `Proposed ${input.slots.length} time slots`,
          at: trx.fn.now(),
        });

        await writeAuditEvent(trx, {
          orgId: user.orgId,
          actorId: user.id,
          actorRole: user.roles[0] || 'PA',
          action: 'appointment.propose_times',
          entityType: 'appointment',
          entityId: id,
          changes: {
            status: [apt.status, AppointmentStatus.AWAITING_REQUESTER],
            slotsCount: input.slots.length,
          },
          correlationId: corrId,
        });

        await writeOutboxEvent(trx, {
          orgId: user.orgId,
          eventType: 'TimesProposed',
          aggregateType: 'appointment',
          aggregateId: id,
          payload: {
            appointmentId: id,
            referenceNo: apt.reference_no,
            requesterUserId: apt.requester_user_id,
            slotsCount: input.slots.length,
          },
        });
      });
    } catch (err: any) {
      if (
        err.code === '23P01' ||
        err.message?.includes('exclusion') ||
        err.constraint === 'no_overlap_hard'
      ) {
        throw ApiError.conflict(
          'One of the proposed slots is no longer available (§11.4)',
          ConflictCode.SLOT_TAKEN,
        );
      }
      throw err;
    }

    try {
      await routeNotificationEvent({
        id: `event-${Date.now()}`,
        orgId: user.orgId,
        eventType: 'TimesProposed',
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          requesterUserId: apt.requester_user_id,
          slotsCount: input.slots.length,
        },
        occurredAt: new Date(),
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to route TimesProposed event');
    }
  }

  /**
   * Requester accepts a proposed slot (§10.2: AWAITING_REQUESTER -> PENDING_APPROVAL / CONFIRMED)
   */
  async acceptProposal(
    user: AuthUser,
    id: string,
    input: AcceptProposalInput,
    correlationId?: string,
  ): Promise<void> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt || apt.requester_user_id !== user.id) {
      throw ApiError.notFound('Appointment not found');
    }

    const proposal = await db('appointment_proposals')
      .where({ id: input.proposalId, appointment_id: id })
      .first();

    if (!proposal) {
      throw ApiError.badRequest('Proposed slot not found');
    }

    if (new Date(proposal.expires_at) <= new Date()) {
      throw ApiError.badRequest('This proposed slot has expired');
    }

    const isRoutine = await this.isRoutine(apt);
    const { nextStatus } = validateTransition(apt.status, 'acceptProposal', { isRoutine });
    const corrId = correlationId || crypto.randomUUID();

    try {
      await db.transaction(async (trx) => {
        // 1. Mark chosen proposal
        await trx('appointment_proposals').where('id', input.proposalId).update({ chosen: true });

        // 2. Release other candidate proposals and cancel their HOLD events
        const otherProposals = await trx('appointment_proposals')
          .where('appointment_id', id)
          .whereNot('id', input.proposalId);

        const otherHoldIds = otherProposals.map((p) => p.hold_event_id).filter(Boolean);
        if (otherHoldIds.length > 0) {
          await trx('calendar_events')
            .whereIn('id', otherHoldIds)
            .update({ status: 'CANCELLED', updated_at: trx.fn.now() });
        }

        // 3. Update appointment slot
        const updateData: any = {
          status: nextStatus,
          status_changed_at: trx.fn.now(),
          start_at: proposal.start_at,
          end_at: proposal.end_at,
          room_id: proposal.room_id || null,
          updated_at: trx.fn.now(),
          updated_by: user.id,
        };

        if (nextStatus === AppointmentStatus.CONFIRMED) {
          updateData.confirmed_at = trx.fn.now();

          // Convert chosen hold in-place to APPOINTMENT event (§10.7)
          if (proposal.hold_event_id) {
            await trx('calendar_events').where('id', proposal.hold_event_id).update({
              kind: 'APPOINTMENT',
              hold_expires_at: null,
              updated_at: trx.fn.now(),
              updated_by: user.id,
            });
          }
        }

        await trx('appointments').where('id', id).update(updateData);

        await trx('appointment_status_history').insert({
          appointment_id: id,
          from_status: apt.status,
          to_status: nextStatus,
          action: 'acceptProposal',
          actor_id: user.id,
          note: `Accepted proposal for ${new Date(proposal.start_at).toISOString()}`,
          at: trx.fn.now(),
        });

        await writeAuditEvent(trx, {
          orgId: user.orgId,
          actorId: user.id,
          actorRole: user.roles[0] || 'GUEST',
          action: 'appointment.accept_proposal',
          entityType: 'appointment',
          entityId: id,
          changes: { status: [apt.status, nextStatus], chosenProposalId: input.proposalId },
          correlationId: corrId,
        });

        const eventType =
          nextStatus === AppointmentStatus.CONFIRMED ? 'AppointmentConfirmed' : 'ProposalAccepted';
        await writeOutboxEvent(trx, {
          orgId: user.orgId,
          eventType,
          aggregateType: 'appointment',
          aggregateId: id,
          payload: {
            appointmentId: id,
            referenceNo: apt.reference_no,
            officialId: apt.primary_official_id,
            startAt: proposal.start_at,
            endAt: proposal.end_at,
            nextStatus,
          },
        });
      });
    } catch (err: any) {
      if (
        err.code === '23P01' ||
        err.message?.includes('exclusion') ||
        err.constraint === 'no_overlap_hard'
      ) {
        throw ApiError.conflict(
          'The chosen slot has just been taken by another booking (§11.4)',
          ConflictCode.SLOT_TAKEN,
        );
      }
      throw err;
    }

    try {
      const eventType =
        nextStatus === AppointmentStatus.CONFIRMED ? 'AppointmentConfirmed' : 'ProposalAccepted';
      await routeNotificationEvent({
        id: `event-${Date.now()}`,
        orgId: user.orgId,
        eventType,
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          officialId: apt.primary_official_id,
          startAt: proposal.start_at,
          endAt: proposal.end_at,
        },
        occurredAt: new Date(),
      });

      if (nextStatus === AppointmentStatus.CONFIRMED && apt.meeting_mode === MeetingMode.ONLINE) {
        await calendarSyncService.ensureTeamsMeetingLink(id);
      }
    } catch (e) {
      logger.warn(
        { err: e },
        'Failed to route ProposalAccepted event or ensure Teams meeting link',
      );
    }
  }

  /**
   * Requester declines all proposed slots (§10.2: AWAITING_REQUESTER -> UNDER_REVIEW)
   */
  async declineProposals(
    user: AuthUser,
    id: string,
    input: DeclineProposalsInput,
    correlationId?: string,
  ): Promise<void> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt || apt.requester_user_id !== user.id) {
      throw ApiError.notFound('Appointment not found');
    }

    validateTransition(apt.status, 'declineAll');
    const corrId = correlationId || crypto.randomUUID();

    await db.transaction(async (trx) => {
      // Release all holds
      const proposals = await trx('appointment_proposals').where('appointment_id', id);
      const holdIds = proposals.map((p) => p.hold_event_id).filter(Boolean);

      if (holdIds.length > 0) {
        await trx('calendar_events')
          .whereIn('id', holdIds)
          .update({ status: 'CANCELLED', updated_at: trx.fn.now() });
      }

      await trx('appointments').where('id', id).update({
        status: AppointmentStatus.UNDER_REVIEW,
        status_changed_at: trx.fn.now(),
        updated_at: trx.fn.now(),
        updated_by: user.id,
      });

      await trx('appointment_status_history').insert({
        appointment_id: id,
        from_status: apt.status,
        to_status: AppointmentStatus.UNDER_REVIEW,
        action: 'declineAll',
        actor_id: user.id,
        note: input.note || 'Requester declined all proposed slots',
        at: trx.fn.now(),
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0] || 'GUEST',
        action: 'appointment.decline_proposals',
        entityType: 'appointment',
        entityId: id,
        changes: { status: [apt.status, AppointmentStatus.UNDER_REVIEW] },
        reason: input.note,
        correlationId: corrId,
      });

      await writeOutboxEvent(trx, {
        orgId: user.orgId,
        eventType: 'ProposalDeclined',
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          assignedToUserId: apt.assigned_to_user_id,
          note: input.note,
        },
      });
    });

    try {
      await routeNotificationEvent({
        id: `event-${Date.now()}`,
        orgId: user.orgId,
        eventType: 'ProposalDeclined',
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          assignedToUserId: apt.assigned_to_user_id,
          note: input.note,
        },
        occurredAt: new Date(),
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to route ProposalDeclined event');
    }
  }

  /**
   * Schedule appointment directly (§10.2: UNDER_REVIEW -> PENDING_APPROVAL / CONFIRMED)
   */
  async schedule(
    user: AuthUser,
    id: string,
    input: ScheduleAppointmentInput,
    correlationId?: string,
  ): Promise<void> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    assertCan(
      user,
      Permission.APPOINTMENT_REVIEW,
      {
        orgId: apt.org_id,
        officialId: apt.primary_official_id,
      },
      false,
    );

    // Conflict check
    const check = await schedulingEngine.checkConflicts(user.orgId, {
      officials: [{ officialId: apt.primary_official_id, requirement: Requirement.REQUIRED }],
      startAt: input.startAt,
      endAt: input.endAt,
      roomId: input.roomId || null,
      priority: apt.priority,
      meetingMode: apt.meeting_mode,
      excludeAppointmentId: apt.id,
      respectMinNotice: true,
    });

    const hardConflict = check.conflicts.find((c) => c.severity === 'HARD');
    if (hardConflict) {
      throw ApiError.badRequest(`Selected slot has a conflict: ${hardConflict.message}`);
    }

    const isRoutine = await this.isRoutine(apt);
    const { nextStatus } = validateTransition(apt.status, 'schedule', { isRoutine });
    const corrId = correlationId || crypto.randomUUID();

    try {
      await db.transaction(async (trx) => {
        const officialCalendar = await trx('calendars')
          .where({ official_id: apt.primary_official_id, type: 'ORG' })
          .first();

        const calendarId = officialCalendar ? officialCalendar.id : crypto.randomUUID();

        // Insert calendar event: APPOINTMENT if confirmed, HOLD if pending approval
        const eventKind = nextStatus === AppointmentStatus.CONFIRMED ? 'APPOINTMENT' : 'HOLD';
        const holdExpiresAt =
          nextStatus === AppointmentStatus.CONFIRMED
            ? null
            : new Date(Date.now() + 48 * 60 * 60 * 1000);

        await trx('calendar_events').insert({
          org_id: apt.org_id,
          calendar_id: calendarId,
          official_id: apt.primary_official_id,
          kind: eventKind,
          block_strength: 'HARD',
          title: `${apt.subject}`,
          start_at: input.startAt,
          end_at: input.endAt,
          occupied_range: trx.raw(`tstzrange(?, ?, '[)')`, [input.startAt, input.endAt]),
          appointment_id: apt.id,
          hold_expires_at: holdExpiresAt,
          status: 'ACTIVE',
          visibility: apt.visibility || 'INTERNAL',
          created_by: user.id,
        });

        const updateData: any = {
          status: nextStatus,
          status_changed_at: trx.fn.now(),
          start_at: input.startAt,
          end_at: input.endAt,
          room_id: input.roomId || null,
          updated_at: trx.fn.now(),
          updated_by: user.id,
        };

        if (nextStatus === AppointmentStatus.CONFIRMED) {
          updateData.confirmed_at = trx.fn.now();
        }

        await trx('appointments').where('id', id).update(updateData);

        await trx('appointment_status_history').insert({
          appointment_id: id,
          from_status: apt.status,
          to_status: nextStatus,
          action: 'schedule',
          actor_id: user.id,
          note: `Scheduled for ${new Date(input.startAt).toISOString()}`,
          at: trx.fn.now(),
        });

        await writeAuditEvent(trx, {
          orgId: user.orgId,
          actorId: user.id,
          actorRole: user.roles[0] || 'PA',
          action: 'appointment.schedule',
          entityType: 'appointment',
          entityId: id,
          changes: { status: [apt.status, nextStatus], startAt: input.startAt, endAt: input.endAt },
          correlationId: corrId,
        });

        const eventType =
          nextStatus === AppointmentStatus.CONFIRMED ? 'AppointmentConfirmed' : 'ApprovalRequested';
        await writeOutboxEvent(trx, {
          orgId: user.orgId,
          eventType,
          aggregateType: 'appointment',
          aggregateId: id,
          payload: {
            appointmentId: id,
            referenceNo: apt.reference_no,
            officialId: apt.primary_official_id,
            startAt: input.startAt,
            endAt: input.endAt,
          },
        });
      });
    } catch (err: any) {
      if (
        err.code === '23P01' ||
        err.message?.includes('exclusion') ||
        err.constraint === 'no_overlap_hard'
      ) {
        throw ApiError.conflict(
          'The chosen slot has just been taken by another booking (§11.4)',
          ConflictCode.SLOT_TAKEN,
        );
      }
      throw err;
    }

    try {
      const eventType =
        nextStatus === AppointmentStatus.CONFIRMED ? 'AppointmentConfirmed' : 'ApprovalRequested';
      await routeNotificationEvent({
        id: `event-${Date.now()}`,
        orgId: user.orgId,
        eventType,
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          officialId: apt.primary_official_id,
          startAt: input.startAt,
          endAt: input.endAt,
        },
        occurredAt: new Date(),
      });

      if (nextStatus === AppointmentStatus.CONFIRMED && apt.meeting_mode === MeetingMode.ONLINE) {
        await calendarSyncService.ensureTeamsMeetingLink(id);
      }
    } catch (e) {
      logger.warn({ err: e }, 'Failed to route Schedule notification or ensure Teams meeting link');
    }
  }

  /**
   * Helper to create visits for confirmed appointment (§7.6, §15)
   */
  private async createVisitsForConfirmedAppointment(trx: any, appointment: any): Promise<void> {
    const existingVisits = await trx('visits').where('appointment_id', appointment.id);
    if (existingVisits.length > 0) return;

    const attendees = await trx('appointment_attendees').where('appointment_id', appointment.id);
    const externalAttendees = attendees.filter((a: any) => Boolean(a.is_external));

    const listToCreate =
      externalAttendees.length > 0
        ? externalAttendees
        : [
            {
              name: appointment.requester_snapshot?.name || 'Requester',
              email: appointment.requester_snapshot?.email || null,
              phone: appointment.requester_snapshot?.phone || null,
              organization: appointment.requester_snapshot?.organization || null,
            },
          ];

    for (const att of listToCreate) {
      const refNo = await generateReferenceNumber(trx, 'VIS');
      const qrToken = crypto.randomBytes(32).toString('hex');
      const qrHash = crypto.createHash('sha256').update(qrToken).digest('hex');

      await trx('visits').insert({
        org_id: appointment.org_id,
        appointment_id: appointment.id,
        reference_no: refNo,
        visitor_name: att.name,
        phone: att.phone || null,
        email: att.email || null,
        organization: att.organization || null,
        status: 'EXPECTED',
        qr_token_hash: qrHash,
        party_size: 1,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
    }
  }

  /**
   * Official (or authorized staff) approves appointment (§10.2, §10.5 multi-official rules)
   * If appointment has multiple officials:
   * - Each official records their decision in appointment_officials.
   * - Transitions to CONFIRMED only when ALL REQUIRED officials approve.
   * - OPTIONAL official decisions are informational.
   */
  async approve(
    user: AuthUser,
    id: string,
    input: ApproveAppointmentInput,
    correlationId?: string,
  ): Promise<void> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    const targetOfficialId = input.officialId || user.officialId || apt.primary_official_id;

    assertCan(
      user,
      Permission.APPOINTMENT_APPROVE,
      {
        orgId: apt.org_id,
        officialId: targetOfficialId,
      },
      false,
    );

    validateTransition(apt.status, 'approve');
    const corrId = correlationId || crypto.randomUUID();

    let transitionedToConfirmed = false;

    try {
      await db.transaction(async (trx) => {
        // Record official's approval decision in appointment_officials
        await trx('appointment_officials')
          .where({ appointment_id: id, official_id: targetOfficialId })
          .update({
            decision: OfficialDecision.APPROVED,
            decided_by: user.id,
            decided_at: trx.fn.now(),
            decision_note: input.note || null,
          });

        // Check multi-official consensus (§10.5)
        const allOfficials = await trx('appointment_officials').where('appointment_id', id);
        const requiredOfficials = allOfficials.filter(
          (o: any) => o.requirement === Requirement.REQUIRED,
        );
        const approvedRequiredCount = requiredOfficials.filter(
          (o: any) => o.decision === OfficialDecision.APPROVED,
        ).length;
        const allRequiredApproved =
          requiredOfficials.length === 0 || approvedRequiredCount === requiredOfficials.length;

        if (allRequiredApproved) {
          transitionedToConfirmed = true;

          // Convert any existing HOLD event in calendar_events to APPOINTMENT (§10.7)
          await trx('calendar_events')
            .where({ appointment_id: id, kind: 'HOLD', status: 'ACTIVE' })
            .update({
              kind: 'APPOINTMENT',
              hold_expires_at: null,
              updated_at: trx.fn.now(),
              updated_by: user.id,
            });

          // Ensure room booking exists if room specified (§13)
          if (apt.room_id && apt.start_at && apt.end_at) {
            const existingRoomBooking = await trx('room_bookings')
              .where({ appointment_id: id, status: 'ACTIVE' })
              .first();

            if (!existingRoomBooking) {
              await trx('room_bookings').insert({
                room_id: apt.room_id,
                appointment_id: id,
                start_at: apt.start_at,
                end_at: apt.end_at,
                occupied_range: trx.raw(`tstzrange(?, ?, '[)')`, [apt.start_at, apt.end_at]),
                status: 'ACTIVE',
                created_by: user.id,
              });
            }
          }

          // Create visit records (§7.6, §15)
          await this.createVisitsForConfirmedAppointment(trx, apt);

          // Update appointment status to CONFIRMED
          await trx('appointments').where('id', id).update({
            status: AppointmentStatus.CONFIRMED,
            status_changed_at: trx.fn.now(),
            confirmed_at: trx.fn.now(),
            updated_at: trx.fn.now(),
            updated_by: user.id,
          });

          await trx('appointment_status_history').insert({
            appointment_id: id,
            from_status: apt.status,
            to_status: AppointmentStatus.CONFIRMED,
            action: 'approve',
            actor_id: user.id,
            note: input.note || 'All required officials approved. Appointment confirmed.',
            at: trx.fn.now(),
          });

          await writeAuditEvent(trx, {
            orgId: user.orgId,
            actorId: user.id,
            actorRole: user.roles[0] || 'OFFICIAL',
            action: 'appointment.approve',
            entityType: 'appointment',
            entityId: id,
            changes: { status: [apt.status, AppointmentStatus.CONFIRMED] },
            reason: input.note,
            correlationId: corrId,
          });

          await writeOutboxEvent(trx, {
            orgId: user.orgId,
            eventType: 'AppointmentConfirmed',
            aggregateType: 'appointment',
            aggregateId: id,
            payload: {
              appointmentId: id,
              referenceNo: apt.reference_no,
              officialId: apt.primary_official_id,
              requesterUserId: apt.requester_user_id,
              startAt: apt.start_at,
              endAt: apt.end_at,
            },
          });
        } else {
          // Appointment remains in PENDING_APPROVAL awaiting other required officials
          await trx('appointment_status_history').insert({
            appointment_id: id,
            from_status: apt.status,
            to_status: apt.status,
            action: 'approve',
            actor_id: user.id,
            note: `Official approved (${approvedRequiredCount}/${requiredOfficials.length} required approvals received).`,
            at: trx.fn.now(),
          });

          await writeAuditEvent(trx, {
            orgId: user.orgId,
            actorId: user.id,
            actorRole: user.roles[0] || 'OFFICIAL',
            action: 'appointment.approve_partial',
            entityType: 'appointment',
            entityId: id,
            changes: { approvedOfficialId: targetOfficialId },
            reason: input.note,
            correlationId: corrId,
          });
        }
      });
    } catch (err: any) {
      if (
        err.code === '23P01' ||
        err.message?.includes('exclusion') ||
        err.constraint === 'no_overlap_hard' ||
        err.constraint === 'no_overlap_room'
      ) {
        throw ApiError.conflict(
          'The chosen slot has just been taken by another booking (§11.4)',
          ConflictCode.SLOT_TAKEN,
        );
      }
      throw err;
    }

    if (transitionedToConfirmed) {
      try {
        await routeNotificationEvent({
          id: `event-${Date.now()}`,
          orgId: user.orgId,
          eventType: 'AppointmentConfirmed',
          aggregateType: 'appointment',
          aggregateId: id,
          payload: {
            appointmentId: id,
            referenceNo: apt.reference_no,
            officialId: apt.primary_official_id,
            requesterUserId: apt.requester_user_id,
            startAt: apt.start_at,
            endAt: apt.end_at,
          },
          occurredAt: new Date(),
        });

        if (apt.meeting_mode === MeetingMode.ONLINE) {
          await calendarSyncService.ensureTeamsMeetingLink(id);
        }
      } catch (e) {
        logger.warn(
          { err: e },
          'Failed to route AppointmentConfirmed notification or ensure Teams meeting link',
        );
      }
    }
  }

  /**
   * Remove an official from a multi-official appointment (§10.5)
   * If removing leaves all remaining required officials approved, moves to CONFIRMED.
   */
  async removeOfficial(
    user: AuthUser,
    id: string,
    officialId: string,
    input: RemoveOfficialInput,
    correlationId?: string,
  ): Promise<void> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    assertCan(
      user,
      Permission.APPOINTMENT_REVIEW,
      { orgId: apt.org_id, officialId: apt.primary_official_id },
      false,
    );

    if (officialId === apt.primary_official_id) {
      throw ApiError.badRequest('Cannot remove the primary official from an appointment');
    }

    const corrId = correlationId || crypto.randomUUID();
    let becameConfirmed = false;

    await db.transaction(async (trx) => {
      const deleted = await trx('appointment_officials')
        .where({ appointment_id: id, official_id: officialId })
        .del();

      if (!deleted) {
        throw ApiError.notFound('Official not found on this appointment');
      }

      // Cancel any holds for this removed official
      await trx('calendar_events')
        .where({ appointment_id: id, official_id: officialId, status: 'ACTIVE' })
        .update({ status: 'CANCELLED', updated_at: trx.fn.now() });

      // Check remaining required officials
      const remainingOfficials = await trx('appointment_officials').where('appointment_id', id);
      const remainingRequired = remainingOfficials.filter(
        (o: any) => o.requirement === Requirement.REQUIRED,
      );
      const allApproved =
        remainingRequired.length > 0 &&
        remainingRequired.every((o: any) => o.decision === OfficialDecision.APPROVED);

      let nextStatus = apt.status;
      if (apt.status === AppointmentStatus.PENDING_APPROVAL && allApproved) {
        nextStatus = AppointmentStatus.CONFIRMED;
        becameConfirmed = true;

        await trx('appointments').where('id', id).update({
          status: AppointmentStatus.CONFIRMED,
          status_changed_at: trx.fn.now(),
          confirmed_at: trx.fn.now(),
          updated_at: trx.fn.now(),
          updated_by: user.id,
        });

        await trx('calendar_events')
          .where({ appointment_id: id, kind: 'HOLD', status: 'ACTIVE' })
          .update({
            kind: 'APPOINTMENT',
            hold_expires_at: null,
            updated_at: trx.fn.now(),
            updated_by: user.id,
          });

        if (apt.room_id && apt.start_at && apt.end_at) {
          const existingRoomBooking = await trx('room_bookings')
            .where({ appointment_id: id, status: 'ACTIVE' })
            .first();

          if (!existingRoomBooking) {
            await trx('room_bookings').insert({
              room_id: apt.room_id,
              appointment_id: id,
              start_at: apt.start_at,
              end_at: apt.end_at,
              occupied_range: trx.raw(`tstzrange(?, ?, '[)')`, [apt.start_at, apt.end_at]),
              status: 'ACTIVE',
              created_by: user.id,
            });
          }
        }

        await this.createVisitsForConfirmedAppointment(trx, apt);
      }

      await trx('appointment_status_history').insert({
        appointment_id: id,
        from_status: apt.status,
        to_status: nextStatus,
        action: 'removeOfficial',
        actor_id: user.id,
        note: `Removed official: ${input.reason}`,
        at: trx.fn.now(),
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0] || 'PA',
        action: 'appointment.remove_official',
        entityType: 'appointment',
        entityId: id,
        changes: { removedOfficialId: officialId, reason: input.reason },
        correlationId: corrId,
      });

      if (becameConfirmed) {
        await writeOutboxEvent(trx, {
          orgId: user.orgId,
          eventType: 'AppointmentConfirmed',
          aggregateType: 'appointment',
          aggregateId: id,
          payload: {
            appointmentId: id,
            referenceNo: apt.reference_no,
            officialId: apt.primary_official_id,
            requesterUserId: apt.requester_user_id,
            startAt: apt.start_at,
            endAt: apt.end_at,
          },
        });
      }
    });

    if (becameConfirmed) {
      try {
        await routeNotificationEvent({
          id: `event-${Date.now()}`,
          orgId: user.orgId,
          eventType: 'AppointmentConfirmed',
          aggregateType: 'appointment',
          aggregateId: id,
          payload: {
            appointmentId: id,
            referenceNo: apt.reference_no,
            officialId: apt.primary_official_id,
            requesterUserId: apt.requester_user_id,
            startAt: apt.start_at,
            endAt: apt.end_at,
          },
          occurredAt: new Date(),
        });
      } catch (e) {
        logger.warn({ err: e }, 'Failed to route AppointmentConfirmed notification');
      }
    }
  }

  /**
   * Reject appointment (§10.2: UNDER_REVIEW / PENDING_APPROVAL -> REJECTED)
   */
  async reject(
    user: AuthUser,
    id: string,
    input: RejectAppointmentInput,
    correlationId?: string,
  ): Promise<void> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    if (apt.status === AppointmentStatus.UNDER_REVIEW) {
      assertCan(
        user,
        Permission.APPOINTMENT_REVIEW,
        { orgId: apt.org_id, officialId: apt.primary_official_id },
        false,
      );
    } else {
      assertCan(
        user,
        Permission.APPOINTMENT_APPROVE,
        { orgId: apt.org_id, officialId: apt.primary_official_id },
        false,
      );
    }

    validateTransition(apt.status, 'reject', { reason: input.reason });
    const corrId = correlationId || crypto.randomUUID();

    await db.transaction(async (trx) => {
      // Release any active holds
      await trx('calendar_events')
        .where({ appointment_id: id, kind: 'HOLD', status: 'ACTIVE' })
        .update({ status: 'CANCELLED', updated_at: trx.fn.now() });

      await trx('appointments').where('id', id).update({
        status: AppointmentStatus.REJECTED,
        status_changed_at: trx.fn.now(),
        cancel_reason: input.reason.trim(),
        updated_at: trx.fn.now(),
        updated_by: user.id,
      });

      await trx('appointment_status_history').insert({
        appointment_id: id,
        from_status: apt.status,
        to_status: AppointmentStatus.REJECTED,
        action: 'reject',
        actor_id: user.id,
        note: input.reason.trim(),
        at: trx.fn.now(),
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0] || 'PA',
        action: 'appointment.reject',
        entityType: 'appointment',
        entityId: id,
        changes: { status: [apt.status, AppointmentStatus.REJECTED], reason: input.reason },
        correlationId: corrId,
      });

      await writeOutboxEvent(trx, {
        orgId: user.orgId,
        eventType: 'AppointmentRejected',
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          requesterUserId: apt.requester_user_id,
          reason: input.reason.trim(),
        },
      });
    });

    try {
      await routeNotificationEvent({
        id: `event-${Date.now()}`,
        orgId: user.orgId,
        eventType: 'AppointmentRejected',
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          requesterUserId: apt.requester_user_id,
          reason: input.reason.trim(),
        },
        occurredAt: new Date(),
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to route AppointmentRejected notification');
    }
  }

  /**
   * Official suggests other times (§10.2: PENDING_APPROVAL -> AWAITING_REQUESTER)
   */
  async suggestOther(
    user: AuthUser,
    id: string,
    input: SuggestOtherInput,
    correlationId?: string,
  ): Promise<void> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    assertCan(
      user,
      Permission.APPOINTMENT_APPROVE,
      {
        orgId: apt.org_id,
        officialId: apt.primary_official_id,
      },
      false,
    );

    validateTransition(apt.status, 'suggestOther', { slotsCount: input.slots.length });

    // Validate proposed slots
    for (const slot of input.slots) {
      const check = await schedulingEngine.checkConflicts(user.orgId, {
        officials: [{ officialId: apt.primary_official_id, requirement: Requirement.REQUIRED }],
        startAt: slot.startAt,
        endAt: slot.endAt,
        roomId: slot.roomId || null,
        priority: apt.priority,
        meetingMode: apt.meeting_mode,
        excludeAppointmentId: apt.id,
        respectMinNotice: true,
      });

      const hardConflict = check.conflicts.find((c) => c.severity === 'HARD');
      if (hardConflict) {
        throw ApiError.badRequest(
          `Suggested slot ${slot.startAt} has a conflict: ${hardConflict.message}`,
        );
      }
    }

    const corrId = correlationId || crypto.randomUUID();

    try {
      await db.transaction(async (trx) => {
        // Cancel existing holds
        await trx('calendar_events')
          .where({ appointment_id: id, kind: 'HOLD', status: 'ACTIVE' })
          .update({ status: 'CANCELLED', updated_at: trx.fn.now() });

        const officialCalendar = await trx('calendars')
          .where({ official_id: apt.primary_official_id, type: 'ORG' })
          .first();

        const calendarId = officialCalendar ? officialCalendar.id : crypto.randomUUID();
        const holdExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        for (const slot of input.slots) {
          const [holdEvent] = await trx('calendar_events')
            .insert({
              org_id: apt.org_id,
              calendar_id: calendarId,
              official_id: apt.primary_official_id,
              kind: 'HOLD',
              block_strength: 'HARD',
              title: `Hold (Official Suggested): ${apt.subject}`,
              start_at: slot.startAt,
              end_at: slot.endAt,
              occupied_range: trx.raw(`tstzrange(?, ?, '[)')`, [slot.startAt, slot.endAt]),
              appointment_id: apt.id,
              hold_expires_at: holdExpiresAt,
              status: 'ACTIVE',
              visibility: apt.visibility || 'INTERNAL',
              created_by: user.id,
            })
            .returning('*');

          const holdEventId = holdEvent ? holdEvent.id || holdEvent : crypto.randomUUID();

          await trx('appointment_proposals').insert({
            appointment_id: apt.id,
            start_at: slot.startAt,
            end_at: slot.endAt,
            room_id: slot.roomId || null,
            hold_event_id: holdEventId,
            proposed_by: user.id,
            expires_at: holdExpiresAt,
            chosen: false,
          });
        }

        await trx('appointments').where('id', id).update({
          status: AppointmentStatus.AWAITING_REQUESTER,
          status_changed_at: trx.fn.now(),
          updated_at: trx.fn.now(),
          updated_by: user.id,
        });

        await trx('appointment_status_history').insert({
          appointment_id: id,
          from_status: apt.status,
          to_status: AppointmentStatus.AWAITING_REQUESTER,
          action: 'suggestOther',
          actor_id: user.id,
          note: input.note || `Official suggested ${input.slots.length} alternative slots`,
          at: trx.fn.now(),
        });

        await writeAuditEvent(trx, {
          orgId: user.orgId,
          actorId: user.id,
          actorRole: user.roles[0] || 'OFFICIAL',
          action: 'appointment.suggest_other',
          entityType: 'appointment',
          entityId: id,
          changes: {
            status: [apt.status, AppointmentStatus.AWAITING_REQUESTER],
            slotsCount: input.slots.length,
          },
          correlationId: corrId,
        });

        await writeOutboxEvent(trx, {
          orgId: user.orgId,
          eventType: 'TimesProposed',
          aggregateType: 'appointment',
          aggregateId: id,
          payload: {
            appointmentId: id,
            referenceNo: apt.reference_no,
            requesterUserId: apt.requester_user_id,
            slotsCount: input.slots.length,
          },
        });
      });
    } catch (err: any) {
      if (
        err.code === '23P01' ||
        err.message?.includes('exclusion') ||
        err.constraint === 'no_overlap_hard'
      ) {
        throw ApiError.conflict(
          'One of the suggested slots is no longer available (§11.4)',
          ConflictCode.SLOT_TAKEN,
        );
      }
      throw err;
    }

    try {
      await routeNotificationEvent({
        id: `event-${Date.now()}`,
        orgId: user.orgId,
        eventType: 'TimesProposed',
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          requesterUserId: apt.requester_user_id,
          slotsCount: input.slots.length,
        },
        occurredAt: new Date(),
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to route TimesProposed event');
    }
  }

  /**
   * Change appointment priority (§10.2, §14.4: URGENT triggers immediate toasts to official and support staff)
   */
  async changePriority(
    user: AuthUser,
    id: string,
    input: ChangePriorityInput,
    correlationId?: string,
  ): Promise<void> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    assertCan(
      user,
      Permission.APPOINTMENT_REVIEW,
      {
        orgId: apt.org_id,
        officialId: apt.primary_official_id,
      },
      false,
    );

    if (input.priority === Priority.URGENT) {
      const canSetUrgent = user.roles.some(
        (r) =>
          r === RoleCode.SUPER_ADMIN ||
          r === RoleCode.APPOINTMENT_ADMIN ||
          r === RoleCode.PA ||
          r === RoleCode.EA ||
          r === RoleCode.OFFICIAL,
      );
      if (!canSetUrgent) {
        throw ApiError.forbidden('Only authorized staff may set priority to URGENT');
      }
    }

    // Recalculate SLA due at based on new priority
    const holidayRows = await db('holidays')
      .where('org_id', user.orgId)
      .where('is_optional', false)
      .select('date');
    const holidayDates = holidayRows.map((h) =>
      typeof h.date === 'string' ? h.date : h.date.toISOString().substring(0, 10),
    );

    const baseDate = apt.submitted_at ? new Date(apt.submitted_at) : new Date();
    const newSlaDueAt = calculateSlaDueDate(baseDate, input.priority, holidayDates);
    const corrId = correlationId || crypto.randomUUID();

    await db.transaction(async (trx) => {
      await trx('appointments').where('id', id).update({
        priority: input.priority,
        priority_reason: input.reason.trim(),
        sla_due_at: newSlaDueAt,
        updated_at: trx.fn.now(),
        updated_by: user.id,
      });

      await trx('appointment_status_history').insert({
        appointment_id: id,
        from_status: apt.status,
        to_status: apt.status,
        action: 'changePriority',
        actor_id: user.id,
        note: `Priority changed to ${input.priority}: ${input.reason}`,
        at: trx.fn.now(),
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0] || 'PA',
        action: 'appointment.priority_change',
        entityType: 'appointment',
        entityId: id,
        changes: { priority: [apt.priority, input.priority], reason: input.reason },
        correlationId: corrId,
      });

      await writeOutboxEvent(trx, {
        orgId: user.orgId,
        eventType: 'PriorityChanged',
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          oldPriority: apt.priority,
          newPriority: input.priority,
          reason: input.reason,
        },
      });

      // If URGENT, dispatch UrgentRequest event (§14.4 T4, §22 Criterion 4)
      if (input.priority === Priority.URGENT) {
        await writeOutboxEvent(trx, {
          orgId: user.orgId,
          eventType: 'UrgentRequest',
          aggregateType: 'appointment',
          aggregateId: id,
          payload: {
            appointmentId: id,
            referenceNo: apt.reference_no,
            officialId: apt.primary_official_id,
            subject: apt.subject,
            reason: input.reason,
          },
        });
      }
    });

    try {
      await routeNotificationEvent({
        id: `event-${Date.now()}`,
        orgId: user.orgId,
        eventType: 'PriorityChanged',
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          oldPriority: apt.priority,
          newPriority: input.priority,
          reason: input.reason,
        },
        occurredAt: new Date(),
      });

      if (input.priority === Priority.URGENT) {
        await routeNotificationEvent({
          id: `urgent-event-${Date.now()}`,
          orgId: user.orgId,
          eventType: 'UrgentRequest',
          aggregateType: 'appointment',
          aggregateId: id,
          payload: {
            appointmentId: id,
            referenceNo: apt.reference_no,
            officialId: apt.primary_official_id,
            subject: apt.subject,
            reason: input.reason,
          },
          occurredAt: new Date(),
        });
      }
    } catch (e) {
      logger.warn({ err: e }, 'Failed to route PriorityChanged / UrgentRequest notification');
    }
  }

  /**
   * Reschedule appointment directly (§10.6, §22 Track 5)
   * Guaranteed atomic move:
   * 1. Inserts new APPOINTMENT event (protected by exclusion constraint)
   * 2. Inserts new room booking if room specified (protected by room exclusion constraint)
   * 3. Cancels old event and releases old room booking
   * 4. Updates appointment start/end/room and increments version
   * Rollback on exclusion violation leaves old booking 100% intact and throws 409 SLOT_TAKEN.
   */
  async reschedule(
    user: AuthUser,
    id: string,
    input: RescheduleAppointmentInput,
    correlationId?: string,
  ): Promise<void> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    assertCan(
      user,
      Permission.APPOINTMENT_RESCHEDULE,
      { orgId: apt.org_id, officialId: apt.primary_official_id },
      false,
    );

    if (apt.status !== AppointmentStatus.CONFIRMED) {
      throw ApiError.stateConflict('Only CONFIRMED appointments can be rescheduled');
    }

    const newStart = new Date(input.startAt);
    const newEnd = new Date(input.endAt);
    if (newEnd.getTime() <= newStart.getTime()) {
      throw ApiError.badRequest('End time must be after start time');
    }

    // Capacity & Room validation (§13)
    const roomIdToUse = input.roomId !== undefined ? input.roomId : apt.room_id;
    if (roomIdToUse) {
      const room = await db('rooms').where({ id: roomIdToUse, is_active: true }).first();
      if (!room) {
        throw ApiError.badRequest('Selected room does not exist or is inactive');
      }

      const attendeeCount = apt.attendee_count || 1;
      const officials = await db('appointment_officials').where('appointment_id', id);
      const totalAttendees = attendeeCount + Math.max(1, officials.length);
      if (room.capacity < totalAttendees) {
        throw ApiError.conflict(
          `Room capacity (${room.capacity}) is less than total meeting participants (${totalAttendees}) (§13)`,
          ConflictCode.ROOM_CAPACITY,
        );
      }
    }

    // Check scheduling engine conflicts (§10.6, §11.4)
    const conflictCheck = await schedulingEngine.checkConflicts(user.orgId, {
      officials: [{ officialId: apt.primary_official_id, requirement: Requirement.REQUIRED }],
      startAt: input.startAt,
      endAt: input.endAt,
      roomId: roomIdToUse,
      priority: apt.priority,
      meetingMode: apt.meeting_mode,
      excludeAppointmentId: apt.id,
      respectMinNotice: false,
    });

    const hardConflict = conflictCheck.conflicts.find((c) => c.severity === 'HARD');
    if (hardConflict) {
      throw ApiError.conflict(
        `Selected reschedule slot has a conflict: ${hardConflict.message} (§10.6, §11.4)`,
        ConflictCode.SLOT_TAKEN,
      );
    }

    const corrId = correlationId || crypto.randomUUID();
    const oldStartStr = apt.start_at ? new Date(apt.start_at).toISOString() : 'none';

    try {
      await db.transaction(async (trx) => {
        const officialCalendar = await trx('calendars')
          .where({ official_id: apt.primary_official_id, type: 'ORG' })
          .first();
        const calendarId = officialCalendar ? officialCalendar.id : crypto.randomUUID();

        // 1. Insert new APPOINTMENT event (exclusion constraint no_overlap_hard throws 23P01 if busy)
        await trx('calendar_events').insert({
          org_id: apt.org_id,
          calendar_id: calendarId,
          official_id: apt.primary_official_id,
          kind: 'APPOINTMENT',
          block_strength: 'HARD',
          title: apt.subject,
          start_at: input.startAt,
          end_at: input.endAt,
          occupied_range: trx.raw(`tstzrange(?, ?, '[)')`, [input.startAt, input.endAt]),
          appointment_id: apt.id,
          status: 'ACTIVE',
          visibility: apt.visibility || 'INTERNAL',
          created_by: user.id,
        });

        // 2. Insert new room booking if room specified (exclusion constraint no_overlap_room throws if busy)
        if (roomIdToUse) {
          await trx('room_bookings').insert({
            room_id: roomIdToUse,
            appointment_id: apt.id,
            start_at: input.startAt,
            end_at: input.endAt,
            occupied_range: trx.raw(`tstzrange(?, ?, '[)')`, [input.startAt, input.endAt]),
            status: 'ACTIVE',
            created_by: user.id,
          });
        }

        // 3. Cancel old event(s) and release old room booking(s)
        await trx('calendar_events')
          .where({ appointment_id: id, status: 'ACTIVE' })
          .whereNot({ start_at: input.startAt })
          .update({ status: 'CANCELLED', updated_at: trx.fn.now() });

        if (apt.room_id) {
          await trx('room_bookings')
            .where({ appointment_id: id, status: 'ACTIVE' })
            .whereNot({ start_at: input.startAt })
            .update({ status: 'RELEASED', updated_at: trx.fn.now() });
        }

        // 4. Update appointment start/end/room and increment version
        await trx('appointments')
          .where('id', id)
          .update({
            start_at: input.startAt,
            end_at: input.endAt,
            room_id: roomIdToUse,
            version: apt.version + 1,
            updated_at: trx.fn.now(),
            updated_by: user.id,
          });

        // 5. Write status history
        await trx('appointment_status_history').insert({
          appointment_id: id,
          from_status: apt.status,
          to_status: apt.status,
          action: 'rescheduled',
          actor_id: user.id,
          note: `Rescheduled from ${oldStartStr} to ${input.startAt}. Reason: ${input.reason}`,
          at: trx.fn.now(),
        });

        // 6. Write audit event
        await writeAuditEvent(trx, {
          orgId: user.orgId,
          actorId: user.id,
          actorRole: user.roles[0] || 'PA',
          action: 'appointment.reschedule',
          entityType: 'appointment',
          entityId: id,
          changes: {
            startAt: [apt.start_at, input.startAt],
            endAt: [apt.end_at, input.endAt],
            roomId: [apt.room_id, roomIdToUse],
            reason: input.reason,
          },
          correlationId: corrId,
        });

        // 7. Write outbox event
        await writeOutboxEvent(trx, {
          orgId: user.orgId,
          eventType: 'AppointmentRescheduled',
          aggregateType: 'appointment',
          aggregateId: id,
          payload: {
            appointmentId: id,
            referenceNo: apt.reference_no,
            officialId: apt.primary_official_id,
            requesterUserId: apt.requester_user_id,
            startAt: input.startAt,
            endAt: input.endAt,
            reason: input.reason,
          },
        });
      });
    } catch (err: any) {
      if (
        err.code === '23P01' ||
        err.message?.includes('exclusion') ||
        err.constraint === 'no_overlap_hard' ||
        err.constraint === 'no_overlap_room'
      ) {
        throw ApiError.conflict(
          'The chosen slot or room is no longer available (§10.6, §11.4)',
          ConflictCode.SLOT_TAKEN,
        );
      }
      throw err;
    }

    try {
      await routeNotificationEvent({
        id: `event-${Date.now()}`,
        orgId: user.orgId,
        eventType: 'AppointmentRescheduled',
        aggregateType: 'appointment',
        aggregateId: id,
        payload: {
          appointmentId: id,
          referenceNo: apt.reference_no,
          officialId: apt.primary_official_id,
          requesterUserId: apt.requester_user_id,
          startAt: input.startAt,
          endAt: input.endAt,
          reason: input.reason,
        },
        occurredAt: new Date(),
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to route AppointmentRescheduled notification');
    }
  }

  /**
   * Requester creates a change request for a CONFIRMED appointment (§10.6)
   */
  async createChangeRequest(
    user: AuthUser,
    appointmentId: string,
    input: CreateChangeRequestInput,
    correlationId?: string,
  ): Promise<{ id: string }> {
    const apt = await appointmentsRepo.getById(appointmentId, user.orgId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    if (apt.requester_user_id !== user.id && !user.roles.includes(RoleCode.SUPER_ADMIN)) {
      throw ApiError.forbidden(
        'Only the requester can submit a change request for this appointment',
      );
    }

    if (apt.status !== AppointmentStatus.CONFIRMED) {
      throw ApiError.badRequest(
        'Change requests can only be submitted for CONFIRMED appointments (§10.6)',
      );
    }

    // Check if there is already an active change request
    const existingActive = await db('change_requests')
      .where({ appointment_id: appointmentId })
      .whereIn('status', [ChangeRequestStatus.PENDING, ChangeRequestStatus.AWAITING_REQUESTER])
      .first();

    if (existingActive) {
      throw ApiError.conflict(
        'An active change request is already in progress for this appointment',
      );
    }

    const corrId = correlationId || crypto.randomUUID();
    let newCrId = '';

    await db.transaction(async (trx) => {
      const [cr] = await trx('change_requests')
        .insert({
          org_id: user.orgId,
          appointment_id: appointmentId,
          requested_by: user.id,
          reason: input.reason.trim(),
          preferred_windows: JSON.stringify(input.preferredWindows),
          new_duration_min: input.newDurationMin || null,
          status: ChangeRequestStatus.PENDING,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        })
        .returning('*');

      newCrId = cr ? cr.id || cr : crypto.randomUUID();

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0] || 'GUEST',
        action: 'appointment.change_request_create',
        entityType: 'change_request',
        entityId: newCrId,
        changes: { appointmentId, reason: input.reason, preferredWindows: input.preferredWindows },
        correlationId: corrId,
      });

      await writeOutboxEvent(trx, {
        orgId: user.orgId,
        eventType: 'ChangeRequested',
        aggregateType: 'change_request',
        aggregateId: newCrId,
        payload: {
          changeRequestId: newCrId,
          appointmentId,
          referenceNo: apt.reference_no,
          requesterName: apt.requester_snapshot?.name || 'Requester',
          reason: input.reason,
          officialId: apt.primary_official_id,
        },
      });
    });

    try {
      await routeNotificationEvent({
        id: `event-${Date.now()}`,
        orgId: user.orgId,
        eventType: 'ChangeRequested',
        aggregateType: 'change_request',
        aggregateId: newCrId,
        payload: {
          changeRequestId: newCrId,
          appointmentId,
          referenceNo: apt.reference_no,
          requesterName: apt.requester_snapshot?.name || 'Requester',
          reason: input.reason,
          officialId: apt.primary_official_id,
        },
        occurredAt: new Date(),
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to route ChangeRequested notification');
    }

    return { id: newCrId };
  }

  /**
   * List change requests for an appointment (§10.6)
   */
  async getChangeRequests(user: AuthUser, appointmentId: string): Promise<ChangeRequestDto[]> {
    const apt = await appointmentsRepo.getById(appointmentId, user.orgId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    if (apt.requester_user_id !== user.id && !user.roles.includes(RoleCode.SUPER_ADMIN)) {
      assertCan(user, Permission.APPOINTMENT_READ, {
        orgId: apt.org_id,
        officialId: apt.primary_official_id,
      });
    }

    const rows = await db('change_requests')
      .join('users', 'change_requests.requested_by', 'users.id')
      .where('change_requests.appointment_id', appointmentId)
      .orderBy('change_requests.created_at', 'desc')
      .select('change_requests.*', 'users.full_name as requester_name');

    const crIds = rows.map((r: any) => r.id);
    const proposals =
      crIds.length > 0
        ? await db('appointment_proposals')
            .leftJoin('rooms', 'appointment_proposals.room_id', 'rooms.id')
            .whereIn('appointment_proposals.change_request_id', crIds)
            .select('appointment_proposals.*', 'rooms.name as room_name')
        : [];

    return rows.map((r: any) => ({
      id: r.id,
      appointmentId: r.appointment_id,
      requestedBy: r.requested_by,
      requesterName: r.requester_name,
      reason: r.reason,
      newDurationMin: r.new_duration_min,
      preferredWindows:
        typeof r.preferred_windows === 'string'
          ? JSON.parse(r.preferred_windows)
          : r.preferred_windows,
      status: r.status,
      resolvedBy: r.resolved_by,
      resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
      proposals: proposals
        .filter((p: any) => p.change_request_id === r.id)
        .map((p: any) => ({
          id: p.id,
          startAt: new Date(p.start_at).toISOString(),
          endAt: new Date(p.end_at).toISOString(),
          roomId: p.room_id || null,
          roomName: p.room_name || undefined,
          expiresAt: new Date(p.expires_at).toISOString(),
        })),
    }));
  }

  /**
   * PA proposes candidate slots for a change request (§10.6)
   */
  async proposeChangeRequestSlots(
    user: AuthUser,
    crId: string,
    input: ProposeChangeRequestSlotsInput,
    correlationId?: string,
  ): Promise<void> {
    const cr = await db('change_requests').where('id', crId).first();
    if (!cr) {
      throw ApiError.notFound('Change request not found');
    }

    const apt = await appointmentsRepo.getById(cr.appointment_id, user.orgId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    assertCan(
      user,
      Permission.APPOINTMENT_REVIEW,
      { orgId: apt.org_id, officialId: apt.primary_official_id },
      false,
    );

    if (cr.status !== ChangeRequestStatus.PENDING) {
      throw ApiError.badRequest('Can only propose slots for PENDING change requests');
    }

    // Validate proposed slots
    for (const slot of input.slots) {
      const check = await schedulingEngine.checkConflicts(user.orgId, {
        officials: [{ officialId: apt.primary_official_id, requirement: Requirement.REQUIRED }],
        startAt: slot.startAt,
        endAt: slot.endAt,
        roomId: slot.roomId || null,
        priority: apt.priority,
        meetingMode: apt.meeting_mode,
        excludeAppointmentId: apt.id,
        respectMinNotice: true,
      });

      const hardConflict = check.conflicts.find((c) => c.severity === 'HARD');
      if (hardConflict) {
        throw ApiError.badRequest(`Slot ${slot.startAt} has a conflict: ${hardConflict.message}`);
      }
    }

    const corrId = correlationId || crypto.randomUUID();

    try {
      await db.transaction(async (trx) => {
        // Cancel any existing holds for this change request
        const existingProps = await trx('appointment_proposals').where('change_request_id', crId);
        const holdIds = existingProps.map((p: any) => p.hold_event_id).filter(Boolean);
        if (holdIds.length > 0) {
          await trx('calendar_events')
            .whereIn('id', holdIds)
            .update({ status: 'CANCELLED', updated_at: trx.fn.now() });
        }

        const officialCalendar = await trx('calendars')
          .where({ official_id: apt.primary_official_id, type: 'ORG' })
          .first();
        const calendarId = officialCalendar ? officialCalendar.id : crypto.randomUUID();
        const holdExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h proposal lifetime (§10.7)

        for (const slot of input.slots) {
          const [holdEvent] = await trx('calendar_events')
            .insert({
              org_id: apt.org_id,
              calendar_id: calendarId,
              official_id: apt.primary_official_id,
              kind: 'HOLD',
              block_strength: 'HARD',
              title: `Hold (Change Request): ${apt.subject}`,
              start_at: slot.startAt,
              end_at: slot.endAt,
              occupied_range: trx.raw(`tstzrange(?, ?, '[)')`, [slot.startAt, slot.endAt]),
              appointment_id: apt.id,
              hold_expires_at: holdExpiresAt,
              status: 'ACTIVE',
              visibility: apt.visibility || 'INTERNAL',
              created_by: user.id,
            })
            .returning('*');

          const holdEventId = holdEvent ? holdEvent.id || holdEvent : crypto.randomUUID();

          await trx('appointment_proposals').insert({
            appointment_id: apt.id,
            change_request_id: crId,
            start_at: slot.startAt,
            end_at: slot.endAt,
            room_id: slot.roomId || null,
            hold_event_id: holdEventId,
            proposed_by: user.id,
            expires_at: holdExpiresAt,
            chosen: false,
          });
        }

        await trx('change_requests').where('id', crId).update({
          status: ChangeRequestStatus.AWAITING_REQUESTER,
          updated_at: trx.fn.now(),
        });

        await writeAuditEvent(trx, {
          orgId: user.orgId,
          actorId: user.id,
          actorRole: user.roles[0] || 'PA',
          action: 'appointment.change_request_propose',
          entityType: 'change_request',
          entityId: crId,
          changes: {
            status: [cr.status, ChangeRequestStatus.AWAITING_REQUESTER],
            slotsCount: input.slots.length,
          },
          correlationId: corrId,
        });

        await writeOutboxEvent(trx, {
          orgId: user.orgId,
          eventType: 'TimesProposed',
          aggregateType: 'appointment',
          aggregateId: apt.id,
          payload: {
            appointmentId: apt.id,
            changeRequestId: crId,
            referenceNo: apt.reference_no,
            requesterUserId: apt.requester_user_id,
            slotsCount: input.slots.length,
          },
        });
      });
    } catch (err: any) {
      if (
        err.code === '23P01' ||
        err.message?.includes('exclusion') ||
        err.constraint === 'no_overlap_hard'
      ) {
        throw ApiError.conflict(
          'One of the candidate slots is no longer available (§11.4)',
          ConflictCode.SLOT_TAKEN,
        );
      }
      throw err;
    }

    try {
      await routeNotificationEvent({
        id: `event-${Date.now()}`,
        orgId: user.orgId,
        eventType: 'TimesProposed',
        aggregateType: 'appointment',
        aggregateId: apt.id,
        payload: {
          appointmentId: apt.id,
          changeRequestId: crId,
          referenceNo: apt.reference_no,
          requesterUserId: apt.requester_user_id,
          slotsCount: input.slots.length,
        },
        occurredAt: new Date(),
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to route TimesProposed event');
    }
  }

  /**
   * Requester accepts a proposed slot for a change request (§10.6)
   * Guaranteed atomic move:
   * 1. Inserts new APPOINTMENT event
   * 2. Inserts new room booking
   * 3. Cancels old event and releases old room booking
   * 4. Updates change request status to APPROVED
   */
  async acceptChangeRequestProposal(
    user: AuthUser,
    crId: string,
    input: AcceptChangeRequestProposalInput,
    correlationId?: string,
  ): Promise<void> {
    const cr = await db('change_requests').where('id', crId).first();
    if (!cr) {
      throw ApiError.notFound('Change request not found');
    }

    const apt = await appointmentsRepo.getById(cr.appointment_id, user.orgId);
    if (!apt || (apt.requester_user_id !== user.id && !user.roles.includes(RoleCode.SUPER_ADMIN))) {
      throw ApiError.notFound('Appointment not found');
    }

    if (cr.status !== ChangeRequestStatus.AWAITING_REQUESTER) {
      throw ApiError.badRequest('Change request is not currently awaiting requester acceptance');
    }

    const proposal = await db('appointment_proposals')
      .where({ id: input.proposalId, change_request_id: crId })
      .first();

    if (!proposal) {
      throw ApiError.notFound('Proposed slot not found for this change request');
    }

    if (new Date(proposal.expires_at).getTime() < Date.now()) {
      throw ApiError.badRequest('This proposal has expired (§10.7)');
    }

    const corrId = correlationId || crypto.randomUUID();
    const oldStartStr = apt.start_at ? new Date(apt.start_at).toISOString() : 'none';

    try {
      await db.transaction(async (trx) => {
        const officialCalendar = await trx('calendars')
          .where({ official_id: apt.primary_official_id, type: 'ORG' })
          .first();
        const calendarId = officialCalendar ? officialCalendar.id : crypto.randomUUID();

        // 1. Insert new APPOINTMENT event
        await trx('calendar_events').insert({
          org_id: apt.org_id,
          calendar_id: calendarId,
          official_id: apt.primary_official_id,
          kind: 'APPOINTMENT',
          block_strength: 'HARD',
          title: apt.subject,
          start_at: proposal.start_at,
          end_at: proposal.end_at,
          occupied_range: trx.raw(`tstzrange(?, ?, '[)')`, [proposal.start_at, proposal.end_at]),
          appointment_id: apt.id,
          status: 'ACTIVE',
          visibility: apt.visibility || 'INTERNAL',
          created_by: user.id,
        });

        // 2. Insert new room booking if room specified
        if (proposal.room_id) {
          await trx('room_bookings').insert({
            room_id: proposal.room_id,
            appointment_id: apt.id,
            start_at: proposal.start_at,
            end_at: proposal.end_at,
            occupied_range: trx.raw(`tstzrange(?, ?, '[)')`, [proposal.start_at, proposal.end_at]),
            status: 'ACTIVE',
            created_by: user.id,
          });
        }

        // 3. Cancel old event and release old room booking
        await trx('calendar_events')
          .where({ appointment_id: apt.id, status: 'ACTIVE' })
          .whereNot({ start_at: proposal.start_at })
          .update({ status: 'CANCELLED', updated_at: trx.fn.now() });

        if (apt.room_id) {
          await trx('room_bookings')
            .where({ appointment_id: apt.id, status: 'ACTIVE' })
            .whereNot({ start_at: proposal.start_at })
            .update({ status: 'RELEASED', updated_at: trx.fn.now() });
        }

        // 4. Cancel all other proposal holds for this change request
        const otherProps = await trx('appointment_proposals')
          .where('change_request_id', crId)
          .whereNot('id', input.proposalId);
        const otherHoldIds = otherProps.map((p: any) => p.hold_event_id).filter(Boolean);
        if (otherHoldIds.length > 0) {
          await trx('calendar_events')
            .whereIn('id', otherHoldIds)
            .update({ status: 'CANCELLED', updated_at: trx.fn.now() });
        }

        // 5. Mark proposal chosen and change request APPROVED
        await trx('appointment_proposals').where('id', input.proposalId).update({ chosen: true });

        await trx('change_requests').where('id', crId).update({
          status: ChangeRequestStatus.APPROVED,
          resolved_by: user.id,
          resolved_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

        // 6. Update appointment times
        await trx('appointments')
          .where('id', apt.id)
          .update({
            start_at: proposal.start_at,
            end_at: proposal.end_at,
            room_id: proposal.room_id || null,
            version: apt.version + 1,
            updated_at: trx.fn.now(),
            updated_by: user.id,
          });

        // 7. Status history & audit
        await trx('appointment_status_history').insert({
          appointment_id: apt.id,
          from_status: apt.status,
          to_status: apt.status,
          action: 'rescheduled',
          actor_id: user.id,
          note: `Change request accepted. Rescheduled from ${oldStartStr} to ${new Date(proposal.start_at).toISOString()}`,
          at: trx.fn.now(),
        });

        await writeAuditEvent(trx, {
          orgId: user.orgId,
          actorId: user.id,
          actorRole: user.roles[0] || 'GUEST',
          action: 'appointment.reschedule',
          entityType: 'appointment',
          entityId: apt.id,
          changes: {
            changeRequestId: crId,
            startAt: [apt.start_at, proposal.start_at],
            endAt: [apt.end_at, proposal.end_at],
            roomId: [apt.room_id, proposal.room_id],
          },
          correlationId: corrId,
        });

        await writeOutboxEvent(trx, {
          orgId: user.orgId,
          eventType: 'AppointmentRescheduled',
          aggregateType: 'appointment',
          aggregateId: apt.id,
          payload: {
            appointmentId: apt.id,
            referenceNo: apt.reference_no,
            officialId: apt.primary_official_id,
            requesterUserId: apt.requester_user_id,
            startAt: proposal.start_at,
            endAt: proposal.end_at,
            reason: cr.reason,
          },
        });
      });
    } catch (err: any) {
      if (
        err.code === '23P01' ||
        err.message?.includes('exclusion') ||
        err.constraint === 'no_overlap_hard' ||
        err.constraint === 'no_overlap_room'
      ) {
        throw ApiError.conflict(
          'The chosen proposed slot has just been taken by another booking (§11.4)',
          ConflictCode.SLOT_TAKEN,
        );
      }
      throw err;
    }

    try {
      await routeNotificationEvent({
        id: `event-${Date.now()}`,
        orgId: user.orgId,
        eventType: 'AppointmentRescheduled',
        aggregateType: 'appointment',
        aggregateId: apt.id,
        payload: {
          appointmentId: apt.id,
          referenceNo: apt.reference_no,
          officialId: apt.primary_official_id,
          requesterUserId: apt.requester_user_id,
          startAt: proposal.start_at,
          endAt: proposal.end_at,
          reason: cr.reason,
        },
        occurredAt: new Date(),
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to route AppointmentRescheduled notification');
    }
  }

  /**
   * Requester withdraws change request (§10.6)
   */
  async withdrawChangeRequest(user: AuthUser, crId: string, correlationId?: string): Promise<void> {
    const cr = await db('change_requests').where('id', crId).first();
    if (!cr) {
      throw ApiError.notFound('Change request not found');
    }

    const apt = await appointmentsRepo.getById(cr.appointment_id, user.orgId);
    if (!apt || (apt.requester_user_id !== user.id && !user.roles.includes(RoleCode.SUPER_ADMIN))) {
      throw ApiError.notFound('Appointment not found');
    }

    if (
      cr.status !== ChangeRequestStatus.PENDING &&
      cr.status !== ChangeRequestStatus.AWAITING_REQUESTER
    ) {
      throw ApiError.badRequest('Can only withdraw pending or proposed change requests');
    }

    const corrId = correlationId || crypto.randomUUID();

    await db.transaction(async (trx) => {
      // Release any holds
      const props = await trx('appointment_proposals').where('change_request_id', crId);
      const holdIds = props.map((p: any) => p.hold_event_id).filter(Boolean);
      if (holdIds.length > 0) {
        await trx('calendar_events')
          .whereIn('id', holdIds)
          .update({ status: 'CANCELLED', updated_at: trx.fn.now() });
      }

      await trx('change_requests').where('id', crId).update({
        status: ChangeRequestStatus.WITHDRAWN,
        resolved_by: user.id,
        resolved_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0] || 'GUEST',
        action: 'appointment.change_request_withdraw',
        entityType: 'change_request',
        entityId: crId,
        changes: { status: [cr.status, ChangeRequestStatus.WITHDRAWN] },
        correlationId: corrId,
      });
    });
  }

  /**
   * Staff rejects change request (§10.6)
   */
  async rejectChangeRequest(
    user: AuthUser,
    crId: string,
    reason: string,
    correlationId?: string,
  ): Promise<void> {
    const cr = await db('change_requests').where('id', crId).first();
    if (!cr) {
      throw ApiError.notFound('Change request not found');
    }

    const apt = await appointmentsRepo.getById(cr.appointment_id, user.orgId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    assertCan(
      user,
      Permission.APPOINTMENT_REVIEW,
      { orgId: apt.org_id, officialId: apt.primary_official_id },
      false,
    );

    if (
      cr.status !== ChangeRequestStatus.PENDING &&
      cr.status !== ChangeRequestStatus.AWAITING_REQUESTER
    ) {
      throw ApiError.badRequest('Can only reject pending or proposed change requests');
    }

    const corrId = correlationId || crypto.randomUUID();

    await db.transaction(async (trx) => {
      // Release any holds
      const props = await trx('appointment_proposals').where('change_request_id', crId);
      const holdIds = props.map((p: any) => p.hold_event_id).filter(Boolean);
      if (holdIds.length > 0) {
        await trx('calendar_events')
          .whereIn('id', holdIds)
          .update({ status: 'CANCELLED', updated_at: trx.fn.now() });
      }

      await trx('change_requests').where('id', crId).update({
        status: ChangeRequestStatus.REJECTED,
        resolved_by: user.id,
        resolved_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0] || 'PA',
        action: 'appointment.change_request_reject',
        entityType: 'change_request',
        entityId: crId,
        changes: { status: [cr.status, ChangeRequestStatus.REJECTED], reason },
        reason,
        correlationId: corrId,
      });
    });
  }

  /**
   * Start meeting (§16.1: CONFIRMED / CHECKED_IN -> IN_PROGRESS)
   */
  async startMeeting(user: AuthUser, id: string, correlationId?: string): Promise<void> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt) throw ApiError.notFound('Appointment not found');

    assertCan(
      user,
      Permission.APPOINTMENT_START,
      { orgId: apt.org_id, officialId: apt.primary_official_id },
      false,
    );

    if (apt.status !== AppointmentStatus.CONFIRMED && apt.status !== AppointmentStatus.CHECKED_IN) {
      throw ApiError.badRequest(`Cannot start meeting in status ${apt.status}`);
    }

    const corrId = correlationId || crypto.randomUUID();
    const now = new Date();

    await db.transaction(async (trx) => {
      await trx('appointments').where('id', id).update({
        status: AppointmentStatus.IN_PROGRESS,
        updated_at: now,
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0] || 'OFFICIAL',
        action: 'appointment.start',
        entityType: 'appointment',
        entityId: id,
        changes: { status: [apt.status, AppointmentStatus.IN_PROGRESS] },
        correlationId: corrId,
      });
    });
  }

  /**
   * Complete meeting (§16.1: IN_PROGRESS / CHECKED_IN / CONFIRMED -> COMPLETED)
   */
  async completeMeeting(user: AuthUser, id: string, correlationId?: string): Promise<void> {
    const apt = await appointmentsRepo.getById(id, user.orgId);
    if (!apt) throw ApiError.notFound('Appointment not found');

    assertCan(
      user,
      Permission.APPOINTMENT_COMPLETE,
      { orgId: apt.org_id, officialId: apt.primary_official_id },
      false,
    );

    if (
      apt.status !== AppointmentStatus.IN_PROGRESS &&
      apt.status !== AppointmentStatus.CHECKED_IN &&
      apt.status !== AppointmentStatus.CONFIRMED
    ) {
      throw ApiError.badRequest(`Cannot complete meeting in status ${apt.status}`);
    }

    const corrId = correlationId || crypto.randomUUID();
    const now = new Date();

    await db.transaction(async (trx) => {
      await trx('appointments').where('id', id).update({
        status: AppointmentStatus.COMPLETED,
        updated_at: now,
      });

      await writeAuditEvent(trx, {
        orgId: user.orgId,
        actorId: user.id,
        actorRole: user.roles[0] || 'OFFICIAL',
        action: 'appointment.complete',
        entityType: 'appointment',
        entityId: id,
        changes: { status: [apt.status, AppointmentStatus.COMPLETED] },
        correlationId: corrId,
      });
    });
  }
}

export const appointmentsService = new AppointmentsService();
