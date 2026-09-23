import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const up = () => Promise.resolve();
const down = () => Promise.reject(new Error('connection refused'));

function appWith(checks: Parameters<typeof createApp>[0]['healthChecks']) {
  return createApp({ frontendOrigin: 'http://localhost:5173', healthChecks: checks });
}

describe('GET /health', () => {
  it('returns 200 and "ok" when the database and Redis are up', async () => {
    const res = await request(appWith({ database: up, redis: up })).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database.status).toBe('up');
    expect(res.body.checks.redis.status).toBe('up');
  });

  it('returns 503 and names the failing dependency when Redis is down', async () => {
    const res = await request(appWith({ database: up, redis: down })).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database.status).toBe('up');
    expect(res.body.checks.redis).toMatchObject({ status: 'down', error: 'connection refused' });
  });

  it('returns 503 when the database is down', async () => {
    const res = await request(appWith({ database: down, redis: up })).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.checks.database.status).toBe('down');
  });

  it('sets security headers (helmet)', async () => {
    const res = await request(appWith({ database: up, redis: up })).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('returns 404 JSON for unknown routes', async () => {
    const res = await request(appWith({})).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});
