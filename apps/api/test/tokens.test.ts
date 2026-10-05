import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
} from '../src/core/auth/tokens.js';
import type { AuthUser } from '@oams/shared';
import { RoleCode } from '@oams/shared';

describe('RS256 JWT & Refresh Token System (§3.1, §17.1)', () => {
  const mockUser: AuthUser = {
    id: '11111111-1111-4111-8111-111111111111',
    orgId: '00000000-0000-4000-8000-000000000001',
    email: 'test@apex.local',
    fullName: 'Test User',
    status: 'ACTIVE',
    authProvider: 'EMAIL_OTP',
    timezone: 'Asia/Kolkata',
    theme: 'SYSTEM',
    roles: [RoleCode.EMPLOYEE],
    assignedOfficialIds: [],
  };

  it('should sign and verify valid RS256 access tokens', async () => {
    const token = await signAccessToken(mockUser, 1);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const payload = await verifyAccessToken(token);
    expect(payload.sub).toBe(mockUser.id);
    expect(payload.org).toBe(mockUser.orgId);
    expect(payload.roles).toEqual(mockUser.roles);
    expect(payload.ver).toBe(1);
  });

  it('should reject tampered tokens', async () => {
    const token = await signAccessToken(mockUser, 1);
    const parts = token.split('.');
    // Tamper with the payload part
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    await expect(verifyAccessToken(tamperedToken)).rejects.toThrow();
  });

  it('should generate secure high-entropy refresh tokens and SHA-256 hashes', () => {
    const raw1 = generateRefreshToken();
    const raw2 = generateRefreshToken();

    expect(raw1.token).toHaveLength(80);
    expect(raw2.token).toHaveLength(80);
    expect(raw1.token).not.toEqual(raw2.token);

    expect(raw1.hash).toHaveLength(64);
    expect(raw2.hash).toHaveLength(64);
    expect(raw1.hash).not.toEqual(raw2.hash);

    // Hash should be deterministic
    expect(hashToken(raw1.token)).toEqual(raw1.hash);
  });
});
