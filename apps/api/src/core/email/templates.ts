import { config } from '../config.js';

export interface NotificationEmailTemplateOptions {
  title: string;
  body: string;
  link?: string;
  priority?: string;
  referenceNo?: string;
  recipientName?: string;
  metadata?: Record<string, string | number | undefined | null>;
  actionLabel?: string;
}

export function renderNotificationEmailHtml(options: NotificationEmailTemplateOptions): string {
  const appName = config.OAMS_APP_NAME || 'OAMS';
  const fullLink = options.link
    ? options.link.startsWith('http')
      ? options.link
      : `${config.WEB_URL}${options.link.startsWith('/') ? '' : '/'}${options.link}`
    : `${config.WEB_URL}/`;

  const priorityColor =
    options.priority === 'URGENT'
      ? '#dc2626'
      : options.priority === 'HIGH'
      ? '#d97706'
      : options.priority === 'MEDIUM'
      ? '#2563eb'
      : '#475569';

  const metadataHtml = options.metadata
    ? Object.entries(options.metadata)
        .filter(([_, v]) => v !== undefined && v !== null && v !== '')
        .map(
          ([k, v]) => `
            <tr>
              <td style="padding: 6px 12px; color: #64748b; font-weight: 500; font-size: 13px; text-transform: capitalize;">${k.replace(/([A-Z])/g, ' $1')}:</td>
              <td style="padding: 6px 12px; color: #0f172a; font-weight: 600; font-size: 13px;">${v}</td>
            </tr>
          `,
        )
        .join('')
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 24px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 700; letter-spacing: -0.02em;">${appName}</h1>
                    <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 12px;">Official Appointment & Scheduling Management</p>
                  </td>
                  ${
                    options.priority
                      ? `<td align="right">
                          <span style="display: inline-block; padding: 4px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #ffffff; background-color: ${priorityColor}; border-radius: 9999px;">
                            ${options.priority}
                          </span>
                        </td>`
                      : ''
                  }
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 32px;">
              ${options.recipientName ? `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155;">Dear <strong>${options.recipientName}</strong>,</p>` : ''}

              ${
                options.referenceNo
                  ? `<div style="display: inline-block; margin-bottom: 16px; padding: 6px 12px; background-color: #f1f5f9; border-left: 4px solid #0284c7; border-radius: 4px; font-size: 13px; font-weight: 600; color: #0369a1;">
                      Reference: ${options.referenceNo}
                    </div>`
                  : ''
              }

              <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 600; color: #0f172a;">${options.title}</h2>
              <div style="font-size: 15px; color: #334155; margin-bottom: 24px; line-height: 1.6;">${options.body}</div>

              ${
                metadataHtml
                  ? `<div style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; padding: 12px; margin-bottom: 24px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        ${metadataHtml}
                      </table>
                    </div>`
                  : ''
              }

              <!-- Action Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px 0 12px 0;">
                <tr>
                  <td align="center" style="border-radius: 8px; background-color: #0284c7;">
                    <a href="${fullLink}" target="_blank" style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                      ${options.actionLabel || 'View in OAMS'} &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 20px 0 0 0; font-size: 12px; color: #64748b;">
                If the button does not work, copy and paste this link into your browser:<br>
                <a href="${fullLink}" style="color: #0284c7; word-break: break-all;">${fullLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
              <p style="margin: 0 0 4px 0; font-weight: 600; color: #475569;">OAMS SMRU &bull; <a href="mailto:apointments@smru.edu.in" style="color: #0284c7; text-decoration: none;">apointments@smru.edu.in</a></p>
              <p style="margin: 0 0 8px 0;">This is an official automated notification from ${appName}.</p>
              <p style="margin: 0;">To update your quiet hours or notification preferences, visit <a href="${config.WEB_URL}/app/settings" style="color: #0284c7; text-decoration: none;">Notification Settings</a>.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
