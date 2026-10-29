// Log-in by email or phone, and the 6-digit codes (ACCOUNT_CODES, ADR 0013): after the password on
// a new device (by SMS or email, the person chooses), at sign-up (by email), and "Remember this
// phone or computer for 30 days".
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env, validateEnv } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';
import { maskEmail, maskPhone, parseIdentifier } from '../src/modules/auth/accountCodes.js';
import { sha256 } from '../src/lib/tokens.js';
import { PASSWORD, auth, testApp, uniqueEmail } from './helpers.js';

const app = testApp();
const WORKER1_PHONE = '+254700000004';

const login = (identifier: string, cookie?: string) => {
  const req = request(app).post('/api/auth/login');
  if (cookie) req.set('Cookie', cookie);
  return req.send({ identifier, password: PASSWORD });
};
const send = (challengeId: string, channel: 'sms' | 'email') =>
  request(app).post('/api/auth/login/send').send({ challengeId, channel });
const enter = (challengeId: string, code: string, rememberDevice = false) =>
  request(app).post('/api/auth/login/code').send({ challengeId, code, rememberDevice });
const wrongCode = (code: string) => (code === '000000' ? '111111' : '000000');
const cookieNamed = (res: request.Response, name: string) =>
  [res.headers['set-cookie']].flat().find((c) => c?.startsWith(`${name}=`));

afterAll(async () => {
  env.ACCOUNT_CODES = false;
  env.OTP_DEMO_MODE = false;
  await prisma.$disconnect();
});

describe('email or phone number', () => {
  it('reads the ways people type a Kenyan number', () => {
    for (const typed of ['0712 345 678', '712345678', '+254 712-345-678', '254712345678']) {
      expect(parseIdentifier(typed)).toEqual({ kind: 'phone', phone: '+254712345678' });
    }
    expect(parseIdentifier(' Wanjiru@Gmail.com ')).toEqual({
      kind: 'email',
      email: 'wanjiru@gmail.com',
    });
    expect(parseIdentifier('0812345678')).toBeNull();
    expect(parseIdentifier('wanjiru@')).toBeNull();
  });

  it('masks addresses so only the owner recognises them', () => {
    expect(maskEmail('wanjiru@gmail.com')).toBe('wa•••@gmail.com');
    expect(maskEmail('bo@x.co')).toBe('b•••@x.co');
    expect(maskPhone('+254712345678')).toBe('07•• ••• 678');
  });

  it('says whether an account exists (a verified phone counts, an unknown one does not)', async () => {
    const check = (identifier: string) => request(app).post('/api/auth/check').send({ identifier });
    expect((await check('worker1@example.com').expect(200)).body).toEqual({
      exists: true,
      kind: 'email',
    });
    expect((await check('0700 000 004').expect(200)).body).toEqual({ exists: true, kind: 'phone' });
    expect((await check('0799 999 999').expect(200)).body.exists).toBe(false);
    expect((await check('nobody@example.com').expect(200)).body.exists).toBe(false);
    const bad = await check('hello').expect(400);
    expect(bad.body.error.code).toBe('identifier_invalid');
  });

  it('logs in with the phone number instead of the email (codes off)', async () => {
    const res = await login('0700000004').expect(200);
    expect(res.body.user.email).toBe('worker1@example.com');
  });

  it('a wrong password is "not right" whichever way the account is named', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: WORKER1_PHONE, password: 'wrong-password' })
      .expect(401);
    expect(res.body.error.code).toBe('wrong_credentials');
  });
});

describe('codes on', () => {
  beforeEach(() => {
    env.ACCOUNT_CODES = true;
  });
  afterEach(() => {
    env.ACCOUNT_CODES = false;
    env.OTP_DEMO_MODE = false;
  });

  it('after the password: a choice of SMS or email, masked, and no session yet', async () => {
    const res = await login('worker1@example.com').expect(200);
    expect(res.body).toMatchObject({
      codeRequired: true,
      firstName: 'Wanjiru',
      options: [
        { channel: 'sms', to: '07•• ••• 004' },
        { channel: 'email', to: 'wo•••@example.com' },
      ],
    });
    expect(res.body.accessToken).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('a person without a verified phone is offered email only', async () => {
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail('nophone'),
        name: 'Amina Noor',
        role: 'worker',
        passwordHash: (
          await prisma.user.findUniqueOrThrow({ where: { email: 'worker1@example.com' } })
        ).passwordHash,
      },
    });
    const res = await login(user.email).expect(200);
    expect(res.body.options).toEqual([{ channel: 'email', to: 'no•••@example.com' }]);
    const sms = await send(res.body.challengeId, 'sms').expect(400);
    expect(sms.body.error.code).toBe('code_channel_unavailable');
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('SMS: the right code logs in once; a wrong one says so', async () => {
    const first = await login(WORKER1_PHONE).expect(200);
    const sent = await send(first.body.challengeId, 'sms').expect(200);
    expect(sent.body).toMatchObject({
      channel: 'sms',
      to: '07•• ••• 004',
      expiresInSeconds: 300,
      resendInSeconds: 30,
    });
    expect(sent.body.mockCode).toMatch(/^\d{6}$/);
    expect(sent.body.demoCode).toBeUndefined(); // only in OTP_DEMO_MODE

    const bad = await enter(first.body.challengeId, wrongCode(sent.body.mockCode)).expect(400);
    expect(bad.body.error.code).toBe('login_code_wrong');

    const ok = await enter(first.body.challengeId, sent.body.mockCode).expect(200);
    expect(ok.body.user.email).toBe('worker1@example.com');
    expect(cookieNamed(ok, 'kf_refresh')).toBeTruthy();
    expect(cookieNamed(ok, 'kf_device')).toBeUndefined(); // not remembered
    await request(app).get('/api/me').set(auth(ok.body.accessToken)).expect(200);

    const again = await enter(first.body.challengeId, sent.body.mockCode).expect(400);
    expect(again.body.error.code).toBe('login_code_expired');
  });

  it('"Send again" waits 30 seconds', async () => {
    const first = await login('worker2@example.com').expect(200);
    await send(first.body.challengeId, 'email').expect(200);
    const soon = await send(first.body.challengeId, 'sms').expect(400);
    expect(soon.body.error.code).toBe('code_too_soon');
  });

  it('five wrong codes end the attempt', async () => {
    const first = await login('worker2@example.com').expect(200);
    const sent = await send(first.body.challengeId, 'email').expect(200);
    const wrong = wrongCode(sent.body.mockCode);
    for (let i = 0; i < 4; i++) await enter(first.body.challengeId, wrong).expect(400);
    const fifth = await enter(first.body.challengeId, wrong).expect(400);
    expect(fifth.body.error.code).toBe('login_code_expired');
    await enter(first.body.challengeId, sent.body.mockCode).expect(400);
  });

  it('the code is kept only as a hash, for 5 minutes', async () => {
    const first = await login('worker2@example.com').expect(200);
    const sent = await send(first.body.challengeId, 'email').expect(200);
    const key = `kf:account-code:${sha256(first.body.challengeId)}`;
    expect(await redis.exists(`kf:account-code:${first.body.challengeId}`)).toBe(0);
    expect(await redis.get(key)).not.toContain(sent.body.mockCode);
    expect(await redis.ttl(key)).toBeGreaterThan(290);
    expect(await redis.ttl(key)).toBeLessThanOrEqual(300);
  });

  it('demo mode also returns the code for the screen', async () => {
    env.OTP_DEMO_MODE = true;
    const first = await login('worker2@example.com').expect(200);
    const sent = await send(first.body.challengeId, 'email').expect(200);
    expect(sent.body.demoCode).toBe(sent.body.mockCode);
  });

  it('"Remember this phone or computer": no code next time, until "log out of all devices"', async () => {
    const first = await login('worker3@example.com').expect(200);
    const sent = await send(first.body.challengeId, 'email').expect(200);
    const ok = await enter(first.body.challengeId, sent.body.mockCode, true).expect(200);
    const device = cookieNamed(ok, 'kf_device');
    expect(device).toMatch(/HttpOnly/i);
    const deviceCookie = device!.split(';')[0]!;

    const next = await login('worker3@example.com', deviceCookie).expect(200);
    expect(next.body.accessToken).toBeTruthy();
    // The remembered device belongs to this person only.
    expect((await login('worker2@example.com', deviceCookie).expect(200)).body.codeRequired).toBe(
      true,
    );

    await request(app).post('/api/auth/logout-all').set(auth(next.body.accessToken)).expect(204);
    expect((await login('worker3@example.com', deviceCookie).expect(200)).body.codeRequired).toBe(
      true,
    );
  });

  it('sign-up: the account is created only after the emailed code', async () => {
    const email = uniqueEmail('signup');
    const start = await request(app)
      .post('/api/auth/register')
      .send({ role: 'worker', name: 'Grace Achieng', email, password: PASSWORD })
      .expect(200);
    expect(start.body).toMatchObject({
      codeRequired: true,
      sent: { channel: 'email', to: 'si•••@example.com' },
    });
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();

    const code = start.body.sent.mockCode as string;
    const enterSignup = (c: string) =>
      request(app)
        .post('/api/auth/register/code')
        .send({ challengeId: start.body.challengeId, code: c, rememberDevice: true });
    expect((await enterSignup(wrongCode(code)).expect(400)).body.error.code).toBe(
      'login_code_wrong',
    );
    const done = await enterSignup(code).expect(201);
    expect(done.body.user).toMatchObject({ email, role: 'worker' });
    expect(cookieNamed(done, 'kf_device')).toBeTruthy();
    expect(await prisma.user.findUnique({ where: { email } })).not.toBeNull();
    await enterSignup(code).expect(400);
  });

  it('sign-up: an email that is already used never gets a code', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ role: 'worker', name: 'Someone', email: 'worker1@example.com', password: PASSWORD })
      .expect(409);
    expect(res.body.error.code).toBe('email_taken');
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

  it('asks for codes by default', () => {
    const result = validateEnv({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'Qm9vdHN0cmFwLXRlc3Qtc2VjcmV0LWZvci1rYXppZm9yY2UtMjAyNg',
    });
    expect(result.success && result.data.ACCOUNT_CODES).toBe(true);
  });
});
