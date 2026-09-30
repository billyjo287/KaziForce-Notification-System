// FR-4b channel suggestion: simple statistics, not machine learning.
//
// For each of the person's urgent alerts that they opened through an outside channel (a tracked
// link, or a WhatsApp "read"), note which channel they opened first. If, over at least 5 such
// alerts, one channel "won" at least 80% of the time and it is not already their first choice,
// suggest it ONCE: "You usually open SMS fastest. Make SMS your first choice?". The channel order
// only changes if they tap yes.
import type { Channel, PrismaClient } from '../generated/prisma/client.js';

export const MIN_ALERTS = 5;
export const WIN_SHARE = 0.8;

type External = Exclude<Channel, 'in_app'>;

export interface ChannelSuggestion {
  channel: External;
  currentFirst: External;
  /** Urgent alerts the statistic is based on. */
  alerts: number;
  /** How many of them were opened first on the suggested channel. */
  wins: number;
  /** Typical minutes from sending to opening on the suggested channel. */
  medianMinutes: number;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

export async function channelSuggestion(
  prisma: PrismaClient,
  userId: string,
): Promise<ChannelSuggestion | null> {
  const preference = await prisma.userPreference.findUnique({ where: { userId } });
  if (!preference || preference.channelSuggestionShownAt) return null;
  const currentFirst = preference.channelOrder.find((c) => c !== 'in_app') as External | undefined;
  if (!currentFirst) return null;

  const urgent = await prisma.notification.findMany({
    where: {
      recipientId: userId,
      OR: [
        { correctedPriority: 'urgent' },
        { correctedPriority: null, predictedPriority: 'urgent' },
      ],
    },
    select: {
      deliveries: {
        where: { channel: { not: 'in_app' }, sentAt: { not: null } },
        select: { channel: true, sentAt: true, openedAt: true, clickedAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const wins = new Map<External, number>();
  const minutes = new Map<External, number[]>();
  let alerts = 0;
  for (const { deliveries } of urgent) {
    let first: { channel: External; at: number; sentAt: number } | null = null;
    for (const d of deliveries) {
      const opened = [d.openedAt, d.clickedAt].filter((x): x is Date => x !== null);
      if (opened.length === 0 || !d.sentAt) continue;
      const at = Math.min(...opened.map((x) => x.getTime()));
      if (!first || at < first.at) {
        first = { channel: d.channel as External, at, sentAt: d.sentAt.getTime() };
      }
    }
    if (!first) continue;
    alerts++;
    wins.set(first.channel, (wins.get(first.channel) ?? 0) + 1);
    minutes.set(first.channel, [
      ...(minutes.get(first.channel) ?? []),
      (first.at - first.sentAt) / 60_000,
    ]);
  }
  if (alerts < MIN_ALERTS) return null;

  const [best, bestWins] = [...wins.entries()].sort((a, b) => b[1] - a[1])[0]!;
  if (best === currentFirst || bestWins / alerts < WIN_SHARE) return null;
  return {
    channel: best,
    currentFirst,
    alerts,
    wins: bestWins,
    medianMinutes: Math.round(median(minutes.get(best)!) * 10) / 10,
  };
}
