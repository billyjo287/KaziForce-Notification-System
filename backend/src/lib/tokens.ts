import { createHash, randomBytes, randomInt } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { Role } from '../generated/prisma/client.js';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

/** Short-lived login token (JWT), kept in the browser's memory only. */
export function signAccessToken(user: { id: string; role: Role }): string {
  return jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: `${env.ACCESS_TOKEN_MINUTES}m`,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub) return null;
    return { sub: payload.sub, role: payload.role as Role };
  } catch {
    return null;
  }
}

/** Long random secret for refresh tokens and reset links (never stored as-is). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hash: what the database stores instead of the secret itself. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Six-digit SMS code, e.g. "042917". */
export function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
