// Presentation demo mode (OTP_DEMO_MODE): log-in asks for a 6-digit code after the password, and
// the code is returned so the page can show it. Off by default, and refused in production.
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env, validateEnv } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';
import { PASSWORD, auth, testApp } from './helpers.js';

const app = testApp();
const login = () =>
  request(app).post('/api/auth/login').send({ email: 'worker3@example.com', password: PASSWORD });
const sendCode = (challengeId: string, code: string) =>
  request(app).post('/api/auth/login/code').send({ challengeId, code });

afterAll(async () => {
  env.OTP_DEMO_MODE = false;
  await prisma.$disconnect();
});

describe('demo mode off (the default)', () => {
  it('logs in with the password alone, as before', async () => {
    const res = await login().expect(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.codeRequired).toBeUndefined();
  });
});

describe('demo mode on', () => {
  beforeEach(() => {
    env.OTP_DEMO_MODE = true;
  });
  afterEach(() => {
    env.OTP_DEMO_MODE = false;
  });

  it('asks for a code after a right password; the right code logs in once', async () => {
    const first = await login().expect(200);
    expect(first.body).toMatchObject({ codeRequired: true, expiresInSeconds: 300 });
    expect(first.body.demoCode).toMatch(/^\d{6}$/);
    // No session yet: no login token and no refresh cookie.
    expect(first.body.accessToken).toBeUndefined();
    expect(first.headers['set-cookie']).toBeUndefined();

    const wrong = first.body.demoCode === '000000' ? '111111' : '000000';
    const bad = await sendCode(first.body.challengeId, wrong).expect(400);
    expect(bad.body.error.code).toBe('login_code_wrong');

    const ok = await sendCode(first.body.challengeId, first.body.demoCode).expect(200);
    expect(ok.body.user.email).toBe('worker3@example.com');
    await request(app).get('/api/me').set(auth(ok.body.accessToken)).expect(200);
    // A code works only once.
    const again = await sendCode(first.body.challengeId, first.body.demoCode).expect(400);
    expect(again.body.error.code).toBe('login_code_expired');
  });

  it('a wrong password never gets a code', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'worker3@example.com', password: 'wrong-password' })
      .expect(401);
    expect(res.body.demoCode).toBeUndefined();
  });

  it('five wrong codes end the attempt', async () => {
    const first = await login().expect(200);
    const wrong = first.body.demoCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) await sendCode(first.body.challengeId, wrong).expect(400);
    const fifth = await sendCode(first.body.challengeId, wrong).expect(400);
    expect(fifth.body.error.code).toBe('login_code_expired');
    // Even the right code no longer works.
    await sendCode(first.body.challengeId, first.body.demoCode).expect(400);
  });

  it('the code is stored only as a hash, for 5 minutes', async () => {
    const first = await login().expect(200);
    const keys = await redis.keys('kf:login-code:*');
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).not.toContain(first.body.challengeId);
      expect(await redis.get(key)).not.toContain(first.body.demoCode);
      expect(await redis.ttl(key)).toBeLessThanOrEqual(300);
    }
  });
});

describe('production', () => {
  it('refuses to start with demo codes switched on', () => {
    const result = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'Qm9vdHN0cmFwLXRlc3Qtc2VjcmV0LWZvci1rYXppZm9yY2UtMjAyNg',
      OTP_DEMO_MODE: 'true',
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('OTP_DEMO_MODE');
  });
});
