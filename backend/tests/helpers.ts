import request from 'supertest';
import { createApp } from '../src/app.js';
import type { RateLimitSettings } from '../src/lib/rateLimits.js';

export const PASSWORD = 'Password123!';
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? PASSWORD;

/** A fresh app with generous rate limits unless a test asks for specific ones. */
export function testApp(rateLimits: Partial<RateLimitSettings> = {}) {
  return createApp({
    frontendOrigin: 'http://localhost:5173',
    healthChecks: {},
    rateLimits: { login: 1000, passwordReset: 1000, phoneCode: 1000, ...rateLimits },
  });
}

type App = ReturnType<typeof testApp>;

/** Logs in and returns the access token plus the refresh cookie. */
export async function login(app: App, email: string, password = PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${res.text}`);
  const cookie = [res.headers['set-cookie']].flat().find((c) => c?.startsWith('kf_refresh='));
  return { token: res.body.accessToken as string, cookie: cookie ?? '', user: res.body.user };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let counter = 0;
/** A unique email for accounts created during tests. */
export const uniqueEmail = (prefix = 'test') => `${prefix}.${Date.now()}.${counter++}@example.com`;
