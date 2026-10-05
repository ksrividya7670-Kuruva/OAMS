import crypto from 'crypto';
import { db } from '../../core/db.js';
import { ApiError, PrivacyExportInput, PrivacyEraseInput } from '@oams/shared';
import { writeAuditEvent } from '../../core/audit/auditWriter.js';

export class PrivacyService {
  async exportDataPrincipal(orgId: string, input: PrivacyExportInput) {
    if (!input.userId && !input.email) {
      throw ApiError.badRequest('Either userId or email must be specified for data export');
    }

    let user: any = null;
    if (input.userId) {
      user = await db('users').where({ id: input.userId, org_id: orgId }).first();
    } else if (input.email) {
      user = await db('users').where({ email: input.email, org_id: orgId }).first();
    }

    const targetEmail = input.email || user?.email;
    const targetUserId = input.userId || user?.id;

    // 1. Fetch appointments
    const appointmentsQuery = db('appointments').where('org_id', orgId);
    if (targetUserId && targetEmail) {
      appointmentsQuery.where((qb) => {
        qb.where('requester_user_id', targetUserId).orWhere('requester_email', targetEmail);
      });
    } else if (targetUserId) {
      appointmentsQuery.where('requester_user_id', targetUserId);
    } else if (targetEmail) {
      appointmentsQuery.where('requester_email', targetEmail);
    }
    const appointments = await appointmentsQuery.select('*');

    // 2. Fetch visits
    const visitsQuery = db('visits').where('org_id', orgId);
    if (targetUserId && targetEmail) {
      visitsQuery.where((qb) => {
        qb.where('user_id', targetUserId).orWhere('visitor_email', targetEmail);
      });
    } else if (targetUserId) {
      visitsQuery.where('user_id', targetUserId);
    } else if (targetEmail) {
      visitsQuery.where('visitor_email', targetEmail);
    }
    const visits = await visitsQuery.select('*');

    // 3. Fetch notifications
    let notifications: any[] = [];
    if (targetUserId) {
      notifications = await db('notifications').where('user_id', targetUserId).select('*');
    }

    return {
      exportedAt: new Date().toISOString(),
      dataPrincipal: {
        id: user?.id || targetUserId,
        email: user?.email || targetEmail,
        fullName: user?.full_name,
      },
      appointments,
      visits,
      notifications,
    };
  }

  async eraseDataPrincipal(
    orgId: string,
    input: PrivacyEraseInput,
    actorId?: string,
    actorRole?: string,
    correlationId = crypto.randomUUID(),
  ) {
    if (!input.userId && !input.email) {
      throw ApiError.badRequest('Either userId or email must be specified for data erasure');
    }

    let user: any = null;
    if (input.userId) {
      user = await db('users').where({ id: input.userId, org_id: orgId }).first();
    } else if (input.email) {
      user = await db('users').where({ email: input.email, org_id: orgId }).first();
    }

    const targetEmail = input.email || user?.email;
    const targetUserId = input.userId || user?.id;

    await db.transaction(async (trx) => {
      // 1. Anonymize appointments (DPDP Act §17.6)
      const aptQuery = trx('appointments').where('org_id', orgId);
      if (targetUserId && targetEmail) {
        aptQuery.where((qb) => {
          qb.where('requester_user_id', targetUserId).orWhere('requester_email', targetEmail);
        });
      } else if (targetUserId) {
        aptQuery.where('requester_user_id', targetUserId);
      } else if (targetEmail) {
        aptQuery.where('requester_email', targetEmail);
      }

      await aptQuery.update({
        requester_name: 'Anonymized User',
        requester_email: 'anonymized@dpdp.local',
        requester_phone: null,
        subject: '[ANONYMIZED PER DPDP]',
        purpose: '[ANONYMIZED PER DPDP]',
        updated_at: trx.fn.now(),
      });

      // 2. Anonymize visits (scrub ID last 4, photo, and visitor name/contact)
      const visitsQuery = trx('visits').where('org_id', orgId);
      if (targetUserId && targetEmail) {
        visitsQuery.where((qb) => {
          qb.where('user_id', targetUserId).orWhere('visitor_email', targetEmail);
        });
      } else if (targetUserId) {
        visitsQuery.where('user_id', targetUserId);
      } else if (targetEmail) {
        visitsQuery.where('visitor_email', targetEmail);
      }

      await visitsQuery.update({
        visitor_name: 'Anonymized Visitor',
        visitor_email: 'anonymized@dpdp.local',
        visitor_phone: null,
        gov_id_last4: null,
        photo_url: null,
        badge_number: null,
        updated_at: trx.fn.now(),
      });

      // 3. Disable and anonymize user profile if registered
      if (targetUserId) {
        await trx('users')
          .where({ id: targetUserId, org_id: orgId })
          .update({
            full_name: 'Anonymized User',
            email: `anonymized-${targetUserId}@dpdp.local`,
            phone: null,
            status: 'DISABLED',
            updated_at: trx.fn.now(),
          });

        await trx('notifications').where('user_id', targetUserId).delete();
      }

      // 4. Audit row IDs are strictly preserved per §17.6 ("keeps the audit row IDs")
      await writeAuditEvent(trx, {
        orgId,
        actorId,
        actorRole,
        action: 'privacy.data_erasure',
        entityType: 'data_principal',
        entityId: targetUserId || targetEmail || 'unknown',
        changes: {
          anonymized: true,
          targetEmail: targetEmail ? '***@***' : undefined,
        },
        reason: input.reason,
        correlationId,
      });
    });

    return {
      success: true,
      message: 'Data principal personal records successfully anonymized per DPDP Act 2023',
    };
  }
}

export const privacyService = new PrivacyService();
