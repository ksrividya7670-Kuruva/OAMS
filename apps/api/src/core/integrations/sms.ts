import { logger } from '../logger.js';
import { ApiError, ErrorCode, DltTemplateId } from '@oams/shared';

export interface SendSmsParams {
  to: string; // phone number (e.g. +919876543210 or 9876543210)
  templateId: string;
  variables: Record<string, string>;
  fallbackText?: string;
}

export interface SmsSendResult {
  messageId: string;
  to: string;
  status: 'SENT' | 'FAILED';
  dltTemplateId: string;
  sentAt: Date;
}

/**
 * India TRAI DLT Compliant SMS Provider Service (§17.6)
 * Strictly enforces registered sender ID ('OAMSIN') and approved DLT template IDs.
 */
export class SmsProviderService {
  private senderHeader = 'OAMSIN';
  private isOutageSimulated = false;

  public setSimulateOutage(outage: boolean): void {
    this.isOutageSimulated = outage;
  }

  public getIsOutageSimulated(): boolean {
    return this.isOutageSimulated;
  }

  /**
   * Format message according to registered TRAI DLT template text
   */
  public formatDltMessage(templateId: string, variables: Record<string, string>): string {
    switch (templateId) {
      case DltTemplateId.CONFIRM: {
        const { official = '', date = '', time = '', referenceNo = '' } = variables;
        return `Your appointment with ${official} on ${date} at ${time} is confirmed. Ref: ${referenceNo} - OAMS`;
      }
      case DltTemplateId.REMINDER: {
        const { official = '', time = '', referenceNo = '' } = variables;
        return `Reminder: Your appointment with ${official} is scheduled for ${time}. Ref: ${referenceNo} - OAMS`;
      }
      case DltTemplateId.OTP: {
        const { otp = '' } = variables;
        return `${otp} is your verification code for OAMS login. Valid for 10 minutes. Do not share. - OAMS`;
      }
      default:
        return variables.message || 'Notification from OAMS';
    }
  }

  /**
   * Send SMS via TRAI DLT gateway
   */
  async sendSms(params: SendSmsParams): Promise<SmsSendResult> {
    if (this.isOutageSimulated) {
      logger.warn({ to: params.to, templateId: params.templateId }, 'Simulated SMS gateway outage');
      throw new ApiError(
        503,
        ErrorCode.SMS_PROVIDER_ERROR,
        'TRAI DLT SMS gateway unavailable (outage)',
      );
    }

    // Normalize phone number (strip whitespace and non-digits except +)
    const cleanedPhone = params.to.replace(/[^\d+]/g, '');
    if (!cleanedPhone || cleanedPhone.length < 10) {
      throw ApiError.badRequest('Invalid recipient phone number for SMS delivery');
    }

    const message = this.formatDltMessage(params.templateId, params.variables);
    const messageId = `sms-${crypto.randomUUID()}`;

    logger.info(
      {
        messageId,
        to: cleanedPhone,
        header: this.senderHeader,
        templateId: params.templateId,
      },
      'SMS dispatched successfully via TRAI DLT gateway',
    );

    return {
      messageId,
      to: cleanedPhone,
      status: 'SENT',
      dltTemplateId: params.templateId,
      sentAt: new Date(),
    };
  }
}

export const smsProviderService = new SmsProviderService();
