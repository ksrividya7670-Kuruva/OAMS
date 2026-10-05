export interface PowerAutomatePayloadOptions {
  toEmail: string;
  recipientName?: string;
  subject: string;
  title: string;
  body: string;
  link?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  referenceNo?: string;
  eventType?:
    | 'APPOINTMENT_REQUESTED'
    | 'APPOINTMENT_REQUESTED_ADMIN'
    | 'APPOINTMENT_CONFIRMED'
    | 'APPOINTMENT_REJECTED'
    | 'APPOINTMENT_CANCELLED'
    | 'APPOINTMENT_CLOSED'
    | string;
  status?: string;
  officialName?: string;
  officialEmail?: string;
  scheduledTime?: string;
  location?: string;
  reason?: string;
  adminEmail?: string;
  ccEmail?: string;
  requesterEmail?: string;
  requesterName?: string;
  requesterPhone?: string;
  recipientRole?: 'REQUESTER' | 'ADMIN' | 'OFFICIAL' | 'STAFF' | 'ALL';
  actionRequired?: boolean;
}

export interface PowerAutomateResult {
  ok: boolean;
  status: number;
  statusText: string;
  message: string;
}

const FALLBACK_WEBHOOK_URL =
  'https://default0206568c151549fd90d4f6dad07845.00.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/12/workflows/8e66872d567e4d46bd015476f84d9e18/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=s9jNLAcdEDKqzJmSYVb8xC9Bt0PQzJrH57pKmQoiK4U';

export function getPowerAutomateWebhookUrl(): string {
  if (typeof window !== 'undefined') {
    const customUrl = localStorage.getItem('oams_power_automate_webhook_url');
    // Clear out deprecated workflow URLs if cached in browser
    if (
      customUrl &&
      (customUrl.includes('38e7464b98d4480595dcf1cfdd5ea580') ||
        customUrl.includes('6431e698b2524aabae0f57a693605d31'))
    ) {
      localStorage.removeItem('oams_power_automate_webhook_url');
    } else if (customUrl && customUrl.trim().startsWith('http')) {
      return customUrl.trim();
    }
  }
  return (
    (import.meta as any).env?.VITE_POWER_AUTOMATE_WEBHOOK_URL ||
    FALLBACK_WEBHOOK_URL
  );
}

export function setPowerAutomateWebhookUrl(url: string): void {
  if (typeof window !== 'undefined') {
    if (url && url.trim().startsWith('http')) {
      localStorage.setItem('oams_power_automate_webhook_url', url.trim());
    } else {
      localStorage.removeItem('oams_power_automate_webhook_url');
    }
  }
}

export const DEFAULT_DESTINATION_EMAIL = 'apointments@smru.edu.in';
export const DEFAULT_SENDER_EMAIL = 'apointments@smru.edu.in';
export const DEFAULT_SENDER_NAME = 'OAMS Appointment';

/**
 * Sanitize recipient email:
 * Preserves the user's real email address so notifications are sent directly TO the user.
 * Only internal local dev mock domains (@apex., @oams.local) fallback to default inbox.
 */
export function sanitizeRecipientEmail(email?: string): string {
  if (!email) return DEFAULT_DESTINATION_EMAIL;
  const trimmed = email.trim();
  const lower = trimmed.toLowerCase();
  if (
    !trimmed ||
    lower.includes('@apex.') ||
    lower.includes('@oams.local')
  ) {
    return DEFAULT_DESTINATION_EMAIL;
  }
  return trimmed;
}

export function getAdminEmail(): string {
  const envEmail = (import.meta as any).env?.VITE_ADMIN_EMAIL;
  if (envEmail && envEmail !== 'admin@stmarys.edu') return sanitizeRecipientEmail(envEmail);
  return (
    localStorage.getItem('oams_admin_email') ||
    DEFAULT_DESTINATION_EMAIL
  );
}

export function getOfficialEmail(): string {
  const envEmail = (import.meta as any).env?.VITE_OFFICIAL_EMAIL;
  if (envEmail && envEmail !== 'secretary@stmarys.edu') return sanitizeRecipientEmail(envEmail);
  return (
    localStorage.getItem('oams_official_email') ||
    DEFAULT_DESTINATION_EMAIL
  );
}

export function getSenderEmail(): string {
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem('oams_sender_email');
    if (local && local.trim() && local.includes('@')) return local.trim();
  }
  const envEmail =
    (import.meta as any).env?.VITE_SENDER_EMAIL ||
    (import.meta as any).env?.VITE_SMTP_FROM;
  if (envEmail) {
    const match = envEmail.match(/<([^>]+)>/);
    if (match) return match[1].trim();
    if (envEmail.includes('@')) return envEmail.trim();
  }
  return DEFAULT_SENDER_EMAIL;
}

export function getSenderName(): string {
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem('oams_sender_name');
    if (local && local.trim()) return local.trim();
  }
  const envName = (import.meta as any).env?.VITE_SENDER_NAME;
  if (envName && envName.trim()) return envName.trim();
  const envFrom = (import.meta as any).env?.VITE_SMTP_FROM;
  if (envFrom && envFrom.includes('<')) {
    const namePart = envFrom.split('<')[0].replace(/"/g, '').trim();
    if (namePart) return namePart;
  }
  return DEFAULT_SENDER_NAME;
}

export function getFormattedSender(): string {
  return `"${getSenderName()}" <${getSenderEmail()}>`;
}

export async function sendPowerAutomateNotification(
  opts: PowerAutomatePayloadOptions,
): Promise<PowerAutomateResult> {
  const webhookUrl = getPowerAutomateWebhookUrl();
  const deliveryId = `web-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const priority = opts.priority || 'HIGH';
  const eventType = opts.eventType || 'APPOINTMENT_UPDATE';
  const status =
    opts.status ||
    (eventType === 'APPOINTMENT_CONFIRMED'
      ? 'CONFIRMED'
      : eventType === 'APPOINTMENT_REJECTED'
      ? 'REJECTED'
      : 'UNDER_REVIEW');
  const link = opts.link || window.location.origin;

  // Determine theme colors and badge text
  let headerBg = '#1e3a8a'; // Royal Blue for under review
  const badgeBg = 'rgba(255,255,255,0.2)';
  let badgeText = `${priority} PRIORITY &bull; UNDER REVIEW`;

  if (status === 'CONFIRMED' || eventType === 'APPOINTMENT_CONFIRMED') {
    headerBg = '#047857'; // Emerald
    badgeText = `${priority} PRIORITY &bull; CONFIRMED`;
  } else if (status === 'RESCHEDULED' || eventType === 'APPOINTMENT_RESCHEDULED') {
    headerBg = '#d97706'; // Amber / Orange
    badgeText = `${priority} PRIORITY &bull; RESCHEDULED`;
  } else if (status === 'REJECTED' || eventType === 'APPOINTMENT_REJECTED') {
    headerBg = '#b91c1c'; // Crimson Red
    badgeText = `REQUEST REJECTED`;
  } else if (status === 'CANCELLED' || eventType === 'APPOINTMENT_CANCELLED') {
    headerBg = '#475569'; // Slate
    badgeText = `APPOINTMENT CANCELLED`;
  }

  // Sender identity constants
  const senderEmail = getSenderEmail();
  const senderName = getSenderName();
  const formattedSender = getFormattedSender();

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08);">
      <div style="background: ${headerBg}; padding: 24px; color: #ffffff;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 12px;">
          <tr>
            <td align="left">
              <span style="font-size: 14px; font-weight: 800; letter-spacing: 0.05em; color: #ffffff; text-transform: uppercase;">${senderName}</span>
              <span style="display: block; font-size: 11px; color: rgba(255,255,255,0.85); margin-top: 2px;">Official Appointment Management System</span>
            </td>
            <td align="right">
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background: ${badgeBg}; color: #ffffff; padding: 5px 10px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.25);">
                ${badgeText}
              </span>
            </td>
          </tr>
        </table>
        <h2 style="margin: 8px 0 0 0; font-size: 20px; font-weight: 700; color: #ffffff;">${opts.subject}</h2>
      </div>
      <div style="padding: 24px; color: #334155; line-height: 1.6;">
        <p style="font-size: 15px; margin: 0 0 16px 0; color: #1e293b;">
          Dear <strong>${opts.recipientName || 'Valued Requester / Administrator'}</strong>,
        </p>
        <p style="font-size: 14px; margin: 0 0 16px 0;">${opts.body}</p>

        <div style="background: #f8fafc; padding: 16px; border-radius: 8px; border-left: 4px solid ${headerBg}; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            ${opts.referenceNo ? `<tr><td style="padding: 4px 0; color: #64748b; width: 140px;">Reference No:</td><td style="padding: 4px 0; font-weight: 700; font-family: monospace; color: #0f172a;">${opts.referenceNo}</td></tr>` : ''}
            ${opts.requesterName ? `<tr><td style="padding: 4px 0; color: #64748b;">Requester:</td><td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${opts.requesterName} ${opts.requesterEmail ? `(${opts.requesterEmail})` : ''}</td></tr>` : ''}
            ${opts.requesterPhone ? `<tr><td style="padding: 4px 0; color: #64748b;">Phone:</td><td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${opts.requesterPhone}</td></tr>` : ''}
            ${opts.officialName ? `<tr><td style="padding: 4px 0; color: #64748b;">Official:</td><td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${opts.officialName}</td></tr>` : ''}
            ${opts.scheduledTime ? `<tr><td style="padding: 4px 0; color: #64748b;">Meeting Timing:</td><td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${opts.scheduledTime}</td></tr>` : ''}
            ${opts.location ? `<tr><td style="padding: 4px 0; color: #64748b;">Location / Mode:</td><td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${opts.location}</td></tr>` : ''}
            <tr><td style="padding: 4px 0; color: #64748b;">Status:</td><td style="padding: 4px 0; font-weight: 700; color: ${headerBg};">${status}</td></tr>
            ${opts.reason ? `<tr><td style="padding: 4px 0; color: #64748b;">Remarks / Note:</td><td style="padding: 4px 0; color: #0f172a;">${opts.reason}</td></tr>` : ''}
          </table>
        </div>

        <div style="margin-top: 24px;">
          <a href="${link}" style="display: inline-block; background: ${headerBg}; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Open in Official OAMS Portal &rarr;
          </a>
        </div>
      </div>
      <div style="background: #f1f5f9; padding: 16px 24px; font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0 0 4px 0; font-weight: 700; color: #1e293b; font-size: 12px;">${senderName} &bull; SMRU Official Appointment Management System</p>
        <p style="margin: 0; color: #64748b;">Official notification dispatched from <strong>${senderEmail}</strong> &bull; Protocol & Secretariat Communications</p>
      </div>
    </div>
  `.trim();

  const cleanToEmail = sanitizeRecipientEmail(opts.toEmail || opts.requesterEmail);
  const cleanRequesterEmail = sanitizeRecipientEmail(opts.requesterEmail || opts.toEmail);
  const cleanRequesterName = (opts.requesterName || opts.recipientName || 'Valued Requester').trim();
  const adminEmail = sanitizeRecipientEmail(opts.adminEmail || getAdminEmail());
  const officialEmail = sanitizeRecipientEmail(opts.officialEmail || getOfficialEmail());

  // Unified payload formatted with top-level fields for universal Power Automate mapping
  const payload = {
    deliveryId,
    // Event & Status matching tokens for Switch block
    eventType,
    event: eventType,
    action: eventType,
    status,
    appointmentStatus: status,
    requestStatus: status,
    // Outgoing From / Sender Identity fields (OAMS Appointment <apointments@smru.edu.in>)
    from: senderEmail,
    fromEmail: senderEmail,
    from_email: senderEmail,
    fromName: senderName,
    from_name: senderName,
    senderName: senderName,
    sender_name: senderName,
    senderDisplayName: senderName,
    sender_display_name: senderName,
    displayName: senderName,
    display_name: senderName,
    formattedFrom: formattedSender,
    fromFormatted: formattedSender,
    fullSender: formattedSender,
    senderEmail: senderEmail,
    sender_email: senderEmail,
    sender: senderEmail,
    sendAs: senderEmail,
    send_as: senderEmail,
    sendAsEmail: senderEmail,
    sendAsName: senderName,
    sendAsFormatted: formattedSender,
    replyTo: senderEmail,
    reply_to: senderEmail,
    replyToName: senderName,
    fromAddress: senderEmail,
    mailFrom: senderEmail,
    mail_from: senderEmail,
    mailFromName: senderName,
    // Recipient Email fields (The email this notification goes TO: user's email)
    to: cleanToEmail, // Standard Power Automate 'To' field
    toEmail: cleanToEmail,
    to_email: cleanToEmail,
    requesterEmail: cleanRequesterEmail,
    requester_email: cleanRequesterEmail,
    recipientEmail: cleanToEmail,
    recipient_email: cleanToEmail,
    userEmail: cleanRequesterEmail,
    user_email: cleanRequesterEmail,
    targetEmail: cleanToEmail,
    target_email: cleanToEmail,
    allRecipients: cleanToEmail,
    recipientRole: opts.recipientRole || 'REQUESTER',
    // Requester Details
    requesterName: cleanRequesterName,
    recipientName: cleanRequesterName,
    requesterPhone: opts.requesterPhone || '',
    recipientPhone: opts.requesterPhone || '',
    // Metadata
    adminEmail,
    officialEmail,
    cc: opts.ccEmail ? sanitizeRecipientEmail(opts.ccEmail) : '',
    ccEmail: opts.ccEmail ? sanitizeRecipientEmail(opts.ccEmail) : '',
    officialName: opts.officialName || 'Mr. KVK',
    referenceNo: opts.referenceNo || 'OAMS-ALERT',
    subject: opts.subject,
    title: opts.title,
    body: opts.body,
    html: htmlContent, // Full styled HTML email
    link,
    portalLink: link,
    priority,
    location: opts.location || 'Main Secretariat Chambers',
    scheduledTime: opts.scheduledTime || 'As scheduled in portal',
    reason: opts.reason || '',
    occurredAt: new Date().toISOString(),
    recipient: {
      email: cleanToEmail,
      name: cleanRequesterName,
      phone: opts.requesterPhone || '',
    },
    email: {
      from: formattedSender,
      fromAddress: senderEmail,
      fromEmail: senderEmail,
      fromName: senderName,
      senderName: senderName,
      senderDisplayName: senderName,
      senderEmail: senderEmail,
      sendAs: senderEmail,
      sendAsName: senderName,
      sendAsFormatted: formattedSender,
      replyTo: senderEmail,
      replyToName: senderName,
      to: cleanToEmail,
      adminTo: adminEmail,
      officialTo: officialEmail,
      subject: opts.subject,
      html: htmlContent,
      text: opts.body,
    },
    push: {
      title: opts.title,
      body: opts.body,
      link,
      priority,
      referenceNo: opts.referenceNo || 'OAMS-ALERT',
    },
    source: 'OAMS-Portal',
    timestamp: new Date().toISOString(),
  };

  // Dynamically record in-app notification for the portal UI
  if (typeof window !== 'undefined') {
    try {
      const inAppItem: any = {
        id: deliveryId,
        eventType,
        title: opts.title || opts.subject,
        body: opts.body,
        link,
        priority,
        entityType: 'APPOINTMENT',
        entityId: opts.referenceNo || deliveryId,
        readAt: null,
        createdAt: new Date().toISOString(),
      };
      const stored = localStorage.getItem('oams_mock_notifications');
      const list = stored ? JSON.parse(stored) : [];
      list.unshift(inAppItem);
      localStorage.setItem('oams_mock_notifications', JSON.stringify(list));
      window.dispatchEvent(
        new CustomEvent('oams-notification-created', { detail: inAppItem }),
      );
    } catch {
      // ignore storage access error
    }
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OAMS-Event-Type': eventType,
        'X-OAMS-Status': status,
        'X-OAMS-Action': 'NOTIFICATION_PUSH_AND_EMAIL',
        'X-OAMS-Recipient-Role': payload.recipientRole,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok || response.status === 202) {
      return {
        ok: true,
        status: response.status,
        statusText: response.statusText,
        message: `Notification successfully dispatched via Microsoft Power Automate (${response.status} Accepted)`,
      };
    } else {
      const errText = await response.text().catch(() => '');
      return {
        ok: false,
        status: response.status,
        statusText: response.statusText,
        message: `Power Automate returned error ${response.status}: ${errText || response.statusText}`,
      };
    }
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      statusText: 'Network Error',
      message: err.message || 'Failed to connect to Power Automate webhook URL',
    };
  }
}

/**
 * Dispatch notifications for a new appointment submission:
 * Sends EXACTLY ONE original webhook call delivering simultaneously to Requester and Administrator.
 * No duplicate calls or multiple runs in Power Automate!
 */
export async function sendAppointmentSubmissionNotifications(params: {
  appointmentId: string;
  referenceNo: string;
  subject: string;
  requesterEmail: string;
  requesterName: string;
  requesterPhone?: string;
  officialName: string;
  officialEmail?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  preferredTime?: string;
  meetingMode?: string;
  location?: string;
  purpose?: string;
}): Promise<PowerAutomateResult> {
  const adminEmail = sanitizeRecipientEmail(getAdminEmail());
  const officialEmail = sanitizeRecipientEmail(params.officialEmail || getOfficialEmail());
  const portalBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  const link = `${portalBase}/`;

  const cleanToEmail = sanitizeRecipientEmail(params.requesterEmail);

  return sendPowerAutomateNotification({
    toEmail: cleanToEmail,
    recipientName: params.requesterName,
    adminEmail,
    officialEmail,
    ccEmail: undefined,
    recipientRole: 'REQUESTER',
    requesterEmail: cleanToEmail,
    requesterName: params.requesterName,
    requesterPhone: params.requesterPhone,
    subject: `Appointment Request Received: ${params.subject} (${params.referenceNo})`,
    title: 'New Appointment Request Submitted',
    body: `A new appointment request #${params.referenceNo} for "${params.subject}" has been submitted by ${params.requesterName} (${cleanToEmail}${params.requesterPhone ? `, Tel: ${params.requesterPhone}` : ''}) for ${params.officialName}. The request is currently UNDER REVIEW by the official secretariat.`,
    priority: params.priority || 'HIGH',
    referenceNo: params.referenceNo,
    eventType: 'APPOINTMENT_REQUESTED',
    status: 'UNDER_REVIEW',
    officialName: params.officialName,
    scheduledTime: params.preferredTime,
    location:
      params.location ||
      (params.meetingMode === 'ONLINE'
        ? 'Microsoft Teams Online'
        : 'Chamber 101, Main Secretariat'),
    reason: params.purpose,
    link,
  });
}

/**
 * Dispatch status change notifications (Approved, Rejected, Cancelled, Rescheduled):
 * Delivers directly and cleanly to the Requester's email via Microsoft Power Automate.
 */
export async function sendAppointmentStatusNotifications(params: {
  appointmentId: string;
  referenceNo: string;
  subject: string;
  requesterEmail: string;
  requesterName: string;
  requesterPhone?: string;
  officialName: string;
  status: 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'RESCHEDULED';
  reason?: string;
  scheduledTime?: string;
  location?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}): Promise<PowerAutomateResult> {
  const adminEmail = sanitizeRecipientEmail(getAdminEmail());
  const isApproved = params.status === 'CONFIRMED';
  const isRejected = params.status === 'REJECTED';
  const isRescheduled = params.status === 'RESCHEDULED';
  const eventType = isApproved
    ? 'APPOINTMENT_CONFIRMED'
    : isRejected
    ? 'APPOINTMENT_REJECTED'
    : isRescheduled
    ? 'APPOINTMENT_RESCHEDULED'
    : 'APPOINTMENT_CANCELLED';

  const subjectText = isApproved
    ? `Appointment Confirmed: ${params.subject} (${params.referenceNo})`
    : isRejected
    ? `Appointment Request Rejected: ${params.subject} (${params.referenceNo})`
    : isRescheduled
    ? `Appointment Rescheduled: ${params.subject} (${params.referenceNo})`
    : `Appointment Cancelled: ${params.subject} (${params.referenceNo})`;

  const bodyText = isApproved
    ? `Good news! The appointment #${params.referenceNo} for ${params.requesterName} with ${params.officialName} has been APPROVED and CONFIRMED. Meeting Timing: ${params.scheduledTime || 'As scheduled'}. Location: ${params.location || 'Main Secretariat Chambers'}.`
    : isRescheduled
    ? `Notice: The appointment #${params.referenceNo} for ${params.requesterName} with ${params.officialName} has been RESCHEDULED to new timings: ${params.scheduledTime || 'See portal'}. Location: ${params.location || 'Main Secretariat Chambers'}.${params.reason ? ` Reason: ${params.reason}` : ''}`
    : isRejected
    ? `Notice: The appointment request #${params.referenceNo} for "${params.subject}" was REJECTED due to official schedule constraints.${params.reason ? ` Remarks: ${params.reason}` : ''}`
    : `Notice: The appointment #${params.referenceNo} has been cancelled.${params.reason ? ` Reason: ${params.reason}` : ''}`;

  const portalBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  const link = `${portalBase}/`;
  const cleanToEmail = sanitizeRecipientEmail(params.requesterEmail);

  return sendPowerAutomateNotification({
    toEmail: cleanToEmail,
    recipientName: params.requesterName,
    adminEmail,
    ccEmail: undefined,
    recipientRole: 'REQUESTER',
    requesterEmail: cleanToEmail,
    requesterName: params.requesterName,
    requesterPhone: params.requesterPhone,
    subject: subjectText,
    title: `Appointment ${params.status}`,
    body: bodyText,
    priority: params.priority || 'HIGH',
    referenceNo: params.referenceNo,
    eventType,
    status: params.status,
    officialName: params.officialName,
    scheduledTime: params.scheduledTime,
    location: params.location,
    reason: params.reason,
    link,
  });
}
