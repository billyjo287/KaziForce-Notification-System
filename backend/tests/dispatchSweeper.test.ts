// BT-06: an alert delivered in the app whose outside channels were never planned (the worker
// stopped in between) is planned again by the dispatch sweeper, once, and only when it should be.
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { startDispatchSweeper } from '../src/pipeline/dispatchSweeper.js';
import { uniqueEmail } from './helpers.js';

let userId: string;
const logger = pino({ level: 'silent' });

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      role: 'worker',
      name: 'Sweeper Test',
      email: uniqueEmail('sweeper'),
      passwordHash: 'x',
      language: 'en',
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } });
});

function alert(
  data: Partial<{ status: 'sent' | 'queued'; mutedByPreference: boolean; dispatchedAt: Date }> = {},
) {
  return prisma.notification.create({
    data: {
      recipientId: userId,
      recipientRole: 'worker',
      senderRole: 'system',
      type: 'job_alert',
      category: 'new_job',
      title: 'Urgent job',
      message: 'Closes soon',
      status: data.status ?? 'sent',
      predictedPriority: 'urgent',
      mutedByPreference: data.mutedByPreference ?? false,
      dispatchedAt: data.dispatchedAt,
    },
  });
}

describe('dispatch sweeper (BT-06)', () => {
  it('plans the outside channels again for a half-done alert, then leaves it alone', async () => {
    const halfDone = await alert();
    const done = await alert({ dispatchedAt: new Date() });
    const muted = await alert({ mutedByPreference: true });
    const notYetSent = await alert({ status: 'queued' });

    const dispatched: string[] = [];
    // 2 minutes later: the alerts have "settled" (untouched for more than 30 seconds).
    const sweeper = startDispatchSweeper({
      prisma,
      logger,
      schedule: false,
      dispatch: async (id) => void dispatched.push(id),
      now: () => new Date(Date.now() + 2 * 60_000),
    });

    await sweeper.sweep();
    const mine = dispatched.filter((id) =>
      [halfDone.id, done.id, muted.id, notYetSent.id].includes(id),
    );
    expect(mine).toEqual([halfDone.id]);
    const after = await prisma.notification.findUniqueOrThrow({ where: { id: halfDone.id } });
    expect(after.dispatchedAt).not.toBeNull();

    // A second round finds nothing more to do for it.
    dispatched.length = 0;
    await sweeper.sweep();
    expect(dispatched).not.toContain(halfDone.id);
  });

  it('does not touch an alert that may still be in progress, or one older than an hour', async () => {
    const fresh = await alert();
    const dispatched: string[] = [];
    const sweep = (minutesLater: number) =>
      startDispatchSweeper({
        prisma,
        logger,
        schedule: false,
        dispatch: async (id) => void dispatched.push(id),
        now: () => new Date(Date.now() + minutesLater * 60_000),
      }).sweep();

    await sweep(0); // just sent: the worker may be planning it right now
    await sweep(90); // an hour and a half later: too old to be worth a message
    expect(dispatched).not.toContain(fresh.id);
  });

  it('keeps an alert for the next round when dispatching fails (e.g. Redis down)', async () => {
    const stuck = await alert();
    const sweeper = startDispatchSweeper({
      prisma,
      logger,
      schedule: false,
      dispatch: async (id) => {
        if (id === stuck.id) throw new Error('Redis is down');
      },
      now: () => new Date(Date.now() + 2 * 60_000),
    });
    await sweeper.sweep();
    const after = await prisma.notification.findUniqueOrThrow({ where: { id: stuck.id } });
    expect(after.dispatchedAt).toBeNull();
    await prisma.notification.update({
      where: { id: stuck.id },
      data: { dispatchedAt: new Date() },
    });
  });
});
