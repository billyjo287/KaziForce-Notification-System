// Adjusts the classifier's priority to one person's own habits (proposal Objective ii: "user
// interaction patterns"; docs/ml-v2-plan.md step 3b). Runs in the worker after the classifier
// and the spam check, before delivery. It looks only at that person's recent alerts of the same
// kind: same category (e.g. "new_job") from the same sender (the employer, or KaziForce).
//
//   Lowered one level ("You usually skip these"): at least 3 of the recent alerts of this kind
//     were marked "Not important to me", and that is at least half of them.
//     Never for a job alert closing within 3 hours, never below medium for an urgent alert,
//     and never if the person said "This was urgent for me" about one of them.
//   Raised from low to medium ("You usually open these quickly"): at least 5 recent alerts of
//     this kind, at least 70% opened in the app within 30 minutes, none marked not important.
//
// The classifier's own answer is kept in modelPriority, so training data never learns from
// these personal changes; the reason is shown to the person and saved in personalReason.
import type {
  NotificationType,
  Priority,
  PrismaClient,
  SenderRole,
} from '../generated/prisma/client.js';

export type PersonalReason = 'often_skipped' | 'often_opened';

export interface PersonalInput {
  id: string;
  recipientId: string;
  senderId: string | null;
  senderRole: SenderRole;
  category: string;
  type: NotificationType;
  deadlineAt: Date | null;
  createdAt: Date;
}

export const PERSONAL = {
  lookbackDays: 60,
  recent: 20,
  minSkipped: 3,
  skippedShare: 0.5,
  minForRaise: 5,
  openedShare: 0.7,
  quickOpenMinutes: 30,
  closingSoonMinutes: 180,
} as const;

const LOWER: Record<Priority, Priority> = { urgent: 'medium', medium: 'low', low: 'low' };

export async function personalPriority(
  prisma: PrismaClient,
  n: PersonalInput,
  priority: Priority,
  now = new Date(),
): Promise<{ priority: Priority; reason: PersonalReason | null }> {
  const unchanged = { priority, reason: null };
  const history = await prisma.notification.findMany({
    where: {
      recipientId: n.recipientId,
      category: n.category,
      ...(n.senderId ? { senderId: n.senderId } : { senderId: null, senderRole: n.senderRole }),
      id: { not: n.id },
      createdAt: {
        gte: new Date(now.getTime() - PERSONAL.lookbackDays * 86_400_000),
        lt: n.createdAt,
      },
      // Only alerts the person actually got: not blocked as spam, not muted by their settings.
      status: { in: ['sent', 'held'] },
      mutedByPreference: false,
    },
    orderBy: { createdAt: 'desc' },
    take: PERSONAL.recent,
    select: {
      markedNotImportant: true,
      markedUrgentByUser: true,
      deliveries: { where: { channel: 'in_app' }, select: { sentAt: true, openedAt: true } },
    },
  });
  if (history.length === 0) return unchanged;

  const skipped = history.filter((h) => h.markedNotImportant).length;
  const closingSoon =
    n.type === 'job_alert' &&
    n.deadlineAt !== null &&
    n.deadlineAt.getTime() - now.getTime() <= PERSONAL.closingSoonMinutes * 60_000;
  if (
    priority !== 'low' &&
    !closingSoon &&
    skipped >= PERSONAL.minSkipped &&
    skipped / history.length >= PERSONAL.skippedShare &&
    !history.some((h) => h.markedUrgentByUser)
  ) {
    return { priority: LOWER[priority], reason: 'often_skipped' };
  }

  if (priority === 'low' && skipped === 0 && history.length >= PERSONAL.minForRaise) {
    const quick = history.filter((h) =>
      h.deliveries.some(
        (d) =>
          d.sentAt &&
          d.openedAt &&
          d.openedAt.getTime() - d.sentAt.getTime() <= PERSONAL.quickOpenMinutes * 60_000,
      ),
    ).length;
    if (quick / history.length >= PERSONAL.openedShare) {
      return { priority: 'medium', reason: 'often_opened' };
    }
  }
  return unchanged;
}
