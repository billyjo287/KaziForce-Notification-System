// The worker process: turns domain events into notifications and processes them (BullMQ).
// Runs next to the API (`npm run dev` starts both). On Railway it is its own service, so slow
// work here never slows down the website.
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { createNotificationQueue, queueConnection } from './lib/queue.js';
import { redis } from './lib/redis.js';
import { createAdapters } from './channels/index.js';
import { startDelivery } from './channels/delivery.js';
import { startNotificationWorker } from './pipeline/notificationWorker.js';
import { startOutboxRelay } from './pipeline/outboxRelay.js';

const connection = queueConnection();
const queue = createNotificationQueue(connection);

// External channels get their own Redis connection: sharing one with the notification queue made
// every in-app alert wait behind channel work (the in-app median rose from ~70 ms to ~130 ms).
const deliveryConnection = queueConnection();
const delivery = startDelivery({
  prisma,
  connection: deliveryConnection,
  prefix: env.QUEUE_PREFIX,
  logger,
  adapters: createAdapters({
    mode: env.CHANNEL_MODE,
    logger,
    mockFailChannels: env.MOCK_FAIL_CHANNELS,
  }),
  publicApiUrl: env.PUBLIC_API_URL,
  publicAppUrl: env.PUBLIC_APP_URL,
  windowMinutes: env.ESCALATION_WINDOW_MINUTES,
  retryDelayMs: env.CHANNEL_RETRY_DELAY_MS,
});

const worker = startNotificationWorker({
  prisma,
  connection,
  publisher: redis,
  logger,
  prefix: env.QUEUE_PREFIX,
  mlServiceUrl: env.ML_SERVICE_URL,
  mlTimeoutMs: env.ML_TIMEOUT_MS,
  dispatch: delivery.dispatch,
});
const relay = startOutboxRelay({ prisma, queue, databaseUrl: env.DATABASE_URL, logger });
await relay.ready;
logger.info(
  `Notification worker running (channel mode: ${env.CHANNEL_MODE}` +
    (env.MOCK_FAIL_CHANNELS.length
      ? `, pretending to fail: ${env.MOCK_FAIL_CHANNELS.join(', ')}`
      : '') +
    ')',
);

async function shutdown(signal: string) {
  logger.info(`${signal} received, stopping the worker`);
  await relay.stop();
  await worker.close(); // lets the current jobs finish
  await delivery.close();
  await queue.close();
  await Promise.allSettled([
    prisma.$disconnect(),
    redis.quit(),
    connection.quit(),
    deliveryConnection.quit(),
  ]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
