import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../logger.js';

export * from './templates.js';

export const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_SECURE !== undefined ? config.SMTP_SECURE : config.SMTP_PORT === 465,
  auth:
    config.SMTP_USER && config.SMTP_PASS
      ? {
          user: config.SMTP_USER,
          pass: config.SMTP_PASS,
        }
      : undefined,
  ignoreTLS: config.NODE_ENV !== 'production' && !config.SMTP_USER,
});

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<string> {
  const senderEmail = config.SENDER_EMAIL || config.SMTP_FROM || 'apointments@smru.edu.in';
  const senderName = config.SENDER_NAME || 'OAMS Appointment';
  const defaultFrom = senderEmail.includes('<') ? senderEmail : `"${senderName}" <${senderEmail}>`;
  const from = options.from || defaultFrom;

  try {
    const info = await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>?/gm, ''),
    });

    logger.info(
      { to: options.to, messageId: info.messageId, subject: options.subject },
      'Email sent successfully',
    );
    return info.messageId;
  } catch (err: unknown) {
    logger.warn({ err, to: options.to, subject: options.subject }, 'Failed to deliver email');
    throw err;
  }
}
