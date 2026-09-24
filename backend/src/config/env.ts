// Reads and checks environment variables once at start-up.
// If something is missing or wrong, the server stops with a clear message instead of failing later.
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  FRONTEND_ORIGIN: z.url().default('http://localhost:5173'),
  PUBLIC_APP_URL: z.url().default('http://localhost:5173'),
  APP_TIMEZONE: z.string().default('Africa/Nairobi'),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  ML_SERVICE_URL: z.url().default('http://localhost:8000'),
  ML_TIMEOUT_MS: z.coerce.number().int().positive().default(500),
  CHANNEL_MODE: z.enum(['mock', 'sandbox', 'live']).default('mock'),
  JWT_ACCESS_SECRET: z.string().min(32, 'Use at least 32 characters'),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  // Log-in / sign-up attempts per 15 minutes per network address.
  LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
  STATUS_UNDO_SECONDS: z.coerce.number().int().min(0).max(120).default(15),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  EMAIL_FROM: z.string().default('KaziForce <alerts@kaziforce.local>'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables. Check backend/.env against backend/.env.example:');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
