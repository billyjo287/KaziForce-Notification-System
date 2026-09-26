// The outbox relay: reads new domain events and turns each into notifications.
//
//   1. Wake up when Postgres signals a new event (instant), or every second anyway (for events
//      held for Undo, and in case a signal was missed).
//   2. For each event that is due: in ONE transaction, lock it (so two workers never take the
//      same event), create its notifications as QUEUED, and mark it processed.
//   3. After the transaction is saved, add a "notification.process" job for each notification.
//
// If step 3 fails (Redis down), the sweeper re-adds jobs for notifications still QUEUED after
// 30 seconds, so nothing is lost. A job id is the notification id, so nothing is sent twice.
import pg from 'pg';
import type { Logger } from 'pino';
import { EVENT_SIGNAL } from '../events/domainEvents.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { enqueueNotifications, type NotificationQueue } from '../lib/queue.js';
import { saveNotifications } from './createNotifications.js';
import { isKnownEvent, notificationsFor } from './listeners.js';

const MAX_ATTEMPTS = 5;
/** Alerts about things that happened long ago only add noise (e.g. after the worker was off). */
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 30_000;
const TRANSACTION_TIMEOUTS = { maxWait: 10_000, timeout: 30_000 };

export interface RelayOptions {
  prisma: PrismaClient;
  queue: NotificationQueue;
  databaseUrl: string;
  logger: Logger;
  pollMs?: number;
}

interface EventRow {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  createdAt: Date;
}

export function startOutboxRelay({
  prisma,
  queue,
  databaseUrl,
  logger,
  pollMs = 1000,
}: RelayOptions) {
  let stopped = false;
  let draining: Promise<void> | null = null;
  let wakeAgain = false;

  /** Handles the next due event. Returns false when there is nothing (more) to do. */
  async function processNext(): Promise<boolean> {
    // (Assigned inside the transaction below.)
    let current = undefined as EventRow | undefined;
    let created: string[] = [];
    try {
      await prisma.$transaction(async (tx) => {
        // Prisma stores times as UTC without a time zone, and Postgres runs on Nairobi time, so
        // compare against the current UTC time (plain now() would be 3 hours off).
        const rows = await tx.$queryRaw<EventRow[]>`
          SELECT id, type, payload, attempts, "createdAt" FROM "DomainEvent"
          WHERE "processedAt" IS NULL AND "cancelledAt" IS NULL
            AND "availableAt" <= (now() AT TIME ZONE 'UTC')
          ORDER BY "availableAt"
          LIMIT 1
          FOR UPDATE SKIP LOCKED`;
        current = rows[0];
        if (!current) return;

        const { type, payload } = current;
        let note: string | null = null;
        if (!isKnownEvent(type)) {
          note = `Skipped: unknown event type "${type}"`;
        } else if (Date.now() - new Date(current.createdAt).getTime() > MAX_EVENT_AGE_MS) {
          note = 'Skipped: older than 24 hours';
        } else {
          const inputs = await notificationsFor(tx, { type, payload });
          const { ids, rejected } = await saveNotifications(tx, inputs);
          created = ids;
          for (const r of rejected) {
            logger.warn({ eventId: current.id, problems: r.problems }, 'Notification rejected');
          }
        }
        await tx.domainEvent.update({
          where: { id: current.id },
          data: { processedAt: new Date(), lastError: note },
        });
        // A busy computer or database can take more than Prisma's default 2 s to start a
        // transaction; a big announcement can take a while to save.
      }, TRANSACTION_TIMEOUTS);
    } catch (error) {
      if (!current) {
        // Could not even read the events (database down?): try again on the next tick.
        logger.error({ err: error }, 'Could not read domain events');
        return false;
      }
      await recordFailure(current, error);
      return true;
    }
    if (!current) return false;

    try {
      await enqueueNotifications(queue, created);
    } catch (error) {
      logger.error({ err: error }, 'Could not queue notifications; the sweeper will retry');
    }
    return true;
  }

  /** Try the event again later (2, 4, 8, 16 s), or set it aside after MAX_ATTEMPTS. */
  async function recordFailure(event: EventRow, error: unknown) {
    const attempts = event.attempts + 1;
    const giveUp = attempts >= MAX_ATTEMPTS;
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, eventId: event.id, attempts }, 'Domain event failed');
    await prisma.domainEvent
      .update({
        where: { id: event.id },
        data: {
          attempts,
          lastError: message.slice(0, 500),
          ...(giveUp
            ? { processedAt: new Date() }
            : { availableAt: new Date(Date.now() + 2 ** attempts * 1000) }),
        },
      })
      .catch((e: unknown) => logger.error({ err: e }, 'Could not record the failure'));
  }

  /** Works through every due event. Calls while busy just ask for one more round. */
  function wake(): Promise<void> {
    if (draining) {
      wakeAgain = true;
      return draining;
    }
    draining = (async () => {
      do {
        wakeAgain = false;
        while (!stopped && (await processNext()));
      } while (wakeAgain && !stopped);
    })().finally(() => {
      draining = null;
    });
    return draining;
  }

  /** Re-adds jobs for notifications stuck in QUEUED (e.g. Redis was down for a moment). */
  async function sweep() {
    try {
      const stuck = await prisma.notification.findMany({
        where: { status: 'queued', createdAt: { lt: new Date(Date.now() - SWEEP_EVERY_MS) } },
        select: { id: true },
        take: 500,
      });
      await enqueueNotifications(
        queue,
        stuck.map((n) => n.id),
      );
    } catch (error) {
      logger.error({ err: error }, 'Sweeper failed');
    }
  }

  // ---- Instant wake-up via Postgres LISTEN (reconnects on its own if the database restarts) ----
  let listener: pg.Client | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  async function listen() {
    const client = new pg.Client({ connectionString: databaseUrl });
    client.on('notification', () => void wake());
    client.on('error', (error) => {
      logger.warn({ err: error }, 'Lost the database signal connection; reconnecting');
      void client.end().catch(() => {});
      if (!stopped) reconnectTimer = setTimeout(() => void listen(), 5000);
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${EVENT_SIGNAL}`);
      listener = client;
    } catch (error) {
      logger.warn({ err: error }, 'Could not listen for new events; checking every second');
      void client.end().catch(() => {});
      if (!stopped) reconnectTimer = setTimeout(() => void listen(), 5000);
    }
  }

  const ready = listen().then(() => wake());
  const pollTimer = setInterval(() => void wake(), pollMs);
  const sweepTimer = setInterval(() => void sweep(), SWEEP_EVERY_MS);

  return {
    /** Resolves once the relay is listening and has handled events already waiting. */
    ready,
    /** Handle everything that is due now (tests use this instead of waiting). */
    wake,
    sweep,
    async stop() {
      stopped = true;
      clearInterval(pollTimer);
      clearInterval(sweepTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      await draining;
      await listener?.end().catch(() => {});
    },
  };
}

export type OutboxRelay = ReturnType<typeof startOutboxRelay>;
