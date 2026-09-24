// The user's in-app alerts. Phase 2 only READS notifications (Phase 3 creates them from domain
// events) and records the user's actions on them: read / unread and "Not important to me".
// Those actions are also training signals for the ML phase (CLAUDE.md section 6).
import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';

const include = {
  sender: { select: { name: true, companyName: true, role: true } },
  job: { select: { location: { select: { name: true } } } },
} satisfies Prisma.NotificationInclude;

type Row = Prisma.NotificationGetPayload<{ include: typeof include }>;

function serialize(n: Row) {
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

const updateSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
    read: z.boolean().optional(),
    notImportant: z.boolean().optional(),
  })
  .refine((v) => v.read !== undefined || v.notImportant !== undefined, 'Nothing to change');

export function notificationRoutes() {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const me = currentUser(req);
    const notifications = await prisma.notification.findMany({
      // Spam is never shown; notifications still being processed are not ready yet.
      where: { recipientId: me.id, status: { in: ['sent', 'held', 'failed'] } },
      include,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ items: notifications.map(serialize) });
  });

  // Mark one or many as read/unread, or (not) important. Used by "Mark all as read" and Undo.
  router.patch('/', async (req, res) => {
    const me = currentUser(req);
    const input = parse(updateSchema, req.body);
    const now = new Date();
    const mine = { id: { in: input.ids }, recipientId: me.id };

    await prisma.$transaction(async (tx) => {
      if (input.read === true) {
        await tx.notification.updateMany({
          where: { ...mine, readAt: null },
          data: { readAt: now },
        });
        // First open of the in-app copy: response time = openedAt - sentAt.
        await tx.deliveryLog.updateMany({
          where: { notification: mine, channel: 'in_app', openedAt: null },
          data: { openedAt: now },
        });
      } else if (input.read === false) {
        await tx.notification.updateMany({ where: mine, data: { readAt: null } });
      }
      if (input.notImportant !== undefined) {
        await tx.notification.updateMany({
          where: mine,
          data: {
            markedNotImportant: input.notImportant,
            markedNotImportantAt: input.notImportant ? now : null,
          },
        });
        await tx.deliveryLog.updateMany({
          where: { notification: mine, channel: 'in_app' },
          data: { dismissedAt: input.notImportant ? now : null },
        });
      }
    });

    const updated = await prisma.notification.findMany({ where: mine, include });
    res.json({ items: updated.map(serialize) });
  });

  return router;
}
