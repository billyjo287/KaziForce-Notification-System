// Account emails (6-digit codes, password reset, new-login alert). ACCOUNT_EMAIL=gmail: always for
// real through the Gmail account (ADR 0024). Otherwise through the email channel adapter: Mailpit
// (the fake inbox) in mock mode, Resend, SendGrid or Gmail in sandbox and live mode.
import { accountEmailAdapter } from '../channels/index.js';
import { logger } from './logger.js';
import { maskAddress } from './mask.js';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/** Sent in the background: an email problem must never block logging in. */
export function sendEmail(email: Email): void {
  accountEmailAdapter()
    .sendEmail(email)
    .then(() => logger.debug({ to: maskAddress(email.to) }, 'Email sent'))
    .catch((error: unknown) =>
      logger.error({ err: error, to: maskAddress(email.to) }, 'Email failed'),
    );
}
