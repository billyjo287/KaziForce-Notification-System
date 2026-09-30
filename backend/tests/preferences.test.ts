// Phase 6: the notification settings (PRD FR-5) through the API, the Redis cache in front of them,
// and quiet hours in the real delivery engine (BullMQ queues + the test database).
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OutgoingMessage } from '../src/channels/ChannelAdapter.js';
import { EmailAdapter } from '../src/channels/EmailAdapter.js';
import { startDelivery, type Delivery } from '../src/channels/delivery.js';
import type { Priority } from '../src/generated/prisma/client.js';
import { prisma } from '../src/lib/prisma.js';
import { queueConnection } from '../src/lib/queue.js';
import { redis } from '../src/lib/redis.js';
import { PRESETS } from '../src/modules/me/presets.js';
import { UserPreferenceManager } from '../src/preferences/UserPreferenceManager.js';
import { PASSWORD, auth, testApp, uniqueEmail } from './helpers.js';

const app = testApp();
const silent = pino({ level: 'silent' });
// The same Redis keys as the API's own manager.
const preferences = new UserPreferenceManager(prisma, redis, 'kf-test');

async function newAccount(role: 'worker' | 'business' = 'worker') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ role, name: 'Settings Tester', email: uniqueEmail('prefs'), password: PASSWORD });
  expect(res.status).toBe(201);
  return { token: res.body.accessToken as string, id: res.body.user.id as string };
}

const getPrefs = async (token: string) =>
  (await request(app).get('/api/me/preferences').set(auth(token))).body.preferences;
const patch = (token: string, body: object) =>
  request(app).patch('/api/me/preferences').set(auth(token)).send(body);

describe('notification settings API', () => {
  it('a new account starts on Recommended, with quiet hours 21:00-07:00', async () => {
    const { token } = await newAccount();
    expect(await getPrefs(token)).toEqual({
      preset: 'recommended',
      // No WhatsApp until the person says they use it.
      channelOrder: ['sms', 'email'],
      channelSettings: PRESETS.recommended.channelSettings,
      urgentOnBothChannels: false,
      quietHours: { enabled: true, start: '21:00', end: '07:00' },
      dailySummary: true,
      usesWhatsApp: false,
      phoneVerified: false,
      optedOut: { whatsapp: false, sms: false },
    });
  });

  it('a preset sets every channel; changing one setting makes it "custom"; undo goes back', async () => {
    const { token } = await newAccount();
    let res = await patch(token, { preset: 'everything' });
    expect(res.status).toBe(200);
    expect(res.body.preferences).toMatchObject({
      preset: 'everything',
      channelSettings: PRESETS.everything.channelSettings,
      dailySummary: true,
    });
    // The login store gets the new preset too.
    expect(res.body.user.preference.preset).toBe('everything');

    const before = res.body.preferences;
    res = await patch(token, { channelSettings: { email: { threshold: 'urgent_only' } } });
    expect(res.body.preferences.preset).toBe('custom');
    expect(res.body.preferences.channelSettings.email).toEqual({
      enabled: true,
      threshold: 'urgent_only',
    });

    // "Undo" sends the old values back; the preset name follows from them.
    res = await patch(token, {
      channelSettings: before.channelSettings,
      dailySummary: before.dailySummary,
    });
    expect(res.body.preferences.preset).toBe('everything');
  });

  it('WhatsApp yes/no adds or removes it from the order; the order must list each channel once', async () => {
    const { token } = await newAccount();
    let res = await patch(token, { usesWhatsApp: true });
    expect(res.body.preferences.channelOrder).toEqual(['sms', 'email', 'whatsapp']);

    res = await patch(token, { channelOrder: ['whatsapp', 'sms', 'email'] });
    expect(res.body.preferences.channelOrder).toEqual(['whatsapp', 'sms', 'email']);

    expect((await patch(token, { channelOrder: ['sms', 'sms', 'email'] })).status).toBe(400);
    expect((await patch(token, { channelOrder: ['sms', 'email'] })).status).toBe(400);

    res = await patch(token, { usesWhatsApp: false });
    expect(res.body.preferences.channelOrder).toEqual(['sms', 'email']);
    // WhatsApp cannot be put in the order of someone who does not use it.
    expect((await patch(token, { channelOrder: ['whatsapp', 'sms', 'email'] })).status).toBe(400);
  });

  it('quiet hours need two different times written as HH:MM', async () => {
    const { token } = await newAccount();
    const bad = [
      { enabled: true, start: '22:00', end: '22:00' },
      { enabled: true, start: '24:00', end: '06:00' },
      { enabled: true, start: '9:00', end: '06:00' },
    ];
    for (const quietHours of bad) {
      expect((await patch(token, { quietHours })).status, JSON.stringify(quietHours)).toBe(400);
    }
    const res = await patch(token, { quietHours: { enabled: true, start: '22:00', end: '06:00' } });
    expect(res.status).toBe(200);
    expect(res.body.preferences.quietHours).toEqual({
      enabled: true,
      start: '22:00',
      end: '06:00',
    });
  });

  it('refuses a preset and single settings in the same change, and unknown fields', async () => {
    const { token } = await newAccount();
    expect((await patch(token, { preset: 'recommended', dailySummary: false })).status).toBe(400);
    expect((await patch(token, { theme: 'dark' })).status).toBe(400);
  });

  it('switching WhatsApp on in Settings undoes an earlier STOP', async () => {
    const { token, id } = await newAccount();
    await prisma.user.update({
      where: { id },
      data: {
        usesWhatsApp: true,
        whatsappOptedOutAt: new Date(),
        preference: {
          update: {
            channelSettings: {
              ...PRESETS.recommended.channelSettings,
              whatsapp: { enabled: false, threshold: 'urgent_only' },
            },
          },
        },
      },
    });
    expect((await getPrefs(token)).optedOut.whatsapp).toBe(true);
    const res = await patch(token, { channelSettings: { whatsapp: { enabled: true } } });
    expect(res.body.preferences.optedOut.whatsapp).toBe(false);
    expect(res.body.preferences.channelSettings.whatsapp.enabled).toBe(true);
  });
});

describe('UserPreferenceManager: Redis cache', () => {
  it('reads from the cache, and every change through the API clears it', async () => {
    const { token, id } = await newAccount();
    expect((await preferences.get(id)).dailySummary).toBe(true);
    expect(await redis.exists(`kf-test:preferences:${id}`)).toBe(1);

    // Changed behind the cache's back: the cached copy is still used (proof that it is a cache).
    await prisma.userPreference.update({ where: { userId: id }, data: { dailySummary: false } });
    expect((await preferences.get(id)).dailySummary).toBe(true);

    // Changed through the API: the old copy is removed, so what is cached now is fresh.
    await patch(token, { urgentOnBothChannels: true });
    const cached = JSON.parse((await redis.get(`kf-test:preferences:${id}`)) ?? '{}');
    expect(cached).toMatchObject({ urgentOnBothChannels: true, dailySummary: false });
    expect(await preferences.get(id)).toMatchObject({
      urgentOnBothChannels: true,
      dailySummary: false,
    });
  });

  it('invalidate() removes the cached copy (used for STOP replies and deleted accounts)', async () => {
    const { id } = await newAccount();
    await preferences.get(id);
    await preferences.invalidate(id);
    expect(await redis.exists(`kf-test:preferences:${id}`)).toBe(0);
  });
});

// ---------- quiet hours in the delivery engine ----------

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
let delivery: Delivery;
/** The engine's clock; each test sets it. */
let clock = new Date();

beforeAll(() => {
  delivery = startDelivery({
    prisma,
    connection,
    prefix: 'kf-test-quiet',
    logger: silent,
    adapters: { email },
    preferences,
    publicApiUrl: 'http://localhost:4000',
    publicAppUrl: 'http://localhost:5173',
    windowMinutes: 10,
    retryDelayMs: 20,
    now: () => clock,
  });
});

afterAll(async () => {
  await delivery.close();
  await Promise.allSettled([connection.quit(), redis.quit()]);
  await prisma.$disconnect();
});

/** 22:00-06:00 quiet hours; the person gets important alerts by email (Recommended). */
async function nightOwl(overrides: { deletionRequestedAt?: Date } = {}) {
  const user = await prisma.user.create({
    data: {
      email: uniqueEmail('quiet'),
      passwordHash: 'not-used',
      name: 'Quiet Tester',
      role: 'worker',
      onboardingCompletedAt: new Date(),
      ...overrides,
      preference: {
        create: {
          channelOrder: ['sms', 'email'],
          channelSettings: PRESETS.recommended.channelSettings,
          quietHours: { enabled: true, start: '22:00', end: '06:00' },
        },
      },
    },
  });
  return user;
}

const notify = (recipientId: string, priority: Priority) =>
  prisma.notification.create({
    data: {
      recipientId,
      recipientRole: 'worker',
      senderRole: 'business',
      type: 'status_update',
      category: 'application_update',
      title: 'Your application was reviewed',
      message: 'Mwangi Logistics looked at your application.',
      status: 'sent',
      predictedPriority: priority,
    },
  });

const sentTo = (notificationId: string) =>
  email.sent.filter((m) => m.notificationId === notificationId);

async function eventually(check: () => Promise<void> | void, timeoutMs = 8000) {
  const start = Date.now();
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() - start > timeoutMs) throw error;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

const nairobi = (date: string, time: string) => new Date(`${date}T${time}+03:00`);

describe('quiet hours in the delivery engine', () => {
  it('an important email at 23:00 waits until 06:00, then is sent', async () => {
    const user = await nightOwl();
    const n = await notify(user.id, 'medium');
    // 05:59:59 in Nairobi: quiet for one more second.
    clock = nairobi('2026-10-03', '05:59:59');
    const plan = await delivery.dispatch(n.id);

    const endsAt = nairobi('2026-10-03', '06:00:00');
    expect(plan).toEqual({ now: [], escalation: null, heldUntil: endsAt });
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).heldUntil,
    ).toEqual(endsAt);
    const job = await delivery.heldQueue.getJob(`${n.id}-held-${endsAt.getTime()}`);
    expect(job?.opts.delay).toBe(1000);
    expect(sentTo(n.id)).toHaveLength(0);

    // The morning comes: the held job runs by itself and plans again.
    clock = nairobi('2026-10-03', '06:00:01');
    await eventually(() => expect(sentTo(n.id)).toHaveLength(1));
    const logs = await prisma.deliveryLog.findMany({ where: { notificationId: n.id } });
    expect(logs.map((l) => [l.channel, l.status])).toEqual([['email', 'sent']]);
  });

  it('a 23:00 hold lasts until 06:00 the next day', async () => {
    const user = await nightOwl();
    const n = await notify(user.id, 'medium');
    clock = nairobi('2026-10-02', '23:00:00');
    const plan = await delivery.dispatch(n.id);
    expect(plan?.heldUntil).toEqual(nairobi('2026-10-03', '06:00:00'));
    const job = await delivery.heldQueue.getJob(`${n.id}-held-${plan!.heldUntil!.getTime()}`);
    expect(job?.opts.delay).toBe(7 * 60 * 60 * 1000);
    await job?.remove();
  });

  it('urgent gets through during quiet hours', async () => {
    const user = await nightOwl();
    const n = await notify(user.id, 'urgent');
    clock = nairobi('2026-10-03', '02:00:00');
    const plan = await delivery.dispatch(n.id);
    // No verified phone, so email is the only outside channel.
    expect(plan).toEqual({ now: ['email'], escalation: null });
    await eventually(() => expect(sentTo(n.id)).toHaveLength(1));
  });

  it('released, but already read in the app during the night: nothing is sent', async () => {
    const user = await nightOwl();
    const n = await notify(user.id, 'medium');
    clock = nairobi('2026-10-03', '01:00:00');
    const plan = await delivery.dispatch(n.id);
    await (await delivery.heldQueue.getJob(`${n.id}-held-${plan!.heldUntil!.getTime()}`))?.remove();

    await prisma.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
    clock = nairobi('2026-10-03', '06:00:00');
    expect(await delivery.dispatch(n.id)).toBeNull();
    expect(sentTo(n.id)).toHaveLength(0);
  });

  it('quiet hours changed in the night: the release holds again until the new end', async () => {
    const user = await nightOwl();
    const n = await notify(user.id, 'medium');
    clock = nairobi('2026-10-03', '05:00:00');
    const first = await delivery.dispatch(n.id);
    await (
      await delivery.heldQueue.getJob(`${n.id}-held-${first!.heldUntil!.getTime()}`)
    )?.remove();

    await preferences.update(user.id, {
      quietHours: { enabled: true, start: '22:00', end: '08:00' },
    });
    clock = nairobi('2026-10-03', '06:00:00');
    const second = await delivery.dispatch(n.id);
    expect(second?.heldUntil).toEqual(nairobi('2026-10-03', '08:00:00'));
    await (
      await delivery.heldQueue.getJob(`${n.id}-held-${second!.heldUntil!.getTime()}`)
    )?.remove();
  });

  it('nothing goes outside the app for an account waiting to be deleted', async () => {
    const user = await nightOwl({ deletionRequestedAt: new Date() });
    const n = await notify(user.id, 'urgent');
    clock = new Date();
    expect(await delivery.dispatch(n.id)).toBeNull();
  });
});
