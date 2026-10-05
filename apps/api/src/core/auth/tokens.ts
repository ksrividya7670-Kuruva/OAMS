import crypto from 'crypto';
import * as jose from 'jose';
import type { AuthUser } from '@oams/shared';
import { logger } from '../logger.js';

let privateKey: CryptoKey | Uint8Array;
let publicKey: CryptoKey | Uint8Array;

const initPromise = (async () => {
  try {
    if (process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY) {
      privateKey = await jose.importPKCS8(
        process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n'),
        'RS256',
      );
      publicKey = await jose.importSPKI(process.env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n'), 'RS256');
    } else {
      // In-memory RS256 key pair for development / testing per §3.1 & §17.1
      const pair = await jose.generateKeyPair('RS256', { modulusLength: 2048 });
      privateKey = pair.privateKey;
      publicKey = pair.publicKey;
      logger.debug('Generated in-memory RSA key pair for RS256 token signing');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to initialize RS256 keys');
    throw err;
  }
})();

export interface JwtPayload {
  sub: string;
  org: string;
  roles: string[];
  ver: number;
  email: string;
  officialId?: string | null;
  assignedOfficialIds?: string[];
  [key: string]: unknown;
}

export async function signAccessToken(user: AuthUser, version = 1): Promise<string> {
  await initPromise;

  return await new jose.SignJWT({
    org: user.orgId,
    roles: user.roles,
    ver: version,
    email: user.email,
    officialId: user.officialId,
    assignedOfficialIds: user.assignedOfficialIds,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer('oams-auth')
    .setIssuedAt()
    .setExpirationTime('15m') // 15m expiration per §17.1
    .sign(privateKey);
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  await initPromise;

  const { payload } = await jose.jwtVerify(token, publicKey, {
    issuer: 'oams-auth',
    algorithms: ['RS256'],
  });

  return {
    sub: payload.sub as string,
    org: payload.org as string,
    roles: (payload.roles as string[]) || [],
    ver: (payload.ver as number) || 1,
    email: payload.email as string,
    officialId: (payload.officialId as string | null) || null,
    assignedOfficialIds: (payload.assignedOfficialIds as string[]) || [],
  };
}

export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(40).toString('hex');
  const hash = hashToken(token);
  return { token, hash };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
