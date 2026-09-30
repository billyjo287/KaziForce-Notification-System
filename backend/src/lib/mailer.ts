// Account emails (password reset, new-login alert), through the email channel adapter: Mailpit
// (the fake inbox) in mock mode, Resend or SendGrid in sandbox and live mode.
import { sharedAdapters } from '../channels/index.js';
import { logger } from './logger.js';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/** Sent in the background: an email problem must never block logging in. */
export function sendEmail(email: Email): void {
  sharedAdapters()
    .email.sendEmail(email)
    .then(() => logger.debug({ to: email.to, subject: email.subject }, 'Email sent'))
    .catch((error: unknown) => logger.error({ err: error, to: email.to }, 'Email failed'));
}
