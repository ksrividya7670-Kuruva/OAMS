import crypto from 'crypto';
import { db } from '../../core/db.js';
import { redis } from '../../core/redis.js';
import { logger } from '../../core/logger.js';
import { sendEmail } from '../../core/email/mailer.js';
import { renderNotificationEmailHtml } from '../../core/email/templates.js';
import { config } from '../../core/config.js';
import { notificationsRepo } from './repo.js';
import {
  ApiError,
  Priority,
  NotificationChannel,
  NotificationType,
  type NotificationDto,
  type NotificationPaginationInput,
  type UpdateNotificationPreferencesInput,
} from '@oams/shared';

export class NotificationsService {
  /**
   * Generates a single-use stream ticket for Server-Sent Events (SSE)
   */
  async createStreamTicket(userId: string): Promise<{ ticket: string; expiresInSec: number }> {
    const ticket = crypto.randomUUID();
    const expiresInSec = 60;
    try {
      await redis.set(`stream_ticket:${ticket}`, userId, 'EX', expiresInSec);
    } catch (err) {
      logger.warn({ err }, 'Redis stream ticket set failed, continuing');
    }
    return { ticket, expiresInSec };
  }

  /**
   * Verifies and burns a single-use stream ticket
   */
  async verifyStreamTicket(ticket: string): Promise<string | null> {
    const key = `stream_ticket:${ticket}`;
    try {
      const userId = await redis.get(key);
      if (userId) {
        await redis.del(key);
      }
      return userId;
    } catch {
      return null;
    }
  }

  /**
   * Create an in-app and optionally email notification
   */
  async createNotification(params: {
    orgId?: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    appointmentId?: string | null;
    link?: string;
    priority?: Priority | string;
    dedupeKey?: string;
    sendEmailNotification?: boolean;
    emailSubject?: string;
    targetRoles?: string[];
    officialId?: string | null;
  }): Promise<NotificationDto> {
    const created = await notificationsRepo.create({
      orgId: params.orgId,
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      appointmentId: params.appointmentId,
      link: params.link,
      priority: params.priority || Priority.MEDIUM,
      dedupeKey: params.dedupeKey,
      targetRoles: params.targetRoles,
      officialId: params.officialId,
    });

    // 1. Record delivery
    try {
      await db('notification_deliveries').insert({
        notification_id: created.id,
        channel: NotificationChannel.IN_APP,
        status: 'SENT',
        sent_at: db.fn.now(),
      });
    } catch {
      // delivery table optional
    }

    // 2. Publish to Redis channel for live real-time updates
    try {
      await redis.publish(
        `user:${params.userId}`,
        JSON.stringify({
          type: 'notification',
          data: created,
        }),
      );
    } catch (redisErr) {
      logger.debug({ redisErr }, 'Redis live publish failed, falling back to client polling');
    }

    // 3. Dispatch Email if requested or recipient has email
    if (params.sendEmailNotification !== false) {
      try {
        const user = await db('users').where('id', params.userId).first();
        if (user && user.email) {
          const emailHtml = renderNotificationEmailHtml({
            title: params.title,
            body: params.message,
            link: params.link || `/app/appointments/${params.appointmentId || ''}`,
            priority: (params.priority as Priority) || Priority.MEDIUM,
            recipientName: user.full_name || 'User',
          });

          await sendEmail({
            to: user.email,
            subject: params.emailSubject || `OAMS: ${params.title}`,
            html: emailHtml,
          });

          try {
            await db('notification_deliveries').insert({
              notification_id: created.id,
              channel: NotificationChannel.EMAIL,
              status: 'SENT',
              sent_at: db.fn.now(),
            });
          } catch {}
        }
      } catch (emailErr) {
        logger.debug({ emailErr, userId: params.userId }, 'Email delivery error ignored');
      }
    }

    return created;
  }

  /**
   * Helper function to trigger notifications for key appointment lifecycle events
   */
  async notifyAppointmentEvent(
    type: NotificationType | string,
    appointment: {
      id: string;
      referenceNo?: string;
      reference_no?: string;
      subject?: string;
      officialName?: string;
      officialTitle?: string;
      official_id?: string;
      primary_official_id?: string;
      scheduledStartTime?: string;
      scheduled_start_time?: string;
      location?: string;
      orgId?: string;
      org_id?: string;
    },
    extra?: {
      recipientUserId?: string;
      recipientEmail?: string;
      reason?: string;
      note?: string;
      newTime?: string;
      priority?: Priority;
    },
  ): Promise<NotificationDto | null> {
    const ref = appointment.referenceNo || appointment.reference_no || appointment.id;
    const subj = appointment.subject || 'Meeting';
    const orgId = appointment.orgId || appointment.org_id || 'org-apex-main';
    const apptId = appointment.id;
    const timeStr = extra?.newTime || appointment.scheduledStartTime || appointment.scheduled_start_time;
    const formattedTime = timeStr ? new Date(timeStr).toLocaleString('en-IN') : 'Scheduled Time';

    let title = `Appointment Update: ${ref}`;
    let message = `Update regarding appointment ${ref} (${subj}).`;
    let priority = extra?.priority || Priority.MEDIUM;

    switch (type) {
      case NotificationType.APPOINTMENT_BOOKED:
      case 'AppointmentSubmitted':
        title = `Appointment Booked: ${ref}`;
        message = `Your appointment request for "${subj}" has been successfully booked and is under review. Reference: ${ref}.`;
        priority = Priority.MEDIUM;
        break;

      case NotificationType.APPOINTMENT_CONFIRMED:
      case 'AppointmentConfirmed':
        title = `Appointment Confirmed: ${ref}`;
        message = `Your appointment for "${subj}" is confirmed for ${formattedTime}. Venue: ${appointment.location || 'Chamber 101'}.`;
        priority = Priority.HIGH;
        break;

      case NotificationType.APPOINTMENT_RESCHEDULED:
      case 'AppointmentRescheduled':
        title = `Appointment Rescheduled: ${ref}`;
        message = `Your appointment for "${subj}" has been rescheduled to ${formattedTime}.${extra?.reason ? ` Reason: ${extra.reason}` : ''}`;
        priority = Priority.HIGH;
        break;

      case NotificationType.APPOINTMENT_CANCELLED:
      case 'AppointmentCancelled':
        title = `Appointment Cancelled: ${ref}`;
        message = `Your appointment (${ref}) has been cancelled.${extra?.reason ? ` Reason: ${extra.reason}` : ''}`;
        priority = Priority.HIGH;
        break;

      case NotificationType.APPOINTMENT_COMPLETED:
      case 'MeetingCompleted':
      case 'AppointmentCompleted':
        title = `Appointment Completed: ${ref}`;
        message = `Your appointment for "${subj}" has concluded. Minutes and action items have been recorded.`;
        priority = Priority.LOW;
        break;

      case NotificationType.APPOINTMENT_REJECTED:
      case 'AppointmentRejected':
        title = `Appointment Request Declined: ${ref}`;
        message = `Your appointment request (${ref}) could not be accommodated.${extra?.reason ? ` Reason: ${extra.reason}` : ''}`;
        priority = Priority.HIGH;
        break;

      case NotificationType.APPOINTMENT_REMINDER:
        title = `Appointment Reminder: ${ref}`;
        message = `Reminder: You have an upcoming appointment for "${subj}" on ${formattedTime}.`;
        priority = Priority.HIGH;
        break;

      case NotificationType.PROVIDER_UNAVAILABLE:
      case NotificationType.SLOT_CHANGED:
        title = `Schedule Adjustment: ${ref}`;
        message = `The official is unavailable at the originally scheduled time. Please review candidate alternative slots.`;
        priority = Priority.HIGH;
        break;

      case NotificationType.SYSTEM_ALERT:
      case NotificationType.ADMIN_NOTIFICATION:
        title = `System Notification: ${ref}`;
        message = extra?.note || `Important administrative update regarding ${ref}.`;
        priority = Priority.URGENT;
        break;
    }

    if (extra?.recipientUserId) {
      return this.createNotification({
        orgId,
        userId: extra.recipientUserId,
        type,
        title,
        message,
        appointmentId: apptId,
        link: `/app/appointments/${apptId}`,
        priority,
        dedupeKey: `${type}:${apptId}:${extra.recipientUserId}:${Date.now()}`,
      });
    }

    return null;
  }

  /**
   * List notifications for a user with pagination support
   */
  async listNotifications(
    userId: string,
    orgId?: string,
    query: NotificationPaginationInput = {},
  ): Promise<{
    items: NotificationDto[];
    total: number;
    unreadCount: number;
    nextCursor: string | null;
    page: number;
    limit: number;
  }> {
    const limit = query.limit || 20;
    const page = query.page || 1;

    const res = await notificationsRepo.listByUser(userId, {
      unread: query.unread,
      limit,
      page,
      cursor: query.cursor,
      orgId,
    });

    return {
      items: res.items,
      total: res.total,
      unreadCount: res.unreadCount,
      nextCursor: res.nextCursor,
      page,
      limit,
    };
  }

  /**
   * Get unread count for user
   */
  async getUnreadCount(userId: string, orgId?: string): Promise<number> {
    return notificationsRepo.countUnread(userId, orgId);
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(userId: string, id: string, orgId?: string): Promise<{ success: boolean; id: string; readAt: string }> {
    const updated = await notificationsRepo.markAsRead(id, userId, orgId);
    if (!updated) {
      throw ApiError.notFound('Notification not found or unauthorized');
    }
    return { success: true, id: updated.id, readAt: updated.readAt || new Date().toISOString() };
  }

  /**
   * Mark all notifications as read for user
   */
  async markAllAsRead(userId: string, orgId?: string): Promise<{ success: boolean; count: number }> {
    const count = await notificationsRepo.markAllAsRead(userId, orgId);
    return { success: true, count };
  }

  /**
   * Delete a notification
   */
  async deleteNotification(userId: string, id: string, orgId?: string): Promise<{ success: boolean; id: string }> {
    const deleted = await notificationsRepo.delete(id, userId, orgId);
    if (!deleted) {
      throw ApiError.notFound('Notification not found or unauthorized');
    }
    return { success: true, id };
  }

  /**
   * User notification channel preferences
   */
  async getPreferences(userId: string) {
    return db('notification_preferences').where('user_id', userId);
  }

  async updatePreferences(userId: string, input: UpdateNotificationPreferencesInput) {
    return await db.transaction(async (trx) => {
      for (const pref of input.preferences) {
        await trx('notification_preferences')
          .insert({
            user_id: userId,
            event_type: pref.eventType,
            channel: pref.channel,
            enabled: pref.enabled,
          })
          .onConflict(['user_id', 'event_type', 'channel'])
          .merge({
            enabled: pref.enabled,
          });
      }

      return { success: true };
    });
  }
}

export const notificationsService = new NotificationsService();
