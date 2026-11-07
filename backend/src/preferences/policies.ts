// Notification policies for everyone on the platform (SRS FR-NOT-034, ADR 0019). KaziForce runs
// as ONE organisation (no tenants, CLAUDE.md decision 9), so "organisation-wide" means set by an
// admin and applied to every account, above each person's own settings:
//
//   Always send      categories nobody can switch off (NotificationRule, ADR 0016)
//   Daily text limit at most N SMS + WhatsApp messages per person per Nairobi day for alerts that
//                    are NOT urgent (null = no limit). Urgent alerts always go: a missed urgent
//                    job is worse than one message too many. Above the limit the alert still
//                    arrives in the app (and by email, if the person chose it).
import type { PrismaClient } from '../generated/prisma/client.js';

export const POLICY_ID = 'platform';
/** The choices on the admin page (null = no limit). */
export const DAILY_TEXT_LIMITS = [null, 3, 5, 10] as const;

export interface PlatformPolicy {
  dailyTextLimit: number | null;
}

const CACHE_MS = 30_000;

/** Read for every alert, so kept in memory for 30 s (like the "Always send" categories). */
export function createPlatformPolicies(prisma: PrismaClient) {
  let cached: { at: number; value: PlatformPolicy } | null = null;
  return {
    async get(): Promise<PlatformPolicy> {
      if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
      const row = await prisma.notificationPolicy.findUnique({ where: { id: POLICY_ID } });
      cached = { at: Date.now(), value: { dailyTextLimit: row?.dailyTextLimit ?? null } };
      return cached.value;
    },
    clear() {
      cached = null;
    },
  };
}
export type PlatformPolicies = ReturnType<typeof createPlatformPolicies>;
