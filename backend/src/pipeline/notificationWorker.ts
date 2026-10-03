// The BullMQ worker for "notification.process" jobs (pipeline order, CLAUDE.md section 5):
//   QUEUED -> processing -> classify (ML service /predict, or the same rules in Node if it does
//   not answer within 500 ms) -> spam? BLOCKED (never delivered; waits for admin review;
//   an admin can release it, and then it comes back here and skips the classification)
//          -> in-app delivery: DeliveryLog row + live push to the user's Socket.IO room -> SENT
//          -> external channels (channels/delivery.ts): WhatsApp / SMS / email by priority and
//             the person's preferences, with the urgent safety net.
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { PrismaClient } from '../generated/prisma/client.js';
import { NOTIFICATION_QUEUE, idleFriendly, type ProcessJobData } from '../lib/queue.js';
import { notificationInclude, serializeNotification } from '../modules/notifications/serialize.js';
import { InAppAdapter } from '../channels/InAppAdapter.js';
import { classify } from './classify.js';
import { createModelRegistry } from './modelRegistry.js';

export interface WorkerOptions {
  prisma: PrismaClient;
  /** BullMQ connection (maxRetriesPerRequest: null). */
  connection: Redis;
  /** Ordinary Redis connection used to publish live updates. */
  publisher: Redis;
  logger: Logger;
  prefix: string;
  /** Where the ML service runs, and how long to wait for /predict before using the Node rules. */
  mlServiceUrl: string;
  mlTimeoutMs: number;
  /** Plans and queues the external channels (channels/delivery.ts). Tests may leave it out. */
  dispatch?: (notificationId: string) => Promise<unknown>;
  concurrency?: number;
}

export function startNotificationWorker({
  prisma,
  connection,
  publisher,
  logger,
  prefix,
  mlServiceUrl,
  mlTimeoutMs,
  dispatch,
  concurrency = 20,
}: WorkerOptions) {
  const inApp = new InAppAdapter({ mode: 'live', logger }, publisher, prefix);
  const registerModel = createModelRegistry(prisma);
  // Log "ML service unavailable" once per outage, not once per notification.
  let mlDown = false;
  async function processNotification(id: string): Promise<'sent' | 'blocked' | 'skipped'> {
    // Claim it. A job retried after a crash may find it still "processing"; anything further
    // along was already handled, so a duplicate job does nothing.
    const claimed = await prisma.notification.updateMany({
      where: { id, status: { in: ['queued', 'processing'] } },
      data: { status: 'processing' },
    });
    if (claimed.count === 0) return 'skipped';

    const input = await prisma.notification.findUniqueOrThrow({ where: { id } });
    // Released by an admin from the spam review ("not spam"): deliver it with the verdict it
    // already has (kept as the model's answer, a training label next to the correction).
    const released = input.correctedSpam === false && input.modelVersion !== null;
    let classification = {};
    if (!released) {
      const verdict = await classify(input, { mlServiceUrl, timeoutMs: mlTimeoutMs });
      if (verdict.fallbackReason && !mlDown) {
        mlDown = true;
        logger.warn(
          { reason: verdict.fallbackReason, url: mlServiceUrl },
          'ML service unavailable: using the built-in rules (rules_fallback) until it is back',
        );
      } else if (!verdict.fallbackReason && mlDown) {
        mlDown = false;
        logger.info('ML service is answering again');
      }
      await registerModel(verdict.modelVersion).catch((error: unknown) =>
        logger.warn({ err: error }, 'Could not register the model version'),
      );
      classification = {
        predictedPriority: verdict.priority,
        priorityConfidence: verdict.priorityConfidence,
        isSpam: verdict.isSpam,
        spamScore: verdict.spamScore,
        modelVersion: verdict.modelVersion,
        predictionSource: verdict.predictionSource,
        explanation: verdict.explanation,
      };

      if (verdict.isSpam) {
        // Never delivered to anyone; waits in the admin's spam review list.
        await prisma.notification.update({
          where: { id },
          data: { ...classification, status: 'blocked' },
        });
        return 'blocked';
      }
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
      await inApp.push(notification.recipientId, serializeNotification(notification));
    } catch (error) {
      // Already saved as sent: the app fetches it on its next load or reconnect.
      logger.warn({ err: error, notificationId: id }, 'Live push failed');
    }
    if (dispatch) {
      try {
        await dispatch(id);
      } catch (error) {
        logger.error({ err: error, notificationId: id }, 'Could not queue external channels');
      }
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
    { connection, prefix, concurrency, ...idleFriendly() },
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
