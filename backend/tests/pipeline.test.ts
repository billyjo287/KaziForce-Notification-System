// Phase 3 end to end, in one process: REST API + Socket.IO + outbox relay + BullMQ worker, on the
// test database and the "kf-test" queue prefix. Measures and prints in-app latency (NFR-1).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Redis } from 'ioredis';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import type { Role } from '../src/generated/prisma/client.js';
import { logger } from '../src/lib/logger.js';
import { prisma } from '../src/lib/prisma.js';
import {
  createNotificationQueue,
  enqueueNotifications,
  queueConnection,
  type NotificationQueue,
} from '../src/lib/queue.js';
import { redis } from '../src/lib/redis.js';
import { signAccessToken } from '../src/lib/tokens.js';
import type { SerializedNotification } from '../src/modules/notifications/serialize.js';
import { validateNotifications } from '../src/pipeline/createNotifications.js';
import { startNotificationWorker } from '../src/pipeline/notificationWorker.js';
import { startOutboxRelay, type OutboxRelay } from '../src/pipeline/outboxRelay.js';
import { attachRealtime } from '../src/realtime/socketServer.js';
import { auth, login, testApp, uniqueEmail } from './helpers.js';

const app = testApp();
let server: Server;
let baseUrl: string;
let realtime: Awaited<ReturnType<typeof attachRealtime>>;
let subscriber: Redis;
let connection: Redis;
let queue: NotificationQueue;
let worker: ReturnType<typeof startNotificationWorker>;
let relay: OutboxRelay;
const sockets: Socket[] = [];

let employerToken: string;
let employerId: string;
let adminToken: string;
let westlands: string;
let kisumu: string;
let delivery: string;
let painting: string;

beforeAll(async () => {
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;

  subscriber = new Redis(env.REDIS_URL);
  realtime = await attachRealtime(server, {
    frontendOrigin: 'http://localhost:5173',
    prisma,
    subscriber,
    logger,
    prefix: env.QUEUE_PREFIX,
  });
  connection = queueConnection();
  queue = createNotificationQueue(connection);
  worker = startNotificationWorker({
    prisma,
    connection,
    publisher: redis,
    logger,
    prefix: env.QUEUE_PREFIX,
  });
  relay = startOutboxRelay({ prisma, queue, databaseUrl: env.DATABASE_URL, logger });
  await relay.ready;

  const employer = await login(app, 'employer1@example.com');
  employerToken = employer.token;
  employerId = employer.user.id;
  adminToken = (await login(app, 'admin@example.com')).token;
  const place = (slug: string) => prisma.location.findUniqueOrThrow({ where: { slug } });
  const skill = (slug: string) => prisma.skill.findUniqueOrThrow({ where: { slug } });
  westlands = (await place('westlands')).id;
  kisumu = (await place('kisumu')).id;
  delivery = (await skill('delivery')).id;
  painting = (await skill('painting')).id;
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await relay.stop();
  await worker.close();
  await queue.close();
  await realtime.close();
  await Promise.allSettled([connection.quit(), subscriber.quit(), redis.quit()]);
  await prisma.$disconnect();
});

// ---------- helpers ----------

/** A new user straight in the database, with a login token (no password needed). */
async function makeUser(
  role: Role,
  options: { locationId?: string; skillIds?: string[]; language?: 'en' | 'sw' } = {},
) {
  const user = await prisma.user.create({
    data: {
      email: uniqueEmail(role),
      passwordHash: 'not-used',
      name: `Test ${role}`,
      role,
      language: options.language ?? 'en',
      locationId: options.locationId,
      skills: options.skillIds ? { connect: options.skillIds.map((id) => ({ id })) } : undefined,
    },
  });
  return { user, token: signAccessToken(user) };
}

/** Opens a live connection; resolves when connected, rejects with the server's reason. */
function openSocket(token: string | null): Promise<Socket> {
  const socket = connect(baseUrl, {
    auth: token ? { token } : {},
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => reject(error));
  });
}

/** Waits for the next live notification that matches. */
function nextNotification(
  socket: Socket,
  match: (n: SerializedNotification) => boolean = () => true,
  timeoutMs = 5000,
): Promise<SerializedNotification> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('notification:new', onNew);
      reject(new Error('No live notification arrived in time'));
    }, timeoutMs);
    function onNew(n: SerializedNotification) {
      if (!match(n)) return;
      clearTimeout(timer);
      socket.off('notification:new', onNew);
      resolve(n);
    }
    socket.on('notification:new', onNew);
  });
}

/** Retries an assertion until it passes (for things written a moment later). */
async function eventually(check: () => Promise<void>, timeoutMs = 3000) {
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

const inTwoDays = () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.ceil((p / 100) * values.length) - 1]!;

// ---------- tests ----------

describe('live connection (Socket.IO)', () => {
  it('refuses a connection without a valid login token', async () => {
    await expect(openSocket(null)).rejects.toThrow('unauthorized');
    await expect(openSocket('not-a-token')).rejects.toThrow('unauthorized');
  });

  it('refuses a suspended user', async () => {
    const { user, token } = await makeUser('worker');
    await prisma.user.update({ where: { id: user.id }, data: { status: 'suspended' } });
    await expect(openSocket(token)).rejects.toThrow('account_suspended');
  });

  it('closes the live connection when an admin suspends the user', async () => {
    const { user, token } = await makeUser('worker');
    const socket = await openSocket(token);
    const closed = new Promise<string>((resolve) => socket.once('disconnect', resolve));
    const res = await request(app)
      .post(`/api/admin/users/${user.id}/suspend`)
      .set(auth(adminToken))
      .send({ reason: 'Testing live disconnect' });
    expect(res.status).toBe(200);
    expect(await closed).toBe('io server disconnect');
  });
});

describe('business posts a job -> worker receives it live', () => {
  it('delivers job alerts to workers in the same place or with the skill, and nobody else', async () => {
    const samePlace = await makeUser('worker', { locationId: westlands, skillIds: [painting] });
    const sameSkill = await makeUser('worker', {
      locationId: kisumu,
      skillIds: [delivery],
      language: 'sw',
    });
    const neither = await makeUser('worker', { locationId: kisumu, skillIds: [painting] });
    const socket = await openSocket(samePlace.token);
    const swSocket = await openSocket(sameSkill.token);

    const started = performance.now();
    const arrived = nextNotification(socket, (n) => n.type === 'job_alert');
    const arrivedSw = nextNotification(swSocket, (n) => n.type === 'job_alert');
    const res = await request(app).post('/api/jobs').set(auth(employerToken)).send({
      title: 'Evening parcel sorters',
      description: 'Sort parcels at our Westlands depot from 6pm to 10pm.',
      locationId: westlands,
      skillId: delivery,
      pay: 'KSh 1,000',
      deadline: inTwoDays(),
    });
    expect(res.status).toBe(201);
    const alert = await arrived;
    const latencyMs = performance.now() - started;
    console.log(
      `In-app latency, "employer posts job" -> worker's socket: ${latencyMs.toFixed(0)} ms`,
    );

    expect(alert).toMatchObject({
      title: 'Evening parcel sorters',
      priority: 'medium',
      type: 'job_alert',
      link: `/worker/jobs/${res.body.job.id}`,
      location: 'Westlands',
    });
    expect(alert.body).toContain('Apply before');
    // Kiswahili speakers get Kiswahili.
    expect((await arrivedSw).body).toContain('Omba kabla ya');

    // Saved as the pipeline says: classified MEDIUM, not spam, sent, with an in-app delivery row.
    const saved = await prisma.notification.findUniqueOrThrow({
      where: { id: alert.id },
      include: { deliveries: true },
    });
    expect(saved).toMatchObject({ status: 'sent', predictedPriority: 'medium', isSpam: false });
    expect(saved.deliveries).toHaveLength(1);
    expect(saved.deliveries[0]).toMatchObject({ channel: 'in_app' });
    expect(saved.deliveries[0]!.sentAt).toBeInstanceOf(Date);

    // The browser confirms it arrived: deliveredAt is recorded.
    socket.emit('notification:received', { id: alert.id });
    await eventually(async () => {
      const log = await prisma.deliveryLog.findFirstOrThrow({
        where: { notificationId: alert.id },
      });
      expect(log.status).toBe('delivered');
      expect(log.deliveredAt).toBeInstanceOf(Date);
    });

    // Not the same place and not the skill: no alert.
    expect(
      await prisma.notification.count({
        where: { recipientId: neither.user.id, jobId: res.body.job.id },
      }),
    ).toBe(0);
  });

  it('meets the in-app latency target (median under 200 ms over 20 messages)', async () => {
    // Worker and employer need an application to message each other.
    const job = await prisma.job.create({
      data: {
        employerId,
        title: 'Latency test job',
        description: 'Used to measure in-app delivery speed.',
        locationId: kisumu,
        skillId: painting,
        deadline: inTwoDays(),
      },
    });
    const worker = await makeUser('worker', { locationId: kisumu });
    const application = await prisma.application.create({
      data: { jobId: job.id, workerId: worker.user.id },
    });
    const socket = await openSocket(worker.token);

    const latencies: number[] = [];
    for (let i = 0; i < 20; i++) {
      const body = `Latency check ${i}`;
      const started = performance.now();
      const arrived = nextNotification(socket, (n) => n.body === body);
      await request(app)
        .post(`/api/conversations/${application.id}`)
        .set(auth(employerToken))
        .send({ body })
        .expect(201);
      await arrived;
      latencies.push(performance.now() - started);
    }
    const mid = median(latencies);
    console.log(
      `In-app latency over 20 messages (request -> socket): median ${mid.toFixed(0)} ms, ` +
        `95th percentile ${percentile(latencies, 95).toFixed(0)} ms, ` +
        `slowest ${Math.max(...latencies).toFixed(0)} ms`,
    );
    expect(mid).toBeLessThan(200);
  });
});

describe('both sides are notified', () => {
  it('employer gets "New applicant" live; worker gets the status change after the Undo window', async () => {
    const employerSocket = await openSocket(employerToken);
    const job = await prisma.job.create({
      data: {
        employerId,
        title: 'Shop assistant for Saturday',
        description: 'Help in the shop on Saturday.',
        locationId: kisumu,
        skillId: painting,
        deadline: inTwoDays(),
      },
    });
    const worker = await makeUser('worker', { locationId: kisumu });
    const workerSocket = await openSocket(worker.token);

    const newApplicant = nextNotification(employerSocket, (n) => n.title === 'New applicant');
    const applied = await request(app)
      .post(`/api/jobs/${job.id}/apply`)
      .set(auth(worker.token))
      .send({});
    expect(applied.status).toBe(201);
    const applicantAlert = await newApplicant;
    expect(applicantAlert.body).toContain('Shop assistant for Saturday');
    expect(applicantAlert.link).toBe(`/employer/jobs/${job.id}`);

    // Accept, then change to Reject: both events are held for Undo; only the latest is sent.
    const applicationId = applied.body.application.id;
    for (const status of ['accepted', 'rejected']) {
      await request(app)
        .patch(`/api/applications/${applicationId}/status`)
        .set(auth(employerToken))
        .send({ status })
        .expect(200);
    }
    await relay.wake();
    expect(await prisma.notification.count({ where: { recipientId: worker.user.id } })).toBe(0);

    // The Undo window passes.
    const statusResult = nextNotification(workerSocket);
    await prisma.domainEvent.updateMany({
      where: { type: 'application.status_changed', processedAt: null, cancelledAt: null },
      data: { availableAt: new Date() },
    });
    await relay.wake();
    const alert = await statusResult;
    expect(alert.title).toBe('Your application was not successful');
    await relay.wake();
    expect(await prisma.notification.count({ where: { recipientId: worker.user.id } })).toBe(1);
  });

  it('Undo inside the window means the worker is never told', async () => {
    const job = await prisma.job.create({
      data: {
        employerId,
        title: 'Undo test job',
        description: 'Checks that an undone decision is never sent.',
        locationId: kisumu,
        skillId: painting,
        deadline: inTwoDays(),
      },
    });
    const worker = await makeUser('worker');
    const application = await prisma.application.create({
      data: { jobId: job.id, workerId: worker.user.id },
    });
    const accepted = await request(app)
      .patch(`/api/applications/${application.id}/status`)
      .set(auth(employerToken))
      .send({ status: 'accepted' })
      .expect(200);
    await request(app)
      .post(`/api/applications/${application.id}/undo`)
      .set(auth(employerToken))
      .send({ undoId: accepted.body.undoId })
      .expect(200);
    await prisma.domainEvent.update({
      where: { id: accepted.body.undoId },
      data: { availableAt: new Date() },
    });
    await relay.wake();
    expect(await prisma.notification.count({ where: { recipientId: worker.user.id } })).toBe(0);
  });

  it('admin announcements reach everyone in the chosen audience', async () => {
    const employerSocket = await openSocket(employerToken);
    const arrived = nextNotification(employerSocket, (n) => n.type === 'announcement');
    const res = await request(app).post('/api/admin/announcements').set(auth(adminToken)).send({
      audience: 'business',
      title: 'Holiday opening hours',
      message: 'KaziForce support is closed on Monday for the public holiday.',
    });
    expect(res.status).toBe(201);
    const alert = await arrived;
    expect(alert).toMatchObject({ sender: 'KaziForce', title: 'Holiday opening hours' });

    const recipients = await prisma.notification.findMany({
      where: { type: 'announcement', title: 'Holiday opening hours' },
      select: { recipientRole: true },
    });
    const employers = await prisma.user.count({ where: { role: 'business', status: 'active' } });
    expect(recipients).toHaveLength(employers);
    expect(new Set(recipients.map((r) => r.recipientRole))).toEqual(new Set(['business']));
    expect(
      await prisma.auditLog.count({
        where: { action: 'announcement.sent', targetId: res.body.announcementId },
      }),
    ).toBe(1);
  });
});

describe('interaction tracking', () => {
  it('records opened and clicked when the main action is used', async () => {
    const worker = await makeUser('worker', { locationId: westlands });
    const socket = await openSocket(worker.token);
    const arrived = nextNotification(socket);
    await request(app).post('/api/admin/announcements').set(auth(adminToken)).send({
      audience: 'worker',
      title: 'Tracking test',
      message: 'Checks opened and clicked times.',
    });
    const alert = await arrived;

    const res = await request(app)
      .patch('/api/notifications')
      .set(auth(worker.token))
      .send({ ids: [alert.id], clicked: true });
    expect(res.status).toBe(200);
    expect(res.body.items[0].readAt).toBeTruthy();
    const log = await prisma.deliveryLog.findFirstOrThrow({ where: { notificationId: alert.id } });
    expect(log.openedAt).toBeInstanceOf(Date);
    expect(log.clickedAt).toBeInstanceOf(Date);
  });

  it('catch-up: the list includes alerts sent while offline and marks them delivered', async () => {
    const worker = await makeUser('worker');
    const [notification] = await prisma.notification.createManyAndReturn({
      data: [
        {
          recipientId: worker.user.id,
          recipientRole: 'worker',
          senderRole: 'system',
          type: 'announcement',
          category: 'announcement',
          title: 'Sent while you were away',
          message: 'You were offline when this was sent.',
        },
      ],
    });
    await enqueueNotifications(queue, [notification!.id]);
    await eventually(async () => {
      const saved = await prisma.notification.findUniqueOrThrow({
        where: { id: notification!.id },
      });
      expect(saved.status).toBe('sent');
    });

    const res = await request(app).get('/api/notifications').set(auth(worker.token));
    expect(res.body.items.map((n: { title: string }) => n.title)).toContain(
      'Sent while you were away',
    );
    const log = await prisma.deliveryLog.findFirstOrThrow({
      where: { notificationId: notification!.id },
    });
    expect(log.deliveredAt).toBeInstanceOf(Date);
  });
});

describe('reliability', () => {
  it('the sweeper re-queues notifications left in QUEUED (e.g. Redis was down)', async () => {
    const worker = await makeUser('worker');
    const socket = await openSocket(worker.token);
    const arrived = nextNotification(socket);
    await prisma.notification.create({
      data: {
        recipientId: worker.user.id,
        recipientRole: 'worker',
        senderRole: 'system',
        type: 'announcement',
        category: 'announcement',
        title: 'Left behind',
        message: 'This one was never put on the queue.',
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    await relay.sweep();
    expect((await arrived).title).toBe('Left behind');
  });

  it('a failing event is retried later instead of blocking the others', async () => {
    const broken = await prisma.domainEvent.create({
      data: { type: 'job.posted', payload: { jobId: 'not-a-valid-id' } },
    });
    await relay.wake();
    const after = await prisma.domainEvent.findUniqueOrThrow({ where: { id: broken.id } });
    expect(after.processedAt).toBeNull();
    expect(after.attempts).toBe(1);
    expect(after.lastError).toBeTruthy();
    expect(after.availableAt.getTime()).toBeGreaterThan(Date.now());
    // Tidy up so it does not keep retrying in the background.
    await prisma.domainEvent.update({
      where: { id: broken.id },
      data: { cancelledAt: new Date() },
    });
  });

  it('events older than 24 hours are set aside without sending anything', async () => {
    const old = await prisma.domainEvent.create({
      data: {
        type: 'admin.announcement',
        payload: { adminId: employerId, audience: 'everyone', title: 'Old', message: 'Old news' },
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });
    await relay.wake();
    const after = await prisma.domainEvent.findUniqueOrThrow({ where: { id: old.id } });
    expect(after.processedAt).toBeInstanceOf(Date);
    expect(after.lastError).toBe('Skipped: older than 24 hours');
    expect(await prisma.notification.count({ where: { title: 'Old' } })).toBe(0);
  });
});

describe('input contract (DR-3)', () => {
  const valid = {
    type: 'message',
    category: 'message',
    recipientId: '5f4d3c2b-1a09-4e8d-9c7b-6a5f4e3d2c1b',
    recipientRole: 'worker',
    senderId: null,
    senderRole: 'system',
    title: 'Hello',
    message: 'A short message.',
    link: null,
    jobId: null,
    deadlineAt: null,
    createdAt: new Date(),
  };

  it('accepts a complete notification and shortens a long title', () => {
    const { valid: ok, rejected } = validateNotifications([{ ...valid, title: 'x'.repeat(200) }]);
    expect(rejected).toHaveLength(0);
    expect(ok[0]!.title).toHaveLength(120);
    expect(ok[0]!.title.endsWith('…')).toBe(true);
  });

  it('rejects a missing recipient, missing text or text over 1,000 characters', () => {
    const { valid: ok, rejected } = validateNotifications([
      { ...valid, recipientId: undefined },
      { ...valid, message: '   ' },
      { ...valid, message: 'a'.repeat(1001) },
      { ...valid, type: 'unknown' },
    ]);
    expect(ok).toHaveLength(0);
    expect(rejected).toHaveLength(4);
    expect(rejected[0]!.problems.join()).toContain('recipientId');
  });
});
