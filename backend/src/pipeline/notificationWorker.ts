// The BullMQ worker for "notification.process" jobs (pipeline order, CLAUDE.md section 5):
//   QUEUED -> processing -> classify (Phase 3: MEDIUM, not spam) -> spam? blocked
//          -> in-app delivery: DeliveryLog row + live push to the user's Socket.IO room -> SENT
// Phase 5 adds the channel router and one job per external channel after the in-app step.
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { PrismaClient } from '../generated/prisma/client.js';
import { NOTIFICATION_QUEUE, type ProcessJobData } from '../lib/queue.js';
import { notificationInclude, serializeNotification } from '../modules/notifications/serialize.js';
import { publish } from '../realtime/bus.js';
import { classify } from './classify.js';

export interface WorkerOptions {
  prisma: PrismaClient;
  /** BullMQ connection (maxRetriesPerRequest: null). */
  connection: Redis;
  /** Ordinary Redis connection used to publish live updates. */
  publisher: Redis;
  logger: Logger;
  prefix: string;
  concurrency?: number;
}

export function startNotificationWorker({
  prisma,
  connection,
  publisher,
  logger,
  prefix,
  concurrency = 20,
}: WorkerOptions) {
  async function processNotification(id: string): Promise<'sent' | 'blocked' | 'skipped'> {
    // Claim it. A job retried after a crash may find it still "processing"; anything further
    // along was already handled, so a duplicate job does nothing.
    const claimed = await prisma.notification.updateMany({
      where: { id, status: { in: ['queued', 'processing'] } },
      data: { status: 'processing' },
    });
    if (claimed.count === 0) return 'skipped';

    const verdict = classify();
    const classification = {
      predictedPriority: verdict.priority,
      priorityConfidence: verdict.priorityConfidence,
      isSpam: verdict.isSpam,
      spamScore: verdict.spamScore,
      modelVersion: verdict.modelVersion,
      predictionSource: verdict.predictionSource,
    };

    if (verdict.isSpam) {
      // Never delivered; waits in the admin's spam review queue (Phase 7).
      await prisma.notification.update({
        where: { id },
        data: { ...classification, status: 'blocked' },
      });
      return 'blocked';
    }

    const sentAt = new Date();
    const [notification] = await prisma.$transaction([
      prisma.notification.update({
        where: { id },
        data: { ...classification, status: 'sent' },
        include: notificationInclude,
      }),
      // deliveredAt is filled when the browser confirms it arrived (or on the next list fetch).
      prisma.deliveryLog.create({
        data: { notificationId: id, channel: 'in_app', status: 'sent', sentAt },
      }),
    ]);

    try {
      await publish(
        publisher,
        {
          kind: 'notification',
          userId: notification.recipientId,
          notification: serializeNotification(notification),
        },
        prefix,
      );
    } catch (error) {
      // Already saved as sent: the app fetches it on its next load or reconnect.
      logger.warn({ err: error, notificationId: id }, 'Live push failed');
    }
    logger.debug(
      { notificationId: id, ms: Date.now() - notification.createdAt.getTime() },
      'In-app notification sent',
    );
    return 'sent';
  }

  const worker = new Worker<ProcessJobData>(
    NOTIFICATION_QUEUE,
    (job) => processNotification(job.data.notificationId),
    { connection, prefix, concurrency },
  );

  worker.on('failed', (job, error) => {
    if (!job) return;
    logger.error({ err: error, notificationId: job.data.notificationId }, 'Processing failed');
    // Out of retries (3 attempts, exponential backoff): show it as failed.
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      void prisma.notification
        .updateMany({
          where: { id: job.data.notificationId, status: { in: ['queued', 'processing'] } },
          data: { status: 'failed' },
        })
        .catch((e: unknown) => logger.error({ err: e }, 'Could not mark notification failed'));
    }
  });
  worker.on('error', (error) => logger.error({ err: error }, 'Notification worker error'));

  return worker;
}
