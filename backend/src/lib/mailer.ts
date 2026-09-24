// Account emails (password reset, new-login alert). In development they go to Mailpit, the fake
// inbox at http://localhost:8025. Phase 5 adds the full email channel (Resend) for notifications.
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const transport =
  env.NODE_ENV === 'test'
    ? // Tests never send real email; messages are kept in memory instead.
      nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: false });

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/** Sent in the background: an email problem must never block logging in. */
export function sendEmail(email: Email): void {
  transport
    .sendMail({ from: env.EMAIL_FROM, ...email })
    .then(() => logger.debug({ to: email.to, subject: email.subject }, 'Email sent'))
    .catch((error: unknown) => logger.error({ err: error, to: email.to }, 'Email failed'));
}
