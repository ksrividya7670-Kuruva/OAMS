import { db } from '../../core/db.js';
import { ApiError } from '@oams/shared';
import { sendEmail } from '../../core/email/mailer.js';
import { processAutoCloseAppointmentsOnce } from '../../jobs/autoCloseAppointments.js';
import { processNoShowDetectOnce } from '../../jobs/noshowDetect.js';
import { processRerouteAssignmentsOnce } from '../../jobs/rerouteAssignments.js';
import { processQuietHoursReleaseOnce } from '../../jobs/quietHoursRelease.js';
import { processDailyDigestOnce } from '../../jobs/dailyDigest.js';
import { processTaskOverdueOnce } from '../../jobs/taskOverdue.js';
import { processTaskRemindersOnce } from '../../jobs/taskReminders.js';
import { processVisitorAutoCheckoutOnce } from '../../jobs/visitorAutoCheckout.js';
import { processCalendarSyncOnce } from '../../jobs/calendarSync.js';
import { calendarSyncService } from '../calendars/syncService.js';

export class AdminOpsService {
  async getOpsOverview(orgId: string) {
    // 1. Failed Deliveries
    const failedDeliveries = await db('notification_deliveries')
      .where('notification_deliveries.status', 'FAILED')
      .join('notifications', 'notification_deliveries.notification_id', 'notifications.id')
      .where('notifications.org_id', orgId)
      .leftJoin('users', 'notifications.user_id', 'users.id')
      .select(
        'notification_deliveries.id',
        'notification_deliveries.notification_id as notificationId',
        'notification_deliveries.channel',
        'notification_deliveries.status',
        'notification_deliveries.attempts',
        'notification_deliveries.last_error as lastError',
        'notifications.title',
        'notifications.created_at as createdAt',
        'users.email as recipientEmail',
        'users.full_name as recipientName',
      )
      .orderBy('notification_deliveries.sent_at', 'desc')
      .limit(50);

    // 2. Background Jobs Status
    const jobsStatus = [
      {
        name: 'autoClose',
        description: 'Auto-close completed appointments past 14 days (§16)',
        interval: '1 hour',
        status: 'RUNNING' as const,
      },
      {
        name: 'noshowDetect',
        description: 'Detect no-shows past arrival grace period (§15)',
        interval: '1 minute',
        status: 'RUNNING' as const,
      },
      {
        name: 'rerouteAssignments',
        description: 'Reroute reviews on delegation window transitions (§10.3)',
        interval: '1 minute',
        status: 'RUNNING' as const,
      },
      {
        name: 'quietHoursRelease',
        description: 'Release email holds when quiet hours conclude (§14.3)',
        interval: '1 minute',
        status: 'RUNNING' as const,
      },
      {
        name: 'dailyDigest',
        description: 'Batch morning summary emails for digest_mode users (§14.3)',
        interval: 'Daily (08:00)',
        status: 'RUNNING' as const,
      },
      {
        name: 'taskOverdue',
        description: 'Check deadlines and mark overdue tasks (§12)',
        interval: '1 minute',
        status: 'RUNNING' as const,
      },
      {
        name: 'taskReminders',
        description: 'Dispatch upcoming task reminder notifications (§12)',
        interval: '1 minute',
        status: 'RUNNING' as const,
      },
      {
        name: 'visitorAutoCheckout',
        description: 'Auto checkout remaining visitors at end of business day (§15)',
        interval: '5 minutes',
        status: 'RUNNING' as const,
      },
      {
        name: 'calendarSync',
        description: 'Two-way Outlook synchronization and Teams link retry worker (§8.4, §20)',
        interval: '5 minutes',
        status: 'RUNNING' as const,
      },
    ];

    // 3. Stuck Appointments (in review stages past SLA or unassigned)
    const now = new Date();
    const stuckAppointmentsRaw = await db('appointments')
      .where('appointments.org_id', orgId)
      .whereIn('appointments.status', ['UNDER_REVIEW', 'INFO_REQUESTED', 'AWAITING_REQUESTER'])
      .leftJoin('officials', 'appointments.primary_official_id', 'officials.id')
      .leftJoin('users as assignee', 'appointments.assigned_to_user_id', 'assignee.id')
      .select(
        'appointments.id',
        'appointments.reference_no as referenceNo',
        'appointments.subject',
        'appointments.status',
        'appointments.submitted_at as submittedAt',
        'appointments.sla_due_at',
        'appointments.assigned_to_user_id',
        'officials.title as officialTitle',
        'assignee.full_name as assignedToName',
      );

    const stuckAppointments = stuckAppointmentsRaw
      .filter((apt) => {
        const isUnassigned = !apt.assigned_to_user_id;
        const isSlaBreached = apt.sla_due_at && new Date(apt.sla_due_at).getTime() < now.getTime();
        return isUnassigned || isSlaBreached;
      })
      .map((apt) => ({
        id: apt.id,
        referenceNo: apt.referenceNo,
        subject: apt.subject,
        status: apt.status,
        officialTitle: apt.officialTitle || 'Official Office',
        submittedAt: apt.submittedAt
          ? new Date(apt.submittedAt).toISOString()
          : new Date().toISOString(),
        assignedToName: apt.assignedToName || undefined,
        reason: !apt.assigned_to_user_id
          ? 'Missing reviewer assignment'
          : 'Review target SLA breached',
      }));

    // 4. Calendar & Integration Sync Errors (§8.4, §18)
    const syncErrorsRaw = await db('appointments')
      .where('appointments.org_id', orgId)
      .whereIn('appointments.calendar_sync_status', ['FAILED', 'MISMATCH', 'PENDING'])
      .leftJoin('officials', 'appointments.primary_official_id', 'officials.id')
      .select(
        'appointments.id',
        'appointments.reference_no as referenceNo',
        'appointments.subject',
        'appointments.calendar_sync_status as syncStatus',
        'appointments.calendar_sync_error as syncError',
        'appointments.meeting_mode as meetingMode',
        'appointments.updated_at as updatedAt',
        'officials.title as officialTitle',
      )
      .orderBy('appointments.updated_at', 'desc')
      .limit(50);

    const syncErrors = syncErrorsRaw.map((s) => ({
      id: s.id,
      referenceNo: s.referenceNo,
      subject: s.subject,
      syncStatus: s.syncStatus,
      syncError: s.syncError || 'Sync failed or mismatch detected',
      officialTitle: s.officialTitle || 'Official Office',
      updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : new Date().toISOString(),
    }));

    return {
      failedDeliveries: failedDeliveries.map((f) => ({
        ...f,
        createdAt: new Date(f.createdAt).toISOString(),
      })),
      jobsStatus,
      stuckAppointments,
      syncErrors,
    };
  }

  async retryDelivery(orgId: string, deliveryId: string) {
    const delivery = await db('notification_deliveries')
      .where('notification_deliveries.id', deliveryId)
      .join('notifications', 'notification_deliveries.notification_id', 'notifications.id')
      .where('notifications.org_id', orgId)
      .leftJoin('users', 'notifications.user_id', 'users.id')
      .select(
        'notification_deliveries.*',
        'notifications.title',
        'notifications.body',
        'users.email',
      )
      .first();

    if (!delivery) {
      throw ApiError.notFound('Delivery record not found');
    }

    if (!delivery.email) {
      throw ApiError.badRequest('Recipient does not have a registered email address');
    }

    try {
      await sendEmail({
        to: delivery.email,
        subject: `OAMS: ${delivery.title}`,
        html: `<p><strong>${delivery.title}</strong></p><p>${delivery.body}</p>`,
      });

      await db('notification_deliveries')
        .where('id', deliveryId)
        .update({
          status: 'SENT',
          sent_at: db.fn.now(),
          attempts: (delivery.attempts || 1) + 1,
          last_error: null,
        });

      return { success: true, message: 'Delivery resent successfully' };
    } catch (err: any) {
      await db('notification_deliveries')
        .where('id', deliveryId)
        .update({
          status: 'FAILED',
          attempts: (delivery.attempts || 1) + 1,
          last_error: err?.message || String(err),
        });

      throw ApiError.internal(`Retry failed: ${err?.message || 'Email delivery error'}`);
    }
  }

  async retrySync(orgId: string, appointmentId: string) {
    const apt = await db('appointments').where({ id: appointmentId, org_id: orgId }).first();

    if (!apt) {
      throw ApiError.notFound('Appointment record not found');
    }

    if (apt.meeting_mode === 'ONLINE') {
      const res = await calendarSyncService.ensureTeamsMeetingLink(appointmentId);
      if (!res.success) {
        throw ApiError.conflict('Teams meeting link generation failed again during retry');
      }
    } else {
      await calendarSyncService.syncOfficialCalendars({
        orgId,
        officialId: apt.primary_official_id,
      });
    }

    return { success: true, message: 'Sync retried successfully' };
  }

  async runJob(jobName: string) {
    let result: any;

    switch (jobName) {
      case 'autoClose':
        result = await processAutoCloseAppointmentsOnce(14);
        break;
      case 'noshowDetect':
        result = await processNoShowDetectOnce();
        break;
      case 'rerouteAssignments':
        result = await processRerouteAssignmentsOnce();
        break;
      case 'quietHoursRelease':
        result = await processQuietHoursReleaseOnce();
        break;
      case 'dailyDigest':
        result = await processDailyDigestOnce();
        break;
      case 'taskOverdue':
        result = await processTaskOverdueOnce();
        break;
      case 'taskReminders':
        result = await processTaskRemindersOnce();
        break;
      case 'visitorAutoCheckout':
        result = await processVisitorAutoCheckoutOnce();
        break;
      case 'calendarSync':
        result = await processCalendarSyncOnce();
        break;
      default:
        throw ApiError.badRequest(`Unknown job name: ${jobName}`);
    }

    return {
      jobName,
      executedAt: new Date().toISOString(),
      result,
    };
  }
}

export const adminOpsService = new AdminOpsService();
