import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { sha256 } from '../src/lib/tokens.js';
import { PASSWORD, auth, login, testApp, uniqueEmail } from './helpers.js';

const app = testApp();
const APP_HEADER = { 'X-Requested-With': 'KaziForce' };

afterAll(() => prisma.$disconnect());

async function register(role = 'worker', email = uniqueEmail()) {
  return request(app)
    .post('/api/auth/register')
    .send({ role, name: 'Test Person', email, password: PASSWORD });
}

describe('register', () => {
  it('creates an account, logs in, and sets an httpOnly refresh cookie', async () => {
    const res = await register('worker');

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ role: 'worker', onboardingCompleted: false });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = [res.headers['set-cookie']].flat().join(';');
    expect(cookie).toContain('kf_refresh=');
    expect(cookie).toContain('HttpOnly');
  });

  it('never creates admins by sign-up', async () => {
    const res = await register('admin');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_input');
  });

  it('refuses a second account with the same email', async () => {
    const email = uniqueEmail();
    await register('business', email);
    const res = await register('worker', email);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('email_taken');
  });

  it('refuses short passwords', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ role: 'worker', name: 'Test', email: uniqueEmail(), password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.password).toBeTruthy();
  });
});

describe('log in', () => {
  it('works with the right password (email is not case-sensitive)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'Worker1@Example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('worker1@example.com');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'worker1@example.com', password: 'not-the-password' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'not-the-password' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('wrong_credentials');
    expect(unknown.body.error.code).toBe('wrong_credentials');
  });

  it('is rate-limited after too many tries', async () => {
    const limited = testApp({ login: 2 });
    const attempt = () =>
      request(limited)
        .post('/api/auth/login')
        .send({ email: 'x@example.com', password: 'nope1234' });
    await attempt();
    await attempt();
    const third = await attempt();
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('rate_limited');
  });

  it('protected routes need a login token', async () => {
    expect((await request(app).get('/api/me')).status).toBe(401);
    expect((await request(app).get('/api/me').set(auth('not-a-token'))).status).toBe(401);
  });
});

describe('staying logged in (refresh)', () => {
  it('swaps the refresh cookie for a new one and a new login token', async () => {
    const { cookie } = await login(app, 'worker2@example.com');
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie).set(APP_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    const next = [res.headers['set-cookie']].flat().find((c) => c?.startsWith('kf_refresh='));
    expect(next).toBeTruthy();
    expect(next?.split(';')[0]).not.toBe(cookie.split(';')[0]);
  });

  it('needs the app header (protects against other websites using the cookie)', async () => {
    const { cookie } = await login(app, 'worker2@example.com');
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('a stolen, already-used refresh token ends every session of that user', async () => {
    const { cookie, user } = await login(app, 'worker3@example.com');
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).set(APP_HEADER);
    // Pretend the rotation happened over a minute ago (past the two-tabs grace period).
    const token = decodeURIComponent(cookie.split(';')[0]!.split('=')[1]!);
    await prisma.session.update({
      where: { tokenHash: sha256(token) },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    const reuse = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .set(APP_HEADER);
    expect(reuse.status).toBe(401);
    const active = await prisma.session.count({ where: { userId: user.id, revokedAt: null } });
    expect(active).toBe(0);
  });

  it('"Log out of all devices" ends every session', async () => {
    const first = await login(app, 'worker4@example.com');
    const second = await login(app, 'worker4@example.com');
    const res = await request(app).post('/api/auth/logout-all').set(auth(first.token));
    expect(res.status).toBe(204);

    const refresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', second.cookie)
      .set(APP_HEADER);
    expect(refresh.status).toBe(401);
  });
});

describe('forgot password', () => {
  it('answers the same whether or not the email exists', async () => {
    const known = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'worker5@example.com' });
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });
    expect(known.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
  });

  it('a reset link works once, sets the new password and logs out every device', async () => {
    const email = uniqueEmail('reset');
    const created = await register('worker', email);
    const userId = created.body.user.id as string;
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: sha256('a-known-reset-token-for-this-test-123'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'a-known-reset-token-for-this-test-123', password: 'NewPassword456!' });
    expect(reset.status).toBe(200);
    expect(await prisma.session.count({ where: { userId, revokedAt: null } })).toBe(0);
    await login(app, email, 'NewPassword456!');

    const again = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'a-known-reset-token-for-this-test-123', password: 'Another789!' });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('reset_link_invalid');
  });
});
