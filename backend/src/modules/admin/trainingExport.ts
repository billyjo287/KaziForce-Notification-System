// The anonymised training data export (PRD FR-9, DR-2, DR-6): one CSV row per notification with
// what the classifier saw, what it answered, the admin's corrections, and what the person did.
//
// Nothing in it can be traced back to a person:
//   - user and notification ids become random tokens. The key is made fresh for every export
//     and thrown away, so the same person has the same token within one file (the model can
//     learn from their history) but different tokens in two files, and nobody can reverse them.
//   - no names, phone numbers or emails: they are never exported as columns, and the text is
//     scrubbed: every user's name and company name, and anything that looks like a phone
//     number or an email address, becomes [NAME], [PHONE] or [EMAIL].
import { createHmac, randomBytes } from 'node:crypto';
import type { Channel, PrismaClient } from '../../generated/prisma/client.js';
import { TIMEZONE } from '../../preferences/quietHours.js';

export const CSV_COLUMNS = [
  // who / what (tokens, never ids)
  'notification_token',
  'recipient_token',
  'sender_token',
  'recipient_role',
  'sender_role',
  'type',
  'category',
  // the input (FR-2 contract), scrubbed
  'title',
  'text',
  'created_at',
  'hour_of_day',
  'day_of_week',
  'deadline_minutes',
  // the classifier's answer
  'predicted_priority',
  'priority_confidence',
  'is_spam',
  'spam_score',
  'model_version',
  'prediction_source',
  // admin corrections, and the label to train on (correction if any, else the prediction)
  'corrected_priority',
  'corrected_spam',
  'label_priority',
  'label_spam',
  // delivery and what the person did
  'status',
  'channels_sent',
  'escalated_to',
  'held_for_quiet_hours',
  'delivered',
  'opened',
  'opened_via',
  'clicked',
  'dismissed',
  'marked_not_important',
  'delivery_failures',
  'response_seconds',
] as const;

type Row = Record<(typeof CSV_COLUMNS)[number], string | number | boolean | null>;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
// Kenyan and international numbers: +254 712 345 678, 0712345678, 0712-345-678, +44 20 7946 0958
const PHONE = /(?<!\w)(\+\d{1,3}[\s-]?)?\(?0?\d{2,3}\)?([\s-]?\d){6,9}(?!\w)/g;

/**
 * Removes personal details from free text. `names` are every user's name, its parts (at least
 * 4 letters, so short words are not touched) and every company name.
 */
export function makeScrubber(names: string[]) {
  const unique = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 3))].sort(
    (a, b) => b.length - a.length,
  );
  const namePattern = unique.length
    ? new RegExp(
        `(?<![\\p{L}\\p{N}])(${unique.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`,
        'giu',
      )
    : null;
  return (text: string) => {
    let out = text.replace(EMAIL, '[EMAIL]').replace(PHONE, '[PHONE]');
    if (namePattern) out = out.replace(namePattern, '[NAME]');
    return out;
  };
}

/** Names to scrub: full names, their longer parts, and company names. */
export function namesToScrub(users: { name: string; companyName: string | null }[]) {
  return users.flatMap((u) => [
    u.name,
    ...u.name.split(/\s+/).filter((part) => part.length >= 4),
    ...(u.companyName ? [u.companyName] : []),
  ]);
}

/** A random key per export: tokens are stable inside one file only. */
export function makeTokenizer(key = randomBytes(32)) {
  return (id: string | null) =>
    id ? createHmac('sha256', key).update(id).digest('base64url').slice(0, 12) : null;
}

/** One value as CSV: quoted when needed; formulas defused so a spreadsheet never runs them. */
export function csvValue(value: string | number | boolean | null): string {
  if (value === null) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && typeof value === 'string') s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvLine = (values: (string | number | boolean | null)[]) =>
  values.map(csvValue).join(',') + '\r\n';

const local = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

const deliveriesSelect = {
  channel: true,
  status: true,
  sentAt: true,
  deliveredAt: true,
  openedAt: true,
  clickedAt: true,
  dismissedAt: true,
} as const;

type Delivery = {
  channel: Channel;
  status: string;
  sentAt: Date | null;
  deliveredAt: Date | null;
  openedAt: Date | null;
  clickedAt: Date | null;
  dismissedAt: Date | null;
};

type Source = {
  id: string;
  recipientId: string;
  senderId: string | null;
  recipientRole: string;
  senderRole: string;
  type: string;
  category: string;
  title: string;
  message: string;
  createdAt: Date;
  deadlineAt: Date | null;
  predictedPriority: string | null;
  priorityConfidence: number | null;
  isSpam: boolean;
  spamScore: number | null;
  modelVersion: string | null;
  predictionSource: string | null;
  correctedPriority: string | null;
  correctedSpam: boolean | null;
  status: string;
  escalatedTo: Channel | null;
  heldUntil: Date | null;
  readAt: Date | null;
  markedNotImportant: boolean;
  deliveries: Delivery[];
};

const min = (dates: (Date | null)[]) =>
  dates.reduce<Date | null>((best, d) => (d && (!best || d < best) ? d : best), null);

export function toRow(
  n: Source,
  token: (id: string | null) => string | null,
  scrub: (s: string) => string,
): Row {
  const parts = Object.fromEntries(local.formatToParts(n.createdAt).map((p) => [p.type, p.value]));
  const sent = n.deliveries.filter((d) => d.sentAt);
  const firstSent = min(sent.map((d) => d.sentAt));
  // Opened = read in the app, a tracked link, or a WhatsApp "read" (PRD FR-4).
  const opens = [
    ...(n.readAt ? [{ channel: 'in_app' as Channel, at: n.readAt }] : []),
    ...n.deliveries.flatMap((d) => {
      const at = min([d.openedAt, d.clickedAt]);
      return at ? [{ channel: d.channel, at }] : [];
    }),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const firstOpen = opens[0] ?? null;
  const labelPriority = n.correctedPriority ?? n.predictedPriority ?? 'medium';

  return {
    notification_token: token(n.id),
    recipient_token: token(n.recipientId),
    sender_token: token(n.senderId),
    recipient_role: n.recipientRole,
    sender_role: n.senderRole,
    type: n.type,
    category: n.category,
    title: scrub(n.title),
    text: scrub(n.message),
    created_at: n.createdAt.toISOString(),
    hour_of_day: Number(parts.hour),
    day_of_week: parts.weekday ?? null,
    deadline_minutes: n.deadlineAt
      ? Math.round((n.deadlineAt.getTime() - n.createdAt.getTime()) / 60_000)
      : null,
    predicted_priority: n.predictedPriority,
    priority_confidence: n.priorityConfidence,
    is_spam: n.isSpam,
    spam_score: n.spamScore,
    model_version: n.modelVersion,
    prediction_source: n.predictionSource,
    corrected_priority: n.correctedPriority,
    corrected_spam: n.correctedSpam,
    label_priority: labelPriority,
    label_spam: n.correctedSpam ?? n.isSpam,
    status: n.status,
    channels_sent: [...new Set(sent.map((d) => d.channel))].join(';'),
    escalated_to: n.escalatedTo,
    held_for_quiet_hours: n.heldUntil !== null,
    delivered: n.deliveries.some((d) => d.deliveredAt),
    opened: firstOpen !== null,
    opened_via: firstOpen?.channel ?? null,
    clicked: n.deliveries.some((d) => d.clickedAt),
    dismissed: n.deliveries.some((d) => d.dismissedAt),
    marked_not_important: n.markedNotImportant,
    delivery_failures: n.deliveries.filter((d) => d.status === 'failed').length,
    // Response time = opened - sent (CLAUDE.md section 6), in seconds.
    response_seconds:
      firstOpen && firstSent
        ? Math.max(0, Math.round((firstOpen.at.getTime() - firstSent.getTime()) / 1000))
        : null,
  };
}

/** Writes the whole export, a page at a time, so memory stays small however big it gets. */
export async function writeTrainingCsv(
  prisma: PrismaClient,
  write: (chunk: string) => void,
  range: { from?: Date; to?: Date } = {},
) {
  const users = await prisma.user.findMany({ select: { name: true, companyName: true } });
  const scrub = makeScrubber(namesToScrub(users));
  const token = makeTokenizer();
  write(csvLine([...CSV_COLUMNS]));

  let cursor: string | undefined;
  let rows = 0;
  for (;;) {
    const page = await prisma.notification.findMany({
      where: { createdAt: { gte: range.from, lt: range.to } },
      include: { deliveries: { select: deliveriesSelect } },
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });
    if (page.length === 0) break;
    for (const n of page) {
      const row = toRow(n, token, scrub);
      write(csvLine(CSV_COLUMNS.map((c) => row[c])));
    }
    rows += page.length;
    cursor = page.at(-1)!.id;
  }
  return rows;
}
