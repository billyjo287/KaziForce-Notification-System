// Admin-editable wording of SMS and email alerts (SRS FR-NOT-003, FR-NOT-011; ADR 0016). The
// wording is the one short summary line every external message is built from ("You have a new
// message"), per category, language and urgency. The newest saved version wins; none (or a
// "back to default" version) means the built-in wording in messages.ts.
//
// Rules for saved wording: plain characters one SMS can carry (no emoji or curly quotes), at
// most WORDING_MAX characters so the SMS with its label and link stays one message, and no
// placeholders at all, so a message can never carry personal details (CLAUDE.md decision 10).
// WhatsApp keeps Twilio's pre-approved templates, which the summary only fills in.
import type { Language, Priority, PrismaClient } from '../generated/prisma/client.js';
import { CATEGORIES } from '../preferences/categories.js';
import { summaryFor, toGsm } from './messages.js';

/** Longest wording: "KaziForce (Sasa hivi): " + wording + ". Fungua: " + a ~45-character link. */
export const WORDING_MAX = 80;
export const LANGUAGES: Language[] = ['en', 'sw'];

/** Why a wording cannot be saved, or null if it can. */
export function wordingProblem(text: string): 'empty' | 'too_long' | 'characters' | null {
  const trimmed = text.trim();
  if (trimmed.length < 3) return 'empty';
  if (trimmed.length > WORDING_MAX) return 'too_long';
  if (toGsm(trimmed) !== trimmed) return 'characters';
  return null;
}

export interface WordingRow {
  category: string;
  language: Language;
  urgent: boolean;
  /** The built-in wording. */
  defaultText: string;
  /** The saved wording in use, or null when the built-in one is used. */
  text: string | null;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

const keyOf = (category: string, language: Language, urgent: boolean) =>
  `${category}:${language}:${urgent ? 'urgent' : 'normal'}`;

/** The newest version of every (category, language, urgency) that has been saved. */
async function newestVersions(prisma: PrismaClient) {
  const rows = await prisma.messageWording.findMany({
    orderBy: { version: 'desc' },
    include: { createdBy: { select: { name: true } } },
  });
  const newest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = keyOf(row.category, row.language, row.urgent);
    if (!newest.has(key)) newest.set(key, row);
  }
  return newest;
}

/** Every wording the admin page shows: 5 categories x 2 languages x normal/urgent. */
export async function listWording(prisma: PrismaClient): Promise<WordingRow[]> {
  const newest = await newestVersions(prisma);
  return CATEGORIES.flatMap((category) =>
    LANGUAGES.flatMap((language) =>
      [false, true].map((urgent) => {
        const row = newest.get(keyOf(category, language, urgent));
        return {
          category,
          language,
          urgent,
          defaultText: summaryFor(category, urgent ? 'urgent' : 'medium', language),
          text: row?.text ?? null,
          version: row?.version ?? 0,
          updatedAt: row?.createdAt.toISOString() ?? null,
          updatedBy: row?.createdBy?.name ?? null,
        };
      }),
    ),
  );
}

/** Saves a new version (text null = back to the built-in wording). Old versions stay. */
export async function saveWording(
  prisma: PrismaClient,
  input: { category: string; language: Language; urgent: boolean; text: string | null },
  adminId: string,
) {
  const { category, language, urgent } = input;
  const last = await prisma.messageWording.findFirst({
    where: { category, language, urgent },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return prisma.messageWording.create({
    data: {
      category,
      language,
      urgent,
      text: input.text?.trim() ?? null,
      version: (last?.version ?? 0) + 1,
      createdById: adminId,
    },
  });
}

const CACHE_MS = 30_000;

/**
 * The summary line for one alert. Read for every SMS and email, so the saved wording is kept in
 * memory for 30 s: a change reaches the worker within half a minute.
 */
export function createWording(prisma: PrismaClient) {
  let cached: { at: number; texts: Map<string, string> } | null = null;
  async function saved() {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.texts;
    const texts = new Map<string, string>();
    for (const [key, row] of await newestVersions(prisma)) if (row.text) texts.set(key, row.text);
    cached = { at: Date.now(), texts };
    return texts;
  }
  return {
    async summary(category: string, priority: Priority, language: Language): Promise<string> {
      const urgent = priority === 'urgent';
      const custom = await saved()
        .then((texts) => texts.get(keyOf(category, language, urgent)))
        .catch(() => undefined); // database hiccup: the built-in wording still works
      return custom ?? summaryFor(category, priority, language);
    },
    clear() {
      cached = null;
    },
  };
}
export type Wording = ReturnType<typeof createWording>;
