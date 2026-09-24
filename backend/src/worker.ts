// The worker process: turns domain events into notifications and processes them (BullMQ).
// Runs next to the API (`npm run dev` starts both). On Railway it is its own service, so slow
// work here never slows down the website.
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { createNotificationQueue, queueConnection } from './lib/queue.js';
import { redis } from './lib/redis.js';
import { startNotificationWorker } from './pipeline/notificationWorker.js';
import { startOutboxRelay } from './pipeline/outboxRelay.js';

const connection = queueConnection();
const queue = createNotificationQueue(connection);

const worker = startNotificationWorker({
  prisma,
  connection,
  publisher: redis,
  logger,
  prefix: env.QUEUE_PREFIX,
});
const relay = startOutboxRelay({ prisma, queue, databaseUrl: env.DATABASE_URL, logger });
await relay.ready;
logger.info('Notification worker running');

async function shutdown(signal: string) {
  logger.info(`${signal} received, stopping the worker`);
  await relay.stop();
  await worker.close(); // lets the current jobs finish
  await queue.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit(), connection.quit()]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
