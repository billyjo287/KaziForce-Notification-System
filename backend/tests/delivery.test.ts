// Phase 5 end to end with real queues (BullMQ on Redis) and the test database, but test providers:
// they record what would be sent and can be told to fail. Covers PRD FR-4 / FR-4b / FR-7.
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SendError,
  type OutgoingMessage,
  type SendResult,
} from '../src/channels/ChannelAdapter.js';
import { EmailAdapter } from '../src/channels/EmailAdapter.js';
import { SmsAdapter } from '../src/channels/SmsAdapter.js';
import { WhatsAppAdapter } from '../src/channels/WhatsAppAdapter.js';
import { startDelivery, type Delivery } from '../src/channels/delivery.js';
import { twilioSignature } from '../src/channels/twilioSignature.js';
import type { Priority } from '../src/generated/prisma/client.js';
import { prisma } from '../src/lib/prisma.js';
import { closeApiQueues, queueConnection } from '../src/lib/queue.js';
import { redis } from '../src/lib/redis.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { PRESETS } from '../src/modules/me/presets.js';
import { auth, testApp, uniqueEmail } from './helpers.js';

const silent = pino({ level: 'silent' });
const WINDOW_MINUTES = 0.02; // 1.2 seconds, so "not opened in time" can be tested quickly

/** Test providers: record every message; `failNext` sends fail before one gets through. */
class Controls {
  sent: OutgoingMessage[] = [];
  failNext = 0;
  permanentFailure = false;

  send(channel: string, message: OutgoingMessage): SendResult {
    if (this.permanentFailure) throw new SendError('Test provider: invalid number', false);
    if (this.failNext > 0) {
      this.failNext--;
      throw new SendError('Test provider: network timeout');
    }
    this.sent.push(message);
    return { providerMessageId: `test-${channel}-${randomUUID()}` };
  }
}

class TestWhatsApp extends WhatsAppAdapter {
  readonly test = new Controls();
  protected override async sendMock(message: OutgoingMessage) {
    return this.test.send(this.name, message);
  }
}
class TestSms extends SmsAdapter {
  readonly test = new Controls();
  protected override async sendMock(message: OutgoingMessage) {
    return this.test.send(this.name, message);
  }
}
class TestEmail extends EmailAdapter {
  readonly test = new Controls();
  protected override async sendMock(message: OutgoingMessage) {
    return this.test.send(this.name, message);
  }
}

const options = { mode: 'mock' as const, logger: silent };
const whatsapp = new TestWhatsApp(options, {
  templates: {},
  statusCallbackUrl: 'http://localhost:4000/webhooks/twilio/status',
});
const sms = new TestSms(options, { username: 'sandbox' });
const email = new TestEmail(options, {
  provider: 'resend',
  from: 'KaziForce <alerts@example.com>',
  smtp: 'memory',
});

const app = testApp();
let delivery: Delivery;
const connection = queueConnection();

beforeAll(() => {
  delivery = startDelivery({
    prisma,
    connection,
    prefix: 'kf-test',
    logger: silent,
    adapters: { whatsapp, sms, email },
    publicApiUrl: 'http://localhost:4000',
    publicAppUrl: 'http://localhost:5173',
    windowMinutes: WINDOW_MINUTES,
    retryDelayMs: 20,
  });
});

afterAll(async () => {
  await delivery.close();
  await closeApiQueues();
  await Promise.allSettled([connection.quit(), redis.quit()]);
  await prisma.$disconnect();
});

beforeEach(() => {
  for (const { test } of [whatsapp, sms, email]) {
    test.sent = [];
    test.failNext = 0;
    test.permanentFailure = false;
  }
});

// ---------- helpers ----------

let phoneCounter = Math.floor(Math.random() * 1_000_000);
const newPhone = () => `+2547${String(phoneCounter++).padStart(8, '0')}`;

async function makeWorker(
  options: { usesWhatsApp?: boolean; urgentOnBoth?: boolean; language?: 'en' | 'sw' } = {},
) {
  const user = await prisma.user.create({
    data: {
      email: uniqueEmail('channels'),
      passwordHash: 'not-used',
      name: 'Channel Tester',
      role: 'worker',
      language: options.language ?? 'en',
      phone: newPhone(),
      phoneVerified: true,
      consentSmsWhatsapp: true,
      usesWhatsApp: options.usesWhatsApp ?? true,
      onboardingCompletedAt: new Date(),
      preference: {
        create: {
          channelOrder:
            options.usesWhatsApp === false ? ['sms', 'email'] : ['whatsapp', 'sms', 'email'],
          channelSettings: PRESETS.recommended.channelSettings,
          urgentOnBothChannels: options.urgentOnBoth ?? false,
          quietHours: { enabled: false, start: '21:00', end: '07:00' },
        },
      },
    },
  });
  return { user, token: signAccessToken(user) };
}

/** A notification the pipeline has already classified and delivered in-app. */
async function notify(recipientId: string, priority: Priority, deadlineAt: Date | null = null) {
  return prisma.notification.create({
    data: {
      recipientId,
      recipientRole: 'worker',
      senderRole: 'business',
      type: 'message',
      category: 'message',
      title: 'New message from Mwangi Logistics',
      message: 'Can you start tonight at 6pm?',
      status: 'sent',
      predictedPriority: priority,
      deadlineAt,
    },
  });
}

const logs = (notificationId: string) =>
  prisma.deliveryLog.findMany({
    where: { notificationId },
    orderBy: [{ createdAt: 'asc' }, { attempt: 'asc' }],
  });

async function eventually(check: () => Promise<void>, timeoutMs = 6000) {
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- the safety net ----------

describe('urgent: first choice, with a safety net', () => {
  it('WhatsApp fails 3 times -> SMS sent (one DeliveryLog row per try)', async () => {
    const { user } = await makeWorker();
    const n = await notify(user.id, 'urgent');
    whatsapp.test.failNext = 3;
    await delivery.dispatch(n.id);

    await eventually(async () => {
      const rows = await logs(n.id);
      expect(rows.map((r) => [r.channel, r.attempt, r.status, r.isEscalation])).toEqual([
        ['whatsapp', 1, 'failed', false],
        ['whatsapp', 2, 'failed', false],
        ['whatsapp', 3, 'failed', false],
        ['sms', 1, 'sent', true],
      ]);
    });
    const rows = await logs(n.id);
    expect(rows[0]!.error).toBe('Test provider: network timeout');
    expect(rows[3]!.providerMessageId).toMatch(/^test-sms-/);
    expect(await prisma.notification.findUnique({ where: { id: n.id } })).toMatchObject({
      escalatedTo: 'sms',
    });
    expect(sms.test.sent[0]!.text).toMatch(
      /^KaziForce \(Urgent\): You have an urgent new message\. Open: http:\/\/localhost:4000\/o\/\w{8}$/,
    );
  });

  it('a permanent failure (e.g. invalid number) moves on at once, without retrying', async () => {
    const { user } = await makeWorker();
    const n = await notify(user.id, 'urgent');
    whatsapp.test.permanentFailure = true;
    await delivery.dispatch(n.id);
    await eventually(async () => {
      const rows = await logs(n.id);
      expect(rows.map((r) => [r.channel, r.status])).toEqual([
        ['whatsapp', 'failed'],
        ['sms', 'sent'],
      ]);
    });
  });

  it('user has no WhatsApp -> SMS first', async () => {
    const { user } = await makeWorker({ usesWhatsApp: false });
    const n = await notify(user.id, 'urgent');
    const plan = await delivery.dispatch(n.id);
    expect(plan?.now).toEqual(['sms']);
    await eventually(async () => expect(sms.test.sent).toHaveLength(1));
    expect(whatsapp.test.sent).toHaveLength(0);
  });

  it('urgent not opened in the window -> escalates to the next channel', async () => {
    const { user } = await makeWorker();
    const n = await notify(user.id, 'urgent');
    await delivery.dispatch(n.id);
    await eventually(async () => expect(whatsapp.test.sent).toHaveLength(1));
    expect(sms.test.sent).toHaveLength(0);

    await eventually(async () => {
      const rows = await logs(n.id);
      expect(rows.map((r) => [r.channel, r.status, r.isEscalation])).toEqual([
        ['whatsapp', 'sent', false],
        ['sms', 'sent', true],
      ]);
    });
    const saved = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(saved.escalatedTo).toBe('sms');
    expect(saved.escalatedAt).toBeInstanceOf(Date);
  });

  it('opened in the app before the window ends -> no escalation', async () => {
    const { user } = await makeWorker();
    const n = await notify(user.id, 'urgent');
    await delivery.dispatch(n.id);
    await prisma.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
    await wait(WINDOW_MINUTES * 60_000 + 800);
    expect((await logs(n.id)).map((r) => r.channel)).toEqual(['whatsapp']);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).escalatedAt,
    ).toBeNull();
  });

  it('opened through the SMS/WhatsApp link -> counts as opened, no escalation, goes to the alert', async () => {
    const { user } = await makeWorker();
    const n = await notify(user.id, 'urgent');
    await delivery.dispatch(n.id);
    await eventually(async () => expect(whatsapp.test.sent).toHaveLength(1));

    const path = new URL(whatsapp.test.sent[0]!.link).pathname; // /o/<token>
    const res = await request(app).get(path);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`http://localhost:5173/worker/alerts?open=${n.id}`);

    const [row] = await logs(n.id);
    expect(row!.clickedAt).toBeInstanceOf(Date);
    expect(row!.openedAt).toBeInstanceOf(Date);
    await wait(WINDOW_MINUTES * 60_000 + 800);
    expect((await logs(n.id)).map((r) => r.channel)).toEqual(['whatsapp']);
  });

  it('"send on both" -> two sends at once, no escalation', async () => {
    const { user } = await makeWorker({ urgentOnBoth: true });
    const n = await notify(user.id, 'urgent');
    const plan = await delivery.dispatch(n.id);
    expect(plan).toEqual({ now: ['whatsapp', 'sms'], escalation: null });
    await eventually(async () => {
      expect(whatsapp.test.sent).toHaveLength(1);
      expect(sms.test.sent).toHaveLength(1);
    });
    await wait(WINDOW_MINUTES * 60_000 + 800);
    expect(email.test.sent).toHaveLength(0);
    expect((await logs(n.id)).every((r) => !r.isEscalation)).toBe(true);
  });

  it('deadline in 8 minutes -> the escalation check is scheduled 4 minutes later', async () => {
    const { user } = await makeWorker();
    const n = await notify(user.id, 'urgent', new Date(Date.now() + 8 * 60_000));
    // A real 10-minute window for this one test (the others use 1.2 seconds).
    const real = startDelivery({
      prisma,
      connection,
      prefix: 'kf-test-deadline',
      logger: silent,
      adapters: { whatsapp, sms, email },
      publicApiUrl: 'http://localhost:4000',
      publicAppUrl: 'http://localhost:5173',
      windowMinutes: 10,
      retryDelayMs: 20,
    });
    try {
      const plan = await real.dispatch(n.id);
      expect(plan?.escalation?.windowMs).toBeGreaterThan(4 * 60_000 - 2000);
      expect(plan?.escalation?.windowMs).toBeLessThanOrEqual(4 * 60_000);
      const job = await real.escalationQueue.getJob(`${n.id}-window`);
      expect(job?.opts.delay).toBe(plan?.escalation?.windowMs);
      await job?.remove();
    } finally {
      await real.close();
    }
  });
});

describe('medium and low', () => {
  it('medium: email with one button (Recommended preset), no WhatsApp or SMS, no escalation', async () => {
    const { user } = await makeWorker({ language: 'sw' });
    const n = await notify(user.id, 'medium');
    expect(await delivery.dispatch(n.id)).toEqual({ now: ['email'], escalation: null });
    await eventually(async () => expect(email.test.sent).toHaveLength(1));
    expect(email.test.sent[0]).toMatchObject({ subject: 'Una ujumbe mpya', to: user.email });
    expect(email.test.sent[0]!.html).toContain('Fungua KaziForce');
    expect(whatsapp.test.sent).toHaveLength(0);
  });

  it('low: in the app only', async () => {
    const { user } = await makeWorker();
    const n = await notify(user.id, 'low');
    expect(await delivery.dispatch(n.id)).toEqual({ now: [], escalation: null });
  });
});

// ---------- providers calling back ----------

/** Posts form fields signed like Twilio does. */
function fromTwilio(path: string, fields: Record<string, string>) {
  const signature = twilioSignature(
    'test-twilio-auth-token',
    `http://localhost:4000${path}`,
    fields,
  );
  return request(app).post(path).type('form').set('X-Twilio-Signature', signature).send(fields);
}

describe('delivery reports (webhooks)', () => {
  it('Twilio "read" marks the WhatsApp message delivered and opened (no escalation)', async () => {
    const { user } = await makeWorker();
    const n = await notify(user.id, 'urgent');
    await delivery.dispatch(n.id);
    await eventually(async () => expect((await logs(n.id))[0]?.providerMessageId).toBeTruthy());
    const sid = (await logs(n.id))[0]!.providerMessageId!;

    const res = await fromTwilio('/webhooks/twilio/status', {
      MessageSid: sid,
      MessageStatus: 'read',
    });
    expect(res.status).toBe(204);
    const [row] = await logs(n.id);
    expect(row).toMatchObject({ status: 'delivered' });
    expect(row!.openedAt).toBeInstanceOf(Date);
    await wait(WINDOW_MINUTES * 60_000 + 800);
    expect((await logs(n.id)).map((r) => r.channel)).toEqual(['whatsapp']);
  });

  it('Twilio "failed" after acceptance -> the next channel at once', async () => {
    const { user } = await makeWorker();
    const n = await notify(user.id, 'urgent', new Date(Date.now() + 60 * 60_000));
    await delivery.dispatch(n.id);
    await eventually(async () => expect((await logs(n.id))[0]?.providerMessageId).toBeTruthy());
    const sid = (await logs(n.id))[0]!.providerMessageId!;
    await fromTwilio('/webhooks/twilio/status', {
      MessageSid: sid,
      MessageStatus: 'undelivered',
      ErrorCode: '63024',
    }).expect(204);
    await eventually(async () =>
      expect((await logs(n.id)).map((r) => [r.channel, r.status])).toEqual([
        ['whatsapp', 'failed'],
        ['sms', 'sent'],
      ]),
    );
    expect((await logs(n.id))[0]!.error).toBe('Twilio undelivered (63024)');
  });

  it("refuses unsigned Twilio requests and Africa's Talking requests without the secret", async () => {
    await request(app)
      .post('/webhooks/twilio/status')
      .type('form')
      .send({ MessageSid: 'x', MessageStatus: 'read' })
      .expect(403);
    await request(app)
      .post('/webhooks/africastalking/wrong-secret/delivery')
      .type('form')
      .send({ id: 'x', status: 'Success' })
      .expect(403);
  });

  it("Africa's Talking delivery report marks the SMS delivered", async () => {
    const { user } = await makeWorker({ usesWhatsApp: false });
    const n = await notify(user.id, 'urgent');
    await delivery.dispatch(n.id);
    await eventually(async () => expect((await logs(n.id))[0]?.providerMessageId).toBeTruthy());
    const id = (await logs(n.id))[0]!.providerMessageId!;
    await request(app)
      .post('/webhooks/africastalking/test-africastalking-secret/delivery')
      .type('form')
      .send({ id, status: 'Success', phoneNumber: user.phone })
      .expect(204);
    const [row] = await logs(n.id);
    expect(row).toMatchObject({ status: 'delivered' });
    expect(row!.deliveredAt).toBeInstanceOf(Date);
  });

  it('WhatsApp STOP turns WhatsApp off for that person (next urgent alert goes by SMS); START turns it back on', async () => {
    const { user } = await makeWorker({ language: 'sw' });
    const stop = await fromTwilio('/webhooks/twilio/inbound', {
      From: `whatsapp:${user.phone}`,
      Body: ' stop ',
    });
    expect(stop.status).toBe(200);
    expect(stop.text).toContain('Hutapokea tena ujumbe wa KaziForce kwenye WhatsApp');
    const saved = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { preference: true },
    });
    expect(saved.whatsappOptedOutAt).toBeInstanceOf(Date);
    expect(
      (saved.preference!.channelSettings as Record<string, { enabled: boolean }>).whatsapp!.enabled,
    ).toBe(false);

    const n = await notify(user.id, 'urgent');
    expect((await delivery.dispatch(n.id))?.now).toEqual(['sms']);

    await fromTwilio('/webhooks/twilio/inbound', {
      From: `whatsapp:${user.phone}`,
      Body: 'START',
    }).expect(200);
    const back = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(back.whatsappOptedOutAt).toBeNull();
  });

  it("Africa's Talking opt-out turns SMS off", async () => {
    const { user } = await makeWorker({ usesWhatsApp: false });
    await request(app)
      .post('/webhooks/africastalking/test-africastalking-secret/optout')
      .type('form')
      .send({ phoneNumber: user.phone, senderId: 'KAZIFORCE' })
      .expect(204);
    const n = await notify(user.id, 'urgent');
    expect((await delivery.dispatch(n.id))?.now).toEqual(['email']);
  });
});

// ---------- FR-4b ----------

describe('channel suggestion (FR-4b)', () => {
  async function urgentOpened(userId: string, openedFirst: 'whatsapp' | 'sms', minutes: number) {
    const n = await notify(userId, 'urgent');
    const sentAt = new Date(Date.now() - 60 * 60_000);
    const at = (m: number) => new Date(sentAt.getTime() + m * 60_000);
    await prisma.deliveryLog.createMany({
      data: [
        {
          notificationId: n.id,
          channel: 'whatsapp',
          status: 'delivered',
          sentAt,
          openedAt: openedFirst === 'whatsapp' ? at(minutes) : null,
        },
        {
          notificationId: n.id,
          channel: 'sms',
          status: 'sent',
          isEscalation: true,
          sentAt: at(10),
          openedAt: openedFirst === 'sms' ? at(10 + minutes) : null,
        },
      ],
    });
  }

  it('needs at least 5 urgent alerts, then suggests SMS once; only "yes" changes the order', async () => {
    const { user, token } = await makeWorker();
    for (let i = 0; i < 4; i++) await urgentOpened(user.id, 'sms', 2);
    let res = await request(app).get('/api/me/channel-suggestion').set(auth(token));
    expect(res.body.suggestion).toBeNull();

    await urgentOpened(user.id, 'sms', 3);
    res = await request(app).get('/api/me/channel-suggestion').set(auth(token));
    expect(res.body.suggestion).toMatchObject({
      channel: 'sms',
      currentFirst: 'whatsapp',
      alerts: 5,
      wins: 5,
      medianMinutes: 2,
    });

    // Nothing changes until the person taps "yes".
    let pref = await prisma.userPreference.findUniqueOrThrow({ where: { userId: user.id } });
    expect(pref.channelOrder).toEqual(['whatsapp', 'sms', 'email']);

    const answer = await request(app)
      .post('/api/me/channel-suggestion')
      .set(auth(token))
      .send({ accept: true });
    expect(answer.status).toBe(200);
    expect(answer.body.user.preference.channelOrder).toEqual(['sms', 'whatsapp', 'email']);
    pref = await prisma.userPreference.findUniqueOrThrow({ where: { userId: user.id } });
    expect(pref.channelSuggestionShownAt).toBeInstanceOf(Date);

    // Shown once only.
    res = await request(app).get('/api/me/channel-suggestion').set(auth(token));
    expect(res.body.suggestion).toBeNull();
  });

  it('no suggestion when the first choice is already the fastest, or it is not clearly faster', async () => {
    const { user, token } = await makeWorker();
    for (let i = 0; i < 6; i++) await urgentOpened(user.id, 'whatsapp', 1);
    expect(
      (await request(app).get('/api/me/channel-suggestion').set(auth(token))).body.suggestion,
    ).toBeNull();

    const mixed = await makeWorker();
    for (const first of ['sms', 'sms', 'sms', 'whatsapp', 'whatsapp'] as const) {
      await urgentOpened(mixed.user.id, first, 2);
    }
    expect(
      (await request(app).get('/api/me/channel-suggestion').set(auth(mixed.token))).body.suggestion,
    ).toBeNull();
    // "No, keep WhatsApp" is not possible without a suggestion.
    await request(app)
      .post('/api/me/channel-suggestion')
      .set(auth(mixed.token))
      .send({ accept: false })
      .expect(409);
  });
});
