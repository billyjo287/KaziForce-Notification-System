// Builds the external channel adapters from the settings (.env). CHANNEL_MODE decides for all of
// them: mock (log only; email to Mailpit), sandbox (provider test accounts) or live, except the
// channels listed in MOCK_CHANNELS, which stay in mock mode (e.g. WhatsApp without a provider).
// Channels in OFF_CHANNELS reach nobody, so the router skips them and uses the next channel.
import type { Logger } from 'pino';
import { env } from '../config/env.js';
import { logger as defaultLogger } from '../lib/logger.js';
import type { ChannelMode } from './ChannelAdapter.js';
import { EmailAdapter } from './EmailAdapter.js';
import { SmsAdapter } from './SmsAdapter.js';
import { WhatsAppAdapter } from './WhatsAppAdapter.js';

export interface ChannelSetup {
  mode: ChannelMode;
  logger: Logger;
  /** Mock mode only: these channels pretend to fail. */
  mockFailChannels?: string[];
  /** These channels stay in mock mode whatever `mode` says. */
  mockChannels?: string[];
  /** These channels are switched off: they reach nobody, so the router skips them. */
  offChannels?: string[];
}

export function createAdapters({
  mode,
  logger,
  mockFailChannels = [],
  mockChannels = env.MOCK_CHANNELS,
  offChannels = env.OFF_CHANNELS,
}: ChannelSetup) {
  const options = (name: string) => ({
    mode: mockChannels.includes(name) ? ('mock' as const) : mode,
    logger,
    mockFails: mockFailChannels.includes(name),
  });
  const api = env.PUBLIC_API_URL.replace(/\/$/, '');
  const adapters = {
    whatsapp: new WhatsAppAdapter(options('whatsapp'), {
      accountSid: env.TWILIO_ACCOUNT_SID || undefined,
      authToken: env.TWILIO_AUTH_TOKEN || undefined,
      from: env.TWILIO_WHATSAPP_FROM || undefined,
      templates: {
        en: env.TWILIO_TEMPLATE_ALERT_EN || undefined,
        sw: env.TWILIO_TEMPLATE_ALERT_SW || undefined,
      },
      statusCallbackUrl: `${api}/webhooks/twilio/status`,
    }),
    sms: new SmsAdapter(options('sms'), {
      username: env.AFRICASTALKING_USERNAME,
      apiKey: env.AFRICASTALKING_API_KEY || undefined,
      senderId: env.AFRICASTALKING_SENDER_ID || undefined,
    }),
    email: new EmailAdapter(options('email'), {
      provider: env.EMAIL_PROVIDER,
      from: env.EMAIL_FROM,
      resendApiKey: env.RESEND_API_KEY || undefined,
      sendgridApiKey: env.SENDGRID_API_KEY || undefined,
      gmail:
        env.GMAIL_USER && env.GMAIL_APP_PASSWORD
          ? { user: env.GMAIL_USER, appPassword: env.GMAIL_APP_PASSWORD.replace(/\s+/g, '') }
          : undefined,
      // Automated tests keep emails in memory; development sends them to Mailpit.
      smtp: env.NODE_ENV === 'test' ? 'memory' : { host: env.SMTP_HOST, port: env.SMTP_PORT },
    }),
  };
  for (const name of offChannels) {
    const adapter = adapters[name as keyof typeof adapters];
    if (adapter) adapter.addressFor = () => null;
  }
  return adapters;
}

export type ExternalAdapters = ReturnType<typeof createAdapters>;

let accountMailer: EmailAdapter | null = null;

/**
 * The email adapter for account emails (codes, password resets). ACCOUNT_EMAIL=gmail: a live
 * Gmail sender, whatever CHANNEL_MODE says (ADR 0024); otherwise the usual email adapter.
 */
export function accountEmailAdapter(): EmailAdapter {
  if (env.ACCOUNT_EMAIL !== 'gmail' || env.NODE_ENV === 'test') return sharedAdapters().email;
  accountMailer ??= new EmailAdapter(
    { mode: 'live', logger: defaultLogger },
    {
      provider: 'gmail',
      from: env.EMAIL_FROM,
      gmail: {
        user: env.GMAIL_USER!,
        appPassword: env.GMAIL_APP_PASSWORD!.replace(/\s+/g, ''),
      },
      smtp: { host: env.SMTP_HOST, port: env.SMTP_PORT },
    },
  );
  return accountMailer;
}

let shared: ExternalAdapters | null = null;

/** The adapters for the API process itself (SMS codes, account emails). */
export function sharedAdapters(): ExternalAdapters {
  shared ??= createAdapters({ mode: env.CHANNEL_MODE, logger: defaultLogger });
  return shared;
}
