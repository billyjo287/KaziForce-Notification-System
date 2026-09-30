// Email: Resend (default) or SendGrid (EMAIL_PROVIDER=sendgrid) in sandbox/live mode, both over
// HTTPS with no SDK. Mock mode really sends, but to Mailpit, the fake inbox on this computer
// (http://localhost:8025 by default), so the email can be looked at; automated tests keep it in
// memory. Account emails (password reset, new login) use this adapter too (lib/mailer.ts).
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import {
  ChannelAdapter,
  SendError,
  type AdapterOptions,
  type OutgoingMessage,
  type Recipient,
  type SendResult,
} from './ChannelAdapter.js';

export interface EmailConfig {
  provider: 'resend' | 'sendgrid';
  from: string;
  resendApiKey?: string;
  sendgridApiKey?: string;
  smtp: { host: string; port: number } | 'memory';
}

export interface EmailContent {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** "KaziForce <alerts@example.com>" -> { name, email } (SendGrid wants them apart). */
function splitAddress(from: string) {
  const match = /^(.*)<(.+)>$/.exec(from.trim());
  return match ? { name: match[1]!.trim(), email: match[2]!.trim() } : { email: from.trim() };
}

export class EmailAdapter extends ChannelAdapter {
  readonly name = 'email' as const;
  private readonly smtp;

  constructor(
    options: AdapterOptions,
    private readonly config: EmailConfig,
  ) {
    super(options);
    this.smtp =
      config.smtp === 'memory'
        ? nodemailer.createTransport({ jsonTransport: true })
        : nodemailer.createTransport({ ...config.smtp, secure: false });
  }

  addressFor(r: Recipient) {
    return r.email || null;
  }

  protected override async sendMock(message: OutgoingMessage): Promise<SendResult> {
    if (this.options.mockFails) throw new SendError('Mock provider: simulated email failure');
    return this.sendContent(
      message.to,
      message.subject ?? message.summary,
      message.text,
      message.html,
    );
  }

  protected sendWithProvider(message: OutgoingMessage): Promise<SendResult> {
    return this.sendContent(
      message.to,
      message.subject ?? message.summary,
      message.text,
      message.html,
    );
  }

  /** Any email, in the current mode (used for account emails as well). */
  sendEmail(email: EmailContent): Promise<SendResult> {
    return this.sendContent(email.to, email.subject, email.text, email.html);
  }

  private async sendContent(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<SendResult> {
    if (this.options.mode === 'mock') {
      try {
        const info = await this.smtp.sendMail({ from: this.config.from, to, subject, text, html });
        return { providerMessageId: info.messageId || `mock-email-${randomUUID()}` };
      } catch (error) {
        throw new SendError(`Mailpit: ${(error as Error).message}`);
      }
    }
    return this.config.provider === 'sendgrid'
      ? this.viaSendGrid(to, subject, text, html)
      : this.viaResend(to, subject, text, html);
  }

  private async viaResend(to: string, subject: string, text: string, html?: string) {
    if (!this.config.resendApiKey) throw new SendError('Resend is not configured', false);
    const res = await this.post('https://api.resend.com/emails', this.config.resendApiKey, {
      from: this.config.from,
      to: [to],
      subject,
      text,
      html,
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) {
      throw new SendError(`Resend ${res.status}: ${body.message ?? 'no details'}`, retryable(res));
    }
    return { providerMessageId: body.id };
  }

  private async viaSendGrid(to: string, subject: string, text: string, html?: string) {
    if (!this.config.sendgridApiKey) throw new SendError('SendGrid is not configured', false);
    const res = await this.post(
      'https://api.sendgrid.com/v3/mail/send',
      this.config.sendgridApiKey,
      {
        personalizations: [{ to: [{ email: to }] }],
        from: splitAddress(this.config.from),
        subject,
        content: [
          { type: 'text/plain', value: text },
          ...(html ? [{ type: 'text/html', value: html }] : []),
        ],
      },
    );
    if (!res.ok) throw new SendError(`SendGrid ${res.status}`, retryable(res));
    return { providerMessageId: res.headers.get('x-message-id') ?? `sendgrid-${randomUUID()}` };
  }

  private async post(url: string, apiKey: string, body: unknown) {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new SendError(`Email provider unreachable: ${(error as Error).message}`);
    }
  }
}

/** Server trouble or too many requests: worth trying again. A refused request is not. */
const retryable = (res: Response) => res.status >= 500 || res.status === 429;
