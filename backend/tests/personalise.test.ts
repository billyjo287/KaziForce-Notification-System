// Objective ii: one person's own habits move the classifier's priority one step (personalise.ts).
import { afterAll, describe, expect, it } from 'vitest';
import type { Priority } from '../src/generated/prisma/client.js';
import { prisma } from '../src/lib/prisma.js';
import { personalPriority, type PersonalInput } from '../src/pipeline/personalise.js';
import { toRow } from '../src/modules/admin/trainingExport.js';
import { uniqueEmail } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

const MIN = 60_000;

async function people() {
  const make = (role: 'worker' | 'business') =>
    prisma.user.create({
      data: { email: uniqueEmail('personal'), passwordHash: 'not-used', name: 'Test', role },
    });
  return { worker: await make('worker'), employer: await make('business') };
}

interface Past {
  notImportant?: boolean;
  urgentForMe?: boolean;
  openedAfterMin?: number | null;
  muted?: boolean;
  status?: 'sent' | 'blocked';
}

/** Alerts the worker already got from this employer, newest last. */
async function history(workerId: string, employerId: string, past: Past[]) {
  const start = Date.now() - 3 * 24 * 60 * MIN;
  for (const [i, p] of past.entries()) {
    const createdAt = new Date(start + i * 60 * MIN);
    await prisma.notification.create({
      data: {
        recipientId: workerId,
        recipientRole: 'worker',
        senderId: employerId,
        senderRole: 'business',
        type: 'job_alert',
        category: 'new_job',
        title: 'Cleaner needed',
        message: 'Cleaner needed in Kilimani',
        status: p.status ?? 'sent',
        predictedPriority: 'medium',
        mutedByPreference: p.muted ?? false,
        markedNotImportant: p.notImportant ?? false,
        markedUrgentByUser: p.urgentForMe ?? false,
        createdAt,
        deliveries: {
          create: {
            channel: 'in_app',
            status: 'sent',
            sentAt: createdAt,
            openedAt:
              p.openedAfterMin == null
                ? null
                : new Date(createdAt.getTime() + p.openedAfterMin * MIN),
          },
        },
      },
    });
  }
}

function incoming(workerId: string, employerId: string, deadlineMin?: number): PersonalInput {
  const now = new Date();
  return {
    id: '00000000-0000-4000-8000-000000000000',
    recipientId: workerId,
    senderId: employerId,
    senderRole: 'business',
    category: 'new_job',
    type: 'job_alert',
    deadlineAt: deadlineMin === undefined ? null : new Date(now.getTime() + deadlineMin * MIN),
    createdAt: now,
  };
}

const check = (input: PersonalInput, p: Priority) => personalPriority(prisma, input, p);

describe('personal priority (Objective ii)', () => {
  it('lowers a kind the person usually marks "Not important to me", one step only', async () => {
    const { worker, employer } = await people();
    await history(worker.id, employer.id, [
      { notImportant: true },
      { notImportant: true },
      { notImportant: true },
      { openedAfterMin: 5 },
    ]);
    const n = incoming(worker.id, employer.id, 3 * 24 * 60);
    expect(await check(n, 'medium')).toEqual({ priority: 'low', reason: 'often_skipped' });
    expect(await check(n, 'urgent')).toEqual({ priority: 'medium', reason: 'often_skipped' });
    expect(await check(n, 'low')).toEqual({ priority: 'low', reason: null });
  });

  it('never lowers a job closing within 3 hours', async () => {
    const { worker, employer } = await people();
    await history(worker.id, employer.id, [
      { notImportant: true },
      { notImportant: true },
      { notImportant: true },
    ]);
    expect(await check(incoming(worker.id, employer.id, 90), 'urgent')).toEqual({
      priority: 'urgent',
      reason: null,
    });
  });

  it('needs at least 3 skips and half of the recent alerts', async () => {
    const { worker, employer } = await people();
    await history(worker.id, employer.id, [
      { notImportant: true },
      { notImportant: true },
      { openedAfterMin: 5 },
      { openedAfterMin: 5 },
    ]);
    expect((await check(incoming(worker.id, employer.id), 'medium')).reason).toBeNull();
    // Muted or blocked alerts were never seen by the person, so they do not count.
    await history(worker.id, employer.id, [
      { notImportant: true, muted: true },
      { notImportant: true, status: 'blocked' },
    ]);
    expect((await check(incoming(worker.id, employer.id), 'medium')).reason).toBeNull();
  });

  it('does not lower a kind the person once said was urgent for them', async () => {
    const { worker, employer } = await people();
    await history(worker.id, employer.id, [
      { notImportant: true },
      { notImportant: true },
      { notImportant: true },
      { urgentForMe: true, openedAfterMin: 1 },
    ]);
    expect((await check(incoming(worker.id, employer.id), 'medium')).reason).toBeNull();
  });

  it('raises a low kind the person usually opens within 30 minutes', async () => {
    const { worker, employer } = await people();
    await history(worker.id, employer.id, [
      { openedAfterMin: 2 },
      { openedAfterMin: 10 },
      { openedAfterMin: 25 },
      { openedAfterMin: 4 },
      { openedAfterMin: null },
    ]);
    const n = incoming(worker.id, employer.id);
    expect(await check(n, 'low')).toEqual({ priority: 'medium', reason: 'often_opened' });
    // Only low is raised, and only to medium.
    expect((await check(n, 'medium')).reason).toBeNull();
  });

  it('does not raise with too few alerts, slow opens, or any "Not important"', async () => {
    const few = await people();
    await history(few.worker.id, few.employer.id, [{ openedAfterMin: 1 }, { openedAfterMin: 1 }]);
    expect((await check(incoming(few.worker.id, few.employer.id), 'low')).reason).toBeNull();

    const slow = await people();
    await history(
      slow.worker.id,
      slow.employer.id,
      [1, 2, 300, 400, 500].map((m) => ({ openedAfterMin: m })),
    );
    expect((await check(incoming(slow.worker.id, slow.employer.id), 'low')).reason).toBeNull();

    const mixed = await people();
    await history(mixed.worker.id, mixed.employer.id, [
      ...[1, 2, 3, 4, 5].map((m) => ({ openedAfterMin: m })),
      { notImportant: true },
    ]);
    expect((await check(incoming(mixed.worker.id, mixed.employer.id), 'low')).reason).toBeNull();
  });

  it('looks only at the same sender', async () => {
    const { worker, employer } = await people();
    const other = await prisma.user.create({
      data: { email: uniqueEmail('other'), passwordHash: 'x', name: 'Other', role: 'business' },
    });
    await history(worker.id, other.id, [
      { notImportant: true },
      { notImportant: true },
      { notImportant: true },
    ]);
    expect((await check(incoming(worker.id, employer.id), 'medium')).reason).toBeNull();
  });

  it('training export keeps the classifier answer, not the personal one', () => {
    const base = {
      id: 'n1',
      recipientId: 'u1',
      senderId: null,
      recipientRole: 'worker',
      senderRole: 'system',
      type: 'job_alert',
      category: 'new_job',
      title: 't',
      message: 'm',
      createdAt: new Date('2026-11-26T08:00:00Z'),
      deadlineAt: null,
      predictedPriority: 'low',
      modelPriority: 'medium',
      personalReason: 'often_skipped',
      priorityConfidence: 0.7,
      isSpam: false,
      spamScore: 0.1,
      modelVersion: 'ml-v2',
      predictionSource: 'ml',
      correctedPriority: null,
      correctedSpam: null,
      priorityReviewedAt: null,
      status: 'sent',
      escalatedTo: null,
      heldUntil: null,
      readAt: null,
      markedNotImportant: false,
      markedUrgentByUser: false,
      notImportantReason: null,
      deliveries: [],
    };
    const row = toRow(
      base,
      (id) => id,
      (s) => s,
    );
    expect(row.predicted_priority).toBe('medium');
    expect(row.label_priority).toBe('medium');
    expect(row.personal_priority).toBe('low');
    expect(row.personal_reason).toBe('often_skipped');
  });
});
