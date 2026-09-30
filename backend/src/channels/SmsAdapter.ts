// SMS through Africa's Talking (bulk messaging API over HTTPS; no SDK needed).
// Username "sandbox" uses their free test environment (api.sandbox.africastalking.com).
// Texts are plain GSM characters, at most 160 (one SMS), built in messages.ts.
import {
  ChannelAdapter,
  SendError,
  type AdapterOptions,
  type OutgoingMessage,
  type Recipient,
  type SendResult,
} from './ChannelAdapter.js';

export interface AfricasTalkingConfig {
  username: string;
  apiKey?: string;
  senderId?: string;
}

/** Per-recipient status codes where trying again cannot help. */
const PERMANENT = new Set([
  402, // invalid sender id
  403, // invalid phone number
  404, // unsupported number type
  406, // the person is on the blacklist (opted out)
  409, // "do not disturb" rejection
]);

export class SmsAdapter extends ChannelAdapter {
  readonly name = 'sms' as const;

  constructor(
    options: AdapterOptions,
    private readonly at: AfricasTalkingConfig,
  ) {
    super(options);
  }

  /** Only a verified number with consent, and not opted out. */
  addressFor(r: Recipient) {
    if (!r.phone || !r.phoneVerified || !r.consentSmsWhatsapp || r.smsOptedOutAt) return null;
    return r.phone;
  }

  /** Account codes (phone verification) go straight out, without the notification pipeline. */
  sendText(to: string, text: string) {
    return this.send({ notificationId: '', to, language: 'en', text, summary: text, link: '' });
  }

  protected async sendWithProvider(message: OutgoingMessage): Promise<SendResult> {
    const { username, apiKey, senderId } = this.at;
    if (!apiKey) throw new SendError("Africa's Talking is not configured", false);
    const host =
      username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
    const form = new URLSearchParams({ username, to: message.to, message: message.text });
    if (senderId) form.set('from', senderId);

    let res: Response;
    try {
      res = await fetch(`https://${host}/version1/messaging`, {
        method: 'POST',
        headers: {
          apiKey,
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new SendError(`Africa's Talking unreachable: ${(error as Error).message}`);
    }
    if (!res.ok) {
      throw new SendError(
        `Africa's Talking ${res.status}`,
        res.status >= 500 || res.status === 429,
      );
    }
    const body = (await res.json().catch(() => ({}))) as {
      SMSMessageData?: {
        Recipients?: { statusCode: number; status: string; messageId?: string }[];
      };
    };
    const recipient = body.SMSMessageData?.Recipients?.[0];
    if (!recipient) throw new SendError("Africa's Talking gave no recipient status");
    // 100 processed, 101 sent, 102 queued: accepted by the provider.
    if (recipient.statusCode > 102 || !recipient.messageId || recipient.messageId === 'None') {
      throw new SendError(
        `Africa's Talking: ${recipient.status} (${recipient.statusCode})`,
        !PERMANENT.has(recipient.statusCode),
      );
    }
    return { providerMessageId: recipient.messageId };
  }
}
