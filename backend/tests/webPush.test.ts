// ADR 0017: browser pop-ups (Web Push; SRS FR-NOT-016..020) with a fake push service, and the
// "Pop-ups on this device" API. The real web-push library is not called here.
import pino from 'pino';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { PushAdapter, type PushPayload, type SendPush } from '../src/channels/PushAdapter.js';
import { createWording } from '../src/channels/wording.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';
import { UserPreferenceManager } from '../src/preferences/UserPreferenceManager.js';
import { PASSWORD, auth, testApp, uniqueEmail } from './helpers.js';

const app = testApp();
const preferences = new UserPreferenceManager(prisma, redis, 'kf-test');
const sent: { endpoint: string; payload: PushPayload; urgency: string }[] = [];
/** The fake push service: an endpoint ending in "/gone" has expired (410). */
const sendPush: SendPush = async (subscription, payload, options) => {
  if (subscription.endpoint.endsWith('/gone')) {
    throw Object.assign(new Error('Gone'), { statusCode: 410 });
  }
  sent.push({
    endpoint: subscription.endpoint,
    payload: JSON.parse(payload),
    urgency: options.urgency,
  });
};
let clock = new Date('2026-11-04T09:00:00Z'); // 12:00 in Nairobi
const adapter = new PushAdapter(
  { mode: 'mock', logger: pino({ level: 'silent' }) },
  {
    prisma,
    preferences,
    wording: createWording(prisma),
    vapid: { publicKey: 'test', privateKey: 'test', subject: 'mailto:test@example.com' },
    now: () => clock,
    sendPush,
  },
);

afterAll(async () => {
  await redis.quit();
  await prisma.$disconnect();
});

async function personWithBrowsers(endpoints: string[]) {
  return prisma.user.create({
    data: {
      email: uniqueEmail('push'),
      passwordHash: 'not-used',
      name: 'Amina Push-Tester',
      role: 'worker',
      preference: {
        create: {
          channelOrder: ['sms', 'email'],
          channelSettings: {},
          quietHours: { enabled: true, start: '21:00', end: '07:00' },
        },
      },
      pushSubscriptions: {
        create: endpoints.map((endpoint) => ({
          endpoint,
          p256dh: 'p'.repeat(20),
          auth: 'a'.repeat(12),
        })),
      },
    },
  });
}

const alertFor = (recipientId: string, priority: 'urgent' | 'low') =>
  prisma.notification.create({
    data: {
      recipientId,
      recipientRole: 'worker',
      senderRole: 'business',
      type: 'message',
      category: 'message',
      title: 'New message from Pwani Events',
      message: 'Amina, can you work on Saturday at the Mombasa Road site?',
      status: 'sent',
      predictedPriority: priority,
    },
  });

describe('browser pop-ups (FR-NOT-018)', () => {
  it('every browser gets the summary line only: no names, no message words', async () => {
    const user = await personWithBrowsers([
      'https://fcm.googleapis.com/fcm/send/a',
      'https://fcm.googleapis.com/fcm/send/b',
    ]);
    const n = await alertFor(user.id, 'urgent');
    expect(await adapter.notify(n.id)).toBe(2);
    const mine = sent.filter((s) => s.payload.tag === n.id);
    expect(mine.map((s) => s.endpoint)).toEqual([
      'https://fcm.googleapis.com/fcm/send/a',
      'https://fcm.googleapis.com/fcm/send/b',
    ]);
    expect(mine[0]!.payload).toEqual({
      title: 'KaziForce: Act now',
      body: 'You have an urgent new message',
      url: `/worker/alerts?open=${n.id}`,
      tag: n.id,
      silent: false,
      urgent: true,
    });
    expect(mine[0]!.urgency).toBe('high');
    expect(JSON.stringify(mine[0]!.payload)).not.toMatch(/Amina|Pwani|Saturday/);
    const log = await prisma.deliveryLog.findFirstOrThrow({
      where: { notificationId: n.id, channel: 'push' },
    });
    expect(log.status).toBe('sent');
  });

  it('during quiet hours a non-urgent pop-up is silent (FR-NOT-020); urgent is not', async () => {
    clock = new Date('2026-11-04T20:00:00Z'); // 23:00 in Nairobi
    const user = await personWithBrowsers(['https://fcm.googleapis.com/fcm/send/night']);
    const low = await alertFor(user.id, 'low');
    const urgent = await alertFor(user.id, 'urgent');
    await adapter.notify(low.id);
    await adapter.notify(urgent.id);
    expect(sent.find((s) => s.payload.tag === low.id)!.payload.silent).toBe(true);
    expect(sent.find((s) => s.payload.tag === urgent.id)!.payload.silent).toBe(false);
    clock = new Date('2026-11-04T09:00:00Z');
  });

  it('an expired browser (410) is removed at once and never tried again', async () => {
    const user = await personWithBrowsers(['https://fcm.googleapis.com/fcm/send/gone']);
    const n = await alertFor(user.id, 'urgent');
    expect(await adapter.notify(n.id)).toBe(0);
    expect(await prisma.pushSubscription.count({ where: { userId: user.id } })).toBe(0);
    const log = await prisma.deliveryLog.findFirstOrThrow({
      where: { notificationId: n.id, channel: 'push' },
    });
    expect(log).toMatchObject({ status: 'failed', error: 'expired (410)' });
  });

  it('nobody with pop-ups on: nothing is sent and nothing is logged', async () => {
    const user = await personWithBrowsers([]);
    const n = await alertFor(user.id, 'urgent');
    expect(await adapter.notify(n.id)).toBe(0);
    expect(await prisma.deliveryLog.count({ where: { notificationId: n.id } })).toBe(0);
  });
});

describe('"Pop-ups on this device" API', () => {
  async function newAccount() {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        role: 'worker',
        name: 'Push Tester',
        email: uniqueEmail('push-api'),
        password: PASSWORD,
      });
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  }
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: 'p'.repeat(40), auth: 'a'.repeat(16) },
  };

  it('without server keys the switch is hidden (publicKey null) and switching on is refused', async () => {
    const saved = env.VAPID_PUBLIC_KEY;
    env.VAPID_PUBLIC_KEY = '';
    const { token } = await newAccount();
    expect((await request(app).get('/api/me/push').set(auth(token))).body).toEqual({
      publicKey: null,
    });
    expect(
      (await request(app).post('/api/me/push').set(auth(token)).send(subscription)).status,
    ).toBe(409);
    env.VAPID_PUBLIC_KEY = saved;
  });

  it('on and off are saved per browser and kept in the settings history (FR-NOT-038)', async () => {
    const saved = env.VAPID_PUBLIC_KEY;
    env.VAPID_PUBLIC_KEY = 'BTestPublicKey';
    const { token, id } = await newAccount();
    expect((await request(app).get('/api/me/push').set(auth(token))).body.publicKey).toBe(
      'BTestPublicKey',
    );
    const bad = await request(app)
      .post('/api/me/push')
      .set(auth(token))
      .send({ ...subscription, endpoint: 'http://not-secure.example/x' });
    expect(bad.status).toBe(400);
    // Any other https:// address is refused too: the server only talks to push services (BT-05).
    for (const endpoint of [
      'https://evil.example/collect',
      'https://fcm.googleapis.com.evil.example/x',
      'https://fcm.googleapis.com:8443/fcm/send/x',
    ]) {
      const refused = await request(app)
        .post('/api/me/push')
        .set(auth(token))
        .send({ ...subscription, endpoint });
      expect(refused.status).toBe(400);
    }
    expect(
      (await request(app).post('/api/me/push').set(auth(token)).send(subscription)).status,
    ).toBe(201);
    expect(await prisma.pushSubscription.count({ where: { userId: id } })).toBe(1);
    await request(app)
      .delete('/api/me/push')
      .set(auth(token))
      .send({ endpoint: subscription.endpoint });
    expect(await prisma.pushSubscription.count({ where: { userId: id } })).toBe(0);
    const history = await prisma.auditLog.findMany({
      where: { actorId: id, action: 'preferences.changed' },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((h) => h.metadata)).toEqual([
      { browserPopups: true },
      { browserPopups: false },
    ]);
    env.VAPID_PUBLIC_KEY = saved;
  });
});
