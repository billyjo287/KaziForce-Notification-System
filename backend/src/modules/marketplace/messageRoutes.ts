// Messages: one text-only conversation per job application, between the worker and the
// employer (PRD FR-2.3). Refreshed by polling until Socket.IO arrives in Phase 3.
import { Router } from 'express';
import { z } from 'zod';
import { recordEvent } from '../../events/domainEvents.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { notFound } from '../../lib/httpError.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';

const conversationInclude = {
  job: {
    select: {
      id: true,
      title: true,
      employerId: true,
      employer: { select: { id: true, name: true, companyName: true } },
    },
  },
  worker: { select: { id: true, name: true } },
} satisfies Prisma.ApplicationInclude;

type ConversationRow = Prisma.ApplicationGetPayload<{ include: typeof conversationInclude }>;

/** The other person in the conversation, as seen by `userId`. */
function otherPerson(application: ConversationRow, userId: string) {
  const isWorker = application.workerId === userId;
  return isWorker
    ? {
        id: application.job.employer.id,
        name: application.job.employer.companyName ?? application.job.employer.name,
      }
    : { id: application.worker.id, name: application.worker.name };
}

/** Loads a conversation the user is part of, or answers 404. */
async function loadConversation(applicationId: string, userId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: conversationInclude,
  });
  if (!application) throw notFound();
  if (application.workerId !== userId && application.job.employerId !== userId) throw notFound();
  return application;
}

const params = z.object({ applicationId: z.uuid() });
const sendSchema = z.object({
  body: z.string().trim().min(1, 'Write a message first').max(1000, 'Use at most 1,000 characters'),
});

export function messageRoutes() {
  const router = Router();
  router.use(requireAuth, requireRole('worker', 'business'));

  // All conversations (one per application), most recent first.
  router.get('/', async (req, res) => {
    const me = currentUser(req);
    const applications = await prisma.application.findMany({
      where: me.role === 'worker' ? { workerId: me.id } : { job: { employerId: me.id } },
      include: {
        ...conversationInclude,
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    const unread = await prisma.message.groupBy({
      by: ['applicationId'],
      where: { recipientId: me.id, readAt: null },
      _count: { _all: true },
    });
    const unreadBy = new Map(unread.map((u) => [u.applicationId, u._count._all]));

    const items = applications
      .map((a) => {
        const last = a.messages[0];
        return {
          applicationId: a.id,
          job: { id: a.job.id, title: a.job.title },
          with: otherPerson(a, me.id),
          lastMessage: last
            ? {
                body: last.body,
                sentAt: last.createdAt.toISOString(),
                mine: last.senderId === me.id,
              }
            : null,
          unreadCount: unreadBy.get(a.id) ?? 0,
          updatedAt: (last?.createdAt ?? a.createdAt).toISOString(),
        };
      })
      .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
    res.json({ items });
  });

  // One conversation. Opening it marks the messages sent to me as read.
  router.get('/:applicationId', async (req, res) => {
    const me = currentUser(req);
    const { applicationId } = parse(params, req.params);
    const application = await loadConversation(applicationId, me.id);
    await prisma.message.updateMany({
      where: { applicationId, recipientId: me.id, readAt: null },
      data: { readAt: new Date() },
    });
    const messages = await prisma.message.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    res.json({
      conversation: {
        applicationId,
        job: { id: application.job.id, title: application.job.title },
        with: otherPerson(application, me.id),
      },
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        sentAt: m.createdAt.toISOString(),
        mine: m.senderId === me.id,
        readAt: m.readAt?.toISOString() ?? null,
      })),
    });
  });

  router.post('/:applicationId', async (req, res) => {
    const me = currentUser(req);
    const { applicationId } = parse(params, req.params);
    const { body } = parse(sendSchema, req.body);
    const application = await loadConversation(applicationId, me.id);
    const recipientId =
      application.workerId === me.id ? application.job.employerId : application.workerId;

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: { applicationId, senderId: me.id, recipientId, body },
      });
      await recordEvent(tx, 'message.sent', {
        messageId: created.id,
        applicationId,
        senderId: me.id,
        recipientId,
      });
      return created;
    });
    res.status(201).json({
      message: {
        id: message.id,
        body: message.body,
        sentAt: message.createdAt.toISOString(),
        mine: true,
        readAt: null,
      },
    });
  });

  return router;
}
