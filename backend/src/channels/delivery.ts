// Delivery on external channels (PRD FR-4, FR-7), run by the worker process.
//
//   dispatch()   after the in-app delivery: asks the router which channels to use now, adds one
//                job per channel to that channel's queue, and (urgent) a delayed escalation check.
//   send job     one message on one channel: a DeliveryLog row per try (with the provider's
//                message id or the error), 3 tries with exponential backoff. When a channel gives
//                up on an urgent alert, the next channel is tried at once.
//   escalation   when the window ends: if the alert is still unopened (in the app, by a tracked
//                link, or a WhatsApp "read"), send it on the next channel; save escalatedAt/To.
//   held         quiet hours (FR-5): a non-urgent alert waits until they end, then is planned
//                again with the settings of that moment (skipped if already opened in the app).
//
// Nobody gets outside messages while their account is suspended or being deleted.
import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Priority, PrismaClient } from '../generated/prisma/client.js';
import {
  ESCALATION_JOB,
  ESCALATION_QUEUE,
  HELD_JOB,
  HELD_QUEUE,
  channelQueueName,
  type ChannelJobData,
  type EscalationJobData,
  type HeldJobData,
} from '../lib/queue.js';
import type { UserPreferenceManager } from '../preferences/UserPreferenceManager.js';
import { SendError, type OutgoingMessage, type Recipient } from './ChannelAdapter.js';
import { emailContent, shortText, summaryFor } from './messages.js';
import {
  nextChannel,
  planDelivery,
  usableChannels,
  type Adapters,
  type ExternalChannel,
} from './router.js';
import { trackedLinkFor } from './trackedLinks.js';

export interface DeliveryOptions {
  prisma: PrismaClient;
  /**
   * BullMQ connection (maxRetriesPerRequest: null). Give delivery its OWN connection: sharing the
   * notification queue's makes in-app alerts wait behind channel work.
   */
  connection: Redis;
  prefix: string;
  logger: Logger;
  adapters: Adapters;
  /** Cached preferences (Redis), cleared whenever the person changes them. */
  preferences: UserPreferenceManager;
  publicApiUrl: string;
  publicAppUrl: string;
  windowMinutes: number;
  retryDelayMs: number;
  concurrency?: number;
  /** The current time (tests set it to check quiet hours). */
  now?: () => Date;
}

const include = {
  recipient: {
    select: {
      id: true,
      role: true,
      language: true,
      email: true,
      phone: true,
      phoneVerified: true,
      consentSmsWhatsapp: true,
      usesWhatsApp: true,
      whatsappOptedOutAt: true,
      smsOptedOutAt: true,
      status: true,
      deletionRequestedAt: true,
    },
  },
  deliveries: { select: { channel: true, openedAt: true, clickedAt: true } },
} as const;

type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;

function load(prisma: PrismaClient, notificationId: string) {
  return prisma.notification.findUnique({ where: { id: notificationId }, include });
}

const priorityOf = (n: Loaded): Priority => n.correctedPriority ?? n.predictedPriority ?? 'medium';

/** Opened anywhere: in the app, through a tracked link, or a WhatsApp "read" report. */
const isOpened = (n: Loaded) =>
  n.readAt !== null || n.deliveries.some((d) => d.openedAt !== null || d.clickedAt !== null);

const recipientOf = (n: Loaded): Recipient => n.recipient;

/** Suspended accounts and accounts waiting to be deleted get nothing outside the app. */
const reachable = (n: Loaded) =>
  n.recipient.status === 'active' && n.recipient.deletionRequestedAt === null;

export function startDelivery(options: DeliveryOptions) {
  const { prisma, connection, prefix, logger, adapters, preferences } = options;
  const clock = options.now ?? (() => new Date());
  const channels = Object.keys(adapters) as ExternalChannel[];
  const queueOptions = {
    connection,
    prefix,
    defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
  };
  const queues = new Map(
    channels.map((c) => [c, new Queue<ChannelJobData>(channelQueueName(c), queueOptions)]),
  );
  const escalationQueue = new Queue<EscalationJobData>(ESCALATION_QUEUE, queueOptions);
  const heldQueue = new Queue<HeldJobData>(HELD_QUEUE, queueOptions);

  async function enqueueSend(
    notificationId: string,
    channel: ExternalChannel,
    isEscalation: boolean,
  ) {
    await queues.get(channel)!.add(
      `send.${channel}`,
      { notificationId, channel, isEscalation },
      {
        // One send per notification and channel, even if two escalation paths meet.
        jobId: `${notificationId}-${channel}`,
        attempts: adapters[channel]!.attempts,
        backoff: { type: 'exponential', delay: options.retryDelayMs },
      },
    );
  }

  /**
   * Right after the in-app delivery: send on the planned channels and schedule the escalation
   * check, or hold everything until the quiet hours end. Runs again when a held alert is released.
   */
  async function dispatch(notificationId: string) {
    const n = await load(prisma, notificationId);
    if (!n || n.recipient.role === 'admin' || !reachable(n)) return null;
    const now = clock();
    // The job has closed: a message outside the app would only waste the person's time.
    if (n.deadlineAt && n.deadlineAt <= now) return null;
    // Released after quiet hours, but the person has already seen it in the app.
    if (n.heldUntil && isOpened(n)) return null;

    const plan = planDelivery({
      priority: priorityOf(n),
      preferences: await preferences.get(n.recipientId),
      recipient: recipientOf(n),
      adapters,
      deadlineAt: n.deadlineAt,
      now,
      windowMinutes: options.windowMinutes,
    });
    if (plan.heldUntil) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { heldUntil: plan.heldUntil },
      });
      await heldQueue.add(
        HELD_JOB,
        { notificationId },
        {
          // The time is part of the id: if it is held again later, that is a new job.
          jobId: `${notificationId}-held-${plan.heldUntil.getTime()}`,
          delay: plan.heldUntil.getTime() - now.getTime(),
        },
      );
      return plan;
    }
    for (const channel of plan.now) await enqueueSend(notificationId, channel, false);
    if (plan.escalation) {
      await escalationQueue.add(
        ESCALATION_JOB,
        { notificationId, reason: 'window' },
        { jobId: `${notificationId}-window`, delay: plan.escalation.windowMs },
      );
    }
    return plan;
  }

  /** The safety net: the next usable channel, if the urgent alert still needs one. */
  async function escalate(notificationId: string, reason: EscalationJobData['reason']) {
    const n = await load(prisma, notificationId);
    if (!n || !reachable(n) || priorityOf(n) !== 'urgent' || isOpened(n)) return null;
    // The window check escalates once; a failure always moves on (so a message gets through).
    if (reason === 'window' && n.escalatedAt) return null;
    const usable = usableChannels(
      'urgent',
      await preferences.get(n.recipientId),
      recipientOf(n),
      adapters,
    );
    const next = nextChannel(
      usable,
      n.deliveries.map((d) => d.channel),
    );
    if (!next) return null;
    await prisma.notification.update({
      where: { id: notificationId },
      data: { escalatedAt: new Date(), escalatedTo: next },
    });
    await enqueueSend(notificationId, next, true);
    logger.info({ notificationId, to: next, reason }, 'Urgent alert escalated');
    return next;
  }

  async function buildMessage(n: Loaded, channel: ExternalChannel, to: string) {
    const priority = priorityOf(n);
    const { language } = n.recipient;
    const summary = summaryFor(n.category, priority, language);
    const link = await trackedLinkFor(prisma, options.publicApiUrl, n.id, channel);
    const message: OutgoingMessage = {
      notificationId: n.id,
      to,
      language,
      summary,
      link,
      text: shortText(summary, link, priority, language),
    };
    if (channel === 'email') {
      const side = n.recipientRole === 'business' ? 'employer' : 'worker';
      const email = emailContent({
        summary,
        link,
        priority,
        language,
        settingsUrl: `${options.publicAppUrl.replace(/\/$/, '')}/${side}/settings`,
      });
      Object.assign(message, email);
    }
    return message;
  }

  /** One try of one message on one channel. */
  async function send(job: Job<ChannelJobData>) {
    const { notificationId, isEscalation } = job.data;
    const channel = job.data.channel as ExternalChannel;
    const adapter = adapters[channel];
    const n = await load(prisma, notificationId);
    if (!adapter || !n || !reachable(n)) return 'gone';
    const attempt = job.attemptsMade + 1;
    const lastTry = attempt >= (job.opts.attempts ?? adapter.attempts);

    const log = await prisma.deliveryLog.create({
      data: { notificationId, channel, attempt, status: 'pending', isEscalation },
    });
    try {
      // Checked on every try: the person may have opted out or changed settings meanwhile.
      const to = adapter.addressFor(recipientOf(n));
      if (!to) throw new SendError('This channel can no longer reach the person', false);
      const result = await adapter.send(await buildMessage(n, channel, to));
      await prisma.deliveryLog.update({
        where: { id: log.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
        },
      });
      return 'sent';
    } catch (error) {
      const retryable = !(error instanceof SendError) || error.retryable;
      const message = error instanceof Error ? error.message : String(error);
      await prisma.deliveryLog.update({
        where: { id: log.id },
        data: { status: 'failed', error: message.slice(0, 500) },
      });
      if (!retryable || lastTry) {
        logger.warn({ notificationId, channel, attempt, error: message }, 'Channel gave up');
        await escalate(notificationId, 'failed');
      }
      if (!retryable) throw new UnrecoverableError(message);
      throw error;
    }
  }

  const workerOptions = { connection, prefix, concurrency: options.concurrency ?? 10 };
  const workers = [
    ...channels.map((c) => new Worker<ChannelJobData>(channelQueueName(c), send, workerOptions)),
    new Worker<EscalationJobData>(
      ESCALATION_QUEUE,
      (job) => escalate(job.data.notificationId, job.data.reason),
      workerOptions,
    ),
    new Worker<HeldJobData>(HELD_QUEUE, (job) => dispatch(job.data.notificationId), workerOptions),
  ];
  for (const worker of workers) {
    worker.on('error', (error) => logger.error({ err: error }, 'Delivery worker error'));
  }

  return {
    dispatch,
    escalate,
    queues,
    escalationQueue,
    heldQueue,
    async close() {
      await Promise.all(workers.map((w) => w.close()));
      await Promise.all([...queues.values(), escalationQueue, heldQueue].map((q) => q.close()));
    },
  };
}

export type Delivery = ReturnType<typeof startDelivery>;
