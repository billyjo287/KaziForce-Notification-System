import type { NextFunction, Request, Response } from 'express';
import type { Language, Role } from '../generated/prisma/client.js';
import { forbidden, unauthorized } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/tokens.js';

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  language: Language;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

/**
 * Requires a valid login token. The user is re-read from the database on every request, so a
 * suspension takes effect immediately rather than when the token expires.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyAccessToken(token) : null;
  if (!payload) throw unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, name: true, language: true, status: true },
  });
  if (!user) throw unauthorized();
  if (user.status === 'suspended') {
    throw forbidden('account_suspended', 'This account has been suspended.');
  }
  req.user = { id: user.id, role: user.role, name: user.name, language: user.language };
  next();
}

/** Only these roles may continue (use after requireAuth). */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

/** The logged-in user (for handlers behind requireAuth). */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
