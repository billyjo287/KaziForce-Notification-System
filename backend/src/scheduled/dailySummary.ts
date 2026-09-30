// The daily summary email (PRD FR-8): at 08:00 Africa/Nairobi, everyone with the setting on gets
// the last 24 hours of LOW notifications, grouped by category, each with a link into the app, and
// a "Manage your notification preferences" button. Nothing to summarise = no email.
import type { Language, PrismaClient, Role } from '../generated/prisma/client.js';
import { emailButton, emailLayout, escapeHtml } from '../channels/messages.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Longer groups show the newest ones and "and 4 more", so the email stays short. */
const MAX_PER_GROUP = 8;

const CATEGORY_ORDER = [
  'new_job',
  'application_update',
  'new_applicant',
  'message',
  'announcement',
];

const WORDS: Record<
  Language,
  {
    headings: Record<string, string>;
    other: string;
    subject: (count: number) => string;
    intro: string;
    more: (count: number) => string;
    button: string;
    footer: string;
  }
> = {
  en: {
    headings: {
      new_job: 'New jobs',
      application_update: 'Your job applications',
      new_applicant: 'People who applied for your jobs',
      message: 'Messages',
      announcement: 'News from KaziForce',
    },
    other: 'Other updates',
    subject: (n) => `Your KaziForce summary: ${n} ${n === 1 ? 'update' : 'updates'}`,
    intro:
      'Here is what happened in the last 24 hours. None of it was urgent, so we saved it for this email.',
    more: (n) => `and ${n} more in the app`,
    button: 'Manage your notification preferences',
    footer: 'You get this email once a day because the daily summary is on. No news, no email.',
  },
  sw: {
    headings: {
      new_job: 'Kazi mpya',
      application_update: 'Maombi yako ya kazi',
      new_applicant: 'Watu walioomba kazi zako',
      message: 'Ujumbe',
      announcement: 'Habari kutoka KaziForce',
    },
    other: 'Taarifa nyingine',
    subject: (n) => `Muhtasari wako wa KaziForce: taarifa ${n}`,
    intro:
      'Haya ndiyo yaliyotokea katika saa 24 zilizopita. Hakuna lililokuwa la haraka, kwa hivyo tuliyahifadhi kwa barua pepe hii.',
    more: (n) => `na mengine ${n} kwenye programu`,
    button: 'Dhibiti mipangilio ya arifa zako',
    footer:
      'Unapokea barua pepe hii mara moja kwa siku kwa sababu muhtasari wa kila siku umewashwa. Bila habari, hakuna barua pepe.',
  },
};

export interface SummaryItem {
  id: string;
  category: string;
  title: string;
  createdAt: Date;
}

export interface SummaryGroup {
  category: string;
  heading: string;
  /** Newest first, at most MAX_PER_GROUP. */
  items: SummaryItem[];
  /** How many more are not listed. */
  more: number;
}

/** Groups by category in a fixed order (unknown categories last, as "Other updates"). */
export function groupForSummary(items: SummaryItem[], language: Language): SummaryGroup[] {
  const w = WORDS[language];
  const byCategory = new Map<string, SummaryItem[]>();
  for (const item of items) {
    const key = CATEGORY_ORDER.includes(item.category) ? item.category : 'other';
    byCategory.set(key, [...(byCategory.get(key) ?? []), item]);
  }
  return [...CATEGORY_ORDER, 'other']
    .filter((category) => byCategory.has(category))
    .map((category) => {
      const all = byCategory
        .get(category)!
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return {
        category,
        heading: w.headings[category] ?? w.other,
        items: all.slice(0, MAX_PER_GROUP),
        more: Math.max(0, all.length - MAX_PER_GROUP),
      };
    });
}

export function summaryEmail(input: {
  language: Language;
  groups: SummaryGroup[];
  /** The person's side of the app, e.g. http://localhost:5173/worker */
  appUrl: string;
}) {
  const w = WORDS[input.language];
  const count = input.groups.reduce((total, g) => total + g.items.length + g.more, 0);
  const subject = w.subject(count);
  const alertLink = (id: string) => `${input.appUrl}/alerts?open=${id}`;
  const settingsUrl = `${input.appUrl}/settings#notifications`;

  const text = [
    w.intro,
    ...input.groups.flatMap((g) => [
      '',
      `${g.heading} (${g.items.length + g.more})`,
      ...g.items.map((item) => `- ${item.title}: ${alertLink(item.id)}`),
      ...(g.more ? [`- ${w.more(g.more)}: ${input.appUrl}/alerts`] : []),
    ]),
    '',
    `${w.button}: ${settingsUrl}`,
    '',
    w.footer,
  ].join('\n');

  const link = (href: string, label: string) =>
    `<a href="${escapeHtml(href)}" style="color:#0b6b45;font-weight:bold;">${escapeHtml(label)}</a>`;
  const groupsHtml = input.groups
    .map(
      (
        g,
      ) => `<h2 style="margin:24px 0 8px;font-size:18px;line-height:1.3;">${escapeHtml(g.heading)} (${g.items.length + g.more})</h2>
            <ul style="margin:0;padding:0 0 0 20px;font-size:16px;line-height:1.5;">
              ${g.items.map((item) => `<li style="margin:0 0 8px;">${link(alertLink(item.id), item.title)}</li>`).join('\n              ')}${
                g.more
                  ? `\n              <li style="margin:0 0 8px;">${link(`${input.appUrl}/alerts`, w.more(g.more))}</li>`
                  : ''
              }
            </ul>`,
    )
    .join('\n            ');

  const html = emailLayout({
    language: input.language,
    subject,
    preview: w.intro,
    body: `<h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;font-weight:bold;">${escapeHtml(subject)}</h1>
            <p style="margin:0;font-size:16px;line-height:1.5;">${escapeHtml(w.intro)}</p>
            ${groupsHtml}
            <div style="height:28px;"></div>
            ${emailButton(w.button, settingsUrl)}
            <p style="margin:28px 0 0;font-size:14px;line-height:1.5;color:#57534e;">${escapeHtml(w.footer)}</p>`,
  });
  return { subject, text, html, count };
}

const sidePath = (role: Role) => (role === 'business' ? 'employer' : 'worker');

/** LOW notifications of the 24 hours before `until`, not spam, not marked "Not important to me". */
const lowNotificationsWhere = (until: Date) => ({
  createdAt: { gt: new Date(until.getTime() - DAY_MS), lte: until },
  isSpam: false,
  markedNotImportant: false,
  OR: [
    { correctedPriority: 'low' as const },
    { correctedPriority: null, predictedPriority: 'low' as const },
  ],
});

/** Who gets a summary this morning: the setting is on, the account is in use, there is news. */
export async function summaryRecipients(prisma: PrismaClient, until: Date): Promise<string[]> {
  const rows = await prisma.notification.findMany({
    where: {
      ...lowNotificationsWhere(until),
      recipient: {
        status: 'active',
        deletionRequestedAt: null,
        role: { not: 'admin' },
        preference: { dailySummary: true },
      },
    },
    distinct: ['recipientId'],
    select: { recipientId: true },
  });
  return rows.map((r) => r.recipientId);
}

/** One person's summary email, or null if there is nothing to send (checked again here). */
export async function buildSummaryFor(
  prisma: PrismaClient,
  userId: string,
  until: Date,
  publicAppUrl: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      role: true,
      language: true,
      status: true,
      deletionRequestedAt: true,
      preference: { select: { dailySummary: true } },
    },
  });
  if (
    !user ||
    user.status !== 'active' ||
    user.deletionRequestedAt ||
    user.role === 'admin' ||
    !user.preference?.dailySummary
  ) {
    return null;
  }
  const items = await prisma.notification.findMany({
    where: { recipientId: userId, ...lowNotificationsWhere(until) },
    select: { id: true, category: true, title: true, createdAt: true },
  });
  if (items.length === 0) return null;
  const email = summaryEmail({
    language: user.language,
    groups: groupForSummary(items, user.language),
    appUrl: `${publicAppUrl.replace(/\/$/, '')}/${sidePath(user.role)}`,
  });
  return { to: user.email, ...email };
}
