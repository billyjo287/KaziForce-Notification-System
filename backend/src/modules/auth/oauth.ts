// "Continue with Google" and "Continue with GitHub" (ADR 0022): log in or sign up with an
// account the person already has. Standard OAuth 2.0 authorisation-code flow, done by hand with
// fetch (no extra library):
//
//   1. GET /api/auth/oauth/:provider/start?intent=login|signup&role=worker|business&lang=en|sw
//      Saves a random "state" in Redis (10 minutes) and in a short cookie, then sends the browser
//      to Google or GitHub. Google also gets a PKCE code challenge.
//   2. The provider sends the browser back to GET /api/auth/oauth/:provider/callback?code&state.
//      The state must match the cookie and Redis (stops another site from logging someone in).
//      The code is exchanged for the person's VERIFIED email address and name.
//   3. Known provider account -> log in. Unknown, but a KaziForce account has that verified email
//      -> link it and log in. Unknown and "signup" -> create the account with the role chosen on
//      the sign-up page. Unknown and "login" -> back to the sign-up page.
//   4. Logged in: the usual refresh cookie is set and the browser goes to /oauth/done, which gets
//      the login token with /api/auth/refresh. Errors go to /login?oauth_error=<code>.
//
// The provider checked the email and the person's own second step, so no 6-digit KaziForce code
// is asked here. A provider is offered only when its keys are set (GET /providers).
import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import type { RateLimiters } from '../../lib/rateLimits.js';
import { redis } from '../../lib/redis.js';
import { randomToken } from '../../lib/tokens.js';
import { DEFAULT_QUIET_HOURS, PRESETS } from '../me/presets.js';

export type OAuthProvider = 'google' | 'github';
const STATE_COOKIE = 'kf_oauth';
const STATE_TTL_SECONDS = 10 * 60;

interface ProviderConfig {
  clientId?: string;
  clientSecret?: string;
  authorizeUrl: string;
  scope: string;
  pkce: boolean;
}

const providers: Record<OAuthProvider, ProviderConfig> = {
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: 'openid email profile',
    pkce: true,
  },
  github: {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    scope: 'read:user user:email',
    pkce: false,
  },
};

/** Providers whose keys are set: the only buttons the pages show. */
export function enabledProviders(): OAuthProvider[] {
  return (Object.keys(providers) as OAuthProvider[]).filter(
    (p) => providers[p].clientId && providers[p].clientSecret,
  );
}

/** Where the provider sends the browser back. Behind Vercel this must be the website's address,
 * so the login cookie belongs to the website (OAUTH_CALLBACK_BASE, docs/DEPLOYMENT.md). */
export function callbackUrl(provider: OAuthProvider) {
  return `${env.OAUTH_CALLBACK_BASE ?? env.PUBLIC_API_URL}/api/auth/oauth/${provider}/callback`;
}

interface Pending {
  provider: OAuthProvider;
  intent: 'login' | 'signup';
  role?: 'worker' | 'business';
  language: 'en' | 'sw';
  /** Sign-up: the Terms of Service and Privacy Policy box was ticked before leaving for the provider. */
  terms?: boolean;
  verifier?: string;
}

/** What the app needs from the provider: a verified email, a name and a stable id. */
export interface ProviderProfile {
  id: string;
  email: string;
  name: string;
}

class OAuthFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const startSchema = z.object({
  intent: z.enum(['login', 'signup']).default('login'),
  role: z.enum(['worker', 'business']).optional(),
  lang: z.enum(['en', 'sw']).default('en'),
  terms: z.literal('1').optional(),
});

const base64url = (b: Buffer) => b.toString('base64url');

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const, // sent on the provider's redirect back (a top-level GET)
    path: '/api/auth/oauth',
    maxAge: maxAgeMs,
  };
}

async function postForm(url: string, form: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new OAuthFailure('provider_error');
  return (await res.json()) as Record<string, unknown>;
}

async function getJson(url: string, token: string) {
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'user-agent': 'KaziForce',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new OAuthFailure('provider_error');
  return (await res.json()) as unknown;
}

/** Exchanges the code for the person's verified email, name and id. */
export async function fetchProfile(
  provider: OAuthProvider,
  code: string,
  verifier?: string,
): Promise<ProviderProfile> {
  const cfg = providers[provider];
  if (provider === 'google') {
    const token = await postForm('https://oauth2.googleapis.com/token', {
      code,
      client_id: cfg.clientId!,
      client_secret: cfg.clientSecret!,
      redirect_uri: callbackUrl('google'),
      grant_type: 'authorization_code',
      code_verifier: verifier ?? '',
    });
    if (typeof token.access_token !== 'string') throw new OAuthFailure('provider_error');
    const info = z
      .object({
        sub: z.string(),
        email: z.string().optional(),
        email_verified: z.boolean().optional(),
        name: z.string().optional(),
      })
      .parse(await getJson('https://openidconnect.googleapis.com/v1/userinfo', token.access_token));
    if (!info.email || info.email_verified !== true) throw new OAuthFailure('email_not_verified');
    return { id: info.sub, email: info.email.toLowerCase(), name: info.name ?? info.email };
  }

  const token = await postForm('https://github.com/login/oauth/access_token', {
    code,
    client_id: cfg.clientId!,
    client_secret: cfg.clientSecret!,
    redirect_uri: callbackUrl('github'),
  });
  if (typeof token.access_token !== 'string') throw new OAuthFailure('provider_error');
  const user = z
    .object({ id: z.number(), login: z.string(), name: z.string().nullable().optional() })
    .parse(await getJson('https://api.github.com/user', token.access_token));
  const emails = z
    .array(z.object({ email: z.string(), primary: z.boolean(), verified: z.boolean() }))
    .parse(await getJson('https://api.github.com/user/emails', token.access_token));
  const best = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
  if (!best) throw new OAuthFailure('email_not_verified');
  return { id: String(user.id), email: best.email.toLowerCase(), name: user.name || user.login };
}

/** Finds or creates the KaziForce account for a provider profile (step 3 above). */
export async function accountFor(provider: OAuthProvider, profile: ProviderProfile, p: Pending) {
  const linked = await prisma.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider, providerUserId: profile.id } },
    include: { user: true },
  });
  if (linked) return linked.user;

  const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    // The provider verified this address, so it belongs to the same person: link it.
    await prisma.oAuthAccount.create({
      data: { userId: byEmail.id, provider, providerUserId: profile.id, email: profile.email },
    });
    return byEmail;
  }

  if (p.intent !== 'signup' || !p.role) throw new OAuthFailure('no_account');
  // A new account needs the Terms and Privacy box, as with a password sign-up.
  if (!p.terms) throw new OAuthFailure('terms_required');
  const name = profile.name.trim().slice(0, 80) || profile.email.split('@')[0]!;
  return prisma.user.create({
    data: {
      role: p.role,
      name: name.length >= 2 ? name : 'KaziForce user',
      email: profile.email,
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
      language: p.language,
      // No password yet: a random one nobody knows. "Forgot your password?" sets a real one.
      passwordHash: await bcrypt.hash(randomToken(), 12),
      preference: {
        create: {
          preset: 'recommended',
          channelSettings: PRESETS.recommended.channelSettings,
          dailySummary: PRESETS.recommended.dailySummary,
          quietHours: DEFAULT_QUIET_HOURS,
        },
      },
      oauthAccounts: { create: { provider, providerUserId: profile.id, email: profile.email } },
    },
  });
}

export function oauthRoutes(
  limits: RateLimiters,
  startSession: (res: Response, user: { id: string }, userAgent?: string) => Promise<unknown>,
) {
  const router = Router();
  const appUrl = (path: string) => `${env.PUBLIC_APP_URL}${path}`;

  router.get('/providers', (_req, res) => {
    res.json({ providers: enabledProviders() });
  });

  router.get('/:provider/start', limits.login, async (req: Request, res: Response) => {
    const provider = req.params.provider as OAuthProvider;
    if (!enabledProviders().includes(provider)) {
      res.redirect(appUrl('/login?oauth_error=provider_off'));
      return;
    }
    const input = startSchema.safeParse(req.query);
    if (!input.success) {
      res.redirect(appUrl('/login?oauth_error=bad_request'));
      return;
    }
    const state = randomToken();
    const pending: Pending = {
      provider,
      intent: input.data.intent,
      role: input.data.role,
      language: input.data.lang,
      terms: input.data.terms === '1',
    };
    const params = new URLSearchParams({
      client_id: providers[provider].clientId!,
      redirect_uri: callbackUrl(provider),
      response_type: 'code',
      scope: providers[provider].scope,
      state,
    });
    if (providers[provider].pkce) {
      pending.verifier = base64url(randomBytes(32));
      params.set(
        'code_challenge',
        base64url(createHash('sha256').update(pending.verifier).digest()),
      );
      params.set('code_challenge_method', 'S256');
      params.set('prompt', 'select_account');
    }
    await redis.set(`oauth:state:${state}`, JSON.stringify(pending), 'EX', STATE_TTL_SECONDS);
    res.cookie(STATE_COOKIE, state, cookieOptions(STATE_TTL_SECONDS * 1000));
    res.redirect(`${providers[provider].authorizeUrl}?${params.toString()}`);
  });

  router.get('/:provider/callback', limits.login, async (req: Request, res: Response) => {
    const provider = req.params.provider as OAuthProvider;
    const fail = (code: string, intent: 'login' | 'signup' = 'login') => {
      res.clearCookie(STATE_COOKIE, { path: '/api/auth/oauth' });
      res.redirect(appUrl(`/${intent === 'signup' ? 'register' : 'login'}?oauth_error=${code}`));
    };
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    // The person pressed "Cancel" at Google or GitHub.
    if (req.query.error) return fail('cancelled');
    if (!state || !code || req.cookies?.[STATE_COOKIE] !== state) return fail('expired');
    const saved = await redis.getdel(`oauth:state:${state}`);
    if (!saved) return fail('expired');
    const pending = JSON.parse(saved) as Pending;
    if (pending.provider !== provider) return fail('expired');

    try {
      const profile = await fetchProfile(provider, code, pending.verifier);
      const user = await accountFor(provider, profile, pending);
      if (user.status === 'suspended') return fail('account_suspended');
      await startSession(res, user, req.get('user-agent'));
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      res.clearCookie(STATE_COOKIE, { path: '/api/auth/oauth' });
      res.redirect(appUrl('/oauth/done'));
    } catch (err) {
      if (err instanceof OAuthFailure) {
        // "no_account" on log-in: send them to sign up, where they choose worker or employer.
        const toSignup = err.code === 'no_account' || err.code === 'terms_required';
        return fail(err.code, toSignup ? 'signup' : pending.intent);
      }
      logger.warn({ err, provider }, 'OAuth sign-in failed');
      return fail('provider_error', pending.intent);
    }
  });

  return router;
}
