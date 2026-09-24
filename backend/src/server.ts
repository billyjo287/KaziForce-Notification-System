import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';

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

// Close connections cleanly when stopped (Ctrl+C locally, or a redeploy on Railway).
async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
