// The preference manager used by the API process (settings screen, webhooks, onboarding).
// The worker makes its own with its own Redis connection (src/worker.ts).
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { UserPreferenceManager } from './UserPreferenceManager.js';

export const userPreferences = new UserPreferenceManager(prisma, redis, env.QUEUE_PREFIX, logger);
