// The one base class every delivery channel extends (CLAUDE.md section 5, decision 6).
//
// A channel says three things: its name, whether it can reach a person at all (and at what
// address), and how to send one message. Mock mode is handled here, once, for every channel:
// the message is logged and recorded, and nothing is sent (or, in mock mode only, it pretends to
// fail when listed in MOCK_FAIL_CHANNELS). Adding a new channel means adding a new subclass;
// the router does not change.
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { Channel, Language } from '../generated/prisma/client.js';

export type ChannelMode = 'mock' | 'sandbox' | 'live';

/** What the router knows about the person a notification is for. */
export interface Recipient {
  id: string;
  role: 'worker' | 'business' | 'admin';
  language: Language;
  email: string;
  phone: string | null;
  phoneVerified: boolean;
  consentSmsWhatsapp: boolean;
  usesWhatsApp: boolean;
  whatsappOptedOutAt: Date | null;
  smsOptedOutAt: Date | null;
}

/** One message on one channel. The texts never contain personal details (PRD FR-4). */
export interface OutgoingMessage {
  notificationId: string;
  /** Phone number (E.164) or email address, from `addressFor`. */
  to: string;
  language: Language;
  /** Plain text: SMS and WhatsApp (<= 160 GSM characters for SMS), email text part. */
  text: string;
  /** The short summary on its own (WhatsApp template variable, email heading). */
  summary: string;
  /** The tracked link that opens the alert. */
  link: string;
  /** Email only. */
  subject?: string;
  html?: string;
}

export interface SendResult {
  /** The provider's id for the message; delivery reports are matched on it. */
  providerMessageId: string;
}

/** A failed send. `retryable: false` means trying again cannot help (e.g. invalid number). */
export class SendError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
    this.name = 'SendError';
  }
}

export interface AdapterOptions {
  mode: ChannelMode;
  logger: Logger;
  /** Mock mode only: pretend every send fails. */
  mockFails?: boolean;
}

export abstract class ChannelAdapter {
  abstract readonly name: Channel;
  /** Tries per message (first try included), with exponential backoff between them. */
  readonly attempts: number = 3;

  constructor(protected readonly options: AdapterOptions) {}

  /** The address to use for this person, or null if this channel must not be used for them. */
  abstract addressFor(recipient: Recipient): string | null;

  /** Sends one message through the real provider (sandbox or live mode). */
  protected abstract sendWithProvider(message: OutgoingMessage): Promise<SendResult>;

  async send(message: OutgoingMessage): Promise<SendResult> {
    if (this.options.mode !== 'mock') return this.sendWithProvider(message);
    return this.sendMock(message);
  }

  /** Mock mode: log and record only. Email overrides this to use Mailpit. */
  protected async sendMock(message: OutgoingMessage): Promise<SendResult> {
    if (this.options.mockFails) {
      throw new SendError(`Mock provider: simulated ${this.name} failure`);
    }
    this.options.logger.info(`[mock ${this.name}] to ${message.to}: ${message.text}`);
    return { providerMessageId: `mock-${this.name}-${randomUUID()}` };
  }
}
