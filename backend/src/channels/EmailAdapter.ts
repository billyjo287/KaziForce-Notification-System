// Email: Resend (default), SendGrid (EMAIL_PROVIDER=sendgrid), both over HTTPS with no SDK, or a
// Gmail account (EMAIL_PROVIDER=gmail) over SMTP with an app password: free, about 500 emails a
// day, and no own domain needed, which suits a student deployment (ADR 0023). Mock mode really sends, but to Mailpit, the fake inbox on this computer
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
  provider: 'resend' | 'sendgrid' | 'gmail';
  from: string;
  /** EMAIL_PROVIDER=gmail: the Gmail address and its 16-character app password. */
  gmail?: { user: string; appPassword: string };
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
  private readonly gmail;

  constructor(
    options: AdapterOptions,
    private readonly config: EmailConfig,
  ) {
    super(options);
    this.smtp =
      config.smtp === 'memory'
        ? nodemailer.createTransport({ jsonTransport: true })
        : nodemailer.createTransport({ ...config.smtp, secure: false });
    this.gmail = config.gmail
      ? nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: { user: config.gmail.user, pass: config.gmail.appPassword },
        })
      : null;
  }

  addressFor(r: Recipient) {
    return r.email && r.emailVerifiedAt ? r.email : null;
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
    if (this.config.provider === 'gmail') return this.viaGmail(to, subject, text, html);
    return this.config.provider === 'sendgrid'
      ? this.viaSendGrid(to, subject, text, html)
      : this.viaResend(to, subject, text, html);
  }

  private async viaGmail(to: string, subject: string, text: string, html?: string) {
    if (!this.gmail || !this.config.gmail) throw new SendError('Gmail is not configured', false);
    // Gmail sends only "from" its own address: keep the display name, use the Gmail address.
    const name = splitAddress(this.config.from).name ?? 'KaziForce';
    try {
      const info = await this.gmail.sendMail({
        from: { name, address: this.config.gmail.user },
        to,
        subject,
        text,
        html,
      });
      return { providerMessageId: info.messageId || `gmail-${randomUUID()}` };
    } catch (error) {
      const code = (error as { responseCode?: number }).responseCode;
      // 5xx: refused for good (bad address, daily limit reached); otherwise try again later.
      throw new SendError(`Gmail: ${(error as Error).message}`, !(code && code >= 500));
    }
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
