// UserPreferenceManager: one place to read and change a person's notification preferences
// (PRD FR-5). The delivery engine reads them for every alert, so they are cached in Redis; every
// change goes through update() (or invalidate()), which removes the cached copy at once.
//
// A cached copy lives at most CACHE_SECONDS, which bounds one rare race: the worker reads the
// database just before a change and stores the old copy just after it is removed.
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Channel, Preset, Prisma, PrismaClient } from '../generated/prisma/client.js';
import { PRESETS, type ChannelSettings, type ExternalChannel } from '../modules/me/presets.js';
import { NO_QUIET_HOURS, normalizeQuietHours, type QuietHours } from './quietHours.js';

const CACHE_SECONDS = 300;
const THRESHOLDS = new Set(['everything', 'urgent_and_important', 'urgent_only']);
const EXTERNAL: ExternalChannel[] = ['whatsapp', 'sms', 'email'];

export interface UserPreferences {
  preset: Preset;
  channelOrder: ExternalChannel[];
  channelSettings: ChannelSettings;
  urgentOnBothChannels: boolean;
  quietHours: QuietHours;
  dailySummary: boolean;
}

/** Used when a person has no preferences row (e.g. admins): the Recommended preset. */
export const DEFAULT_PREFERENCES: UserPreferences = {
  preset: 'recommended',
  channelOrder: ['whatsapp', 'sms', 'email'],
  channelSettings: PRESETS.recommended.channelSettings,
  urgentOnBothChannels: false,
  quietHours: NO_QUIET_HOURS,
  dailySummary: true,
};

/** Settings saved as JSON: anything missing or broken falls back to the Recommended preset. */
export function normalizeChannelSettings(saved: unknown): ChannelSettings {
  const s = (saved ?? {}) as Partial<Record<string, { enabled?: unknown; threshold?: unknown }>>;
  const result = {} as ChannelSettings;
  for (const channel of EXTERNAL) {
    const fallback = PRESETS.recommended.channelSettings[channel];
    const value = s[channel];
    result[channel] = {
      enabled: typeof value?.enabled === 'boolean' ? value.enabled : fallback.enabled,
      threshold:
        typeof value?.threshold === 'string' && THRESHOLDS.has(value.threshold)
          ? (value.threshold as ChannelSettings[ExternalChannel]['threshold'])
          : fallback.threshold,
    };
  }
  return result;
}

/** The preset these settings match exactly, or "custom" (the person changed something). */
export function presetFor(channelSettings: ChannelSettings, dailySummary: boolean): Preset {
  for (const [name, preset] of Object.entries(PRESETS)) {
    const same = EXTERNAL.every(
      (c) =>
        preset.channelSettings[c].enabled === channelSettings[c].enabled &&
        preset.channelSettings[c].threshold === channelSettings[c].threshold,
    );
    if (same && preset.dailySummary === dailySummary) return name as Preset;
  }
  return 'custom';
}

type Row = {
  preset: Preset;
  channelOrder: Channel[];
  channelSettings: unknown;
  urgentOnBothChannels: boolean;
  quietHours: unknown;
  dailySummary: boolean;
};

export function toPreferences(row: Row | null): UserPreferences {
  if (!row) return DEFAULT_PREFERENCES;
  return {
    preset: row.preset,
    channelOrder: row.channelOrder.filter((c): c is ExternalChannel => c !== 'in_app'),
    channelSettings: normalizeChannelSettings(row.channelSettings),
    urgentOnBothChannels: row.urgentOnBothChannels,
    quietHours: normalizeQuietHours(row.quietHours),
    dailySummary: row.dailySummary,
  };
}

const select = {
  preset: true,
  channelOrder: true,
  channelSettings: true,
  urgentOnBothChannels: true,
  quietHours: true,
  dailySummary: true,
} as const;

export class UserPreferenceManager {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly prefix: string,
    private readonly logger?: Logger,
  ) {}

  private key(userId: string) {
    return `${this.prefix}:preferences:${userId}`;
  }

  /** The person's preferences: from the cache, or the database (then cached). */
  async get(userId: string): Promise<UserPreferences> {
    try {
      const cached = await this.redis.get(this.key(userId));
      if (cached) return JSON.parse(cached) as UserPreferences;
    } catch (error) {
      // Redis briefly down: the database still has the answer.
      this.logger?.warn({ err: error }, 'Preference cache unavailable');
    }
    const row = await this.prisma.userPreference.findUnique({ where: { userId }, select });
    const preferences = toPreferences(row);
    try {
      await this.redis.set(this.key(userId), JSON.stringify(preferences), 'EX', CACHE_SECONDS);
    } catch {
      // Not cached this time; nothing else to do.
    }
    return preferences;
  }

  /** Changes the saved preferences and removes the cached copy. */
  async update(userId: string, data: Prisma.UserPreferenceUpdateInput): Promise<UserPreferences> {
    const row = await this.prisma.userPreference.update({ where: { userId }, data, select });
    await this.invalidate(userId);
    return toPreferences(row);
  }

  /** For changes made elsewhere (e.g. a WhatsApp STOP): the next read goes to the database. */
  async invalidate(userId: string): Promise<void> {
    try {
      await this.redis.del(this.key(userId));
    } catch (error) {
      this.logger?.error({ err: error, userId }, 'Could not clear cached preferences');
    }
  }
}
