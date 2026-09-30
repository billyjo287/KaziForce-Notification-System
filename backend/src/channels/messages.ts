// The words of external messages (SMS, WhatsApp, email), in English and Kiswahili (PRD FR-4):
// a short summary + a link, and never any personal details (no names, no message text, no job
// details), so a lost or stolen phone reveals little. The details are in the app, after login.
// SMS: plain GSM characters (no emoji, no curly quotes), at most 160 = one SMS.
import type { Language, Priority } from '../generated/prisma/client.js';

export const SMS_MAX = 160;

type Summaries = Record<string, { urgent: string; normal: string }>;

const SUMMARIES: Record<Language, Summaries> = {
  en: {
    new_job: { urgent: 'An urgent job near you', normal: 'A new job near you' },
    application_update: {
      urgent: 'Urgent news about your job application',
      normal: 'News about your job application',
    },
    new_applicant: {
      urgent: 'Someone applied for your job',
      normal: 'Someone applied for your job',
    },
    message: { urgent: 'You have an urgent new message', normal: 'You have a new message' },
    announcement: { urgent: 'News from KaziForce', normal: 'News from KaziForce' },
  },
  sw: {
    new_job: { urgent: 'Kazi ya haraka karibu nawe', normal: 'Kazi mpya karibu nawe' },
    application_update: {
      urgent: 'Habari ya haraka kuhusu ombi lako la kazi',
      normal: 'Habari kuhusu ombi lako la kazi',
    },
    new_applicant: { urgent: 'Mtu ameomba kazi yako', normal: 'Mtu ameomba kazi yako' },
    message: { urgent: 'Una ujumbe mpya wa haraka', normal: 'Una ujumbe mpya' },
    announcement: { urgent: 'Habari kutoka KaziForce', normal: 'Habari kutoka KaziForce' },
  },
};

const WORDS: Record<
  Language,
  { open: string; button: string; footer: string; settings: string; urgent: string }
> = {
  en: {
    open: 'Open',
    button: 'Open in KaziForce',
    footer: 'You get this email because of your KaziForce settings.',
    settings: 'Change what we send you',
    urgent: 'Urgent',
  },
  sw: {
    open: 'Fungua',
    button: 'Fungua KaziForce',
    footer: 'Unapokea barua pepe hii kwa sababu ya mipangilio yako ya KaziForce.',
    settings: 'Badilisha tunachokutumia',
    urgent: 'Haraka',
  },
};

/** The short summary for a notification category, e.g. "You have a new message". */
export function summaryFor(category: string, priority: Priority, language: Language): string {
  const entry = SUMMARIES[language][category] ?? SUMMARIES[language].announcement!;
  return priority === 'urgent' ? entry.urgent : entry.normal;
}

// GSM 03.38 basic character set: what one SMS can carry at 160 characters.
const GSM =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_SET = new Set(GSM);

export const isGsm = (text: string) => [...text].every((c) => GSM_SET.has(c));

/** Replaces characters one SMS cannot carry (curly quotes, dashes, emoji) with plain ones. */
export function toGsm(text: string): string {
  return [...text]
    .map((c) => {
      if (GSM_SET.has(c)) return c;
      if ('‘’‛′'.includes(c)) return "'";
      if ('“”„″'.includes(c)) return '"';
      if ('–—‒―'.includes(c)) return '-';
      if (c === '…') return '...';
      if (/\s/.test(c)) return ' ';
      return '';
    })
    .join('');
}

/** SMS and WhatsApp text: "KaziForce (Urgent): You have a new message. Open: <link>". */
export function shortText(summary: string, link: string, priority: Priority, language: Language) {
  const w = WORDS[language];
  const label = priority === 'urgent' ? `KaziForce (${w.urgent})` : 'KaziForce';
  const text = toGsm(`${label}: ${summary}. ${w.open}: ${link}`);
  // Never more than one SMS: fall back to the bare minimum if a long link would not fit.
  return text.length <= SMS_MAX ? text : toGsm(`${label}: ${link}`).slice(0, SMS_MAX);
}

export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const GREEN = '#0b6b45';

/** A big green button that works in every email app (a table cell around a link). */
export function emailButton(label: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius:10px;background:${GREEN};">
                  <a href="${escapeHtml(href)}" style="display:inline-block;padding:16px 28px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
                </td>
              </tr>
            </table>`;
}

/**
 * The frame every KaziForce email shares: one narrow white card on a warm background, built with
 * tables and inline styles, which Gmail (including the phone app) displays reliably.
 * `body` is HTML; everything put into it must already be escaped.
 */
export function emailLayout(input: {
  language: Language;
  subject: string;
  /** The grey line email apps show next to the subject. */
  preview: string;
  body: string;
}) {
  return `<!doctype html>
<html lang="${input.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#faf8f5;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(input.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f5;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:12px;">
        <tr>
          <td style="padding:28px 24px;font-family:Arial,Helvetica,sans-serif;color:#1c1917;">
            <p style="margin:0 0 16px;font-size:16px;font-weight:bold;color:${GREEN};">KaziForce</p>
            ${input.body}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** The notification email: short, plain language, one big button (PRD FR-4, MEDIUM priority). */
export function emailContent(input: {
  summary: string;
  link: string;
  settingsUrl: string;
  priority: Priority;
  language: Language;
}) {
  const w = WORDS[input.language];
  const subject = input.priority === 'urgent' ? `${w.urgent}: ${input.summary}` : input.summary;
  const text = [
    input.summary,
    '',
    `${w.button}: ${input.link}`,
    '',
    w.footer,
    `${w.settings}: ${input.settingsUrl}`,
  ].join('\n');

  const html = emailLayout({
    language: input.language,
    subject,
    preview: input.summary,
    body: `<h1 style="margin:0 0 24px;font-size:24px;line-height:1.3;font-weight:bold;">${escapeHtml(input.summary)}</h1>
            ${emailButton(w.button, input.link)}
            <p style="margin:28px 0 0;font-size:14px;line-height:1.5;color:#57534e;">${escapeHtml(w.footer)}<br><a href="${escapeHtml(input.settingsUrl)}" style="color:${GREEN};">${escapeHtml(w.settings)}</a></p>`,
  });
  return { subject, text, html };
}
