// Builds the external channel adapters from the settings (.env). CHANNEL_MODE decides for all of
// them: mock (log only; email to Mailpit), sandbox (provider test accounts) or live.
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
}

export function createAdapters({ mode, logger, mockFailChannels = [] }: ChannelSetup) {
  const options = (name: string) => ({ mode, logger, mockFails: mockFailChannels.includes(name) });
  const api = env.PUBLIC_API_URL.replace(/\/$/, '');
  return {
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
      // Automated tests keep emails in memory; development sends them to Mailpit.
      smtp: env.NODE_ENV === 'test' ? 'memory' : { host: env.SMTP_HOST, port: env.SMTP_PORT },
    }),
  };
}

export type ExternalAdapters = ReturnType<typeof createAdapters>;

let shared: ExternalAdapters | null = null;

/** The adapters for the API process itself (SMS codes, account emails). */
export function sharedAdapters(): ExternalAdapters {
  shared ??= createAdapters({ mode: env.CHANNEL_MODE, logger: defaultLogger });
  return shared;
}
