// Phase 5 rules without a database: the channel router (PRD FR-4), the external message texts,
// and the Twilio webhook signature.
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Recipient } from '../src/channels/ChannelAdapter.js';
import { createAdapters } from '../src/channels/index.js';
import { WhatsAppAdapter } from '../src/channels/WhatsAppAdapter.js';
import {
  SMS_MAX,
  emailContent,
  isGsm,
  shortText,
  summaryFor,
  toGsm,
} from '../src/channels/messages.js';
import { escalationWindowMs, planDelivery, type Preferences } from '../src/channels/router.js';
import { isValidTwilioSignature, twilioSignature } from '../src/channels/twilioSignature.js';
import { PRESETS } from '../src/modules/me/presets.js';

const adapters = createAdapters({ mode: 'mock', logger: pino({ level: 'silent' }) });
const now = new Date('2026-10-02T09:00:00Z');

const person = (overrides: Partial<Recipient> = {}): Recipient => ({
  id: 'u1',
  role: 'worker',
  language: 'en',
  email: 'wanjiru@example.com',
  phone: '+254712345678',
  phoneVerified: true,
  consentSmsWhatsapp: true,
  usesWhatsApp: true,
  whatsappOptedOutAt: null,
  smsOptedOutAt: null,
  ...overrides,
});

const prefs = (overrides: Partial<Preferences> = {}): Preferences => ({
  channelOrder: ['whatsapp', 'sms', 'email'],
  channelSettings: PRESETS.recommended.channelSettings,
  urgentOnBothChannels: false,
  ...overrides,
});

const plan = (
  priority: 'urgent' | 'medium' | 'low',
  options: { recipient?: Recipient; preferences?: Preferences; deadlineAt?: Date | null } = {},
) =>
  planDelivery({
    priority,
    preferences: options.preferences ?? prefs(),
    recipient: options.recipient ?? person(),
    adapters,
    deadlineAt: options.deadlineAt ?? null,
    now,
    windowMinutes: 10,
  });

describe('channel router: "first choice, with a safety net"', () => {
  it('urgent: first choice now, the next channel after a 10-minute window', () => {
    expect(plan('urgent')).toEqual({
      now: ['whatsapp'],
      escalation: { to: 'sms', windowMs: 10 * 60_000 },
    });
  });

  it('user has no WhatsApp -> SMS first', () => {
    expect(plan('urgent', { recipient: person({ usesWhatsApp: false }) })).toEqual({
      now: ['sms'],
      escalation: { to: 'email', windowMs: 10 * 60_000 },
    });
  });

  it('deadline in 8 minutes -> window is 4 minutes', () => {
    const deadlineAt = new Date(now.getTime() + 8 * 60_000);
    expect(escalationWindowMs(now, deadlineAt, 10)).toBe(4 * 60_000);
    expect(plan('urgent', { deadlineAt }).escalation?.windowMs).toBe(4 * 60_000);
    // A far deadline does not stretch the normal 10 minutes.
    expect(escalationWindowMs(now, new Date(now.getTime() + 3 * 3_600_000), 10)).toBe(600_000);
  });

  it('"send urgent alerts on both": first and second together, no escalation', () => {
    expect(plan('urgent', { preferences: prefs({ urgentOnBothChannels: true }) })).toEqual({
      now: ['whatsapp', 'sms'],
      escalation: null,
    });
  });

  it('skips switched-off, opted-out and unverified channels, keeping the person order', () => {
    const settings = {
      ...PRESETS.recommended.channelSettings,
      whatsapp: { enabled: false, threshold: 'urgent_only' },
    };
    expect(plan('urgent', { preferences: prefs({ channelSettings: settings }) }).now).toEqual([
      'sms',
    ]);
    expect(plan('urgent', { recipient: person({ whatsappOptedOutAt: now }) }).now).toEqual(['sms']);
    // No verified phone: only email is possible.
    expect(plan('urgent', { recipient: person({ phoneVerified: false }) })).toEqual({
      now: ['email'],
      escalation: null,
    });
    expect(
      plan('urgent', { preferences: prefs({ channelOrder: ['email', 'whatsapp', 'sms'] }) }).now,
    ).toEqual(['email']);
  });

  it('medium goes to channels set to "urgent and important" (email in Recommended); low stays in the app', () => {
    expect(plan('medium')).toEqual({ now: ['email'], escalation: null });
    expect(plan('low')).toEqual({ now: [], escalation: null });
    // "Tell me everything": WhatsApp also gets important alerts.
    const everything = prefs({ channelSettings: PRESETS.everything.channelSettings });
    expect(plan('medium', { preferences: everything }).now).toEqual(['whatsapp', 'email']);
  });

  it('low goes to channels set to "everything" (email in "Tell me everything")', () => {
    const everything = prefs({ channelSettings: PRESETS.everything.channelSettings });
    expect(plan('low', { preferences: everything })).toEqual({ now: ['email'], escalation: null });
    expect(
      plan('low', { preferences: prefs({ channelSettings: PRESETS.urgent_only.channelSettings }) }),
    ).toEqual({ now: [], escalation: null });
  });
});

describe('channel router: quiet hours (FR-5)', () => {
  // `now` is 12:00 in Nairobi; these quiet hours cover it and end at 13:30 Nairobi time.
  const quietHours = { enabled: true, start: '11:00', end: '13:30' };
  const quiet = prefs({ quietHours });

  it('only urgent gets through: medium is held until the quiet hours end', () => {
    expect(plan('medium', { preferences: quiet })).toEqual({
      now: [],
      escalation: null,
      heldUntil: new Date('2026-10-02T10:30:00Z'),
    });
    expect(plan('urgent', { preferences: quiet })).toEqual({
      now: ['whatsapp'],
      escalation: { to: 'sms', windowMs: 10 * 60_000 },
    });
  });

  it('low with "everything" is held too; low with nothing to send is not held at all', () => {
    const everything = prefs({ channelSettings: PRESETS.everything.channelSettings, quietHours });
    expect(plan('low', { preferences: everything }).heldUntil).toEqual(
      new Date('2026-10-02T10:30:00Z'),
    );
    expect(plan('low', { preferences: quiet })).toEqual({ now: [], escalation: null });
  });

  it('outside quiet hours, or with them switched off, nothing is held', () => {
    const later = prefs({ quietHours: { enabled: true, start: '22:00', end: '06:00' } });
    expect(plan('medium', { preferences: later })).toEqual({ now: ['email'], escalation: null });
    const off = prefs({ quietHours: { ...quietHours, enabled: false } });
    expect(plan('medium', { preferences: off })).toEqual({ now: ['email'], escalation: null });
  });
});

describe('external message texts', () => {
  const longLink = 'https://api.kaziforce.example.co.ke/o/Ab3dEf7h';
  const categories = ['new_job', 'application_update', 'new_applicant', 'message', 'announcement'];

  it('every SMS is plain GSM text, one SMS (160 characters) at most, in English and Kiswahili', () => {
    for (const language of ['en', 'sw'] as const) {
      for (const priority of ['urgent', 'medium', 'low'] as const) {
        for (const category of categories) {
          const text = shortText(
            summaryFor(category, priority, language),
            longLink,
            priority,
            language,
          );
          expect(text.length, text).toBeLessThanOrEqual(SMS_MAX);
          expect(isGsm(text), text).toBe(true);
          expect(text).toContain(longLink);
        }
      }
    }
    expect(shortText('You have a new message', longLink, 'urgent', 'en')).toBe(
      `KaziForce (Urgent): You have a new message. Open: ${longLink}`,
    );
    expect(shortText('Una ujumbe mpya', longLink, 'medium', 'sw')).toBe(
      `KaziForce: Una ujumbe mpya. Fungua: ${longLink}`,
    );
  });

  it('never contains personal details: only the kind of alert and the link', () => {
    const summaries = ['en', 'sw'].flatMap((l) =>
      categories.map((c) => summaryFor(c, 'urgent', l as 'en' | 'sw')),
    );
    for (const s of summaries) expect(s).not.toMatch(/Wanjiru|Mwangi|KSh|\d/);
  });

  it('turns curly quotes, dashes and emoji into plain SMS characters', () => {
    expect(toGsm('It’s “urgent” – now 👍…')).toBe('It\'s "urgent" - now ...');
  });

  it('the email has one button that opens the alert and a way to change settings', () => {
    const email = emailContent({
      summary: 'News about your job application',
      link: longLink,
      settingsUrl: 'http://localhost:5173/worker/settings',
      priority: 'medium',
      language: 'en',
    });
    expect(email.subject).toBe('News about your job application');
    expect(email.html.match(/<a /g)).toHaveLength(2); // the button + "change settings"
    expect(email.html).toContain(`href="${longLink}"`);
    expect(email.html).toContain('Open in KaziForce');
    expect(email.html).toContain('max-width:480px');
    expect(email.text).toContain(longLink);
  });
});

describe('Twilio webhook signature', () => {
  const url = 'https://api.example.com/webhooks/twilio/status';
  const params = { MessageSid: 'SM123', MessageStatus: 'read', To: 'whatsapp:+254712345678' };

  it('accepts a correctly signed request and refuses tampered or unsigned ones', () => {
    const signature = twilioSignature('secret-token', url, params);
    expect(isValidTwilioSignature('secret-token', url, params, signature)).toBe(true);
    expect(
      isValidTwilioSignature(
        'secret-token',
        url,
        { ...params, MessageStatus: 'failed' },
        signature,
      ),
    ).toBe(false);
    expect(isValidTwilioSignature('other-token', url, params, signature)).toBe(false);
    expect(isValidTwilioSignature('secret-token', url, params, undefined)).toBe(false);
  });
});

describe('WhatsApp through Twilio (sandbox)', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function sentForm(statusCallbackUrl: string) {
    const fetchMock = vi.fn(async () => Response.json({ sid: 'SM123' }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WhatsAppAdapter(
      { mode: 'sandbox', logger: pino({ level: 'silent' }) },
      {
        accountSid: 'AC1',
        authToken: 't',
        from: 'whatsapp:+14155238886',
        templates: {},
        statusCallbackUrl,
      },
    );
    const result = await adapter.send({
      notificationId: 'n1',
      to: '+254712345678',
      language: 'en',
      text: 'KaziForce (Urgent): New job. Open: https://x/o/abc',
      summary: 'New job',
      link: 'https://x/o/abc',
    });
    expect(result.providerMessageId).toBe('SM123');
    return (fetchMock.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
  }

  it('asks for delivery reports at a public address', async () => {
    const form = await sentForm('https://abc.ngrok.app/webhooks/twilio/status');
    expect(form.get('StatusCallback')).toBe('https://abc.ngrok.app/webhooks/twilio/status');
    expect(form.get('To')).toBe('whatsapp:+254712345678');
  });

  it('still sends from a computer Twilio cannot reach (no tunnel), without delivery reports', async () => {
    const form = await sentForm('http://localhost:4000/webhooks/twilio/status');
    expect(form.has('StatusCallback')).toBe(false);
    expect(form.get('Body')).toContain('KaziForce (Urgent)');
  });
});
