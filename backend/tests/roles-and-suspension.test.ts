import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  PASSWORD,
  auth,
  login,
  testApp,
  uniqueEmail,
} from './helpers.js';

const app = testApp();
let workerToken: string;
let employerToken: string;
let adminToken: string;

beforeAll(async () => {
  workerToken = (await login(app, 'worker1@example.com')).token;
  employerToken = (await login(app, 'employer1@example.com')).token;
  adminToken = (await login(app, ADMIN_EMAIL, ADMIN_PASSWORD)).token;
});
afterAll(() => prisma.$disconnect());

describe('role checks', () => {
  it('workers cannot post jobs or open admin pages', async () => {
    const post = await request(app).post('/api/jobs').set(auth(workerToken)).send({});
    expect(post.status).toBe(403);
    expect((await request(app).get('/api/admin/users').set(auth(workerToken))).status).toBe(403);
    expect((await request(app).get('/api/employer/jobs').set(auth(workerToken))).status).toBe(403);
  });

  it('employers cannot apply for jobs or open admin pages', async () => {
    const job = await prisma.job.findFirstOrThrow({ where: { status: 'open' } });
    const apply = await request(app).post(`/api/jobs/${job.id}/apply`).set(auth(employerToken));
    expect(apply.status).toBe(403);
    expect((await request(app).get('/api/admin/users').set(auth(employerToken))).status).toBe(403);
  });

  it('admins can open admin pages', async () => {
    const res = await request(app).get('/api/admin/users').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it("an employer cannot see another employer's applicants", async () => {
    const other = await prisma.job.findFirstOrThrow({
      where: { employer: { email: 'employer2@example.com' } },
    });
    const res = await request(app).get(`/api/employer/jobs/${other.id}`).set(auth(employerToken));
    expect(res.status).toBe(404);
  });
});

describe('suspension', () => {
  it('a suspended user cannot log in and their open sessions stop working at once', async () => {
    const email = uniqueEmail('suspend');
    const created = await request(app)
      .post('/api/auth/register')
      .send({ role: 'worker', name: 'Soon Suspended', email, password: PASSWORD });
    const userId = created.body.user.id as string;
    const token = created.body.accessToken as string;

    const suspend = await request(app)
      .post(`/api/admin/users/${userId}/suspend`)
      .set(auth(adminToken))
      .send({ reason: 'Posted fake jobs asking for fees' });
    expect(suspend.status).toBe(200);

    const me = await request(app).get('/api/me').set(auth(token));
    expect(me.status).toBe(403);
    expect(me.body.error.code).toBe('account_suspended');

    const again = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe('account_suspended');
    expect(await prisma.session.count({ where: { userId, revokedAt: null } })).toBe(0);

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: userId, action: 'user.suspended' },
    });
    expect(audit?.reason).toBe('Posted fake jobs asking for fees');

    const reactivate = await request(app)
      .post(`/api/admin/users/${userId}/reactivate`)
      .set(auth(adminToken))
      .send({});
    expect(reactivate.status).toBe(200);
    await login(app, email);
  });

  it('a reason is required, and admins cannot be suspended', async () => {
    const worker = await prisma.user.findUniqueOrThrow({ where: { email: 'worker6@example.com' } });
    const noReason = await request(app)
      .post(`/api/admin/users/${worker.id}/suspend`)
      .set(auth(adminToken))
      .send({ reason: '' });
    expect(noReason.status).toBe(400);

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    const res = await request(app)
      .post(`/api/admin/users/${admin.id}/suspend`)
      .set(auth(adminToken))
      .send({ reason: 'Trying to suspend an admin' });
    expect(res.status).toBe(400);
  });

  it('removing a job needs a reason and is written to the audit log', async () => {
    const job = await prisma.job.findFirstOrThrow({
      where: { title: 'Loaders for a moving truck' },
    });
    const res = await request(app)
      .post(`/api/admin/jobs/${job.id}/remove`)
      .set(auth(adminToken))
      .send({ reason: 'Duplicate of another post' });
    expect(res.status).toBe(200);

    const log = await request(app).get('/api/admin/audit-log').set(auth(adminToken));
    expect(log.body.items[0]).toMatchObject({
      action: 'job.removed',
      targetName: 'Loaders for a moving truck',
      reason: 'Duplicate of another post',
    });
    // Workers can no longer see it.
    const seen = await request(app).get(`/api/jobs/${job.id}`).set(auth(workerToken));
    expect(seen.status).toBe(404);
  });
});
