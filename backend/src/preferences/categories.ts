// Alert categories and the per-category settings (SRS FR-NOT-031, FR-NOT-032, FR-NOT-035; ADR
// 0016). Each person may switch a category off or keep it away from some channels; an admin may
// make a category mandatory ("Always send"), which overrides both.
//
//   off        kept quietly in the person's history (marked read): no live pop-up, no SMS/email,
//              not in the summary.
//   channels   the external channels this category may use. They narrow the person's channel
//              settings, never widen them (a channel switched off stays off).
import type { PrismaClient, Role } from '../generated/prisma/client.js';
import type { ExternalChannel } from '../modules/me/presets.js';

export const CATEGORIES = [
  'new_job',
  'application_update',
  'new_applicant',
  'message',
  'announcement',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Which categories each side of the app receives (shown on the settings screen). */
export const CATEGORIES_FOR: Record<Exclude<Role, 'admin'>, Category[]> = {
  worker: ['new_job', 'application_update', 'message', 'announcement'],
  business: ['new_applicant', 'message', 'announcement'],
};

const EXTERNAL: ExternalChannel[] = ['whatsapp', 'sms', 'email'];

// A type, not an interface, so it can be saved as JSON.
export type CategorySetting = {
  enabled: boolean;
  channels: ExternalChannel[];
};
export type CategorySettings = Record<Category, CategorySetting>;

const ON: CategorySetting = { enabled: true, channels: EXTERNAL };

export const isCategory = (value: string): value is Category =>
  (CATEGORIES as readonly string[]).includes(value);

/** Settings saved as JSON: anything missing or broken means "on, every channel". */
export function normalizeCategorySettings(saved: unknown): CategorySettings {
  const s = (saved ?? {}) as Partial<Record<string, { enabled?: unknown; channels?: unknown }>>;
  const result = {} as CategorySettings;
  for (const category of CATEGORIES) {
    const value = s[category];
    result[category] = {
      enabled: typeof value?.enabled === 'boolean' ? value.enabled : true,
      channels: Array.isArray(value?.channels)
        ? EXTERNAL.filter((c) => (value.channels as unknown[]).includes(c))
        : EXTERNAL,
    };
  }
  return result;
}

/** The setting that applies: a mandatory category is always on, on every channel. */
export function effectiveCategorySetting(
  settings: CategorySettings | undefined,
  category: string,
  mandatory: ReadonlySet<string>,
): CategorySetting {
  if (mandatory.has(category) || !isCategory(category) || !settings) return ON;
  return settings[category] ?? ON;
}

const CACHE_MS = 30_000;

/**
 * The categories an admin made mandatory. Read for every alert, so kept in memory for 30 s: a
 * change reaches the worker within half a minute, and this process at once (clear()).
 */
export function createMandatoryCategories(prisma: PrismaClient) {
  let cached: { at: number; value: Set<string> } | null = null;
  return {
    async get(): Promise<Set<string>> {
      if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
      const rows = await prisma.notificationRule.findMany({
        where: { mandatory: true },
        select: { category: true },
      });
      cached = { at: Date.now(), value: new Set(rows.map((r) => r.category)) };
      return cached.value;
    },
    clear() {
      cached = null;
    },
  };
}
export type MandatoryCategories = ReturnType<typeof createMandatoryCategories>;
