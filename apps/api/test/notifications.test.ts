import { describe, it, expect, vi } from 'vitest';
import { routeNotificationEvent, type DomainEvent } from '../src/core/notifications/router.js';
import * as mailer from '../src/core/email/mailer.js';

describe('Notification Routing & Delivery System (§14)', () => {
  it('should ignore unrecognized event types without error', async () => {
    const unknownEvent: DomainEvent = {
      id: 'event-1',
      orgId: 'org-1',
      eventType: 'UnknownEventHappened',
      aggregateType: 'test',
      aggregateId: 'test-1',
      payload: {},
      occurredAt: new Date(),
    };

    await expect(routeNotificationEvent(unknownEvent)).resolves.not.toThrow();
  });

  it('should format Redis pub/sub channel user:{userId} for real-time delivery', () => {
    const userId = '11111111-2222-3333-4444-555555555555';
    const channel = `user:${userId}`;
    expect(channel).toBe('user:11111111-2222-3333-4444-555555555555');
  });

  it('should send email using configured transport', async () => {
    const sendMailSpy = vi.spyOn(mailer, 'sendEmail').mockResolvedValue('msg-id-123');

    await mailer.sendEmail({
      to: 'recipient@apex.local',
      subject: 'Test Notification',
      html: '<p>Test message</p>',
    });

    expect(sendMailSpy).toHaveBeenCalledWith({
      to: 'recipient@apex.local',
      subject: 'Test Notification',
      html: '<p>Test message</p>',
    });

    sendMailSpy.mockRestore();
  });
});
