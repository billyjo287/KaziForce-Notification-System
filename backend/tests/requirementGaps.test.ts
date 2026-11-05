// ADR 0016: the partly-met SRS requirements, through the API and the real delivery engine
// (BullMQ queues + the test database): search (FR-NOT-027), summary frequency (037), alert
// types on/off and per channel (031, 032), "Always send" rules (035) and the editable
// SMS/email wording (003, 011). "Mark as unread" (025) is the existing PATCH with read: false.
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OutgoingMessage } from '../src/channels/ChannelAdapter.js';
import { EmailAdapter } from '../src/channels/EmailAdapter.js';
import { startDelivery, type Delivery } from '../src/channels/delivery.js';
import { createWording, wordingProblem } from '../src/channels/wording.js';
import type { Priority } from '../src/generated/prisma/client.js';
import { prisma } from '../src/lib/prisma.js';
import { queueConnection } from '../src/lib/queue.js';
import { redis } from '../src/lib/redis.js';
import { PRESETS } from '../src/modules/me/presets.js';
import { startNotificationWorker } from '../src/pipeline/notificationWorker.js';
import { UserPreferenceManager } from '../src/preferences/UserPreferenceManager.js';
import {
  createMandatoryCategories,
  effectiveCategorySetting,
  normalizeCategorySettings,
} from '../src/preferences/categories.js';
import { frequenciesDue, periodStart, summaryRecipients } from '../src/scheduled/dailySummary.js';
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
const silent = pino({ level: 'silent' });
const preferences = new UserPreferenceManager(prisma, redis, 'kf-test');
const DAY = 24 * 60 * 60 * 1000;

class TestEmail extends EmailAdapter {
  sent: OutgoingMessage[] = [];
  protected override async sendMock(message: OutgoingMessage) {
    this.sent.push(message);
    return { providerMessageId: `test-email-${randomUUID()}` };
  }
}
const email = new TestEmail(
  { mode: 'mock', logger: silent },
  { provider: 'resend', from: 'KaziForce <alerts@example.com>', smtp: 'memory' },
);
const connection = queueConnection();
const mandatory = createMandatoryCategories(prisma);
const wording = createWording(prisma);
let delivery: Delivery;
let adminToken: string;

beforeAll(async () => {
  delivery = startDelivery({
    prisma,
    connection,
    prefix: 'kf-test-gaps',
    logger: silent,
    adapters: { email },
    preferences,
    mandatory,
    wording,
    publicApiUrl: 'http://localhost:4000',
    publicAppUrl: 'http://localhost:5173',
    windowMinutes: 10,
    retryDelayMs: 20,
    // 12:00 Nairobi: never in quiet hours.
    now: () => new Date('2026-11-04T09:00:00Z'),
  });
  adminToken = (await login(app, ADMIN_EMAIL, ADMIN_PASSWORD)).token;
});

afterAll(async () => {
  // Back to the migration's starting rules and wording.
  await prisma.notificationRule.deleteMany({ where: { category: { not: 'announcement' } } });
  await prisma.messageWording.deleteMany({});
  await delivery.close();
  await Promise.allSettled([connection.quit(), redis.quit()]);
  await prisma.$disconnect();
});

async function newAccount() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ role: 'worker', name: 'Gap Tester', email: uniqueEmail('gaps'), password: PASSWORD });
  expect(res.status).toBe(201);
  return { token: res.body.accessToken as string, id: res.body.user.id as string };
}

/** A worker who gets important alerts by email (Recommended preset). */
async function emailPerson(categorySettings?: object) {
  return prisma.user.create({
    data: {
      email: uniqueEmail('gaps-mail'),
      passwordHash: 'not-used',
      name: 'Gap Mail Tester',
      role: 'worker',
      onboardingCompletedAt: new Date(),
      preference: {
        create: {
          channelOrder: ['email'],
          channelSettings: PRESETS.recommended.channelSettings,
          quietHours: { enabled: false, start: '21:00', end: '07:00' },
          ...(categorySettings && { categorySettings }),
        },
      },
    },
  });
}

const notify = (recipientId: string, category: string, priority: Priority = 'medium') =>
  prisma.notification.create({
    data: {
      recipientId,
      recipientRole: 'worker',
      senderRole: 'system',
      type: category === 'message' ? 'message' : 'status_update',
      category,
      title: 'Your application was reviewed',
      message: 'Mwangi Logistics looked at your application.',
      status: 'sent',
      predictedPriority: priority,
    },
  });

const emailsFor = (notificationId: string) =>
  email.sent.filter((m) => m.notificationId === notificationId);

const admin = {
  get: (path: string) => request(app).get(`/api/admin${path}`).set(auth(adminToken)),
  put: (path: string, body: object) =>
    request(app).put(`/api/admin${path}`).set(auth(adminToken)).send(body),
  post: (path: string, body: object) =>
    request(app).post(`/api/admin${path}`).set(auth(adminToken)).send(body),
};

describe('FR-NOT-027: search the alerts', () => {
  it('finds every word, in the title or the text, in any letter case', async () => {
    const { token, id } = await newAccount();
    for (const [title, message] of [
      ['Warehouse packers needed', 'Mombasa Road, start at 8'],
      ['New message from Pwani Events', 'Can you work on Saturday?'],
      ['Tips for a strong profile', 'Add your skills'],
    ]) {
      await prisma.notification.create({
        data: {
          recipientId: id,
          recipientRole: 'worker',
          senderRole: 'system',
          type: 'announcement',
          category: 'announcement',
          title: title!,
          message: message!,
          status: 'sent',
        },
      });
    }
    const search = async (q: string) =>
      (await request(app).get('/api/notifications').query({ q }).set(auth(token))).body.items.map(
        (n: { title: string }) => n.title,
      );
    expect(await search('PACKERS')).toEqual(['Warehouse packers needed']);
    expect(await search('saturday pwani')).toEqual(['New message from Pwani Events']);
    expect(await search('saturday mombasa')).toEqual([]);
    expect((await search('')).length).toBe(3);
  });
});

describe('FR-NOT-037: daily, weekly or monthly summary', () => {
  it('weekly on Mondays, monthly on the 1st, at 08:00 Nairobi', () => {
    // 2026-11-02 is a Monday; 2026-12-01 is a Tuesday (and the 1st).
    expect(frequenciesDue(new Date('2026-11-02T05:00:00Z'))).toEqual(['daily', 'weekly']);
    expect(frequenciesDue(new Date('2026-11-04T05:00:00Z'))).toEqual(['daily']);
    expect(frequenciesDue(new Date('2026-12-01T05:00:00Z'))).toEqual(['daily', 'monthly']);
    const until = new Date('2026-12-01T05:00:00Z');
    expect(periodStart(until, 'daily').toISOString()).toBe('2026-11-30T05:00:00.000Z');
    expect(periodStart(until, 'weekly').toISOString()).toBe('2026-11-24T05:00:00.000Z');
    expect(periodStart(until, 'monthly').toISOString()).toBe('2026-11-01T05:00:00.000Z');
  });

  it('a weekly person gets the last 7 days on Monday, and nothing on other days', async () => {
    const person = await emailPerson();
    await prisma.userPreference.update({
      where: { userId: person.id },
      data: { summaryFrequency: 'weekly' },
    });
    const monday = new Date('2026-11-09T05:00:00Z');
    await prisma.notification.create({
      data: {
        recipientId: person.id,
        recipientRole: 'worker',
        senderRole: 'system',
        type: 'job_alert',
        category: 'new_job',
        title: 'A low job alert five days ago',
        message: 'Shop assistant in Kilimani',
        status: 'sent',
        predictedPriority: 'low',
        createdAt: new Date(monday.getTime() - 5 * DAY),
      },
    });
    expect(await summaryRecipients(prisma, monday)).toContain(person.id);
    expect(await summaryRecipients(prisma, new Date(monday.getTime() + DAY))).not.toContain(
      person.id,
    );
  });

  it('the setting is saved through the API, and only the three choices are allowed', async () => {
    const { token } = await newAccount();
    const res = await request(app)
      .patch('/api/me/preferences')
      .set(auth(token))
      .send({ summaryFrequency: 'monthly' });
    expect(res.status).toBe(200);
    expect(res.body.preferences.summaryFrequency).toBe('monthly');
    const bad = await request(app)
      .patch('/api/me/preferences')
      .set(auth(token))
      .send({ summaryFrequency: 'hourly' });
    expect(bad.status).toBe(400);
  });
});

describe('FR-NOT-031/032: alert types on or off, and per channel', () => {
  it('saves one type at a time; the rest stay on, on every channel', async () => {
    const { token } = await newAccount();
    const res = await request(app)
      .patch('/api/me/preferences')
      .set(auth(token))
      .send({ categorySettings: { message: { channels: ['sms'] } } });
    expect(res.status).toBe(200);
    expect(res.body.preferences.categorySettings.message).toEqual({
      enabled: true,
      channels: ['sms'],
    });
    expect(res.body.preferences.categorySettings.new_job).toEqual({
      enabled: true,
      channels: ['whatsapp', 'sms', 'email'],
    });
    const off = await request(app)
      .patch('/api/me/preferences')
      .set(auth(token))
      .send({ categorySettings: { new_job: { enabled: false } } });
    expect(off.body.preferences.categorySettings.new_job.enabled).toBe(false);
  });

  it('a type kept away from email gets no email; other types still do', async () => {
    const person = await emailPerson({ message: { enabled: true, channels: ['sms'] } });
    const message = await notify(person.id, 'message');
    const update = await notify(person.id, 'application_update');
    await delivery.dispatch(message.id);
    await delivery.dispatch(update.id);
    await expect.poll(() => emailsFor(update.id).length, { timeout: 8000 }).toBe(1);
    expect(emailsFor(message.id)).toHaveLength(0);
  });

  it('a type switched off is kept quietly: read, no live push, nothing outside the app', async () => {
    const person = await emailPerson({ application_update: { enabled: false } });
    const n = await prisma.notification.create({
      data: {
        recipientId: person.id,
        recipientRole: 'worker',
        senderRole: 'system',
        type: 'status_update',
        category: 'application_update',
        title: 'Your application was reviewed',
        message: 'Mwangi Logistics looked at your application.',
        // Already classified (as if released by an admin), so no ML service is needed.
        correctedSpam: false,
        modelVersion: 'rules-v0',
        predictedPriority: 'medium',
      },
    });
    const workerConnection = queueConnection();
    const dispatched: string[] = [];
    const worker = startNotificationWorker({
      prisma,
      connection: workerConnection,
      publisher: redis,
      logger: silent,
      prefix: 'kf-test-gaps-worker',
      mlServiceUrl: 'http://127.0.0.1:9',
      mlTimeoutMs: 200,
      dispatch: async (id) => dispatched.push(id),
      isMuted: async (userId, category) =>
        !effectiveCategorySetting(
          (await preferences.get(userId)).categorySettings,
          category,
          await mandatory.get(),
        ).enabled,
    });
    try {
      const { Queue } = await import('bullmq');
      const { NOTIFICATION_QUEUE } = await import('../src/lib/queue.js');
      const queue = new Queue(NOTIFICATION_QUEUE, {
        connection: workerConnection,
        prefix: 'kf-test-gaps-worker',
      });
      await queue.add('notification.process', { notificationId: n.id });
      await expect
        .poll(
          async () => (await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).status,
          {
            timeout: 8000,
          },
        )
        .toBe('sent');
      const saved = await prisma.notification.findUniqueOrThrow({
        where: { id: n.id },
        include: { deliveries: true },
      });
      expect(saved.mutedByPreference).toBe(true);
      expect(saved.readAt).not.toBeNull();
      expect(saved.deliveries).toHaveLength(0);
      expect(dispatched).not.toContain(n.id);
      await queue.close();
    } finally {
      await worker.close();
      await workerConnection.quit();
    }
  });
});

describe('FR-NOT-035: "Always send" rules', () => {
  it('only admins change them; the change is audited; a mandatory type ignores the person', async () => {
    const { token } = await newAccount();
    const refused = await request(app)
      .put('/api/admin/notification-rules/message')
      .set(auth(token))
      .send({ mandatory: true });
    expect(refused.status).toBe(403);

    const res = await admin.put('/notification-rules/message', { mandatory: true });
    expect(res.status).toBe(200);
    const rules = (await admin.get('/notification-rules')).body.items;
    expect(rules).toContainEqual(expect.objectContaining({ category: 'message', mandatory: true }));
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'notification_rule.mandatory' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.metadata).toEqual({ category: 'message' });

    // The person kept messages away from email, but messages are now mandatory: email goes.
    mandatory.clear();
    const person = await emailPerson({ message: { enabled: false, channels: [] } });
    const n = await notify(person.id, 'message');
    await delivery.dispatch(n.id);
    await expect.poll(() => emailsFor(n.id).length, { timeout: 8000 }).toBe(1);

    // Settings show which types are locked on.
    const prefs = await request(app).get('/api/me/preferences').set(auth(token));
    expect(prefs.body.preferences.mandatoryCategories).toEqual(['message', 'announcement']);

    await admin.put('/notification-rules/message', { mandatory: false });
    mandatory.clear();
    expect(
      effectiveCategorySetting(
        normalizeCategorySettings({ message: { enabled: false } }),
        'message',
        await mandatory.get(),
      ).enabled,
    ).toBe(false);
  });
});

describe('FR-NOT-003/011: editable SMS and email wording', () => {
  it('checks the wording: 3 to 80 plain characters, no emoji or curly quotes', () => {
    expect(wordingProblem('Hi')).toBe('empty');
    expect(wordingProblem('x'.repeat(81))).toBe('too_long');
    expect(wordingProblem('A new job near you 🎉')).toBe('characters');
    expect(wordingProblem('It’s a new job')).toBe('characters');
    expect(wordingProblem("It's a new job near you")).toBeNull();
  });

  it('each save is a new version; the newest is used in emails; "back to default" restores it', async () => {
    const save = (text: string | null) =>
      admin.post('/wording', {
        category: 'application_update',
        language: 'en',
        urgent: false,
        text,
      });
    expect((await save('Bad 🎉 wording')).body.error.code).toBe('wording_characters');
    expect((await save('Your job application has news')).body.version).toBe(1);
    expect((await save('Update on a job you applied for')).body.version).toBe(2);

    const list = (await admin.get('/wording')).body.items;
    expect(list).toHaveLength(20); // 5 types x 2 languages x normal/urgent
    expect(list).toContainEqual(
      expect.objectContaining({
        category: 'application_update',
        language: 'en',
        urgent: false,
        text: 'Update on a job you applied for',
        defaultText: 'News about your job application',
        version: 2,
      }),
    );
    // Both versions are kept (never changed), and both saves are in the audit log.
    expect(await prisma.messageWording.count({ where: { category: 'application_update' } })).toBe(
      2,
    );
    expect(
      await prisma.auditLog.count({ where: { action: 'wording.changed' } }),
    ).toBeGreaterThanOrEqual(2);

    wording.clear();
    const person = await emailPerson();
    const n = await notify(person.id, 'application_update');
    await delivery.dispatch(n.id);
    await expect.poll(() => emailsFor(n.id).length, { timeout: 8000 }).toBe(1);
    expect(emailsFor(n.id)[0]!.subject).toBe('Update on a job you applied for');

    expect((await save(null)).body.version).toBe(3);
    wording.clear();
    expect(await wording.summary('application_update', 'medium', 'en')).toBe(
      'News about your job application',
    );
  });
});

describe('FR-NOT-038: history of preference changes', () => {
  it('every change is kept as the person’s own action, on their admin page, not in the main list', async () => {
    const { token, id } = await newAccount();
    await request(app)
      .patch('/api/me/preferences')
      .set(auth(token))
      .send({ quietHours: { enabled: true, start: '22:00', end: '06:00' } });
    await request(app)
      .patch('/api/me/preferences')
      .set(auth(token))
      .send({ categorySettings: { message: { enabled: false } } });

    const rows = await prisma.auditLog.findMany({
      where: { actorId: id, action: 'preferences.changed' },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => r.metadata)).toEqual([
      { quietHours: { enabled: true, start: '22:00', end: '06:00' } },
      { categorySettings: { message: { enabled: false } } },
    ]);
    const detail = await admin.get(`/users/${id}`);
    expect(detail.body.history.map((h: { action: string }) => h.action)).toEqual([
      'preferences.changed',
      'preferences.changed',
    ]);
    const list = await admin.get('/audit-log');
    expect(
      list.body.items.some((e: { action: string }) => e.action === 'preferences.changed'),
    ).toBe(false);
  });
});
