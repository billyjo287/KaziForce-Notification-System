// SMS for account codes. Phase 5 replaces this with the Africa's Talking channel adapter.
// In mock mode (the default) the message is only printed in the backend console.
import { env } from '../config/env.js';
import { logger } from './logger.js';

export function sendSms(to: string, text: string): void {
  if (env.CHANNEL_MODE !== 'mock') {
    logger.warn('Real SMS arrives in Phase 5; printing the message instead');
  }
  logger.info(`[mock SMS] to ${to}: ${text}`);
}
