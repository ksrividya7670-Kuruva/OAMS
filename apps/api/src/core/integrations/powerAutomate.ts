import crypto from 'crypto';
import { db } from '../db.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { DomainEvent } from '../notifications/router.js';

export interface PowerAutomatePayload {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  orgId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  source: string;
  timestamp: string;
}

export interface PowerAutomateNotificationParams {
  notificationId?: string;
  orgId: string;
  eventType: string;
  recipient: {
    userId?: string;
    email?: string;
    name?: string;
    phone?: string;
  };
  notification: {
    title: string;
    body: string;
    link: string;
    priority: string;
    referenceNo?: string;
    emailSubject: string;
    emailHtml: string;
    emailText?: string;
    pushTitle: string;
    pushBody: string;
  };
  actions?: {
    label: string;
    url: string;
  }[];
}

export interface PowerAutomateNotificationPayload {
  deliveryId: string;
  notificationId?: string;
  eventType: string;
  orgId: string;
  occurredAt: string;
  from?: string;
  fromEmail?: string;
  fromName?: string;
  senderName?: string;
  senderDisplayName?: string;
  displayName?: string;
  formattedFrom?: string;
  fromFormatted?: string;
  fullSender?: string;
  senderEmail?: string;
  sender?: string;
  sendAs?: string;
  sendAsName?: string;
  sendAsFormatted?: string;
  replyTo?: string;
  replyToName?: string;
  to?: string;
  toEmail?: string;
  adminEmail?: string;
  officialEmail?: string;
  cc?: string;
  allRecipients?: string;
  subject?: string;
  html?: string;
  body?: string;
  link?: string;
  priority?: string;
  referenceNo?: string;
  recipient: {
    userId?: string;
    email?: string;
    name?: string;
    phone?: string;
  };
  email: {
    from?: string;
    fromEmail?: string;
    fromName?: string;
    senderName?: string;
    senderDisplayName?: string;
    senderEmail?: string;
    sendAs?: string;
    sendAsName?: string;
    sendAsFormatted?: string;
    replyTo?: string;
    replyToName?: string;
    to: string;
    adminTo?: string;
    cc?: string;
    subject: string;
    html: string;
    text: string;
  };
  push: {
    title: string;
    body: string;
    link: string;
    priority: string;
    referenceNo?: string;
  };
  actions?: {
    label: string;
    url: string;
  }[];
  source: 'OAMS';
  timestamp: string;
}

export class PowerAutomateService {
  /**
   * Resolve webhook URL for an organization:
   * First checks the dynamic settings table (org-specific), then falls back to environment configuration.
   */
  async getWebhookUrl(orgId?: string): Promise<{ url: string | null; secret: string | null }> {
    if (orgId) {
      try {
        const settingRow = await db('settings')
          .where({ org_id: orgId, key: 'power_automate_config' })
          .first();

        if (settingRow && settingRow.value) {
          const parsed =
            typeof settingRow.value === 'string'
              ? JSON.parse(settingRow.value)
              : settingRow.value;

          if (parsed.webhookUrl && parsed.enabled !== false) {
            return {
              url: parsed.webhookUrl,
              secret: parsed.secret || config.POWER_AUTOMATE_SECRET || null,
            };
          }
        }
      } catch (err) {
        logger.debug({ err, orgId }, 'Could not read dynamic power_automate_config from settings');
      }
    }

    if (config.POWER_AUTOMATE_WEBHOOK_URL) {
      return {
        url: config.POWER_AUTOMATE_WEBHOOK_URL,
        secret: config.POWER_AUTOMATE_SECRET || null,
      };
    }

    return { url: null, secret: null };
  }

  /**
   * Forward a raw domain event dynamically to Microsoft Power Automate
   */
  async dispatch(event: DomainEvent): Promise<boolean> {
    const { url, secret } = await this.getWebhookUrl(event.orgId);
    if (!url) {
      return false;
    }

    const payload: PowerAutomatePayload = {
      eventId: event.id,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      orgId: event.orgId,
      occurredAt:
        event.occurredAt instanceof Date ? event.occurredAt.toISOString() : String(event.occurredAt),
      payload: event.payload,
      source: 'OAMS',
      timestamp: new Date().toISOString(),
    };

    const payloadString = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-OAMS-Event-Type': event.eventType,
      'X-OAMS-Event-Id': event.id,
    };

    if (secret) {
      const signature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');
      headers['X-OAMS-Signature'] = `sha256=${signature}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      logger.info(
        { eventType: event.eventType, eventId: event.id, url },
        'Dispatching event to Microsoft Power Automate',
      );

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        logger.warn(
          { status: response.status, eventType: event.eventType, eventId: event.id },
          'Microsoft Power Automate returned non-2xx status',
        );
        return false;
      }

      logger.info(
        { eventType: event.eventType, eventId: event.id, status: response.status },
        'Successfully dispatched to Microsoft Power Automate',
      );
      return true;
    } catch (err: unknown) {
      clearTimeout(timeout);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      logger.warn(
        { err: isAbort ? 'Webhook request timed out after 5s' : err, eventId: event.id },
        'Failed to deliver event to Microsoft Power Automate',
      );
      return false;
    }
  }

  /**
   * Dispatch a unified Push Notification + Email payload directly to Microsoft Power Automate.
   * This enables Power Automate to simultaneously send an email via Office 365 Outlook
   * and trigger mobile push notifications / Microsoft Teams cards.
   */
  async dispatchNotification(params: PowerAutomateNotificationParams): Promise<boolean> {
    const { url, secret } = await this.getWebhookUrl(params.orgId);
    if (!url) {
      return false;
    }

    const sanitizeRecipient = (email?: string): string => {
      const e = (email || '').trim();
      const lower = e.toLowerCase();
      if (
        !e ||
        lower.includes('@apex.') ||
        lower.includes('@oams.local')
      ) {
        return 'apointments@smru.edu.in';
      }
      return e;
    };

    const adminEmail = sanitizeRecipient(config.ADMIN_EMAIL || 'apointments@smru.edu.in');
    const officialEmail = sanitizeRecipient(config.OFFICIAL_EMAIL || 'apointments@smru.edu.in');
    const senderEmail = 'apointments@smru.edu.in';
    const senderName = 'OAMS Appointment';
    const formattedSender = `"${senderName}" <${senderEmail}>`;
    const recipientEmail = sanitizeRecipient(params.recipient.email);

    const payload: PowerAutomateNotificationPayload = {
      deliveryId: `pa-del-${crypto.randomUUID()}`,
      notificationId: params.notificationId,
      eventType: params.eventType,
      orgId: params.orgId,
      occurredAt: new Date().toISOString(),
      from: senderEmail,
      fromEmail: senderEmail,
      fromName: senderName,
      senderName,
      senderDisplayName: senderName,
      displayName: senderName,
      formattedFrom: formattedSender,
      fromFormatted: formattedSender,
      fullSender: formattedSender,
      senderEmail,
      sender: senderEmail,
      sendAs: senderEmail,
      sendAsName: senderName,
      sendAsFormatted: formattedSender,
      replyTo: senderEmail,
      replyToName: senderName,
      to: recipientEmail,
      toEmail: recipientEmail,
      adminEmail: adminEmail || undefined,
      officialEmail: officialEmail || undefined,
      cc: undefined,
      allRecipients: recipientEmail,
      subject: params.notification.emailSubject,
      html: params.notification.emailHtml,
      body: params.notification.body,
      link: params.notification.link,
      priority: params.notification.priority,
      referenceNo: params.notification.referenceNo,
      recipient: params.recipient,
      email: {
        from: formattedSender,
        fromEmail: senderEmail,
        fromName: senderName,
        senderName,
        senderDisplayName: senderName,
        senderEmail,
        sendAs: senderEmail,
        sendAsName: senderName,
        sendAsFormatted: formattedSender,
        replyTo: senderEmail,
        replyToName: senderName,
        to: recipientEmail,
        adminTo: adminEmail || undefined,
        cc: undefined,
        subject: params.notification.emailSubject,
        html: params.notification.emailHtml,
        text: params.notification.emailText || params.notification.body,
      },
      push: {
        title: params.notification.pushTitle,
        body: params.notification.pushBody,
        link: params.notification.link,
        priority: params.notification.priority,
        referenceNo: params.notification.referenceNo,
      },
      actions: params.actions || [
        { label: 'View in OAMS', url: params.notification.link },
      ],
      source: 'OAMS',
      timestamp: new Date().toISOString(),
    };

    const payloadString = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-OAMS-Event-Type': params.eventType,
      'X-OAMS-Delivery-Id': payload.deliveryId,
      'X-OAMS-Action': 'NOTIFICATION_PUSH_AND_EMAIL',
    };

    if (secret) {
      const signature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');
      headers['X-OAMS-Signature'] = `sha256=${signature}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      logger.info(
        { eventType: params.eventType, recipientEmail: params.recipient.email, url },
        'Dispatching dual Push + Email notification to Microsoft Power Automate',
      );

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        logger.warn(
          { status: response.status, eventType: params.eventType },
          'Power Automate dual notification returned non-2xx status',
        );
        return false;
      }

      logger.info(
        { eventType: params.eventType, status: response.status },
        'Power Automate successfully received dual Push + Email notification',
      );
      return true;
    } catch (err: unknown) {
      clearTimeout(timeout);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      logger.warn(
        { err: isAbort ? 'Power Automate dual notification timed out after 5s' : err },
        'Failed to deliver dual notification to Microsoft Power Automate',
      );
      return false;
    }
  }

  /**
   * Test connection to a Power Automate flow endpoint
   */
  async testConnection(
    targetUrl?: string,
    secret?: string,
  ): Promise<{ success: boolean; status?: number; error?: string }> {
    const url = targetUrl || config.POWER_AUTOMATE_WEBHOOK_URL;
    if (!url) {
      return { success: false, error: 'No Power Automate Webhook URL configured' };
    }

    const testPayload = {
      deliveryId: `pa-test-${crypto.randomUUID()}`,
      eventId: `test-${crypto.randomUUID()}`,
      eventType: 'PowerAutomatePing',
      aggregateType: 'system',
      aggregateId: 'ping',
      orgId: 'system',
      occurredAt: new Date().toISOString(),
      recipient: {
        email: 'test@example.com',
        name: 'OAMS Administrator',
      },
      email: {
        to: 'test@example.com',
        subject: 'OAMS: Power Automate Connection Verified',
        html: '<p>Your Microsoft Power Automate flow is successfully connected to OAMS.</p>',
        text: 'Your Microsoft Power Automate flow is successfully connected to OAMS.',
      },
      push: {
        title: 'OAMS Connected',
        body: 'Your Power Automate flow is connected and receiving notifications.',
        link: `${config.WEB_URL}/`,
        priority: 'MEDIUM',
      },
      payload: {
        message: 'Ping from OAMS Microsoft Power Automate Connector',
        testTimestamp: new Date().toISOString(),
      },
      source: 'OAMS',
      timestamp: new Date().toISOString(),
    };

    const payloadString = JSON.stringify(testPayload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-OAMS-Event-Type': 'PowerAutomatePing',
      'X-OAMS-Event-Id': testPayload.eventId,
    };

    const activeSecret = secret || config.POWER_AUTOMATE_SECRET;
    if (activeSecret) {
      const signature = crypto
        .createHmac('sha256', activeSecret)
        .update(payloadString)
        .digest('hex');
      headers['X-OAMS-Signature'] = `sha256=${signature}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return {
        success: response.ok,
        status: response.status,
        error: response.ok ? undefined : `Power Automate returned HTTP ${response.status}`,
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const powerAutomateService = new PowerAutomateService();
