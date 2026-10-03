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
  // Database connections each process may open at once (Prisma's pool). The worker needs more
  // than the default 10 at high load; keep the total under your database's connection limit.
  // Proxies in front of the API: 1 on Railway; 2 when Vercel forwards /api to it.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  // BullMQ idle polling (docs/DEPLOYMENT.md section 8). BullMQ's defaults are 5 and 30.
  QUEUE_DRAIN_DELAY_SECONDS: z.coerce.number().int().min(1).max(300).default(30),
  QUEUE_STALLED_CHECK_SECONDS: z.coerce.number().int().min(10).max(3600).default(120),
  DATABASE_POOL_MAX: z.coerce.number().int().min(2).max(100).default(10),
  REDIS_URL: z.url(),
  // Name prefix for the queues and live-update channel in Redis, so tests never mix with dev.
  QUEUE_PREFIX: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .default('kf'),
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

  // ---- Channels (Phase 5) ----
  // Where this API is reachable from the internet: tracked links (/o/...) and provider webhooks.
  PUBLIC_API_URL: z.url().default('http://localhost:4000'),
  // Urgent alerts not opened within this many minutes go to the next channel (or half the time
  // left before the job deadline, if that is shorter).
  ESCALATION_WINDOW_MINUTES: z.coerce.number().positive().max(120).default(10),
  // First wait before retrying a failed send; doubles each time (2 s, 4 s).
  CHANNEL_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(2000),
  // Mock mode only: channels that pretend to fail, to try the safety net ("whatsapp,sms").
  MOCK_FAIL_CHANNELS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    ),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  // e.g. whatsapp:+14155238886 (the Twilio sandbox number) or your approved WhatsApp sender
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  // Approved WhatsApp templates (Content SIDs, "HX..."); see docs/twilio-whatsapp-templates.md
  TWILIO_TEMPLATE_ALERT_EN: z.string().optional(),
  TWILIO_TEMPLATE_ALERT_SW: z.string().optional(),
  AFRICASTALKING_USERNAME: z.string().default('sandbox'),
  AFRICASTALKING_API_KEY: z.string().optional(),
  AFRICASTALKING_SENDER_ID: z.string().optional(),
  // Secret part of the delivery-report address given to Africa's Talking (it signs nothing).
  AFRICASTALKING_WEBHOOK_SECRET: z.string().optional(),
  EMAIL_PROVIDER: z.enum(['resend', 'sendgrid']).default('resend'),
  RESEND_API_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
});

/** Outside mock mode every provider needs its keys: say which are missing, all at once. */
const withProviderKeys = envSchema.superRefine((v, ctx) => {
  // Production must never run with the example secret from .env.example (anyone could forge a
  // login token with it).
  if (v.NODE_ENV === 'production' && /change-me/i.test(v.JWT_ACCESS_SECRET)) {
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_ACCESS_SECRET'],
      message: 'Set a new random secret for production (see .env.example)',
    });
  }
  if (v.CHANNEL_MODE === 'mock') return;
  const required: (keyof typeof v)[] = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_WHATSAPP_FROM',
    'AFRICASTALKING_API_KEY',
    'AFRICASTALKING_WEBHOOK_SECRET',
    v.EMAIL_PROVIDER === 'resend' ? 'RESEND_API_KEY' : 'SENDGRID_API_KEY',
  ];
  for (const key of required) {
    if (!v[key]) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `Needed when CHANNEL_MODE is ${v.CHANNEL_MODE}`,
      });
    }
  }
});

/** Checks a set of settings (exported so the production rules can be tested). */
export const validateEnv = (source: Record<string, string | undefined>) =>
  withProviderKeys.safeParse(source);

const parsed = validateEnv(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables. Check backend/.env against backend/.env.example:');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
