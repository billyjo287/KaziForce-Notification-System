// SMS for account codes (phone verification), through the SMS channel adapter (Africa's Talking).
// In mock mode (the default) the message is only printed in the backend console.
// Sent in the background: an SMS problem is logged and never blocks the request.
import { sharedAdapters } from '../channels/index.js';
import { logger } from './logger.js';

export function sendSms(to: string, text: string): void {
  sharedAdapters()
    .sms.sendText(to, text)
    .catch((error: unknown) => logger.error({ err: error, to }, 'Account SMS failed'));
}
