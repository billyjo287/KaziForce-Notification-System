// Phase 7: admin monitoring and review (PRD FR-3, FR-7, FR-9), the anonymised training export,
// and the employer's view of the alerts they caused.
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Channel, Priority } from '../src/generated/prisma/client.js';
import { prisma } from '../src/lib/prisma.js';
import { closeApiQueues, queueConnection } from '../src/lib/queue.js';
import { redis } from '../src/lib/redis.js';
import { nairobiDayStart } from '../src/modules/admin/monitoringRoutes.js';
import {
  CSV_COLUMNS,
  csvValue,
  makeScrubber,
  namesToScrub,
} from '../src/modules/admin/trainingExport.js';
import { startNotificationWorker } from '../src/pipeline/notificationWorker.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, auth, login, testApp, uniqueEmail } from './helpers.js';

const app = testApp();
let admin: string;
let worker1: string;

beforeAll(async () => {
  admin = (await login(app, ADMIN_EMAIL, ADMIN_PASSWORD)).token;
  worker1 = (await login(app, 'worker1@example.com')).token;
});

afterAll(async () => {
  await closeApiQueues();
  await Promise.allSettled([redis.quit()]);
  await prisma.$disconnect();
});

const get = (path: string, token = admin) => request(app).get(`/api${path}`).set(auth(token));
const post = (path: string, body: object = {}, token = admin) =>
  request(app).post(`/api${path}`).set(auth(token)).send(body);

async function person(name = 'Admin Test Person', role: 'worker' | 'business' = 'worker') {
  return prisma.user.create({
    data: {
      email: uniqueEmail('admin7'),
      passwordHash: 'not-used',
      name,
      role,
      onboardingCompletedAt: new Date(),
    },
  });
}

async function notification(
  recipientId: string,
  data: Partial<{
    title: string;
    message: string;
    status: 'sent' | 'blocked' | 'queued';
    isSpam: boolean;
    predictedPriority: Priority;
    senderId: string;
    jobId: string;
    category: string;
    readAt: Date;
  }> = {},
) {
  return prisma.notification.create({
    data: {
      recipientId,
      recipientRole: 'worker',
      senderRole: 'business',
      type: 'message',
      category: data.category ?? 'message',
      title: data.title ?? 'New message',
      message: data.message ?? 'Hello',
      status: data.status ?? 'sent',
      isSpam: data.isSpam ?? false,
      predictedPriority: data.predictedPriority ?? 'medium',
      modelVersion: 'rules-v0',
      predictionSource: 'rules',
      senderId: data.senderId,
      jobId: data.jobId,
      readAt: data.readAt,
    },
  });
}

const log = (notificationId: string, channel: Channel, status: string, attempt = 1) =>
  prisma.deliveryLog.create({
    data: {
      notificationId,
      channel,
      attempt,
      status: status as 'sent',
      error: status === 'failed' ? 'Test provider: network timeout' : null,
      sentAt: status === 'sent' ? new Date() : null,
    },
  });

describe('admin only', () => {
  it('workers and employers cannot open any admin page', async () => {
    for (const path of ['/admin/overview', '/admin/delivery-logs', '/admin/models']) {
      expect((await get(path, worker1)).status).toBe(403);
    }
    expect((await get('/admin/export/training.csv', worker1)).status).toBe(403);
  });
});

describe('overview', () => {
  it('counts each message once per channel: retries that got through are a success', async () => {
    const before = (await get('/admin/overview')).body;
    const worker = await person();
    // WhatsApp failed twice, then got through; SMS gave up after 3 tries; email is still trying.
    const a = await notification(worker.id);
    await log(a.id, 'whatsapp', 'failed', 1);
    await log(a.id, 'whatsapp', 'failed', 2);
    await log(a.id, 'whatsapp', 'sent', 3);
    const b = await notification(worker.id);
    for (const attempt of [1, 2, 3]) await log(b.id, 'sms', 'failed', attempt);
    await log(b.id, 'email', 'pending');

    const after = (await get('/admin/overview')).body;
    const diff = (channel: string, key: 'delivered' | 'failed' | 'pending') =>
      after.channels.last24h.find((c: { channel: string }) => c.channel === channel)[key] -
      before.channels.last24h.find((c: { channel: string }) => c.channel === channel)[key];
    expect(diff('whatsapp', 'delivered')).toBe(1);
    expect(diff('whatsapp', 'failed')).toBe(0);
    expect(diff('sms', 'failed')).toBe(1);
    expect(diff('email', 'pending')).toBe(1);
    expect(after.today.failedDeliveries - before.today.failedDeliveries).toBe(1);
    expect(after.today.notifications - before.today.notifications).toBe(2);
    expect(after.recentFailures[0]).toMatchObject({ channel: 'sms', notification: { id: b.id } });

    // Seven days includes the last 24 hours; queue sizes come from Redis.
    const sms7d = after.channels.last7d.find((c: { channel: string }) => c.channel === 'sms');
    expect(sms7d.failed).toBeGreaterThanOrEqual(1);
    expect(after.queues.map((q: { name: string }) => q.name)).toEqual([
      'notifications',
      'channel-whatsapp',
      'channel-sms',
      'channel-email',
      'escalation',
      'held',
    ]);
  });

  it('"today" starts at midnight in Nairobi, not UTC', () => {
    // 22:30 UTC on 1 Oct is 01:30 on 2 Oct in Nairobi: today began at 21:00 UTC on 1 Oct.
    expect(nairobiDayStart(new Date('2026-10-01T22:30:00Z'))).toEqual(
      new Date('2026-10-01T21:00:00Z'),
    );
    expect(nairobiDayStart(new Date('2026-10-01T20:59:00Z'))).toEqual(
      new Date('2026-09-30T21:00:00Z'),
    );
  });
});

describe('delivery log', () => {
  it('filters by channel, status and Nairobi date, newest first, with the alert it belongs to', async () => {
    const worker = await person('Delivery Log Person');
    const n = await notification(worker.id, { title: 'Filter me', predictedPriority: 'urgent' });
    await log(n.id, 'sms', 'failed', 1);
    await log(n.id, 'sms', 'failed', 2);

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const res = await get(
      `/admin/delivery-logs?channel=sms&status=failed&from=${today}&to=${today}`,
    );
    expect(res.status).toBe(200);
    const mine = res.body.items.filter(
      (i: { notification: { id: string } }) => i.notification.id === n.id,
    );
    expect(mine.map((i: { attempt: number }) => i.attempt)).toEqual([2, 1]);
    expect(mine[0]).toMatchObject({
      channel: 'sms',
      status: 'failed',
      error: 'Test provider: network timeout',
      notification: {
        title: 'Filter me',
        priority: 'urgent',
        recipient: { name: 'Delivery Log Person' },
      },
    });
    expect(
      res.body.items.every(
        (i: { channel: string; status: string }) => i.channel === 'sms' && i.status === 'failed',
      ),
    ).toBe(true);

    const yesterday = new Date(Date.now() - 2 * 86_400_000).toLocaleDateString('en-CA', {
      timeZone: 'Africa/Nairobi',
    });
    const old = await get(`/admin/delivery-logs?channel=sms&to=${yesterday}`);
    expect(
      old.body.items.some((i: { notification: { id: string } }) => i.notification.id === n.id),
    ).toBe(false);
    expect((await get('/admin/delivery-logs?from=yesterday')).status).toBe(400);
  });
});

describe('spam review', () => {
  it('confirm block: stays blocked, leaves the review list, is saved as a label and audited', async () => {
    const worker = await person();
    const n = await notification(worker.id, {
      status: 'blocked',
      isSpam: true,
      predictedPriority: 'low',
    });
    let list = (await get('/admin/review/spam')).body.items;
    expect(list.some((i: { id: string }) => i.id === n.id)).toBe(true);

    expect((await post(`/admin/review/spam/${n.id}/confirm`)).status).toBe(200);
    const saved = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(saved).toMatchObject({ status: 'blocked', correctedSpam: true });
    expect(saved.correctedById).not.toBeNull();
    list = (await get('/admin/review/spam')).body.items;
    expect(list.some((i: { id: string }) => i.id === n.id)).toBe(false);
    const audit = await prisma.auditLog.findFirst({ where: { targetId: n.id } });
    expect(audit?.action).toBe('notification.spam_confirmed');

    // Someone already decided: a second decision is refused.
    expect((await post(`/admin/review/spam/${n.id}/release`)).status).toBe(409);
  });

  it('release: delivered now with the chosen priority, without being classified (and blocked) again', async () => {
    const worker = await person();
    // Text the rules would block again if it were classified again.
    const n = await notification(worker.id, {
      status: 'blocked',
      isSpam: true,
      predictedPriority: 'low',
      message: 'Send KSh 500 registration fee NOW!!!',
    });
    const res = await post(`/admin/review/spam/${n.id}/release`, { priority: 'urgent' });
    expect(res.status).toBe(200);
    expect(await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).toMatchObject({
      status: 'queued',
      correctedSpam: false,
      correctedPriority: 'urgent',
    });

    // The worker picks up the release job.
    const connection = queueConnection();
    const worker2 = startNotificationWorker({
      prisma,
      connection,
      publisher: redis,
      logger: pino({ level: 'silent' }),
      prefix: 'kf-test',
      mlServiceUrl: 'http://127.0.0.1:9', // nothing there: only the rules could answer
      mlTimeoutMs: 200,
    });
    try {
      await expect
        .poll(
          async () => (await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).status,
          {
            timeout: 8000,
          },
        )
        .toBe('sent');
      const sent = await prisma.notification.findUniqueOrThrow({
        where: { id: n.id },
        include: { deliveries: true },
      });
      // The model's answer is kept next to the correction: both are training data.
      expect(sent).toMatchObject({
        isSpam: true,
        correctedSpam: false,
        correctedPriority: 'urgent',
      });
      expect(sent.deliveries.map((d) => d.channel)).toEqual(['in_app']);
    } finally {
      await worker2.close();
      await connection.quit();
    }
  });

  it('correct the priority of any alert; choosing the predicted one clears the correction', async () => {
    const worker = await person();
    const n = await notification(worker.id, { predictedPriority: 'medium' });
    let res = await post(`/admin/notifications/${n.id}/priority`, { priority: 'low' });
    expect(res.body).toEqual({ priority: 'low', correctedPriority: 'low' });
    res = await post(`/admin/notifications/${n.id}/priority`, { priority: 'medium' });
    expect(res.body).toEqual({ priority: 'medium', correctedPriority: null });
    const actions = await prisma.auditLog.findMany({ where: { targetId: n.id } });
    expect(actions.map((a) => a.action)).toEqual([
      'notification.priority_corrected',
      'notification.priority_corrected',
    ]);
    expect((await post(`/admin/notifications/${n.id}/priority`, { priority: 'huge' })).status).toBe(
      400,
    );
  });
});

describe('announcements', () => {
  it('says how many people an audience reaches before sending', async () => {
    const workers = await prisma.user.count({
      where: { role: 'worker', status: 'active', deletionRequestedAt: null },
    });
    const everyone = await prisma.user.count({
      where: { role: { in: ['worker', 'business'] }, status: 'active', deletionRequestedAt: null },
    });
    expect((await get('/admin/announcements/audience?audience=worker')).body).toEqual({
      people: workers,
    });
    expect((await get('/admin/announcements/audience?audience=everyone')).body).toEqual({
      people: everyone,
    });
  });
});

describe('model versions', () => {
  it('lists MLMetadata with the active version and how much each one classified', async () => {
    const res = await get('/admin/models');
    const rules = res.body.models.find((m: { version: string }) => m.version === 'rules-v0');
    expect(rules).toMatchObject({ algorithm: 'rules', isActive: true });
    expect(rules.classified).toBeGreaterThan(0);
    expect(res.body.models.filter((m: { isActive: boolean }) => m.isActive)).toHaveLength(1);
  });
});

describe('anonymised training export', () => {
  it('no ids, names, phones or emails; tokens stable within the file; labels and response time', async () => {
    const worker = await person('Zawadi Testperson');
    const sender = await person('Baraka Movers Ltd Owner', 'business');
    await prisma.user.update({ where: { id: sender.id }, data: { companyName: 'Baraka Movers' } });
    const read = await notification(worker.id, {
      senderId: sender.id,
      title: 'New message from Baraka Movers',
      message: 'Zawadi, call 0712 345 678 or write to boss@baraka.co.ke about the job.',
      predictedPriority: 'medium',
    });
    await prisma.deliveryLog.create({
      data: {
        notificationId: read.id,
        channel: 'in_app',
        status: 'delivered',
        sentAt: new Date(Date.now() - 90_000),
        deliveredAt: new Date(Date.now() - 89_000),
      },
    });
    await prisma.notification.update({
      where: { id: read.id },
      data: { readAt: new Date(), correctedPriority: 'urgent' },
    });
    await notification(worker.id, { title: 'Second one', message: 'Hello again' });

    const res = await get('/admin/export/training.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const text = res.text.replace(/^\uFEFF/, '');
    const [header, ...lines] = text.trim().split('\r\n');
    expect(header).toBe(CSV_COLUMNS.join(','));

    // Nothing personal anywhere in the file.
    for (const secret of [
      worker.id,
      sender.id,
      read.id,
      'Zawadi',
      'Baraka',
      '0712',
      'baraka.co.ke',
      worker.email,
    ]) {
      expect(text).not.toContain(secret);
    }

    const rows = lines.map((l) =>
      l
        .match(/("([^"]|"")*"|[^,]*)(,|$)/g)!
        .map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')),
    );
    const col = (name: (typeof CSV_COLUMNS)[number]) => CSV_COLUMNS.indexOf(name);
    const mine = rows.find((r) => r[col('text')]!.startsWith('[NAME], call [PHONE]'))!;
    expect(mine[col('text')]).toBe('[NAME], call [PHONE] or write to [EMAIL] about the job.');
    expect(mine[col('title')]).toBe('New message from [NAME]');
    expect(mine[col('predicted_priority')]).toBe('medium');
    expect(mine[col('corrected_priority')]).toBe('urgent');
    expect(mine[col('label_priority')]).toBe('urgent');
    expect(mine[col('opened')]).toBe('true');
    expect(mine[col('opened_via')]).toBe('in_app');
    expect(Number(mine[col('response_seconds')])).toBeGreaterThanOrEqual(89);
    // The same person has the same token in this file, so their history still counts.
    const second = rows.find((r) => r[col('title')] === 'Second one')!;
    expect(second[col('recipient_token')]).toBe(mine[col('recipient_token')]);
    expect(mine[col('recipient_token')]).toMatch(/^[\w-]{12}$/);

    // A new export gives new tokens: files cannot be joined back together.
    const again = (await get('/admin/export/training.csv')).text;
    expect(again).not.toContain(mine[col('recipient_token')]!);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'export.training_data' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });

  it('scrubs names only as whole words, and defuses spreadsheet formulas', () => {
    const scrub = makeScrubber(namesToScrub([{ name: 'Ann Wambui', companyName: null }]));
    // "Ann" alone is too short to scrub as a part (it could be a normal word); the full name is.
    expect(scrub('Ann Wambui applied. Wambui is great. Annual leave.')).toBe(
      '[NAME] applied. [NAME] is great. Annual leave.',
    );
    expect(csvValue('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvValue(-5)).toBe('-5');
    expect(csvValue('a,b')).toBe('"a,b"');
  });
});

describe('employer: did the people I contacted get it?', () => {
  it("job alert totals by state, and each applicant's latest update and message", async () => {
    const employer = await prisma.user.findUniqueOrThrow({
      where: { email: 'employer1@example.com' },
    });
    const [location, skill] = await Promise.all([
      prisma.location.findFirstOrThrow(),
      prisma.skill.findFirstOrThrow(),
    ]);
    const job = await prisma.job.create({
      data: {
        employerId: employer.id,
        title: 'Delivery status test job',
        description: 'A job to check delivery status.',
        locationId: location.id,
        skillId: skill.id,
        deadline: new Date(Date.now() + 86_400_000),
      },
    });
    const [a, b, c, applicant] = await Promise.all([person(), person(), person(), person()]);
    const alert = (recipientId: string, extra = {}) =>
      notification(recipientId, {
        senderId: employer.id,
        jobId: job.id,
        category: 'new_job',
        ...extra,
      });
    await alert(a.id, { readAt: new Date() }); // seen
    const delivered = await alert(b.id);
    await prisma.deliveryLog.create({
      data: {
        notificationId: delivered.id,
        channel: 'in_app',
        status: 'delivered',
        deliveredAt: new Date(),
      },
    });
    await alert(c.id, { status: 'blocked' }); // not delivered
    await prisma.application.create({ data: { jobId: job.id, workerId: applicant.id } });
    await notification(applicant.id, {
      senderId: employer.id,
      jobId: job.id,
      category: 'application_update',
      readAt: new Date(),
    });
    await notification(applicant.id, { senderId: employer.id, jobId: job.id, category: 'message' });

    const token = (await login(app, 'employer1@example.com')).token;
    const res = await get(`/employer/jobs/${job.id}`, token);
    expect(res.status).toBe(200);
    expect(res.body.delivery.jobAlert).toEqual({
      total: 3,
      seen: 1,
      delivered: 1,
      sent: 0,
      waiting: 0,
      not_delivered: 1,
    });
    expect(res.body.delivery.applicants[applicant.id]).toEqual({
      statusUpdate: 'seen',
      message: 'sent',
    });
    // Workers who only got the job alert are never named: only totals.
    expect(res.body.delivery.applicants[a.id]).toBeUndefined();
  });
});
