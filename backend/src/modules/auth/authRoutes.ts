// Accounts: register, log in, stay logged in (refresh), log out, log out everywhere, and reset a
// forgotten password (PRD FR-1).
//
// Login token (JWT, 15 min) goes to the page's memory. The refresh token (30 days) lives in an
// httpOnly cookie that page scripts cannot read, is stored only as a hash, and is replaced on
// every use. If an already-replaced token is used again, it was probably stolen: every session
// of that user is ended.
import bcrypt from 'bcrypt';
import {
  Router,
  type CookieOptions,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import type { User } from '../../generated/prisma/client.js';
import { badRequest, conflict, forbidden, unauthorized } from '../../lib/httpError.js';
import { prisma } from '../../lib/prisma.js';
import type { RateLimiters } from '../../lib/rateLimits.js';
import { sendEmail } from '../../lib/mailer.js';
import { randomToken, sha256, signAccessToken } from '../../lib/tokens.js';
import { parse } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { DEFAULT_QUIET_HOURS, PRESETS } from '../me/presets.js';
import { serializeUser, userWithProfile } from '../me/serializeUser.js';
import { describeDevice, newLoginEmail, passwordResetEmail } from './emails.js';

const COOKIE = 'kf_refresh';
const DAY_MS = 24 * 60 * 60 * 1000;
/** Two tabs refreshing at the same moment must not look like token theft. */
const ROTATION_GRACE_MS = 30 * 1000;
const RESET_LINK_MS = 60 * 60 * 1000;
// Compared against when the email is unknown, so "no such user" takes as long as "wrong password".
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_DAYS * DAY_MS,
});

const email = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());
const password = z.string().min(8, 'Use at least 8 characters').max(128);

const registerSchema = z.object({
  role: z.enum(['worker', 'business']), // admins come from the seed script only
  name: z.string().trim().min(2).max(80),
  email,
  password,
  language: z.enum(['en', 'sw']).default('en'),
});
const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
const forgotSchema = z.object({ email });
const resetSchema = z.object({ token: z.string().min(20).max(200), password });

/** Cookie-based endpoints need this header; other websites cannot add it (CSRF protection). */
function requireAppHeader(req: Request, _res: Response, next: NextFunction) {
  if (req.get('x-requested-with') !== 'KaziForce')
    throw forbidden('missing_header', 'Bad request.');
  next();
}

async function startSession(res: Response, user: User, userAgent: string | undefined) {
  const token = randomToken();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      userAgent: userAgent?.slice(0, 500),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * DAY_MS),
    },
  });
  res.cookie(COOKIE, token, cookieOptions());
  return session;
}

async function loggedInResponse(res: Response, userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: userWithProfile,
  });
  res.json({ accessToken: signAccessToken(user), user: serializeUser(user) });
}

function endAllSessions(userId: string) {
  return prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function authRoutes(limits: RateLimiters) {
  const router = Router();

  router.post('/register', limits.login, async (req, res) => {
    const input = parse(registerSchema, req.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw conflict('email_taken', 'An account with this email already exists.');

    const user = await prisma.user.create({
      data: {
        role: input.role,
        name: input.name,
        email: input.email,
        language: input.language,
        passwordHash: await bcrypt.hash(input.password, 12),
        lastLoginAt: new Date(),
        preference: {
          create: {
            preset: 'recommended',
            channelSettings: PRESETS.recommended.channelSettings,
            dailySummary: PRESETS.recommended.dailySummary,
            quietHours: DEFAULT_QUIET_HOURS,
          },
        },
      },
    });
    await startSession(res, user, req.get('user-agent'));
    res.status(201);
    await loggedInResponse(res, user.id);
  });

  router.post('/login', limits.login, async (req, res) => {
    const input = parse(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    const passwordOk = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordOk) {
      throw unauthorized('wrong_credentials', 'The email or password is not right.');
    }
    if (user.status === 'suspended') {
      throw forbidden('account_suspended', 'This account has been suspended.');
    }

    const userAgent = req.get('user-agent');
    const seenDevice = await prisma.session.findFirst({
      where: { userId: user.id, userAgent: userAgent?.slice(0, 500) ?? null },
    });
    await startSession(res, user, userAgent);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    if (!seenDevice) {
      const settings = `${env.PUBLIC_APP_URL}/${user.role === 'business' ? 'employer' : user.role}/settings`;
      sendEmail({
        to: user.email,
        ...newLoginEmail(user.name, describeDevice(userAgent), new Date(), settings, user.language),
      });
    }
    await loggedInResponse(res, user.id);
  });

  router.post('/refresh', requireAppHeader, async (req, res) => {
    const token: unknown = req.cookies?.[COOKIE];
    if (typeof token !== 'string') throw unauthorized();

    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (!session) {
      res.clearCookie(COOKIE, { path: '/api/auth' });
      throw unauthorized();
    }

    if (session.revokedAt) {
      const recentlyRotated =
        session.replacedById && Date.now() - session.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (recentlyRotated && session.user.status === 'active') {
        // Another tab just refreshed with this token: fine, the browser already has the new cookie.
        return loggedInResponse(res, session.userId);
      }
      if (session.replacedById) await endAllSessions(session.userId); // reused: probably stolen
      res.clearCookie(COOKIE, { path: '/api/auth' });
      throw unauthorized();
    }

    if (session.expiresAt < new Date()) {
      res.clearCookie(COOKIE, { path: '/api/auth' });
      throw unauthorized();
    }
    if (session.user.status === 'suspended') {
      await endAllSessions(session.userId);
      res.clearCookie(COOKIE, { path: '/api/auth' });
      throw forbidden('account_suspended', 'This account has been suspended.');
    }

    const next = await startSession(res, session.user, req.get('user-agent'));
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), replacedById: next.id },
    });
    await loggedInResponse(res, session.userId);
  });

  router.post('/logout', requireAppHeader, async (req, res) => {
    const token: unknown = req.cookies?.[COOKIE];
    if (typeof token === 'string') {
      await prisma.session.updateMany({
        where: { tokenHash: sha256(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie(COOKIE, { path: '/api/auth' });
    res.status(204).end();
  });

  router.post('/logout-all', requireAuth, async (req, res) => {
    await endAllSessions(currentUser(req).id);
    res.clearCookie(COOKIE, { path: '/api/auth' });
    res.status(204).end();
  });

  router.post('/forgot-password', limits.passwordReset, async (req, res) => {
    const input = parse(forgotSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (user && user.status === 'active') {
      const token = randomToken();
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + RESET_LINK_MS),
        },
      });
      const link = `${env.PUBLIC_APP_URL}/reset-password?token=${token}`;
      sendEmail({ to: user.email, ...passwordResetEmail(user.name, link, user.language) });
    }
    // Same answer whether or not the account exists, so emails cannot be discovered this way.
    res.json({ ok: true });
  });

  router.post('/reset-password', limits.passwordReset, async (req, res) => {
    const input = parse(resetSchema, req.body);
    const reset = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(input.token) },
    });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw badRequest('reset_link_invalid', 'This link has expired or was already used.');
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      // A new password logs every device out.
      prisma.session.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    res.json({ ok: true });
  });

  return router;
}
