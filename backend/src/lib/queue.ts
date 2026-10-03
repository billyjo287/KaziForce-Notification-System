// The BullMQ job queues (stored in Redis):
//   notifications     "notification.process": classify, deliver in-app, plan external channels
//   channel-<name>    one queue per external channel (whatsapp, sms, email): one send each,
//                     3 tries with exponential backoff, one DeliveryLog row per try
//   escalation        "escalation.check" jobs, delayed until the urgent escalation window ends
//   held              "held.release" jobs, delayed until the person's quiet hours end
//   scheduled         repeatable jobs: the daily summary (08:00) and the retention cleanup
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/**
 * Settings every BullMQ worker shares, to keep idle Redis traffic low (docs/DEPLOYMENT.md,
 * section 8). drainDelay: how long a waiting worker's request to Redis lasts when there is
 * nothing to do (a new job wakes it at once, so this adds no delay). stalledInterval: how often
 * it checks for jobs left half-done by a crashed worker.
 */
export const idleFriendly = () => ({
  drainDelay: env.QUEUE_DRAIN_DELAY_SECONDS,
  stalledInterval: env.QUEUE_STALLED_CHECK_SECONDS * 1000,
});

export const NOTIFICATION_QUEUE = 'notifications';
export const PROCESS_JOB = 'notification.process';

export interface ProcessJobData {
  notificationId: string;
}

/**
 * A Redis connection for BullMQ. maxRetriesPerRequest: null is what BullMQ requires: commands
 * wait while Redis is briefly down instead of failing, so no queued job is lost (NFR-3).
 */
export function queueConnection(url = env.REDIS_URL) {
  // family 0: the address may be IPv4 or IPv6 (Railway's private network; docs/DEPLOYMENT.md).
  return new Redis(url, { maxRetriesPerRequest: null, family: 0 });
}

export function createNotificationQueue(connection: Redis, prefix = env.QUEUE_PREFIX) {
  return new Queue<ProcessJobData>(NOTIFICATION_QUEUE, {
    connection,
    prefix,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      // Keep a short history in Redis for debugging; the database keeps the real record.
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}

export type NotificationQueue = ReturnType<typeof createNotificationQueue>;

/** Adds one "notification.process" job per notification. The job id is the notification id,
 *  so adding the same notification twice does nothing. */
export async function enqueueNotifications(queue: NotificationQueue, ids: string[]) {
  if (ids.length === 0) return;
  await queue.addBulk(
    ids.map((notificationId) => ({
      name: PROCESS_JOB,
      data: { notificationId },
      opts: { jobId: notificationId },
    })),
  );
}

export const channelQueueName = (channel: string) => `channel-${channel}`;
export const ESCALATION_QUEUE = 'escalation';
export const ESCALATION_JOB = 'escalation.check';

export interface ChannelJobData {
  notificationId: string;
  channel: string;
  /** Sent because the first choice failed or was not opened in time (the safety net). */
  isEscalation: boolean;
}

export interface EscalationJobData {
  notificationId: string;
  /** "window": the escalation window ended; "failed": a provider reported a failed delivery. */
  reason: 'window' | 'failed';
}

export const HELD_QUEUE = 'held';
export const HELD_JOB = 'held.release';

export interface HeldJobData {
  notificationId: string;
}

// ---------- Used by the API process (the worker owns the queues; the API only adds or counts) ----

let apiConnection: Redis | null = null;
const apiQueues = new Map<string, Queue>();

function apiQueue<T>(name: string, prefix: string): Queue<T> {
  apiConnection ??= queueConnection();
  const key = `${prefix}:${name}`;
  let queue = apiQueues.get(key);
  if (!queue) {
    queue = new Queue(name, { connection: apiConnection, prefix });
    apiQueues.set(key, queue);
  }
  return queue as Queue<T>;
}

/** Delivery reports: asks the worker to escalate at once. */
export async function requestEscalation(notificationId: string, prefix = env.QUEUE_PREFIX) {
  await apiQueue<EscalationJobData>(ESCALATION_QUEUE, prefix).add(
    ESCALATION_JOB,
    { notificationId, reason: 'failed' },
    { jobId: `${notificationId}-failed`, removeOnComplete: 1000, removeOnFail: 5000 },
  );
}

/**
 * Spam review "Release": the worker delivers the notification now (in the app, then the outside
 * channels), without classifying it again. Its own job id: the first job used the plain id.
 */
export async function requestRelease(notificationId: string, prefix = env.QUEUE_PREFIX) {
  await apiQueue<ProcessJobData>(NOTIFICATION_QUEUE, prefix).add(
    PROCESS_JOB,
    { notificationId },
    {
      jobId: `${notificationId}-released`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  );
}

/** The queues shown on the admin overview, with plain names (the page translates them). */
export const MONITORED_QUEUES = [
  NOTIFICATION_QUEUE,
  channelQueueName('whatsapp'),
  channelQueueName('sms'),
  channelQueueName('email'),
  ESCALATION_QUEUE,
  HELD_QUEUE,
] as const;

export interface QueueBacklog {
  name: (typeof MONITORED_QUEUES)[number];
  /** Waiting or being worked on right now. */
  waiting: number;
  /** Planned for later on purpose: retries, escalation checks, quiet hours. */
  scheduled: number;
  /** Gave up (kept for a while so they can be looked at). */
  failed: number;
}

/** How much work is waiting in each queue (admin overview). */
export async function queueBacklog(prefix = env.QUEUE_PREFIX): Promise<QueueBacklog[]> {
  return Promise.all(
    MONITORED_QUEUES.map(async (name) => {
      const c = await apiQueue(name, prefix).getJobCounts(
        'waiting',
        'active',
        'prioritized',
        'delayed',
        'failed',
      );
      return {
        name,
        waiting: (c.waiting ?? 0) + (c.active ?? 0) + (c.prioritized ?? 0),
        scheduled: c.delayed ?? 0,
        failed: c.failed ?? 0,
      };
    }),
  );
}

export async function closeApiQueues() {
  await Promise.all([...apiQueues.values()].map((q) => q.close()));
  apiQueues.clear();
  await apiConnection?.quit();
  apiConnection = null;
}
