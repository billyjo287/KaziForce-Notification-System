import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

// General-purpose Redis connection (health checks, small caches).
// maxRetriesPerRequest: 1 makes a command fail after one reconnect attempt instead of waiting
// forever while Redis is down. ioredis keeps reconnecting in the background, so the app
// recovers when Redis comes back. BullMQ gets its own connections in Phase 3 (different settings).
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });

let connected = false;
redis.on('ready', () => {
  connected = true;
  logger.info('Connected to Redis');
});
redis.on('error', (error) => {
  // Log once per outage, not on every reconnect attempt.
  if (connected) logger.error({ err: error }, 'Lost connection to Redis');
  connected = false;
});
