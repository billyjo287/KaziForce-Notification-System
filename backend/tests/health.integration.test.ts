// Talks to the real Postgres and Redis from Docker Compose (or the CI service containers).
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';

describe('GET /health with real services', () => {
  afterAll(async () => {
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  });

  it('reports the database and Redis as up', async () => {
    const app = createApp({
      frontendOrigin: 'http://localhost:5173',
      healthChecks: {
        database: () => prisma.$queryRaw`SELECT 1`,
        redis: () => redis.ping(),
      },
    });

    const res = await request(app).get('/health');

    expect(res.body.checks).toMatchObject({
      database: { status: 'up' },
      redis: { status: 'up' },
    });
    expect(res.status).toBe(200);
  });
});
