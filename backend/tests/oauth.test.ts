// "Continue with Google / GitHub" (src/modules/auth/oauth.ts, ADR 0022). The providers are
// stood in for by a fake fetch, so the tests never leave this computer.
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-google-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
  process.env.GITHUB_CLIENT_ID = 'test-github-id';
  process.env.GITHUB_CLIENT_SECRET = 'test-github-secret';
});

import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';
import { testApp, uniqueEmail } from './helpers.js';

const app = testApp();
afterAll(() => prisma.$disconnect());

let profile: { sub: string; email: string; email_verified: boolean; name: string };
const realFetch = globalThis.fetch;

beforeEach(() => {
  profile = {
    sub: `g-${Date.now()}-${Math.random()}`,
    email: uniqueEmail('oauth'),
    email_verified: true,
    name: 'Achieng Otieno',
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'google-access' });
    }
    if (url.startsWith('https://openidconnect.googleapis.com/v1/userinfo')) {
      return Response.json(profile);
    }
    if (url.startsWith('https://github.com/login/oauth/access_token')) {
      return Response.json({ access_token: 'github-access' });
    }
    if (url === 'https://api.github.com/user') {
      return Response.json({ id: 4242, login: 'kamau-dev', name: null });
    }
    if (url === 'https://api.github.com/user/emails') {
      return Response.json([
        { email: 'old@example.com', primary: false, verified: false },
        { email: profile.email, primary: true, verified: true },
      ]);
    }
    return realFetch(input);
  });
});
afterEach(() => vi.restoreAllMocks());

/** Step 1: the start link. Returns the state and the cookie the browser would keep. */
async function start(provider: string, query: string) {
  const res = await request(app).get(`/api/auth/oauth/${provider}/start?${query}`);
  expect(res.status).toBe(302);
  const location = new URL(res.headers.location!);
  const cookie = [res.headers['set-cookie']].flat().find((c) => c?.startsWith('kf_oauth='))!;
  return { location, state: location.searchParams.get('state')!, cookie: cookie.split(';')[0]! };
}

async function callback(provider: string, state: string, cookie: string) {
  return request(app)
    .get(`/api/auth/oauth/${provider}/callback?code=abc&state=${state}`)
    .set('Cookie', cookie);
}

describe('OAuth sign-in', () => {
  it('lists the providers whose keys are set', async () => {
    const res = await request(app).get('/api/auth/oauth/providers');
    expect(res.body.providers).toEqual(['google', 'github']);
  });

  it('sends the browser to Google with a state and a PKCE challenge', async () => {
    const { location, state } = await start('google', 'intent=signup&role=worker');
    expect(location.origin + location.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(location.searchParams.get('client_id')).toBe('test-google-id');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('redirect_uri')).toMatch(
      /\/api\/auth\/oauth\/google\/callback$/,
    );
    expect(await redis.exists(`oauth:state:${state}`)).toBe(1);
  });

  it('creates a worker account on sign-up with Google and logs it in', async () => {
    const { state, cookie } = await start('google', 'intent=signup&role=worker&lang=sw');
    const res = await callback('google', state, cookie);

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/oauth\/done$/);
    expect([res.headers['set-cookie']].flat().join(';')).toContain('kf_refresh=');
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: profile.email },
      include: { oauthAccounts: true, preference: true },
    });
    expect(user).toMatchObject({ role: 'worker', language: 'sw', name: 'Achieng Otieno' });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.preference).not.toBeNull();
    expect(user.oauthAccounts).toEqual([
      expect.objectContaining({ provider: 'google', providerUserId: profile.sub }),
    ]);
  });

  it('logs in an existing account with the same verified email and links GitHub', async () => {
    const existing = await prisma.user.findFirstOrThrow({
      where: { email: 'worker2@example.com' },
    });
    profile.email = existing.email;
    const { state, cookie } = await start('github', 'intent=login');
    const res = await callback('github', state, cookie);

    expect(res.headers.location).toMatch(/\/oauth\/done$/);
    const link = await prisma.oAuthAccount.findUniqueOrThrow({
      where: { provider_providerUserId: { provider: 'github', providerUserId: '4242' } },
    });
    expect(link.userId).toBe(existing.id);
    await prisma.oAuthAccount.delete({ where: { id: link.id } });
  });

  it('sends a log-in without an account to the sign-up page', async () => {
    const { state, cookie } = await start('google', 'intent=login');
    const res = await callback('google', state, cookie);
    expect(res.headers.location).toMatch(/\/register\?oauth_error=no_account$/);
    expect(await prisma.user.findUnique({ where: { email: profile.email } })).toBeNull();
  });

  it('refuses an email the provider has not verified', async () => {
    profile.email_verified = false;
    const { state, cookie } = await start('google', 'intent=signup&role=business');
    const res = await callback('google', state, cookie);
    expect(res.headers.location).toMatch(/oauth_error=email_not_verified$/);
  });

  it('refuses a state that does not match the browser cookie, and a reused state', async () => {
    const { state, cookie } = await start('google', 'intent=signup&role=worker');
    const forged = await callback('google', state, 'kf_oauth=someone-else');
    expect(forged.headers.location).toMatch(/oauth_error=expired$/);

    const first = await callback('google', state, cookie);
    expect(first.headers.location).toMatch(/\/oauth\/done$/);
    const again = await callback('google', state, cookie);
    expect(again.headers.location).toMatch(/oauth_error=expired$/);
  });

  it('does not log in a suspended account', async () => {
    const user = await prisma.user.create({
      data: {
        email: profile.email,
        name: 'Suspended Person',
        role: 'worker',
        passwordHash: 'x',
        status: 'suspended',
        suspendedAt: new Date(),
      },
    });
    const { state, cookie } = await start('google', 'intent=login');
    const res = await callback('google', state, cookie);
    expect(res.headers.location).toMatch(/oauth_error=account_suspended$/);
    expect([res.headers['set-cookie']].flat().join(';')).not.toContain('kf_refresh=');
    await prisma.user.delete({ where: { id: user.id } });
  });
});
