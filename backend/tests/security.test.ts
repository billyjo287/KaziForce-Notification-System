// Phase 8 security pass (PRD NFR-2): headers, CORS, rate limits on create endpoints, input
// checks on webhooks, and production settings that refuse example secrets.
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { safeUrl } from '../src/app.js';
import { validateEnv } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { auth, login, testApp } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('HTTP headers and CORS', () => {
  it('sends the security headers and hides the framework', async () => {
    const res = await request(testApp()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('only the website may call the API from a browser', async () => {
    const ok = await request(testApp()).get('/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    // Another site gets the WEBSITE's address back, so its browser refuses to show the answer.
    const other = await request(testApp()).get('/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(other.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});

describe('rate limits on create endpoints (per user)', () => {
  it('stops message floods with a plain "Too many tries"', async () => {
    const app = testApp({ message: 2 });
    const application = await prisma.application.findFirstOrThrow({
      where: { worker: { email: 'worker1@example.com' } },
    });
    const { token } = await login(app, 'worker1@example.com');
    const send = () =>
      request(app)
        .post(`/api/conversations/${application.id}`)
        .set(auth(token))
        .send({ body: 'Hello, is the job still open?' });
    expect((await send()).status).toBe(201);
    expect((await send()).status).toBe(201);
    const third = await send();
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('rate_limited');
  });
});

describe('webhook input', () => {
  it("Africa's Talking: a repeated or odd field is refused, not a server error", async () => {
    const res = await request(testApp())
      .post('/webhooks/africastalking/test-africastalking-secret/delivery')
      .type('form')
      .send('id=ATXid_1&id=ATXid_2&status=Success');
    expect(res.status).toBe(400);
    const optOut = await request(testApp())
      .post('/webhooks/africastalking/test-africastalking-secret/optout')
      .type('form')
      .send({ phoneNumber: "'; DROP TABLE users; --" });
    expect(optOut.status).toBe(400);
  });
});

describe('production settings', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@db.example.com:5432/kf',
    REDIS_URL: 'redis://redis.example.com:6379',
    CHANNEL_MODE: 'mock',
  };

  it('refuse the example login secret from .env.example', () => {
    const result = validateEnv({
      ...base,
      JWT_ACCESS_SECRET: 'change-me-dev-access-secret-at-least-32-characters',
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('JWT_ACCESS_SECRET');
  });

  it('accept a real random secret', () => {
    const result = validateEnv({
      ...base,
      JWT_ACCESS_SECRET: 'Qm9vdHN0cmFwLXRlc3Qtc2VjcmV0LWZvci1rYXppZm9yY2UtMjAyNg',
    });
    expect(result.success).toBe(true);
  });
});

describe('logs', () => {
  it('never contain webhook secrets or tracked-link codes', () => {
    expect(safeUrl('/webhooks/africastalking/s3cr3t-value/delivery')).toBe(
      '/webhooks/africastalking/[hidden]/delivery',
    );
    expect(safeUrl('/o/Ab3dEf7h')).toBe('/o/[hidden]');
    expect(safeUrl('/api/auth/reset?token=abc&x=1')).toBe('/api/auth/reset?token=[hidden]&x=1');
    expect(safeUrl('/api/jobs?page=2')).toBe('/api/jobs?page=2');
  });
});
