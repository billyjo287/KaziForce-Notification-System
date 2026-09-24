// The user's in-app alerts: the list (also used to catch up after a lost live connection) and
// the user's actions on them: read / unread, "Not important to me" and following the main link.
// Those actions are also training signals for the ML phase (CLAUDE.md section 6).
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { notificationInclude as include, serializeNotification as serialize } from './serialize.js';

const updateSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
    read: z.boolean().optional(),
    notImportant: z.boolean().optional(),
    /** The user followed the alert's main action (e.g. "View job"). */
    clicked: z.literal(true).optional(),
  })
  .refine(
    (v) => v.read !== undefined || v.notImportant !== undefined || v.clicked !== undefined,
    'Nothing to change',
  );

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
    // Anything that had not reached this person yet (they were offline) has reached them now.
    await prisma.deliveryLog.updateMany({
      where: {
        channel: 'in_app',
        deliveredAt: null,
        notificationId: { in: notifications.map((n) => n.id) },
      },
      data: { status: 'delivered', deliveredAt: new Date() },
    });
    res.json({ items: notifications.map(serialize) });
  });

  // Mark one or many as read/unread, (not) important, or clicked. Used by "Mark all as read",
  // Undo and the main action button.
  router.patch('/', async (req, res) => {
    const me = currentUser(req);
    const input = parse(updateSchema, req.body);
    const now = new Date();
    const mine = { id: { in: input.ids }, recipientId: me.id };
    const inApp = { notification: mine, channel: 'in_app' as const };

    await prisma.$transaction(async (tx) => {
      if (input.read === true || input.clicked) {
        await tx.notification.updateMany({
          where: { ...mine, readAt: null },
          data: { readAt: now },
        });
        // First open of the in-app copy: response time = openedAt - sentAt.
        await tx.deliveryLog.updateMany({
          where: { ...inApp, openedAt: null },
          data: { openedAt: now },
        });
      } else if (input.read === false) {
        await tx.notification.updateMany({ where: mine, data: { readAt: null } });
      }
      if (input.clicked) {
        await tx.deliveryLog.updateMany({
          where: { ...inApp, clickedAt: null },
          data: { clickedAt: now },
        });
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
          where: inApp,
          data: { dismissedAt: input.notImportant ? now : null },
        });
      }
    });

    const updated = await prisma.notification.findMany({ where: mine, include });
    res.json({ items: updated.map(serialize) });
  });

  return router;
}
