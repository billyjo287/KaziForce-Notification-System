import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { PASSWORD, auth, login, testApp, uniqueEmail } from './helpers.js';

const app = testApp();
let employer: string;
let worker: string;
let locationId: string;
let skillId: string;

beforeAll(async () => {
  employer = (await login(app, 'employer1@example.com')).token;
  worker = (await login(app, 'worker2@example.com')).token;
  locationId = (await prisma.location.findUniqueOrThrow({ where: { slug: 'westlands' } })).id;
  skillId = (await prisma.skill.findUniqueOrThrow({ where: { slug: 'delivery' } })).id;
});
afterAll(() => prisma.$disconnect());

const inTwoDays = () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

describe('employer posts a job, worker applies, employer accepts', () => {
  let jobId: string;
  let applicationId: string;

  it('posts a job and records a job.posted event', async () => {
    const res = await request(app).post('/api/jobs').set(auth(employer)).send({
      title: 'Parcel sorters for tonight',
      description: 'Sort parcels at our Westlands depot from 6pm to 10pm.',
      locationId,
      skillId,
      pay: 'KSh 1,000',
      deadline: inTwoDays(),
      urgent: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.job).toMatchObject({ title: 'Parcel sorters for tonight', urgent: true });
    jobId = res.body.job.id;

    const event = await prisma.domainEvent.findFirst({
      where: { type: 'job.posted' },
      orderBy: { createdAt: 'desc' },
    });
    expect(event?.payload).toMatchObject({ jobId, urgent: true });
  });

  it('refuses a closing time in the past', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set(auth(employer))
      .send({
        title: 'Too late job',
        description: 'This deadline has already passed.',
        locationId,
        skillId,
        deadline: new Date(Date.now() - 60_000).toISOString(),
      });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.deadline).toBeTruthy();
  });

  it('workers find it with the location + skill filters and apply once', async () => {
    const list = await request(app)
      .get('/api/jobs')
      .query({ locationId, skillId })
      .set(auth(worker));
    expect(list.body.items.map((j: { id: string }) => j.id)).toContain(jobId);

    const apply = await request(app)
      .post(`/api/jobs/${jobId}/apply`)
      .set(auth(worker))
      .send({ note: 'I live nearby.' });
    expect(apply.status).toBe(201);
    applicationId = apply.body.application.id;

    const twice = await request(app).post(`/api/jobs/${jobId}/apply`).set(auth(worker)).send({});
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('already_applied');

    const events = await prisma.domainEvent.count({
      where: {
        type: 'application.created',
        payload: { path: ['applicationId'], equals: applicationId },
      },
    });
    expect(events).toBe(1);
  });

  it('opening the applicants marks new applications as reviewed', async () => {
    const res = await request(app).get(`/api/employer/jobs/${jobId}`).set(auth(employer));
    expect(res.status).toBe(200);
    expect(res.body.applicants).toHaveLength(1);
    expect(res.body.applicants[0]).toMatchObject({ status: 'reviewed', note: 'I live nearby.' });
  });

  it('Accept can be undone while its event is held; the event is then cancelled', async () => {
    const accept = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set(auth(employer))
      .send({ status: 'accepted' });
    expect(accept.status).toBe(200);
    expect(accept.body.application.status).toBe('accepted');
    const { undoId } = accept.body;

    const event = await prisma.domainEvent.findUniqueOrThrow({ where: { id: undoId } });
    expect(event.availableAt.getTime()).toBeGreaterThan(Date.now()); // held for Undo

    const undo = await request(app)
      .post(`/api/applications/${applicationId}/undo`)
      .set(auth(employer))
      .send({ undoId });
    expect(undo.status).toBe(200);
    expect(undo.body.application.status).toBe('reviewed');
    expect(
      (await prisma.domainEvent.findUniqueOrThrow({ where: { id: undoId } })).cancelledAt,
    ).not.toBeNull();
  });

  it('Undo is refused once the window has passed', async () => {
    const accept = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set(auth(employer))
      .send({ status: 'accepted' });
    await prisma.domainEvent.update({
      where: { id: accept.body.undoId },
      data: { availableAt: new Date(Date.now() - 1000) },
    });
    const undo = await request(app)
      .post(`/api/applications/${applicationId}/undo`)
      .set(auth(employer))
      .send({ undoId: accept.body.undoId });
    expect(undo.status).toBe(409);
    expect(undo.body.error.code).toBe('undo_too_late');

    const mine = await request(app).get('/api/applications/mine').set(auth(worker));
    expect(mine.body.items.find((a: { id: string }) => a.id === applicationId).status).toBe(
      'accepted',
    );
  });

  it('worker and employer can message each other about the application', async () => {
    const sent = await request(app)
      .post(`/api/conversations/${applicationId}`)
      .set(auth(worker))
      .send({ body: 'Thank you! What time should I arrive?' });
    expect(sent.status).toBe(201);

    const list = await request(app).get('/api/conversations').set(auth(employer));
    const conversation = list.body.items.find(
      (c: { applicationId: string }) => c.applicationId === applicationId,
    );
    expect(conversation).toMatchObject({ unreadCount: 1, with: { name: 'Brian Kiprono' } });

    const open = await request(app).get(`/api/conversations/${applicationId}`).set(auth(employer));
    expect(open.body.messages.at(-1)).toMatchObject({
      body: 'Thank you! What time should I arrive?',
      mine: false,
    });
    const after = await request(app).get('/api/conversations').set(auth(employer));
    expect(
      after.body.items.find((c: { applicationId: string }) => c.applicationId === applicationId)
        .unreadCount,
    ).toBe(0);

    const stranger = (await login(app, 'worker5@example.com')).token;
    expect(
      (await request(app).get(`/api/conversations/${applicationId}`).set(auth(stranger))).status,
    ).toBe(404);
  });
});

describe('onboarding', () => {
  it('phone code, the two questions, and a preset', async () => {
    const created = await request(app)
      .post('/api/auth/register')
      .send({
        role: 'worker',
        name: 'New Person',
        email: uniqueEmail('onboard'),
        password: PASSWORD,
      });
    const token = created.body.accessToken as string;

    const badPhone = await request(app)
      .post('/api/me/phone')
      .set(auth(token))
      .send({ phone: '0712345678', consent: true });
    expect(badPhone.status).toBe(400);
    const noConsent = await request(app)
      .post('/api/me/phone')
      .set(auth(token))
      .send({ phone: '+254712345099', consent: false });
    expect(noConsent.status).toBe(400);

    const sent = await request(app)
      .post('/api/me/phone')
      .set(auth(token))
      .send({ phone: '+254712345099', consent: true });
    expect(sent.status).toBe(200);
    expect(sent.body.mockCode).toMatch(/^\d{6}$/);

    const wrongCode = sent.body.mockCode === '000000' ? '111111' : '000000';
    const wrong = await request(app)
      .post('/api/me/phone/verify')
      .set(auth(token))
      .send({ code: wrongCode });
    expect(wrong.body.error.code).toBe('code_wrong');

    const verified = await request(app)
      .post('/api/me/phone/verify')
      .set(auth(token))
      .send({ code: sent.body.mockCode });
    expect(verified.body.user).toMatchObject({ phone: '+254712345099', phoneVerified: true });

    // No WhatsApp, but "checks WhatsApp most": WhatsApp is never used; SMS goes first.
    const channels = await request(app)
      .patch('/api/me/channels')
      .set(auth(token))
      .send({ usesWhatsApp: false, checksMost: 'whatsapp' });
    expect(channels.body.user.preference.channelOrder).toEqual(['sms', 'email']);

    const preset = await request(app)
      .patch('/api/me/preset')
      .set(auth(token))
      .send({ preset: 'urgent_only' });
    expect(preset.body.user).toMatchObject({
      onboardingCompleted: true,
      preference: { preset: 'urgent_only' },
    });
  });

  it('workers can choose at most 5 skills', async () => {
    const skills = await prisma.skill.findMany({ take: 6 });
    const res = await request(app)
      .patch('/api/me/profile')
      .set(auth(worker))
      .send({ skillIds: skills.map((s) => s.id) });
    expect(res.status).toBe(400);
  });
});

describe('alerts', () => {
  it('lists my alerts (never spam) and marks them read and "not important"', async () => {
    const token = (await login(app, 'worker1@example.com')).token;
    const list = await request(app).get('/api/notifications').set(auth(token));
    expect(list.status).toBe(200);
    const priorities = list.body.items.map((n: { priority: string }) => n.priority).sort();
    expect(priorities).toEqual(['low', 'medium', 'urgent']);

    const ids = list.body.items.map((n: { id: string }) => n.id);
    const read = await request(app)
      .patch('/api/notifications')
      .set(auth(token))
      .send({ ids, read: true });
    expect(read.body.items.every((n: { readAt: string | null }) => n.readAt)).toBe(true);

    const dismiss = await request(app)
      .patch('/api/notifications')
      .set(auth(token))
      .send({ ids: [ids[0]], notImportant: true });
    expect(dismiss.body.items[0].markedNotImportant).toBe(true);
  });
});
