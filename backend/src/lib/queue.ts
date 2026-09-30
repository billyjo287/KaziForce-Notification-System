// The BullMQ job queues (stored in Redis):
//   notifications     "notification.process": classify, deliver in-app, plan external channels
//   channel-<name>    one queue per external channel (whatsapp, sms, email): one send each,
//                     3 tries with exponential backoff, one DeliveryLog row per try
//   escalation        "escalation.check" jobs, delayed until the urgent escalation window ends
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

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
  return new Redis(url, { maxRetriesPerRequest: null });
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

let apiConnection: Redis | null = null;
let apiEscalationQueue: Queue<EscalationJobData> | null = null;

/** For the API process (delivery reports): asks the worker to escalate at once. */
export async function requestEscalation(notificationId: string, prefix = env.QUEUE_PREFIX) {
  apiConnection ??= queueConnection();
  apiEscalationQueue ??= new Queue<EscalationJobData>(ESCALATION_QUEUE, {
    connection: apiConnection,
    prefix,
  });
  await apiEscalationQueue.add(
    ESCALATION_JOB,
    { notificationId, reason: 'failed' },
    { jobId: `${notificationId}-failed`, removeOnComplete: 1000, removeOnFail: 5000 },
  );
}

export async function closeApiQueues() {
  await apiEscalationQueue?.close();
  await apiConnection?.quit();
  apiEscalationQueue = null;
  apiConnection = null;
}
