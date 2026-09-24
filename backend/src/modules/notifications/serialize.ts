// What the app receives for one notification, both from the REST API and live over Socket.IO.
import type { Prisma } from '../../generated/prisma/client.js';

export const notificationInclude = {
  sender: { select: { name: true, companyName: true, role: true } },
  job: { select: { location: { select: { name: true } } } },
} satisfies Prisma.NotificationInclude;

export type NotificationRow = Prisma.NotificationGetPayload<{
  include: typeof notificationInclude;
}>;

export function serializeNotification(n: NotificationRow) {
  const sender =
    !n.sender || n.senderRole === 'system' || n.senderRole === 'admin'
      ? 'KaziForce'
      : (n.sender.companyName ?? n.sender.name);
  return {
    id: n.id,
    // An admin's correction wins; missing priority defaults to MEDIUM (PRD FR-3).
    priority: n.correctedPriority ?? n.predictedPriority ?? 'medium',
    type: n.type,
    title: n.title,
    body: n.message,
    link: n.link,
    sender,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt?.toISOString() ?? null,
    deadlineAt: n.deadlineAt?.toISOString() ?? null,
    location: n.job?.location.name ?? null,
    markedNotImportant: n.markedNotImportant,
  };
}

export type SerializedNotification = ReturnType<typeof serializeNotification>;
