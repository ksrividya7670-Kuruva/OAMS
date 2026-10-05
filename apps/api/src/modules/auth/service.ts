import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { db } from '../../core/db.js';
import { writeAuditEvent } from '../../core/audit/auditWriter.js';
import { sendEmail } from '../../core/email/mailer.js';
import { signAccessToken, generateRefreshToken, hashToken } from '../../core/auth/tokens.js';
import { ApiError, RoleCode, type AuthUser, type AuthResponse } from '@oams/shared';
import { logger } from '../../core/logger.js';

export class AuthService {
  async requestEmailOtp(
    email: string,
    correlationId: string,
    ip?: string,
  ): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check rate limit: max 3 requests per 15 minutes per email (§17.1)
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const count = await db('email_otps')
      .where('email', normalizedEmail)
      .where('created_at', '>', fifteenMinsAgo)
      .count('* as count')
      .first();

    if (count && Number(count.count) >= 3) {
      throw ApiError.rateLimited('Too many OTP requests. Please wait 15 minutes.');
    }

    // Generate 6-digit code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db('email_otps').insert({
      email: normalizedEmail,
      code_hash: codeHash,
      expires_at: expiresAt,
      attempts: 0,
    });

    // Send email with code
    await sendEmail({
      to: normalizedEmail,
      subject: 'Your OAMS Login Code',
      html: `<h2>Your OAMS Verification Code</h2><p>Your one-time login code is: <strong>${otp}</strong></p><p>This code will expire in 10 minutes.</p>`,
    });

    logger.info(
      { email: normalizedEmail, correlationId, ip },
      'Email OTP generated and dispatched',
    );
    return { success: true, message: 'Verification code sent to email' };
  }

  async verifyEmailOtp(
    email: string,
    code: string,
    correlationId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResponse & { rawRefreshToken: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Find latest active OTP for this email
    const record = await db('email_otps')
      .where('email', normalizedEmail)
      .whereNull('consumed_at')
      .where('expires_at', '>', new Date())
      .orderBy('created_at', 'desc')
      .first();

    if (!record) {
      throw ApiError.badRequest('Invalid or expired verification code');
    }

    if (record.attempts >= 5) {
      throw ApiError.badRequest('Too many failed attempts. Please request a new code.');
    }

    const isValid = await bcrypt.compare(code, record.codeHash);
    if (!isValid) {
      await db('email_otps').where('id', record.id).increment('attempts', 1);
      throw ApiError.badRequest('Incorrect verification code');
    }

    // Mark OTP consumed
    await db('email_otps').where('id', record.id).update({ consumed_at: db.fn.now() });

    // Find default organization
    let org = await db('organizations').first();
    if (!org) {
      const [newOrg] = await db('organizations')
        .insert({ name: 'Default Organization' })
        .returning('*');
      org = newOrg;
    }

    // Find or create GUEST user
    let userRow = await db('users').where({ org_id: org.id, email: normalizedEmail }).first();

    if (!userRow) {
      const [newUser] = await db('users')
        .insert({
          org_id: org.id,
          email: normalizedEmail,
          full_name: normalizedEmail.split('@')[0],
          auth_provider: 'EMAIL_OTP',
          status: 'ACTIVE',
        })
        .returning('*');
      userRow = newUser;

      // Assign GUEST role
      const guestRole = await db('roles').where('code', RoleCode.GUEST).first();
      if (guestRole) {
        await db('user_roles').insert({
          user_id: userRow.id,
          role_id: guestRole.id,
        });
      }
    }

    return this.createAuthSession(userRow, correlationId, ip, userAgent);
  }

  async breakGlassLogin(
    email: string,
    password: string,
    correlationId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResponse & { rawRefreshToken: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    const userRow = await db('users')
      .where({ email: normalizedEmail, auth_provider: 'LOCAL' })
      .first();

    if (!userRow || !userRow.passwordHash) {
      throw ApiError.unauthenticated('Invalid credentials');
    }

    const match = await bcrypt.compare(password, userRow.passwordHash);
    if (!match) {
      throw ApiError.unauthenticated('Invalid credentials');
    }

    // Audit break glass login per §17.1
    await writeAuditEvent(db, {
      orgId: userRow.orgId,
      actorId: userRow.id,
      actorRole: 'SUPER_ADMIN',
      action: 'auth.break_glass_login',
      entityType: 'user',
      entityId: userRow.id,
      reason: 'Break-glass admin authentication',
      ip,
      userAgent,
      correlationId,
    });

    return this.createAuthSession(userRow, correlationId, ip, userAgent);
  }

  async refreshToken(
    rawToken: string,
    correlationId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResponse & { rawRefreshToken: string }> {
    const tokenHash = hashToken(rawToken);

    const record = await db('refresh_tokens').where('token_hash', tokenHash).first();

    if (!record) {
      throw ApiError.unauthenticated('Invalid refresh token');
    }

    // Reuse detection (§17.1): If token is already revoked, revoke the entire family!
    if (record.revokedAt) {
      logger.warn({ familyId: record.familyId }, 'Refresh token reuse detected! Revoking family.');
      await db('refresh_tokens')
        .where('family_id', record.familyId)
        .update({ revoked_at: db.fn.now() });

      throw ApiError.unauthenticated('Refresh token reuse detected');
    }

    if (new Date(record.expiresAt) < new Date()) {
      throw ApiError.unauthenticated('Refresh token expired');
    }

    // Revoke the used token (rotation)
    await db('refresh_tokens').where('id', record.id).update({ revoked_at: db.fn.now() });

    const userRow = await db('users').where('id', record.userId).first();
    if (!userRow || userRow.status !== 'ACTIVE') {
      throw ApiError.unauthenticated('User account is inactive');
    }

    // Generate new refresh token in the same family
    const nextRefresh = generateRefreshToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db('refresh_tokens').insert({
      user_id: userRow.id,
      token_hash: nextRefresh.hash,
      family_id: record.familyId,
      expires_at: expiresAt,
      ip,
      user_agent: userAgent,
    });

    const authUser = await this.buildAuthUser(userRow);
    const accessToken = await signAccessToken(authUser, userRow.version);

    return {
      user: authUser,
      accessToken,
      expiresInSec: 15 * 60,
      rawRefreshToken: nextRefresh.token,
    };
  }

  async logout(rawToken?: string): Promise<void> {
    if (!rawToken) return;
    const tokenHash = hashToken(rawToken);
    await db('refresh_tokens').where('token_hash', tokenHash).update({ revoked_at: db.fn.now() });
  }

  private async createAuthSession(
    userRow: any,
    correlationId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResponse & { rawRefreshToken: string }> {
    const authUser = await this.buildAuthUser(userRow);
    const accessToken = await signAccessToken(authUser, userRow.version);

    const refreshTokenData = generateRefreshToken();
    const familyId = crypto.randomUUID();
    const isGuest = authUser.roles.includes(RoleCode.GUEST);
    const expiresAt = new Date(
      Date.now() + (isGuest ? 1 : 7) * 24 * 60 * 60 * 1000, // 1 day for guests, 7 for staff
    );

    await db('refresh_tokens').insert({
      user_id: userRow.id,
      token_hash: refreshTokenData.hash,
      family_id: familyId,
      expires_at: expiresAt,
      ip,
      user_agent: userAgent,
    });

    await db('users').where('id', userRow.id).update({ last_login_at: db.fn.now() });

    return {
      user: authUser,
      accessToken,
      expiresInSec: 15 * 60,
      rawRefreshToken: refreshTokenData.token,
    };
  }

  async buildAuthUser(userRow: any): Promise<AuthUser> {
    const rolesRows = await db('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .where('user_roles.user_id', userRow.id)
      .select('roles.code');

    const roles = rolesRows.map((r) => r.code as RoleCode);

    const officialRow = await db('officials')
      .where({ user_id: userRow.id, is_active: true })
      .first();

    const assignedRows = await db('official_support_staff')
      .where('user_id', userRow.id)
      .where(function () {
        this.whereNull('active_to').orWhere('active_to', '>', db.fn.now());
      })
      .select('official_id');

    return {
      id: userRow.id,
      orgId: userRow.orgId,
      email: userRow.email,
      fullName: userRow.fullName,
      designation: userRow.designation,
      departmentId: userRow.departmentId,
      authProvider: userRow.authProvider,
      status: userRow.status,
      timezone: userRow.timezone,
      theme: userRow.theme,
      roles,
      officialId: officialRow ? officialRow.id : null,
      assignedOfficialIds: assignedRows.map((r) => r.officialId),
    };
  }
}

export const authService = new AuthService();
