// Settings for the load test (docs/performance.md). Everything runs on its own database
// ("kaziforce_load"), port 4002 and queue names ("kf-load"): your development data is untouched.
import 'dotenv/config';
import { fileURLToPath } from 'node:url';

const base =
  process.env.DATABASE_URL ?? 'postgresql://kaziforce:kaziforce@localhost:5434/kaziforce';

export const LOAD_PORT = 4002;
export const DATA_DIR = fileURLToPath(new URL('../../../loadtest/data/', import.meta.url));

export const loadEnv = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(LOAD_PORT),
  DATABASE_URL:
    process.env.LOAD_DATABASE_URL ?? base.replace(/\/[^/?]+(\?|$)/, '/kaziforce_load$1'),
  QUEUE_PREFIX: 'kf-load',
  CHANNEL_MODE: 'mock',
  LOG_LEVEL: 'warn',
  DATABASE_POOL_MAX: process.env.LOAD_POOL_MAX ?? '25',
  // The test runs for 10 minutes with tokens made at the start.
  ACCESS_TOKEN_MINUTES: '60',
  // Production mode refuses the example secret; this one is only for the local load test.
  JWT_ACCESS_SECRET: 'local-load-test-only-secret-0123456789abcdefghijklmnop',
  FRONTEND_ORIGIN: 'http://localhost:5173',
};
