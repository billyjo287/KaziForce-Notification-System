// The BullMQ job queue (stored in Redis). One queue for now, "notifications", with one kind of
// job, "notification.process". Phase 5 adds one job per channel.
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
