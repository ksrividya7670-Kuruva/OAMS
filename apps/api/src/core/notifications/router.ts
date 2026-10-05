import { redis } from '../redis.js';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { sendEmail } from '../email/mailer.js';
import { renderNotificationEmailHtml } from '../email/templates.js';
import { Priority, NotificationChannel } from '@oams/shared';
import { smsProviderService } from '../integrations/sms.js';
import { powerAutomateService } from '../integrations/powerAutomate.js';
import { config } from '../config.js';

export interface DomainEvent {
  id: string;
  orgId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export async function routeNotificationEvent(event: DomainEvent): Promise<void> {
  logger.info(
    { eventType: event.eventType, id: event.id },
    'Routing domain event to notification channels',
  );

  // Forward event dynamically to Microsoft Power Automate (non-blocking)
  powerAutomateService.dispatch(event).catch((err) => {
    logger.debug({ err, eventId: event.id }, 'Power Automate dispatch error ignored');
  });

  switch (event.eventType) {
    case 'SupportStaffAssigned': {
      const { officialId, userId, supportRole, title, officialUserId } = event.payload as {
        officialId: string;
        userId: string;
        supportRole: string;
        title: string;
        officialUserId?: string;
      };

      // 1. Notify the assigned staff member
      await deliverInAppAndEmail({
        orgId: event.orgId,
        userId,
        eventType: 'SupportStaffAssigned',
        title: 'New Official Assignment',
        body: `You have been assigned as ${supportRole} to ${title}.`,
        link: '/app/dashboard',
        priority: Priority.MEDIUM,
        entityType: 'official',
        entityId: officialId,
        dedupeKey: `SupportStaffAssigned:${officialId}:${userId}`,
        emailSubject: `OAMS: Assigned as ${supportRole} to ${title}`,
      });

      // 2. Also notify the official if officialUserId is provided
      if (officialUserId && officialUserId !== userId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: officialUserId,
          eventType: 'SupportStaffAssigned',
          title: 'Support Staff Assigned',
          body: `A new ${supportRole} has been assigned to your office.`,
          link: '/app/settings',
          priority: Priority.MEDIUM,
          entityType: 'official',
          entityId: officialId,
          dedupeKey: `SupportStaffAssigned:Official:${officialId}:${userId}`,
          emailSubject: `OAMS: Support staff updated for your office`,
        });
      }
      break;
    }

    case 'SupportStaffRemoved': {
      const { officialId, userId, title } = event.payload as {
        officialId: string;
        userId: string;
        title: string;
      };

      await deliverInAppAndEmail({
        orgId: event.orgId,
        userId,
        eventType: 'SupportStaffRemoved',
        title: 'Assignment Concluded',
        body: `Your assignment to ${title} has concluded.`,
        link: '/app/dashboard',
        priority: Priority.LOW,
        entityType: 'official',
        entityId: officialId,
        dedupeKey: `SupportStaffRemoved:${officialId}:${userId}`,
      });
      break;
    }

    case 'RoleChanged': {
      const { userId, roleCodes } = event.payload as {
        userId: string;
        roleCodes: string[];
      };

      await deliverInAppAndEmail({
        orgId: event.orgId,
        userId,
        eventType: 'RoleChanged',
        title: 'User Roles Updated',
        body: `Your organization roles have been updated to: ${roleCodes.join(', ')}.`,
        link: '/app/settings',
        priority: Priority.HIGH,
        entityType: 'user',
        entityId: userId,
        dedupeKey: `RoleChanged:${userId}:${Date.now()}`,
        emailSubject: 'OAMS: Your roles have been updated',
      });
      break;
    }

    case 'AppointmentSubmitted': {
      const {
        appointmentId,
        referenceNo,
        requesterUserId,
        requesterEmail,
        requesterName,
        officialTitle,
        subject,
        assignedToUserId,
        priority,
      } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        requesterUserId: string;
        requesterEmail: string;
        requesterName: string;
        officialTitle: string;
        subject: string;
        assignedToUserId?: string;
        priority: Priority;
      };

      // 1. Notify Assigned Support Staff / PA (In-App Bell + Email) (§14.4 T3)
      if (assignedToUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: assignedToUserId,
          eventType: 'AppointmentSubmitted',
          title: `New Request: ${referenceNo}`,
          body: `${requesterName} requested to meet ${officialTitle} regarding "${subject}".`,
          link: `/app/appointments/${appointmentId}`,
          priority: priority || Priority.MEDIUM,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `AppointmentSubmitted:Staff:${appointmentId}:${assignedToUserId}`,
          emailSubject: `OAMS: New Appointment Request (${referenceNo})`,
        });
      }

      // 2. Deliver confirmation to Requester (Email + in-app if registered user) (§14.4 T3)
      if (requesterUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: requesterUserId,
          eventType: 'AppointmentSubmitted',
          title: `Request Submitted: ${referenceNo}`,
          body: `Your request regarding "${subject}" is under review. Reference: ${referenceNo}.`,
          link: `/my/appointments/${appointmentId}`,
          priority: Priority.LOW,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `AppointmentSubmitted:Requester:${appointmentId}:${requesterUserId}`,
          emailSubject: `OAMS Appointment Received: ${referenceNo}`,
        });
      } else if (requesterEmail) {
        // Direct email & Power Automate for guest without user ID
        const guestLink = `${config.WEB_URL}/my/appointments/${appointmentId}`;
        const guestHtml = renderNotificationEmailHtml({
          title: `Appointment Request Received: ${referenceNo}`,
          body: `Dear ${requesterName || 'Visitor'}, your appointment request regarding "<strong>${subject}</strong>" has been received and is under review.`,
          link: `/my/appointments/${appointmentId}`,
          priority: priority || Priority.MEDIUM,
          referenceNo,
          recipientName: requesterName || 'Visitor',
          actionLabel: 'Track Appointment',
        });

        try {
          await sendEmail({
            to: requesterEmail,
            subject: `OAMS Appointment Received: ${referenceNo}`,
            html: guestHtml,
          });
        } catch (emailErr) {
          logger.warn({ emailErr, requesterEmail }, 'Failed to send guest confirmation email');
        }

        powerAutomateService
          .dispatchNotification({
            orgId: event.orgId,
            eventType: 'AppointmentSubmitted',
            recipient: {
              email: requesterEmail,
              name: requesterName || 'Visitor',
            },
            notification: {
              title: `Appointment Request Received: ${referenceNo}`,
              body: `Your request regarding "${subject}" is under review. Reference: ${referenceNo}.`,
              link: guestLink,
              priority: priority || Priority.MEDIUM,
              referenceNo,
              emailSubject: `OAMS Appointment Received: ${referenceNo}`,
              emailHtml: guestHtml,
              pushTitle: `Appointment Received: ${referenceNo}`,
              pushBody: `Your request regarding "${subject}" is under review.`,
            },
            actions: [{ label: 'Track Appointment', url: guestLink }],
          })
          .catch((err) => {
            logger.debug({ err, requesterEmail }, 'Power Automate guest dispatch failed');
          });
      }

      // 3. Deliver to Admin users in-app & email (§14.4)
      try {
        const adminUsers = await db('users')
          .join('user_roles', 'users.id', 'user_roles.user_id')
          .join('roles', 'user_roles.role_id', 'roles.id')
          .where('users.org_id', event.orgId)
          .whereIn('roles.code', ['SUPER_ADMIN', 'ADMIN'])
          .select('users.id', 'users.email')
          .distinct();

        for (const admin of adminUsers) {
          if (admin.id !== requesterUserId && admin.id !== assignedToUserId) {
            await deliverInAppAndEmail({
              orgId: event.orgId,
              userId: admin.id,
              eventType: 'AppointmentSubmitted',
              title: `[ACTION REQUIRED] New Request: ${referenceNo}`,
              body: `${requesterName || 'A requester'} requested to meet ${officialTitle} regarding "${subject}".`,
              link: `/app/appointments/${appointmentId}`,
              priority: priority || Priority.HIGH,
              entityType: 'appointment',
              entityId: appointmentId,
              dedupeKey: `AppointmentSubmitted:Admin:${appointmentId}:${admin.id}`,
              emailSubject: `[ACTION REQUIRED] OAMS: New Appointment Request (${referenceNo})`,
            });
          }
        }
      } catch (err) {
        logger.debug({ err }, 'Failed to deliver to in-system admin users');
      }

      break;
    }

    case 'AppointmentAutoRejected': {
      const { appointmentId, referenceNo, requesterUserId, requesterEmail, reason } =
        event.payload as {
          appointmentId: string;
          referenceNo: string;
          requesterUserId?: string;
          requesterEmail?: string;
          reason: string;
        };

      if (requesterUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: requesterUserId,
          eventType: 'AppointmentAutoRejected',
          title: `Request Not Processed: ${referenceNo}`,
          body: `Your appointment request could not be processed: ${reason}`,
          link: `/my/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `AppointmentAutoRejected:${appointmentId}:${requesterUserId}`,
          emailSubject: `OAMS: Appointment Request Update (${referenceNo})`,
        });
      } else if (requesterEmail) {
        try {
          await sendEmail({
            to: requesterEmail,
            subject: `OAMS: Appointment Request Update (${referenceNo})`,
            html: `<p>Your appointment request (${referenceNo}) could not be processed: ${reason}</p>`,
          });
        } catch (emailErr) {
          logger.warn({ emailErr, requesterEmail }, 'Failed to send rejection email');
        }
      }
      break;
    }

    case 'AppointmentAssigned': {
      const { appointmentId, referenceNo, assignedToUserId } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        assignedToUserId: string;
      };

      if (assignedToUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: assignedToUserId,
          eventType: 'AppointmentAssigned',
          title: `Assigned: ${referenceNo}`,
          body: `You have been assigned to review appointment request ${referenceNo}.`,
          link: `/app/appointments/${appointmentId}`,
          priority: Priority.MEDIUM,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `AppointmentAssigned:${appointmentId}:${assignedToUserId}`,
          emailSubject: `OAMS: Assigned to review request ${referenceNo}`,
        });
      }
      break;
    }

    case 'InfoRequested': {
      const { appointmentId, referenceNo, requesterUserId, note } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        requesterUserId: string;
        note: string;
      };

      if (requesterUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: requesterUserId,
          eventType: 'InfoRequested',
          title: `Action Required: Info Needed for ${referenceNo}`,
          body: `The official's office has requested additional information: "${note}".`,
          link: `/my/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `InfoRequested:${appointmentId}:${Date.now()}`,
          emailSubject: `OAMS: Information Requested for ${referenceNo}`,
        });
      }
      break;
    }

    case 'InfoProvided': {
      const { appointmentId, referenceNo, assignedToUserId, note } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        assignedToUserId?: string;
        note: string;
      };

      if (assignedToUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: assignedToUserId,
          eventType: 'InfoProvided',
          title: `Information Provided: ${referenceNo}`,
          body: `The requester has provided the requested details: "${note}".`,
          link: `/app/appointments/${appointmentId}`,
          priority: Priority.MEDIUM,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `InfoProvided:${appointmentId}:${Date.now()}`,
          emailSubject: `OAMS: Requester provided info for ${referenceNo}`,
        });
      }
      break;
    }

    case 'TimesProposed': {
      const { appointmentId, referenceNo, requesterUserId, slotsCount } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        requesterUserId: string;
        slotsCount: number;
      };

      if (requesterUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: requesterUserId,
          eventType: 'TimesProposed',
          title: `Action Required: Meeting Times Proposed for ${referenceNo}`,
          body: `The official's office proposed ${slotsCount} candidate time slot(s). Please choose one within 24 hours.`,
          link: `/my/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `TimesProposed:${appointmentId}:${Date.now()}`,
          emailSubject: `OAMS: Candidate times proposed for ${referenceNo}`,
        });
      }
      break;
    }

    case 'ProposalAccepted': {
      const { appointmentId, referenceNo, officialId, startAt } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        officialId: string;
        startAt: string;
      };

      // Notify support staff of official
      const staffList = await db('support_staff_assignments')
        .where('official_id', officialId)
        .where('active_from', '<=', db.fn.now())
        .andWhere((qb) => {
          qb.whereNull('active_to').orWhere('active_to', '>=', db.fn.now());
        });

      for (const staff of staffList) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: staff.user_id,
          eventType: 'ProposalAccepted',
          title: `Proposal Accepted: ${referenceNo}`,
          body: `Requester accepted slot for ${new Date(startAt).toLocaleString('en-IN')}.`,
          link: `/app/appointments/${appointmentId}`,
          priority: Priority.MEDIUM,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `ProposalAccepted:${appointmentId}:${staff.user_id}:${Date.now()}`,
        });
      }
      break;
    }

    case 'ProposalDeclined': {
      const { appointmentId, referenceNo, assignedToUserId, note } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        assignedToUserId?: string;
        note?: string;
      };

      if (assignedToUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: assignedToUserId,
          eventType: 'ProposalDeclined',
          title: `Proposals Declined: ${referenceNo}`,
          body: `Requester declined proposed times: "${note || 'No reason provided'}".`,
          link: `/app/appointments/${appointmentId}`,
          priority: Priority.MEDIUM,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `ProposalDeclined:${appointmentId}:${Date.now()}`,
        });
      }
      break;
    }

    case 'ApprovalRequested': {
      const { appointmentId, referenceNo, officialId, startAt } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        officialId: string;
        startAt: string;
      };

      const official = await db('officials').where('id', officialId).first();
      if (official && official.user_id) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: official.user_id,
          eventType: 'ApprovalRequested',
          title: `Approval Needed: ${referenceNo}`,
          body: `Appointment request ${referenceNo} scheduled for ${new Date(startAt).toLocaleString('en-IN')} awaits your approval.`,
          link: `/app/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `ApprovalRequested:${appointmentId}:${official.user_id}`,
          emailSubject: `OAMS: Appointment Approval Request (${referenceNo})`,
        });
      }
      break;
    }

    case 'AppointmentConfirmed': {
      const { appointmentId, referenceNo, requesterUserId, officialId, startAt } =
        event.payload as {
          appointmentId: string;
          referenceNo: string;
          requesterUserId?: string;
          officialId: string;
          startAt?: string;
        };

      const dateStr = startAt ? new Date(startAt).toLocaleString('en-IN') : 'Scheduled Time';

      const official = await db('officials').where('id', officialId).first();
      const officialTitle = official?.title || 'Official';

      if (requesterUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: requesterUserId,
          eventType: 'AppointmentConfirmed',
          title: `Appointment Confirmed: ${referenceNo}`,
          body: `Your appointment is confirmed for ${dateStr}.`,
          link: `/my/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `AppointmentConfirmed:${appointmentId}:${requesterUserId}`,
          emailSubject: `OAMS Appointment Confirmed: ${referenceNo}`,
          smsTemplateId: 'DLT-TE-1001',
          smsVariables: {
            official: officialTitle,
            date: dateStr.split(',')[0] || dateStr,
            time: dateStr.split(',')[1] || dateStr,
            referenceNo,
          },
        });
      }

      if (official && official.user_id) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: official.user_id,
          eventType: 'AppointmentConfirmed',
          title: `Confirmed: ${referenceNo}`,
          body: `Appointment ${referenceNo} has been confirmed for ${dateStr}.`,
          link: `/app/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `AppointmentConfirmed:${appointmentId}:${official.user_id}`,
          emailSubject: `OAMS Appointment Confirmed: ${referenceNo}`,
        });
      }
      break;
    }

    case 'AppointmentRejected': {
      const { appointmentId, referenceNo, requesterUserId, reason } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        requesterUserId?: string;
        reason: string;
      };

      if (requesterUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: requesterUserId,
          eventType: 'AppointmentRejected',
          title: `Appointment Request Declined: ${referenceNo}`,
          body: `Your appointment request could not be accommodated: "${reason}".`,
          link: `/my/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `AppointmentRejected:${appointmentId}:${requesterUserId}`,
          emailSubject: `OAMS Appointment Request Update: ${referenceNo}`,
        });
      }
      break;
    }

    case 'PriorityChanged': {
      const { appointmentId, referenceNo, newPriority, reason } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        newPriority: Priority;
        reason: string;
      };

      const apt = await db('appointments').where('id', appointmentId).first();
      if (apt && apt.assigned_to_user_id) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: apt.assigned_to_user_id,
          eventType: 'PriorityChanged',
          title: `Priority Changed: ${referenceNo}`,
          body: `Priority set to ${newPriority}: "${reason}".`,
          link: `/app/appointments/${appointmentId}`,
          priority: newPriority,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `PriorityChanged:${appointmentId}:${Date.now()}`,
        });
      }
      break;
    }

    case 'UrgentRequest': {
      const { appointmentId, referenceNo, officialId, subject, reason } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        officialId: string;
        subject: string;
        reason?: string;
      };

      const recipientUserIds: string[] = [];

      // Official user
      const official = await db('officials').where('id', officialId).first();
      if (official && official.user_id) {
        recipientUserIds.push(official.user_id);
      }

      // All active assigned support staff (§14.4 T4, §22 Criterion 4)
      const supportStaff = await db('support_staff_assignments')
        .where('official_id', officialId)
        .where('active_from', '<=', db.fn.now())
        .andWhere((qb) => {
          qb.whereNull('active_to').orWhere('active_to', '>=', db.fn.now());
        });

      for (const staff of supportStaff) {
        if (!recipientUserIds.includes(staff.user_id)) {
          recipientUserIds.push(staff.user_id);
        }
      }

      for (const userId of recipientUserIds) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId,
          eventType: 'UrgentRequest',
          title: `URGENT: Appointment Request ${referenceNo}`,
          body: `Urgent request regarding "${subject}". Reason: ${reason || 'Urgent attention required'}.`,
          link: `/app/appointments/${appointmentId}`,
          priority: Priority.URGENT,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `UrgentRequest:${appointmentId}:${userId}:${Date.now()}`,
          emailSubject: `URGENT OAMS Request: ${referenceNo} - ${subject}`,
        });
      }
      break;
    }

    case 'HoldExpired': {
      const { appointmentId, referenceNo, assignedToUserId } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        assignedToUserId?: string;
      };

      if (assignedToUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: assignedToUserId,
          eventType: 'HoldExpired',
          title: `Holds Expired: ${referenceNo}`,
          body: `Proposed time holds for ${referenceNo} expired without requester response. Returned to review queue.`,
          link: `/app/appointments/${appointmentId}`,
          priority: Priority.MEDIUM,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `HoldExpired:${appointmentId}:${Date.now()}`,
        });
      }
      break;
    }

    case 'SlaReminder': {
      const { appointmentId, referenceNo, assignedToUserId, slaDueAt } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        assignedToUserId?: string;
        slaDueAt: string;
      };

      if (assignedToUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: assignedToUserId,
          eventType: 'SlaReminder',
          title: `SLA Reminder (50%): ${referenceNo}`,
          body: `50% of the review SLA has elapsed for ${referenceNo}. Due by ${new Date(slaDueAt).toLocaleString('en-IN')}.`,
          link: `/app/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `SlaReminder:${appointmentId}:${Date.now()}`,
          emailSubject: `OAMS: SLA Reminder (50%) for ${referenceNo}`,
        });
      }
      break;
    }

    case 'SlaEscalated': {
      const { appointmentId, referenceNo, assignedToUserId, slaDueAt } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        assignedToUserId?: string;
        slaDueAt: string;
      };

      if (assignedToUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: assignedToUserId,
          eventType: 'SlaEscalated',
          title: `SLA ESCALATED (100%): ${referenceNo}`,
          body: `SLA deadline (${new Date(slaDueAt).toLocaleString('en-IN')}) breached for ${referenceNo}. Escalated.`,
          link: `/app/appointments/${appointmentId}`,
          priority: Priority.URGENT,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `SlaEscalated:${appointmentId}:${Date.now()}`,
          emailSubject: `OAMS ALERT: SLA Escalated for ${referenceNo}`,
        });
      }
      break;
    }

    case 'ChangeRequested': {
      const { appointmentId, referenceNo, requesterName, reason, officialId } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        requesterName: string;
        reason: string;
        officialId: string;
      };

      // Notify support staff of official
      const staffList = await db('support_staff_assignments')
        .where('official_id', officialId)
        .where('active_from', '<=', db.fn.now())
        .andWhere((qb) => {
          qb.whereNull('active_to').orWhere('active_to', '>=', db.fn.now());
        });

      for (const staff of staffList) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: staff.user_id,
          eventType: 'ChangeRequested',
          title: `Change Requested: ${referenceNo}`,
          body: `${requesterName || 'Requester'} requested to reschedule appointment: "${reason}".`,
          link: `/app/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `ChangeRequested:${appointmentId}:${staff.user_id}:${Date.now()}`,
          emailSubject: `OAMS: Reschedule Request for ${referenceNo}`,
        });
      }
      break;
    }

    case 'AppointmentRescheduled': {
      const { appointmentId, referenceNo, requesterUserId, officialId, startAt, reason } =
        event.payload as {
          appointmentId: string;
          referenceNo: string;
          requesterUserId?: string;
          officialId: string;
          startAt: string;
          reason?: string;
        };

      const dateStr = startAt ? new Date(startAt).toLocaleString('en-IN') : 'New Scheduled Time';

      // 1. Notify Requester
      if (requesterUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: requesterUserId,
          eventType: 'AppointmentRescheduled',
          title: `Appointment Rescheduled: ${referenceNo}`,
          body: `Your appointment has been moved to ${dateStr}.${reason ? ` Reason: ${reason}` : ''}`,
          link: `/my/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `AppointmentRescheduled:${appointmentId}:${requesterUserId}:${Date.now()}`,
          emailSubject: `OAMS: Appointment Rescheduled (${referenceNo})`,
        });
      }

      // 2. Notify Official
      const official = await db('officials').where('id', officialId).first();
      if (official && official.user_id) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: official.user_id,
          eventType: 'AppointmentRescheduled',
          title: `Rescheduled: ${referenceNo}`,
          body: `Appointment ${referenceNo} has been rescheduled to ${dateStr}.`,
          link: `/app/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `AppointmentRescheduled:${appointmentId}:${official.user_id}:${Date.now()}`,
          emailSubject: `OAMS: Appointment Rescheduled (${referenceNo})`,
        });
      }

      // 3. Notify Support Staff
      const staffList = await db('support_staff_assignments')
        .where('official_id', officialId)
        .where('active_from', '<=', db.fn.now())
        .andWhere((qb) => {
          qb.whereNull('active_to').orWhere('active_to', '>=', db.fn.now());
        });

      for (const staff of staffList) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: staff.user_id,
          eventType: 'AppointmentRescheduled',
          title: `Rescheduled: ${referenceNo}`,
          body: `Appointment ${referenceNo} has been moved to ${dateStr}.`,
          link: `/app/appointments/${appointmentId}`,
          priority: Priority.MEDIUM,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `AppointmentRescheduled:${appointmentId}:${staff.user_id}:${Date.now()}`,
          emailSubject: `OAMS: Appointment Rescheduled (${referenceNo})`,
        });
      }
      break;
    }

    case 'AppointmentCancelled': {
      const { appointmentId, referenceNo, requesterUserId, officialId, reason, cancelledBy } =
        event.payload as {
          appointmentId: string;
          referenceNo: string;
          requesterUserId?: string;
          officialId?: string;
          reason: string;
          cancelledBy?: string;
        };

      // 1. Notify Requester (if not cancelled by requester)
      if (requesterUserId && requesterUserId !== cancelledBy) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: requesterUserId,
          eventType: 'AppointmentCancelled',
          title: `Appointment Cancelled: ${referenceNo}`,
          body: `Your appointment request ${referenceNo} was cancelled. Reason: "${reason}".`,
          link: `/my/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `AppointmentCancelled:${appointmentId}:${requesterUserId}`,
          emailSubject: `OAMS: Appointment Cancelled (${referenceNo})`,
        });
      }

      // 2. Notify Official & Support Staff if officialId known
      if (officialId) {
        const official = await db('officials').where('id', officialId).first();
        if (official && official.user_id && official.user_id !== cancelledBy) {
          await deliverInAppAndEmail({
            orgId: event.orgId,
            userId: official.user_id,
            eventType: 'AppointmentCancelled',
            title: `Appointment Cancelled: ${referenceNo}`,
            body: `Appointment ${referenceNo} has been cancelled. Reason: "${reason}".`,
            link: `/app/appointments/${appointmentId}`,
            priority: Priority.MEDIUM,
            entityType: 'appointment',
            entityId: appointmentId,
            dedupeKey: `AppointmentCancelled:${appointmentId}:${official.user_id}`,
            emailSubject: `OAMS: Appointment Cancelled (${referenceNo})`,
          });
        }

        const staffList = await db('support_staff_assignments')
          .where('official_id', officialId)
          .where('active_from', '<=', db.fn.now())
          .andWhere((qb) => {
            qb.whereNull('active_to').orWhere('active_to', '>=', db.fn.now());
          });

        for (const staff of staffList) {
          if (staff.user_id !== cancelledBy) {
            await deliverInAppAndEmail({
              orgId: event.orgId,
              userId: staff.user_id,
              eventType: 'AppointmentCancelled',
              title: `Appointment Cancelled: ${referenceNo}`,
              body: `Appointment ${referenceNo} has been cancelled. Reason: "${reason}".`,
              link: `/app/appointments/${appointmentId}`,
              priority: Priority.MEDIUM,
              entityType: 'appointment',
              entityId: appointmentId,
              dedupeKey: `AppointmentCancelled:${appointmentId}:${staff.user_id}`,
              emailSubject: `OAMS: Appointment Cancelled (${referenceNo})`,
            });
          }
        }
      }
      break;
    }

    case 'AppointmentCompleted':
    case 'MeetingCompleted': {
      const {
        appointmentId,
        referenceNo,
        primaryOfficialId,
        officialId,
        completedByUserId,
        requesterUserId,
        requesterEmail,
        subject,
      } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        primaryOfficialId?: string;
        officialId?: string;
        completedByUserId?: string;
        requesterUserId?: string;
        requesterEmail?: string;
        subject?: string;
      };

      const effOfficialId = primaryOfficialId || officialId;

      // 1. Notify Requester
      if (requesterUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: requesterUserId,
          eventType: 'AppointmentCompleted',
          title: `Appointment Completed: ${referenceNo}`,
          body: `Your appointment ${referenceNo}${subject ? ` regarding "${subject}"` : ''} has been completed. Meeting minutes and decisions are recorded.`,
          link: `/my/appointments/${appointmentId}`,
          priority: Priority.LOW,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `AppointmentCompleted:${appointmentId}:${requesterUserId}`,
          emailSubject: `OAMS: Appointment Completed (${referenceNo})`,
        });
      } else if (requesterEmail) {
        try {
          await sendEmail({
            to: requesterEmail,
            subject: `OAMS: Appointment Completed (${referenceNo})`,
            html: `<p>Dear Attendee, your appointment (${referenceNo}) has concluded. Thank you for your cooperation.</p>`,
          });
        } catch (emailErr) {
          logger.warn({ emailErr, requesterEmail }, 'Failed to send appointment completed email');
        }
      }

      // 2. Notify Official & Support Staff if completed by someone else
      if (effOfficialId) {
        const official = await db('officials').where('id', effOfficialId).first();
        if (official && official.user_id && official.user_id !== completedByUserId) {
          await deliverInAppAndEmail({
            orgId: event.orgId,
            userId: official.user_id,
            eventType: 'AppointmentCompleted',
            title: `Appointment Concluded: ${referenceNo}`,
            body: `Appointment ${referenceNo} has been marked completed.`,
            link: `/app/appointments/${appointmentId}`,
            priority: Priority.LOW,
            entityType: 'appointment',
            entityId: appointmentId,
            dedupeKey: `AppointmentCompleted:${appointmentId}:${official.user_id}`,
          });
        }
      }
      break;
    }

    case 'AppointmentReminder': {
      const {
        appointmentId,
        referenceNo,
        requesterUserId,
        requesterEmail,
        startAt,
        officialTitle,
        location,
        subject,
      } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        requesterUserId?: string;
        requesterEmail?: string;
        startAt?: string;
        officialTitle?: string;
        location?: string;
        subject?: string;
      };

      const dateStr = startAt ? new Date(startAt).toLocaleString('en-IN') : 'Scheduled Time';

      if (requesterUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: requesterUserId,
          eventType: 'AppointmentReminder',
          title: `Appointment Reminder: ${referenceNo}`,
          body: `Reminder: You have an upcoming appointment for "${subject || 'Meeting'}" with ${officialTitle || 'the official'} on ${dateStr} at ${location || 'Chamber 101'}.`,
          link: `/my/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `AppointmentReminder:${appointmentId}:${requesterUserId}:${Date.now()}`,
          emailSubject: `OAMS Reminder: Upcoming Appointment (${referenceNo})`,
        });
      } else if (requesterEmail) {
        try {
          await sendEmail({
            to: requesterEmail,
            subject: `OAMS Reminder: Upcoming Appointment (${referenceNo})`,
            html: `<p>Reminder: You have an upcoming appointment (${referenceNo}) on ${dateStr} at ${location || 'Chamber 101'}.</p>`,
          });
        } catch (emailErr) {
          logger.warn({ emailErr, requesterEmail }, 'Failed to send reminder email');
        }
      }
      break;
    }

    case 'OfficialUnavailable':
    case 'SlotChanged': {
      const {
        appointmentId,
        referenceNo,
        requesterUserId,
        requesterEmail,
        reason,
        officialTitle,
      } = event.payload as {
        appointmentId: string;
        referenceNo: string;
        requesterUserId?: string;
        requesterEmail?: string;
        reason?: string;
        officialTitle?: string;
      };

      if (requesterUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: requesterUserId,
          eventType: 'OfficialUnavailable',
          title: `Schedule Notice: ${referenceNo}`,
          body: `${officialTitle || 'The official'} is unavailable at the previously scheduled time.${reason ? ` Reason: ${reason}` : ''} Please select an alternative slot.`,
          link: `/my/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `OfficialUnavailable:${appointmentId}:${requesterUserId}:${Date.now()}`,
          emailSubject: `OAMS Schedule Update: ${referenceNo}`,
        });
      } else if (requesterEmail) {
        try {
          await sendEmail({
            to: requesterEmail,
            subject: `OAMS Schedule Update: ${referenceNo}`,
            html: `<p>Important: ${officialTitle || 'The official'} is unavailable for appointment ${referenceNo}. Please review alternative slots.</p>`,
          });
        } catch (emailErr) {
          logger.warn({ emailErr, requesterEmail }, 'Failed to send unavailable notice email');
        }
      }
      break;
    }

    case 'AdminNotification':
    case 'SystemAlert': {
      const { userId, title, message, priority, link, entityType, entityId } = event.payload as {
        userId: string;
        title: string;
        message: string;
        priority?: Priority;
        link?: string;
        entityType?: string;
        entityId?: string;
      };

      if (userId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId,
          eventType: 'SystemAlert',
          title: title || 'System Notification',
          body: message || 'Important system notification.',
          link: link || '/app/dashboard',
          priority: priority || Priority.HIGH,
          entityType: entityType || 'system',
          entityId: entityId || userId,
          dedupeKey: `SystemAlert:${userId}:${Date.now()}`,
          emailSubject: `OAMS Alert: ${title || 'System Notification'}`,
        });
      }
      break;
    }

    case 'CapacityWarning': {
      const { officialId, message } = event.payload as {
        officialId: string;
        message: string;
      };

      const staffList = await db('support_staff_assignments')
        .where('official_id', officialId)
        .where('active_from', '<=', db.fn.now())
        .andWhere((qb) => {
          qb.whereNull('active_to').orWhere('active_to', '>=', db.fn.now());
        });

      for (const staff of staffList) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: staff.user_id,
          eventType: 'CapacityWarning',
          title: `Capacity Limit Warning`,
          body: message,
          link: `/app/calendar`,
          priority: Priority.MEDIUM,
          entityType: 'official',
          entityId: officialId,
          dedupeKey: `CapacityWarning:${officialId}:${staff.user_id}:${Date.now()}`,
        });
      }
      break;
    }

    // --- Track 6: To-Do module notifications (§14.4 T6) ---
    case 'TaskAssigned': {
      const { taskId, referenceNo, title, assigneeUserId, dueAt } = event.payload as {
        taskId: string;
        referenceNo: string;
        title: string;
        assigneeUserId: string;
        dueAt?: string;
      };

      if (assigneeUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: assigneeUserId,
          eventType: 'TaskAssigned',
          title: `Task Assigned: ${title}`,
          body: `You have been assigned task ${referenceNo}${dueAt ? ` (due: ${dueAt.substring(0, 10)})` : ''}.`,
          link: `/app/todo?taskId=${taskId}`,
          priority: Priority.MEDIUM,
          entityType: 'task',
          entityId: taskId,
          dedupeKey: `TaskAssigned:${taskId}:${assigneeUserId}`,
          emailSubject: `OAMS: You have been assigned task ${referenceNo}`,
        });
      }
      break;
    }

    case 'TaskCompleted': {
      const { taskId, referenceNo, title, ownerUserId, completedByName } = event.payload as {
        taskId: string;
        referenceNo: string;
        title: string;
        ownerUserId: string;
        completedByName?: string;
      };

      if (ownerUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: ownerUserId,
          eventType: 'TaskCompleted',
          title: `Task Completed: ${title}`,
          body: `${completedByName || 'Assignee'} has completed task ${referenceNo}.`,
          link: `/app/todo?taskId=${taskId}`,
          priority: Priority.MEDIUM,
          entityType: 'task',
          entityId: taskId,
          dedupeKey: `TaskCompleted:${taskId}:${Date.now()}`,
          emailSubject: `OAMS: Task ${referenceNo} has been completed`,
        });
      }
      break;
    }

    case 'TaskVerificationNeeded': {
      const { taskId, referenceNo, title, ownerUserId } = event.payload as {
        taskId: string;
        referenceNo: string;
        title: string;
        ownerUserId: string;
      };

      if (ownerUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: ownerUserId,
          eventType: 'TaskVerificationNeeded',
          title: `Task Verification Needed`,
          body: `Task ${referenceNo} (${title}) is completed and awaits your verification.`,
          link: `/app/todo?taskId=${taskId}`,
          priority: Priority.HIGH,
          entityType: 'task',
          entityId: taskId,
          dedupeKey: `TaskVerificationNeeded:${taskId}`,
          emailSubject: `OAMS: Action required - Verify task ${referenceNo}`,
        });
      }
      break;
    }

    case 'TaskReminder': {
      const { taskId, referenceNo, title, userId } = event.payload as {
        taskId: string;
        referenceNo: string;
        title: string;
        userId: string;
      };

      if (userId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId,
          eventType: 'TaskReminder',
          title: `Task Reminder: ${title}`,
          body: `Reminder for task ${referenceNo}.`,
          link: `/app/todo?taskId=${taskId}`,
          priority: Priority.MEDIUM,
          entityType: 'task',
          entityId: taskId,
          dedupeKey: `TaskReminder:${taskId}:${userId}:${Date.now()}`,
          emailSubject: `OAMS Reminder: Task ${referenceNo}`,
        });
      }
      break;
    }

    case 'TaskOverdue': {
      const { taskId, referenceNo, title, ownerUserId, assigneeUserId } = event.payload as {
        taskId: string;
        referenceNo: string;
        title: string;
        ownerUserId: string;
        assigneeUserId?: string;
      };

      const recipientIds = new Set<string>();
      if (ownerUserId) recipientIds.add(ownerUserId);
      if (assigneeUserId) recipientIds.add(assigneeUserId);

      for (const uid of recipientIds) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: uid,
          eventType: 'TaskOverdue',
          title: `Task Overdue: ${title}`,
          body: `Task ${referenceNo} is now overdue.`,
          link: `/app/todo?taskId=${taskId}`,
          priority: Priority.HIGH,
          entityType: 'task',
          entityId: taskId,
          dedupeKey: `TaskOverdue:${taskId}:${uid}`,
          emailSubject: `OAMS Alert: Task ${referenceNo} is overdue`,
        });
      }
      break;
    }

    case 'TaskCommented': {
      const { taskId, referenceNo, title, authorId, authorName, ownerUserId, assigneeUserId } =
        event.payload as {
          taskId: string;
          referenceNo: string;
          title: string;
          authorId: string;
          authorName?: string;
          ownerUserId: string;
          assigneeUserId?: string;
        };

      // Find watchers
      const watchers = await db('task_watchers').where('task_id', taskId).select('user_id');
      const recipientIds = new Set<string>();
      if (ownerUserId && ownerUserId !== authorId) recipientIds.add(ownerUserId);
      if (assigneeUserId && assigneeUserId !== authorId) recipientIds.add(assigneeUserId);
      for (const w of watchers) {
        if (w.user_id !== authorId) recipientIds.add(w.user_id);
      }

      for (const uid of recipientIds) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: uid,
          eventType: 'TaskCommented',
          title: `New Comment on Task: ${title}`,
          body: `${authorName || 'A user'} commented on task ${referenceNo}.`,
          link: `/app/todo?taskId=${taskId}`,
          priority: Priority.MEDIUM,
          entityType: 'task',
          entityId: taskId,
          dedupeKey: `TaskCommented:${taskId}:${uid}:${Date.now()}`,
        });
      }
      break;
    }

    case 'VisitorArrived': {
      const { visitId, appointmentId, officialId, visitorName, referenceNo, isWalkIn } =
        event.payload as {
          visitId: string;
          appointmentId: string;
          officialId?: string;
          visitorName: string;
          referenceNo: string;
          isWalkIn?: boolean;
        };

      const recipientIds = new Set<string>();

      if (officialId) {
        const official = await db('officials').where('id', officialId).first();
        if (official && official.user_id) recipientIds.add(official.user_id);

        const staffList = await db('support_staff_assignments')
          .where('official_id', officialId)
          .where('active_from', '<=', db.fn.now())
          .andWhere((qb) => {
            qb.whereNull('active_to').orWhere('active_to', '>=', db.fn.now());
          });

        for (const s of staffList) recipientIds.add(s.user_id);
      }

      for (const uid of recipientIds) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: uid,
          eventType: 'VisitorArrived',
          title: isWalkIn
            ? `Walk-in Visitor Arrived: ${visitorName}`
            : `Visitor Arrived: ${visitorName}`,
          body: `${visitorName} (${referenceNo}) has arrived at reception.`,
          link: `/app/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'visit',
          entityId: visitId,
          dedupeKey: `VisitorArrived:${visitId}:${uid}:${Date.now()}`,
          emailSubject: `OAMS Alert: Visitor ${visitorName} Arrived`,
        });
      }
      break;
    }

    case 'VisitorCheckedIn': {
      const { visitId, appointmentId, officialId, visitorName, badgeNo } = event.payload as {
        visitId: string;
        appointmentId: string;
        officialId?: string;
        visitorName: string;
        badgeNo: string;
      };

      const recipientIds = new Set<string>();

      if (officialId) {
        const official = await db('officials').where('id', officialId).first();
        if (official && official.user_id) recipientIds.add(official.user_id);

        const staffList = await db('support_staff_assignments')
          .where('official_id', officialId)
          .where('active_from', '<=', db.fn.now())
          .andWhere((qb) => {
            qb.whereNull('active_to').orWhere('active_to', '>=', db.fn.now());
          });

        for (const s of staffList) recipientIds.add(s.user_id);
      }

      for (const uid of recipientIds) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: uid,
          eventType: 'VisitorCheckedIn',
          title: `Visitor Checked In: Badge #${badgeNo}`,
          body: `${visitorName} has checked in (Badge #${badgeNo}) and is waiting.`,
          link: `/app/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'visit',
          entityId: visitId,
          dedupeKey: `VisitorCheckedIn:${visitId}:${uid}`,
          emailSubject: `OAMS: ${visitorName} Checked In (Badge #${badgeNo})`,
        });
      }
      break;
    }

    case 'VisitorDenied': {
      const { visitId, appointmentId, officialId, visitorName, reason } = event.payload as {
        visitId: string;
        appointmentId: string;
        officialId?: string;
        visitorName: string;
        reason: string;
      };

      const recipientIds = new Set<string>();

      if (officialId) {
        const official = await db('officials').where('id', officialId).first();
        if (official && official.user_id) recipientIds.add(official.user_id);

        const staffList = await db('support_staff_assignments')
          .where('official_id', officialId)
          .where('active_from', '<=', db.fn.now())
          .andWhere((qb) => {
            qb.whereNull('active_to').orWhere('active_to', '>=', db.fn.now());
          });

        for (const s of staffList) recipientIds.add(s.user_id);
      }

      for (const uid of recipientIds) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: uid,
          eventType: 'VisitorDenied',
          title: `Visitor Entry Denied: ${visitorName}`,
          body: `Visitor ${visitorName} was denied entry: "${reason}".`,
          link: `/app/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'visit',
          entityId: visitId,
          dedupeKey: `VisitorDenied:${visitId}:${uid}`,
          emailSubject: `OAMS Alert: Visitor Entry Denied (${visitorName})`,
        });
      }
      break;
    }

    case 'AppointmentNoShow': {
      const { appointmentId, referenceNo, officialId, requesterUserId, requesterEmail } =
        event.payload as {
          appointmentId: string;
          referenceNo: string;
          officialId?: string;
          requesterUserId?: string;
          requesterEmail?: string;
        };

      if (requesterUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: requesterUserId,
          eventType: 'AppointmentNoShow',
          title: `Appointment Closed (No-Show): ${referenceNo}`,
          body: `Appointment ${referenceNo} has been marked as No-Show.`,
          link: `/my/appointments/${appointmentId}`,
          priority: Priority.HIGH,
          entityType: 'appointment',
          entityId: appointmentId,
          dedupeKey: `AppointmentNoShow:${appointmentId}:${requesterUserId}`,
          emailSubject: `OAMS: Appointment Closed - No-Show (${referenceNo})`,
        });
      } else if (requesterEmail) {
        try {
          await sendEmail({
            to: requesterEmail,
            subject: `OAMS: Appointment Closed - No-Show (${referenceNo})`,
            html: `<p>Your appointment (${referenceNo}) has been closed as No-Show as arrival grace period passed without check-in.</p>`,
          });
        } catch (emailErr) {
          logger.warn({ emailErr, requesterEmail }, 'Failed to send no-show email');
        }
      }

      if (officialId) {
        const staffList = await db('support_staff_assignments')
          .where('official_id', officialId)
          .where('active_from', '<=', db.fn.now())
          .andWhere((qb) => {
            qb.whereNull('active_to').orWhere('active_to', '>=', db.fn.now());
          });

        for (const s of staffList) {
          await deliverInAppAndEmail({
            orgId: event.orgId,
            userId: s.user_id,
            eventType: 'AppointmentNoShow',
            title: `Appointment Marked No-Show: ${referenceNo}`,
            body: `Appointment ${referenceNo} was marked as No-Show after grace period elapsed.`,
            link: `/app/appointments/${appointmentId}`,
            priority: Priority.MEDIUM,
            entityType: 'appointment',
            entityId: appointmentId,
            dedupeKey: `AppointmentNoShow:Staff:${appointmentId}:${s.user_id}`,
          });
        }
      }
      break;
    }

    case 'DelegationStarted': {
      const {
        officialId,
        fromUserId,
        toUserId,
        scope,
        startsAt,
        endsAt,
        officialTitle,
        delegateName,
      } = event.payload as {
        officialId: string;
        fromUserId: string;
        toUserId: string;
        scope: string;
        startsAt: string;
        endsAt: string;
        officialTitle: string;
        delegateName?: string;
      };

      // 1. Notify Delegate
      await deliverInAppAndEmail({
        orgId: event.orgId,
        userId: toUserId,
        eventType: 'DelegationStarted',
        title: `Delegation Activated: ${officialTitle}`,
        body: `You have been delegated ${scope} authority for ${officialTitle} until ${new Date(endsAt).toLocaleString('en-IN')}.`,
        link: '/app/settings/personal-access',
        priority: Priority.HIGH,
        entityType: 'delegation',
        entityId: (event.payload.delegationId as string) || officialId,
        dedupeKey: `DelegationStarted:Delegate:${event.payload.delegationId || officialId}:${toUserId}`,
        emailSubject: `OAMS: Delegation Activated for ${officialTitle}`,
      });

      // 2. Notify Official
      if (fromUserId && fromUserId !== toUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: fromUserId,
          eventType: 'DelegationStarted',
          title: `Delegation Active: ${delegateName || 'Delegate'}`,
          body: `Authority (${scope}) successfully delegated to ${delegateName || 'your delegate'} until ${new Date(endsAt).toLocaleString('en-IN')}.`,
          link: '/app/settings/personal-access',
          priority: Priority.MEDIUM,
          entityType: 'delegation',
          entityId: (event.payload.delegationId as string) || officialId,
          dedupeKey: `DelegationStarted:Official:${event.payload.delegationId || officialId}:${fromUserId}`,
          emailSubject: `OAMS: Delegation Active for ${officialTitle}`,
        });
      }
      break;
    }

    case 'DelegationEnded': {
      const { officialId, fromUserId, toUserId, scope, officialTitle, delegateName } =
        event.payload as {
          officialId: string;
          fromUserId: string;
          toUserId: string;
          scope: string;
          officialTitle: string;
          delegateName?: string;
        };

      // 1. Notify Delegate
      await deliverInAppAndEmail({
        orgId: event.orgId,
        userId: toUserId,
        eventType: 'DelegationEnded',
        title: `Delegation Concluded: ${officialTitle}`,
        body: `Your delegated ${scope} authority for ${officialTitle} has concluded.`,
        link: '/app/settings/personal-access',
        priority: Priority.MEDIUM,
        entityType: 'delegation',
        entityId: (event.payload.delegationId as string) || officialId,
        dedupeKey: `DelegationEnded:Delegate:${event.payload.delegationId || officialId}:${toUserId}`,
        emailSubject: `OAMS: Delegation Concluded for ${officialTitle}`,
      });

      // 2. Notify Official
      if (fromUserId && fromUserId !== toUserId) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId: fromUserId,
          eventType: 'DelegationEnded',
          title: `Delegation Concluded: ${delegateName || 'Delegate'}`,
          body: `Delegated authority (${scope}) to ${delegateName || 'delegate'} has ended and returned to primary routing.`,
          link: '/app/settings/personal-access',
          priority: Priority.MEDIUM,
          entityType: 'delegation',
          entityId: (event.payload.delegationId as string) || officialId,
          dedupeKey: `DelegationEnded:Official:${event.payload.delegationId || officialId}:${fromUserId}`,
          emailSubject: `OAMS: Delegation Concluded for ${officialTitle}`,
        });
      }
      break;
    }

    case 'PersonalAccessGranted': {
      const { officialId, staffUserId, permissions, officialTitle } = event.payload as {
        officialId: string;
        staffUserId: string;
        permissions: string[];
        officialTitle: string;
      };

      await deliverInAppAndEmail({
        orgId: event.orgId,
        userId: staffUserId,
        eventType: 'PersonalAccessGranted',
        title: `Access Granted: ${officialTitle}`,
        body: `You were granted permissions: ${permissions.join(', ')} for ${officialTitle}.`,
        link: '/app/settings/personal-access',
        priority: Priority.HIGH,
        entityType: 'official',
        entityId: officialId,
        dedupeKey: `PersonalAccessGranted:${officialId}:${staffUserId}:${Date.now()}`,
        emailSubject: `OAMS: Permissions Granted for ${officialTitle}`,
      });
      break;
    }

    case 'PersonalAccessRevoked': {
      const { officialId, staffUserId, permissions, officialTitle } = event.payload as {
        officialId: string;
        staffUserId: string;
        permissions: string[];
        officialTitle: string;
      };

      await deliverInAppAndEmail({
        orgId: event.orgId,
        userId: staffUserId,
        eventType: 'PersonalAccessRevoked',
        title: `Access Revoked: ${officialTitle}`,
        body: `Permissions revoked: ${permissions.join(', ')} for ${officialTitle}.`,
        link: '/app/settings/personal-access',
        priority: Priority.HIGH,
        entityType: 'official',
        entityId: officialId,
        dedupeKey: `PersonalAccessRevoked:${officialId}:${staffUserId}:${Date.now()}`,
        emailSubject: `OAMS: Permissions Revoked for ${officialTitle}`,
      });
      break;
    }

    case 'CalendarSyncMismatch': {
      const { officialId, appointmentId, referenceNo, externalEventId, description } =
        event.payload as {
          officialId: string;
          appointmentId?: string;
          referenceNo?: string;
          externalEventId?: string;
          description?: string;
        };

      const staffList = await db('official_support_staff')
        .where('official_id', officialId)
        .where('active_from', '<=', db.fn.now())
        .andWhere((qb) => {
          qb.whereNull('active_to').orWhere('active_to', '>=', db.fn.now());
        });

      const admins = await db('users')
        .join('user_roles', 'users.id', 'user_roles.user_id')
        .join('roles', 'user_roles.role_id', 'roles.id')
        .where('users.org_id', event.orgId)
        .whereIn('roles.code', ['APPOINTMENT_ADMIN', 'SUPER_ADMIN'])
        .select('users.id')
        .distinct();

      const recipientIds = new Set<string>();
      staffList.forEach((s: any) => recipientIds.add(s.user_id));
      admins.forEach((a: any) => recipientIds.add(a.id));

      const title = `Calendar Sync Mismatch: ${referenceNo || 'Appointment'}`;
      const body =
        description ||
        `External Outlook event modification detected for ${referenceNo || 'appointment'}. OAMS appointment remains authoritative.`;
      const link = appointmentId ? `/app/appointments/${appointmentId}` : '/app/calendar';

      for (const userId of recipientIds) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId,
          eventType: 'CalendarSyncMismatch',
          title,
          body,
          link,
          priority: Priority.HIGH,
          entityType: 'appointment',
          entityId: appointmentId || officialId,
          dedupeKey: `CalendarSyncMismatch:${officialId}:${appointmentId || externalEventId || 'unknown'}:${userId}:${Date.now()}`,
          emailSubject: `OAMS ALERT: ${title}`,
        });
      }
      break;
    }

    case 'SyncFailed': {
      const { officialId, syncType, errorMessage } = event.payload as {
        officialId: string;
        syncType: string;
        errorMessage: string;
      };

      const staffList = await db('official_support_staff')
        .where('official_id', officialId)
        .where('active_from', '<=', db.fn.now())
        .andWhere((qb) => {
          qb.whereNull('active_to').orWhere('active_to', '>=', db.fn.now());
        });

      const admins = await db('users')
        .join('user_roles', 'users.id', 'user_roles.user_id')
        .join('roles', 'user_roles.role_id', 'roles.id')
        .where('users.org_id', event.orgId)
        .whereIn('roles.code', ['APPOINTMENT_ADMIN', 'SUPER_ADMIN'])
        .select('users.id')
        .distinct();

      const recipientIds = new Set<string>();
      staffList.forEach((s: any) => recipientIds.add(s.user_id));
      admins.forEach((a: any) => recipientIds.add(a.id));

      for (const userId of recipientIds) {
        await deliverInAppAndEmail({
          orgId: event.orgId,
          userId,
          eventType: 'SyncFailed',
          title: `Calendar Sync Failed (${syncType})`,
          body: `Calendar synchronization failed: ${errorMessage}. Retrying automatically.`,
          link: '/admin/ops',
          priority: Priority.HIGH,
          entityType: 'calendar',
          entityId: officialId,
          dedupeKey: `SyncFailed:${officialId}:${syncType}:${userId}:${Date.now()}`,
          emailSubject: `OAMS: Calendar Sync Failed (${syncType})`,
        });
      }
      break;
    }

    default:
      logger.debug({ eventType: event.eventType }, 'Event type handled with default no-op');
  }
}

export function isUserInQuietHours(
  quietHoursStart?: string | null,
  quietHoursEnd?: string | null,
  timezone: string = 'Asia/Kolkata',
  now: Date = new Date(),
): boolean {
  if (!quietHoursStart || !quietHoursEnd) return false;
  if (quietHoursStart === quietHoursEnd) return false;

  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const currentTimeStr = formatter.format(now); // "HH:MM"

    if (quietHoursStart < quietHoursEnd) {
      return currentTimeStr >= quietHoursStart && currentTimeStr < quietHoursEnd;
    } else {
      // Crosses midnight, e.g. 22:00 to 07:00
      return currentTimeStr >= quietHoursStart || currentTimeStr < quietHoursEnd;
    }
  } catch {
    return false;
  }
}

interface DeliveryParams {
  orgId: string;
  userId: string;
  eventType: string;
  title: string;
  body: string;
  link: string;
  priority: Priority;
  entityType: string;
  entityId: string;
  dedupeKey: string;
  emailSubject?: string;
  phone?: string;
  smsTemplateId?: string;
  smsVariables?: Record<string, string>;
}

export async function deliverInAppAndEmail(params: DeliveryParams): Promise<void> {
  try {
    // 1. IN_APP delivery: insert into notifications
    const existing = await db('notifications').where('dedupe_key', params.dedupeKey).first();
    if (existing) {
      logger.debug({ dedupeKey: params.dedupeKey }, 'Notification deduplicated');
      return;
    }

    const [notification] = await db('notifications')
      .insert({
        org_id: params.orgId,
        user_id: params.userId,
        event_type: params.eventType,
        title: params.title,
        body: params.body,
        link: params.link,
        priority: params.priority,
        entity_type: params.entityType,
        entity_id: params.entityId,
        dedupe_key: params.dedupeKey,
      })
      .returning('*');

    await db('notification_deliveries').insert({
      notification_id: notification.id,
      channel: NotificationChannel.IN_APP,
      status: 'SENT',
      sent_at: db.fn.now(),
    });

    // 2. Publish to Redis channel user:{userId} for live SSE stream (§14.1 & §14.2)
    try {
      await redis.publish(
        `user:${params.userId}`,
        JSON.stringify({
          type: 'notification',
          data: notification,
        }),
      );
    } catch (redisErr) {
      logger.warn({ redisErr }, 'Failed to publish live notification to Redis');
    }

    const user = await db('users').where('id', params.userId).first();
    const isUrgent = params.priority === Priority.URGENT;
    const recipientPhone = params.phone || user?.phone;

    // 3. MICROSOFT POWER AUTOMATE: Simultaneous Push Notification + Email Dispatch
    // Forward the push notification and email simultaneously to Microsoft Power Automate
    const refMatch = (params.dedupeKey + ' ' + params.title + ' ' + params.body).match(
      /\b([A-Z]{2,4}-\d{3,}(?:-\d+)?)\b/i,
    );
    const fullLink = params.link.startsWith('http')
      ? params.link
      : `${config.WEB_URL}${params.link.startsWith('/') ? '' : '/'}${params.link}`;

    const defaultHtml = renderNotificationEmailHtml({
      title: params.title,
      body: params.body,
      link: params.link,
      priority: params.priority,
      referenceNo: refMatch ? refMatch[1] : undefined,
      recipientName: user?.full_name || undefined,
    });

    powerAutomateService
      .dispatchNotification({
        notificationId: notification.id,
        orgId: params.orgId,
        eventType: params.eventType,
        recipient: {
          userId: params.userId,
          email: user?.email,
          name: user?.full_name,
          phone: recipientPhone,
        },
        notification: {
          title: params.title,
          body: params.body,
          link: fullLink,
          priority: params.priority,
          referenceNo: refMatch ? refMatch[1] : undefined,
          emailSubject: params.emailSubject || `OAMS: ${params.title}`,
          emailHtml: defaultHtml,
          pushTitle: params.title,
          pushBody: params.body,
        },
        actions: [{ label: 'View in OAMS', url: fullLink }],
      })
      .then(async (success) => {
        if (success) {
          try {
            await db('notification_deliveries').insert({
              notification_id: notification.id,
              channel: NotificationChannel.POWER_AUTOMATE,
              status: 'SENT',
              sent_at: db.fn.now(),
            });
          } catch {}
        }
      })
      .catch((err) => {
        logger.debug({ err, notificationId: notification.id }, 'Power Automate dual dispatch failed');
      });

    // 4. EMAIL delivery: check quiet hours, digest mode, and send via Nodemailer
    if (user && user.email) {
      let skipImmediateEmail = false;

      if (!isUrgent) {
        // Check user notification preferences for EMAIL channel
        try {
          const pref = await db('notification_preferences')
            .where({
              user_id: params.userId,
              event_type: params.eventType,
              channel: NotificationChannel.EMAIL,
            })
            .first();

          if (pref && pref.enabled === false) {
            logger.info(
              { userId: params.userId, eventType: params.eventType },
              'Email delivery skipped due to user preference',
            );
            await db('notification_deliveries').insert({
              notification_id: notification.id,
              channel: NotificationChannel.EMAIL,
              status: 'SKIPPED_PREFERENCE',
            });
            skipImmediateEmail = true;
          }
        } catch {
          // If table query fails, continue with standard delivery
        }

        // Evaluate Quiet Hours (§14.3: non-urgent emails held during quiet hours)
        if (
          !skipImmediateEmail &&
          isUserInQuietHours(
            user.quiet_hours_start,
            user.quiet_hours_end,
            user.timezone || 'Asia/Kolkata',
          )
        ) {
          logger.info(
            { userId: params.userId, priority: params.priority },
            'Email delivery held during quiet hours',
          );
          await db('notification_deliveries').insert({
            notification_id: notification.id,
            channel: NotificationChannel.EMAIL,
            status: 'HELD_QUIET_HOURS',
          });
          skipImmediateEmail = true;
        } else if (
          !skipImmediateEmail &&
          user.digest_mode === 'DAILY' &&
          (params.priority === Priority.LOW || params.priority === Priority.MEDIUM)
        ) {
          // Evaluate Digest Mode (§14.3: LOW/MEDIUM emails held for daily digest)
          logger.info(
            { userId: params.userId, priority: params.priority },
            'Email delivery held for daily digest',
          );
          await db('notification_deliveries').insert({
            notification_id: notification.id,
            channel: NotificationChannel.EMAIL,
            status: 'HELD_DIGEST',
          });
          skipImmediateEmail = true;
        }
      }

      if (!skipImmediateEmail) {
        // Deliver Email Immediately
        try {
          let emailHtml: string = '';
          let emailSubject = params.emailSubject || `OAMS: ${params.title}`;

          // Check if custom active template exists in DB
          try {
            const templateQb = db('notification_templates').where({
              event_type: params.eventType,
              channel: 'EMAIL',
              is_active: true,
            });
            const activeTemplate =
              typeof templateQb.orderBy === 'function'
                ? await templateQb.orderBy('version', 'desc').first()
                : await templateQb.first();

            if (activeTemplate) {
              const refMatch = (params.dedupeKey + ' ' + params.title + ' ' + params.body).match(
                /\b([A-Z]{2,4}-\d{3,}(?:-\d+)?)\b/i,
              );
              const vars: Record<string, string> = {
                title: params.title,
                body: params.body,
                link: params.link,
                referenceNo: refMatch ? refMatch[1] : '',
                userName: user.full_name || 'User',
                priority: params.priority || 'MEDIUM',
              };

              emailSubject = activeTemplate.subject.replace(
                /\{\{\s*(\w+)\s*\}\}/g,
                (_: string, k: string) => vars[k] || '',
              );
              emailHtml = activeTemplate.body.replace(
                /\{\{\s*(\w+)\s*\}\}/g,
                (_: string, k: string) => vars[k] || '',
              );
            }
          } catch {
            // Ignore template query error
          }

          if (!emailHtml) {
            const refMatch = (params.dedupeKey + ' ' + params.title + ' ' + params.body).match(
              /\b([A-Z]{2,4}-\d{3,}(?:-\d+)?)\b/i,
            );
            emailHtml = renderNotificationEmailHtml({
              title: params.title,
              body: params.body,
              link: params.link,
              priority: params.priority,
              referenceNo: refMatch ? refMatch[1] : undefined,
              recipientName: user.full_name || undefined,
            });
          }

          await sendEmail({
            to: user.email,
            subject: emailSubject,
            html: emailHtml,
          });

          await db('notification_deliveries').insert({
            notification_id: notification.id,
            channel: NotificationChannel.EMAIL,
            status: 'SENT',
            sent_at: db.fn.now(),
          });
        } catch (emailErr) {
          await db('notification_deliveries').insert({
            notification_id: notification.id,
            channel: NotificationChannel.EMAIL,
            status: 'FAILED',
            last_error: emailErr instanceof Error ? emailErr.message : String(emailErr),
          });
        }
      }
    }

    // 5. SMS delivery: check quiet hours (unless URGENT) and send via TRAI DLT gateway (§17.6)
    if (recipientPhone && params.smsTemplateId) {
      if (
        !isUrgent &&
        isUserInQuietHours(
          user?.quiet_hours_start,
          user?.quiet_hours_end,
          user?.timezone || 'Asia/Kolkata',
        )
      ) {
        logger.info(
          { userId: params.userId, priority: params.priority, phone: recipientPhone },
          'SMS delivery held during quiet hours',
        );
        await db('notification_deliveries').insert({
          notification_id: notification.id,
          channel: NotificationChannel.SMS,
          status: 'HELD_QUIET_HOURS',
        });
      } else {
        try {
          const smsResult = await smsProviderService.sendSms({
            to: recipientPhone,
            templateId: params.smsTemplateId,
            variables: params.smsVariables || { message: params.body },
          });

          await db('notification_deliveries').insert({
            notification_id: notification.id,
            channel: NotificationChannel.SMS,
            status: 'SENT',
            provider_message_id: smsResult.messageId,
            sent_at: db.fn.now(),
          });
        } catch (smsErr) {
          logger.warn(
            { smsErr, phone: recipientPhone, templateId: params.smsTemplateId },
            'SMS delivery failed via gateway (recorded in deliveries table)',
          );
          await db('notification_deliveries').insert({
            notification_id: notification.id,
            channel: NotificationChannel.SMS,
            status: 'FAILED',
            last_error: smsErr instanceof Error ? smsErr.message : String(smsErr),
          });
        }
      }
    }
  } catch (err) {
    logger.error({ err, params }, 'Error delivering notification');
  }
}
