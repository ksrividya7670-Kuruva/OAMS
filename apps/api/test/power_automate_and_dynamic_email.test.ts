import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { renderNotificationEmailHtml } from '../src/core/email/templates.js';
import { powerAutomateService } from '../src/core/integrations/powerAutomate.js';
import { routeNotificationEvent, type DomainEvent } from '../src/core/notifications/router.js';

describe('Dynamic Email Templates & Microsoft Power Automate Integration', () => {
  describe('renderNotificationEmailHtml', () => {
    it('should generate responsive HTML with URGENT badge and red color', () => {
      const html = renderNotificationEmailHtml({
        title: 'Emergency Meeting Request',
        body: 'Urgent meeting requires official confirmation.',
        priority: 'URGENT',
        referenceNo: 'APT-2026-9999',
        recipientName: 'Dr. Jane Smith',
        link: '/app/appointments/apt-123',
      });

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('URGENT');
      expect(html).toContain('#dc2626');
      expect(html).toContain('APT-2026-9999');
      expect(html).toContain('Dr. Jane Smith');
      expect(html).toContain('/app/appointments/apt-123');
      expect(html).toContain('OAMS');
    });

    it('should generate responsive HTML with metadata table when provided', () => {
      const html = renderNotificationEmailHtml({
        title: 'Appointment Confirmed',
        body: 'Your meeting is confirmed.',
        priority: 'HIGH',
        metadata: {
          official: 'Minister of State',
          date: '25-Sep-2026',
          time: '11:00 AM',
        },
      });

      expect(html).toContain('HIGH');
      expect(html).toContain('Minister of State');
      expect(html).toContain('25-Sep-2026');
      expect(html).toContain('11:00 AM');
    });
  });

  describe('Microsoft Power Automate Service', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should dispatch standardized payload to Power Automate webhook with HMAC signature', async () => {
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        capturedUrl = url;
        capturedHeaders = init.headers;
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
        };
      }) as any;

      const secret = 'test-secret-key-12345';
      vi.spyOn(powerAutomateService, 'getWebhookUrl').mockResolvedValue({
        url: 'https://prod-01.westus.logic.azure.com/workflows/test-flow',
        secret,
      });

      const event: DomainEvent = {
        id: 'evt-pa-001',
        orgId: 'org-test-456',
        eventType: 'AppointmentConfirmed',
        aggregateType: 'appointment',
        aggregateId: 'apt-789',
        payload: {
          referenceNo: 'APT-2026-1001',
          officialTitle: 'Director General',
          requesterName: 'Alice Walker',
        },
        occurredAt: new Date('2026-09-24T10:00:00Z'),
      };

      const result = await powerAutomateService.dispatch(event);

      expect(result).toBe(true);
      expect(capturedUrl).toBe('https://prod-01.westus.logic.azure.com/workflows/test-flow');
      expect(capturedHeaders['Content-Type']).toBe('application/json');
      expect(capturedHeaders['X-OAMS-Event-Type']).toBe('AppointmentConfirmed');
      expect(capturedHeaders['X-OAMS-Event-Id']).toBe('evt-pa-001');

      // Verify HMAC-SHA256 signature
      expect(capturedHeaders['X-OAMS-Signature']).toBeDefined();
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify({
          eventId: event.id,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          orgId: event.orgId,
          occurredAt: event.occurredAt.toISOString(),
          payload: event.payload,
          source: 'OAMS',
          timestamp: capturedBody.timestamp,
        }))
        .digest('hex');
      expect(capturedHeaders['X-OAMS-Signature']).toBe(`sha256=${expectedSignature}`);

      // Verify payload structure matches Power Automate JSON schema
      expect(capturedBody.eventId).toBe('evt-pa-001');
      expect(capturedBody.eventType).toBe('AppointmentConfirmed');
      expect(capturedBody.aggregateType).toBe('appointment');
      expect(capturedBody.aggregateId).toBe('apt-789');
      expect(capturedBody.payload.referenceNo).toBe('APT-2026-1001');
      expect(capturedBody.source).toBe('OAMS');
    });

    it('should test connection successfully when ping returns 200', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      }) as any;

      const result = await powerAutomateService.testConnection(
        'https://prod-01.westus.logic.azure.com/test-endpoint',
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
    });

    it('should handle webhook network errors gracefully without throwing', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network connection timeout')) as any;

      vi.spyOn(powerAutomateService, 'getWebhookUrl').mockResolvedValue({
        url: 'https://prod-01.westus.logic.azure.com/unreachable',
        secret: null,
      });

      const event: DomainEvent = {
        id: 'evt-fail-1',
        orgId: 'org-1',
        eventType: 'UrgentRequest',
        aggregateType: 'appointment',
        aggregateId: 'apt-1',
        payload: { referenceNo: 'APT-001' },
        occurredAt: new Date(),
      };

      const result = await powerAutomateService.dispatch(event);
      expect(result).toBe(false);
    });

    it('should automatically forward domain events through routeNotificationEvent', async () => {
      const dispatchSpy = vi
        .spyOn(powerAutomateService, 'dispatch')
        .mockResolvedValue(true);

      const event: DomainEvent = {
        id: 'evt-routed-1',
        orgId: 'org-route',
        eventType: 'CustomWorkflowTriggered',
        aggregateType: 'workflow',
        aggregateId: 'wf-routed',
        payload: {
          referenceNo: 'APT-999',
          customField: 'Test Value',
        },
        occurredAt: new Date(),
      };

      await routeNotificationEvent(event);

      expect(dispatchSpy).toHaveBeenCalledWith(event);
    });

    it('should dispatch simultaneous Push + Email payload via dispatchNotification', async () => {
      let capturedBody: any = null;
      let capturedHeaders: Record<string, string> = {};

      global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        capturedHeaders = init.headers;
        capturedBody = JSON.parse(init.body);
        return { ok: true, status: 200 };
      }) as any;

      vi.spyOn(powerAutomateService, 'getWebhookUrl').mockResolvedValue({
        url: 'https://prod-01.westus.logic.azure.com/workflows/dual-notification',
        secret: 'dual-secret',
      });

      const result = await powerAutomateService.dispatchNotification({
        notificationId: 'notif-123',
        orgId: 'org-test',
        eventType: 'AppointmentConfirmed',
        recipient: {
          userId: 'user-456',
          email: 'minister@gov.in',
          name: 'Hon. Minister',
          phone: '+919999999999',
        },
        notification: {
          title: 'Appointment Confirmed: APT-2026-0001',
          body: 'Your appointment is confirmed for tomorrow at 10:00 AM.',
          link: 'https://oams.gov.in/app/appointments/apt-123',
          priority: 'HIGH',
          referenceNo: 'APT-2026-0001',
          emailSubject: 'OAMS Appointment Confirmed: APT-2026-0001',
          emailHtml: '<p>Meeting Confirmed</p>',
          emailText: 'Meeting Confirmed',
          pushTitle: 'Appointment Confirmed: APT-2026-0001',
          pushBody: 'Your appointment is confirmed for tomorrow at 10:00 AM.',
        },
      });

      expect(result).toBe(true);
      expect(capturedHeaders['X-OAMS-Action']).toBe('NOTIFICATION_PUSH_AND_EMAIL');
      expect(capturedHeaders['X-OAMS-Event-Type']).toBe('AppointmentConfirmed');
      expect(capturedHeaders['X-OAMS-Signature']).toBeDefined();

      // Check Push notification payload
      expect(capturedBody.push.title).toBe('Appointment Confirmed: APT-2026-0001');
      expect(capturedBody.push.body).toBe('Your appointment is confirmed for tomorrow at 10:00 AM.');
      expect(capturedBody.push.link).toBe('https://oams.gov.in/app/appointments/apt-123');
      expect(capturedBody.push.priority).toBe('HIGH');
      expect(capturedBody.push.referenceNo).toBe('APT-2026-0001');

      // Check Email payload
      expect(capturedBody.email.to).toBe('minister@gov.in');
      expect(capturedBody.email.subject).toBe('OAMS Appointment Confirmed: APT-2026-0001');
      expect(capturedBody.email.html).toBe('<p>Meeting Confirmed</p>');

      // Check Recipient metadata
      expect(capturedBody.recipient.name).toBe('Hon. Minister');
      expect(capturedBody.recipient.phone).toBe('+919999999999');
    });
  });
});
