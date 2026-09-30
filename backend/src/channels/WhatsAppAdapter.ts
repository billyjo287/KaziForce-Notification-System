// WhatsApp through Twilio (Messages API over HTTPS; no SDK needed).
//
// Business-initiated WhatsApp messages outside the 24-hour customer window must use a template
// approved by Meta. When TWILIO_TEMPLATE_ALERT_EN / _SW are set, the adapter sends that template
// (ContentSid) with two variables: {{1}} the short summary and {{2}} the tracked-link code. When
// they are empty (sandbox), it sends plain text, which the Twilio sandbox allows.
// See docs/twilio-whatsapp-templates.md.
import type { Language } from '../generated/prisma/client.js';
import {
  ChannelAdapter,
  SendError,
  type AdapterOptions,
  type OutgoingMessage,
  type Recipient,
  type SendResult,
} from './ChannelAdapter.js';

export interface TwilioConfig {
  accountSid?: string;
  authToken?: string;
  from?: string;
  templates: Partial<Record<Language, string>>;
  /** Where Twilio reports sent / delivered / read / failed. */
  statusCallbackUrl: string;
}

/** Twilio error codes where trying again cannot help. */
const PERMANENT = new Set([
  21211, // invalid "To" number
  21408, // no permission to send to this region
  21610, // the person replied STOP
  21614, // not a mobile number
  63016, // outside the 24-hour window without an approved template
  63024, // invalid recipient
]);

export class WhatsAppAdapter extends ChannelAdapter {
  readonly name = 'whatsapp' as const;

  constructor(
    options: AdapterOptions,
    private readonly twilio: TwilioConfig,
  ) {
    super(options);
  }

  /** Only people who said they use WhatsApp on a verified number, gave consent, and did not opt out. */
  addressFor(r: Recipient) {
    if (!r.usesWhatsApp || !r.phone || !r.phoneVerified) return null;
    if (!r.consentSmsWhatsapp || r.whatsappOptedOutAt) return null;
    return r.phone;
  }

  protected async sendWithProvider(message: OutgoingMessage): Promise<SendResult> {
    const { accountSid, authToken, from, templates, statusCallbackUrl } = this.twilio;
    if (!accountSid || !authToken || !from) {
      throw new SendError('Twilio is not configured', false);
    }
    const form = new URLSearchParams({
      To: `whatsapp:${message.to}`,
      From: from,
      StatusCallback: statusCallbackUrl,
    });
    const template = templates[message.language];
    if (template) {
      form.set('ContentSid', template);
      form.set(
        'ContentVariables',
        JSON.stringify({ 1: message.summary, 2: message.link.split('/o/')[1] ?? message.link }),
      );
    } else {
      form.set('Body', message.text);
    }

    let res: Response;
    try {
      res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new SendError(`Twilio unreachable: ${(error as Error).message}`);
    }
    const body = (await res.json().catch(() => ({}))) as {
      sid?: string;
      code?: number;
      message?: string;
    };
    if (!res.ok || !body.sid) {
      const permanent = body.code !== undefined && PERMANENT.has(body.code);
      throw new SendError(
        `Twilio ${res.status}${body.code ? ` (${body.code})` : ''}: ${body.message ?? 'no details'}`,
        !permanent && (res.status >= 500 || res.status === 429 || res.ok),
      );
    }
    return { providerMessageId: body.sid };
  }
}
