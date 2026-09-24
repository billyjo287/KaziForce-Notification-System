// The API process: REST API + live connections (Socket.IO).
// The notification pipeline runs in a separate process: src/worker.ts.
import { Redis } from 'ioredis';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { attachRealtime } from './realtime/socketServer.js';

const app = createApp({
  frontendOrigin: env.FRONTEND_ORIGIN,
  logger,
  rateLimits: { login: env.LOGIN_RATE_LIMIT },
  healthChecks: {
    database: () => prisma.$queryRaw`SELECT 1`,
    redis: () => redis.ping(),
  },
});

const server = app.listen(env.PORT, () => {
  logger.info(`API running on http://localhost:${env.PORT} (channel mode: ${env.CHANNEL_MODE})`);
});

const subscriber = new Redis(env.REDIS_URL);
const realtime = await attachRealtime(server, {
  frontendOrigin: env.FRONTEND_ORIGIN,
  prisma,
  subscriber,
  logger,
  prefix: env.QUEUE_PREFIX,
});

// Close connections cleanly when stopped (Ctrl+C locally, or a redeploy on Railway).
async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  await realtime.close(); // also stops the HTTP server
  await Promise.allSettled([prisma.$disconnect(), redis.quit(), subscriber.quit()]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
