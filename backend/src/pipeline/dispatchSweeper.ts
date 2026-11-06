// The safety net for the outside channels (BT-06). The worker saves an alert as SENT (in-app),
// then plans its WhatsApp / SMS / email sends ("dispatch"), then marks it dispatchedAt. If the
// worker stops between those steps (an update, a crash) or Redis refuses the jobs, nothing would
// ever plan them again: a retried job skips alerts that are already SENT.
//
// Every 30 seconds this finds alerts that are SENT, not switched off by the person, still without
// dispatchedAt, and not touched for 30 seconds, and dispatches them again. That is safe to repeat:
// every channel, escalation and quiet-hours job has a fixed id, so nothing is sent twice, and
// dispatch() itself skips closed jobs, opened alerts and people who cannot be reached.
// Only the last hour is looked at: an older alert is no longer worth a message outside the app.
import type { Logger } from 'pino';
import type { PrismaClient } from '../generated/prisma/client.js';

const EVERY_MS = 30_000;
const SETTLE_MS = 30_000;
const LOOK_BACK_MS = 60 * 60 * 1000;
const BATCH = 200;

export interface DispatchSweeperOptions {
  prisma: PrismaClient;
  dispatch: (notificationId: string) => Promise<unknown>;
  logger: Logger;
  /** Tests run sweep() themselves (false = no timer). */
  schedule?: boolean;
  now?: () => Date;
}

export function startDispatchSweeper({
  prisma,
  dispatch,
  logger,
  schedule = true,
  now = () => new Date(),
}: DispatchSweeperOptions) {
  let running = false;

  /** Re-dispatches the alerts left half-done. Returns how many it fixed. */
  async function sweep(): Promise<number> {
    if (running) return 0;
    running = true;
    let fixed = 0;
    try {
      const t = now().getTime();
      const stuck = await prisma.notification.findMany({
        where: {
          status: 'sent',
          mutedByPreference: false,
          dispatchedAt: null,
          updatedAt: { lt: new Date(t - SETTLE_MS) },
          createdAt: { gt: new Date(t - LOOK_BACK_MS) },
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: BATCH,
      });
      for (const { id } of stuck) {
        try {
          await dispatch(id);
          await prisma.notification.update({ where: { id }, data: { dispatchedAt: new Date() } });
          fixed += 1;
        } catch (error) {
          logger.warn({ err: error, notificationId: id }, 'Re-dispatch failed; trying again later');
        }
      }
      if (fixed > 0) logger.warn({ fixed }, 'Outside channels planned again for half-done alerts');
    } catch (error) {
      logger.error({ err: error }, 'Dispatch sweeper failed');
    } finally {
      running = false;
    }
    return fixed;
  }

  const timer = schedule ? setInterval(() => void sweep(), EVERY_MS) : null;
  return {
    sweep,
    stop() {
      if (timer) clearInterval(timer);
    },
  };
}
