// Admin monitoring (PRD FR-7, FR-9, section 6 "Admin"): the overview numbers, the delivery log,
// the list of classifier versions, and the anonymised training data export.
import { Router } from 'express';
import { z } from 'zod';
import type { Channel, Prisma } from '../../generated/prisma/client.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { queueBacklog } from '../../lib/queue.js';
import { PAGE_SIZE, pageQuery, parse } from '../../lib/validate.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { writeTrainingCsv } from './trainingExport.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const CHANNELS: Channel[] = ['in_app', 'whatsapp', 'sms', 'email'];

/** Midnight in Nairobi (UTC+3 all year) at the start of the day that contains `now`. */
export function nairobiDayStart(now: Date): Date {
  const offset = 3 * HOUR;
  return new Date(Math.floor((now.getTime() + offset) / DAY) * DAY - offset);
}

/** "2026-10-02" (a Nairobi day) -> the moment it starts. */
const dayStart = (day: string) => new Date(`${day}T00:00:00+03:00`);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-02');

export interface ChannelRate {
  channel: Channel;
  /** Messages that reached the provider (or the app) on this channel. */
  delivered: number;
  /** Messages this channel gave up on (after its tries). */
  failed: number;
  /** Still trying. */
  pending: number;
  /** delivered / (delivered + failed), or null when nothing was sent. */
  rate: number | null;
}

/**
 * Delivery success per channel since `since`, counted per MESSAGE, not per try: a message that
 * failed twice and then got through counts once, as delivered (retries are the safety net).
 */
export async function channelRates(since: Date): Promise<ChannelRate[]> {
  // The column is UTC without a time zone and the database runs in Nairobi time: compare in UTC.
  const rows = await prisma.$queryRaw<
    { channel: Channel; delivered: bigint; failed: bigint; pending: bigint }[]
  >`
    SELECT channel,
           COUNT(*) FILTER (WHERE ok) AS delivered,
           COUNT(*) FILTER (WHERE NOT ok AND NOT waiting) AS failed,
           COUNT(*) FILTER (WHERE NOT ok AND waiting) AS pending
    FROM (
      SELECT "notificationId", channel,
             BOOL_OR(status IN ('sent', 'delivered')) AS ok,
             BOOL_OR(status = 'pending') AS waiting
      FROM "DeliveryLog"
      WHERE "createdAt" >= (${since.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY "notificationId", channel
    ) AS messages
    GROUP BY channel`;
  const byChannel = new Map(rows.map((r) => [r.channel, r]));
  return CHANNELS.map((channel) => {
    const r = byChannel.get(channel);
    const delivered = Number(r?.delivered ?? 0);
    const failed = Number(r?.failed ?? 0);
    return {
      channel,
      delivered,
      failed,
      pending: Number(r?.pending ?? 0),
      rate: delivered + failed > 0 ? delivered / (delivered + failed) : null,
    };
  });
}

const logQuery = z.object({
  channel: z.enum(['in_app', 'whatsapp', 'sms', 'email']).optional(),
  status: z.enum(['pending', 'sent', 'delivered', 'failed']).optional(),
  from: day.optional(),
  to: day.optional(),
  page: pageQuery,
});

const exportQuery = z.object({ from: day.optional(), to: day.optional() });

export function monitoringRoutes() {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  // ---------- Overview ----------
  router.get('/overview', async (_req, res) => {
    const now = new Date();
    const today = nairobiDayStart(now);
    const [last24h, last7d, notificationsToday, spamBlockedToday, spamWaiting, heldNow, recent] =
      await Promise.all([
        channelRates(new Date(now.getTime() - DAY)),
        channelRates(new Date(now.getTime() - 7 * DAY)),
        prisma.notification.count({ where: { createdAt: { gte: today } } }),
        prisma.notification.count({ where: { createdAt: { gte: today }, isSpam: true } }),
        prisma.notification.count({ where: { status: 'blocked', correctedSpam: null } }),
        prisma.notification.count({ where: { heldUntil: { gt: now } } }),
        prisma.deliveryLog.findMany({
          where: { status: 'failed', createdAt: { gte: new Date(now.getTime() - DAY) } },
          include: { notification: { select: { id: true, title: true } } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);
    // Redis may be down: the page still shows everything else.
    const queues = await queueBacklog().catch((error: unknown) => {
      logger.warn({ err: error }, 'Could not read the queue sizes');
      return null;
    });
    res.json({
      generatedAt: now.toISOString(),
      channels: { last24h, last7d },
      today: {
        notifications: notificationsToday,
        spamBlocked: spamBlockedToday,
        failedDeliveries: last24h.reduce((total, c) => total + c.failed, 0),
      },
      spamWaiting,
      heldNow,
      queues,
      recentFailures: recent.map((log) => ({
        id: log.id,
        channel: log.channel,
        error: log.error,
        at: log.createdAt.toISOString(),
        notification: log.notification,
      })),
    });
  });

  // ---------- Delivery log: one row per try (FR-7) ----------
  router.get('/delivery-logs', async (req, res) => {
    const q = parse(logQuery, req.query);
    const where: Prisma.DeliveryLogWhereInput = {
      channel: q.channel,
      status: q.status,
      createdAt: {
        gte: q.from ? dayStart(q.from) : undefined,
        lt: q.to ? new Date(dayStart(q.to).getTime() + DAY) : undefined,
      },
    };
    const [items, total] = await Promise.all([
      prisma.deliveryLog.findMany({
        where,
        include: {
          notification: {
            select: {
              id: true,
              title: true,
              category: true,
              predictedPriority: true,
              correctedPriority: true,
              recipient: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { attempt: 'desc' }],
        skip: (q.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.deliveryLog.count({ where }),
    ]);
    res.json({
      items: items.map((log) => ({
        id: log.id,
        channel: log.channel,
        status: log.status,
        attempt: log.attempt,
        isEscalation: log.isEscalation,
        error: log.error,
        providerMessageId: log.providerMessageId,
        createdAt: log.createdAt.toISOString(),
        sentAt: log.sentAt?.toISOString() ?? null,
        deliveredAt: log.deliveredAt?.toISOString() ?? null,
        openedAt: (log.openedAt ?? log.clickedAt)?.toISOString() ?? null,
        notification: {
          id: log.notification.id,
          title: log.notification.title,
          category: log.notification.category,
          priority:
            log.notification.correctedPriority ?? log.notification.predictedPriority ?? 'medium',
          corrected: log.notification.correctedPriority !== null,
          recipient: log.notification.recipient,
        },
      })),
      total,
      page: q.page,
      pageSize: PAGE_SIZE,
    });
  });

  // ---------- Model versions (MLMetadata) ----------
  router.get('/models', async (_req, res) => {
    const [models, usage, corrections] = await Promise.all([
      prisma.mLMetadata.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] }),
      prisma.notification.groupBy({
        by: ['modelVersion', 'predictionSource'],
        _count: { _all: true },
      }),
      prisma.notification.groupBy({
        by: ['modelVersion'],
        where: { OR: [{ correctedPriority: { not: null } }, { correctedSpam: { not: null } }] },
        _count: { _all: true },
      }),
    ]);
    res.json({
      models: models.map((m) => {
        const mine = usage.filter((u) => u.modelVersion === m.version);
        const count = (source?: string) =>
          mine
            .filter((u) => !source || u.predictionSource === source)
            .reduce((total, u) => total + u._count._all, 0);
        return {
          id: m.id,
          version: m.version,
          algorithm: m.algorithm,
          description: m.description,
          metrics: m.metrics,
          datasetInfo: m.datasetInfo,
          isActive: m.isActive,
          trainedAt: m.trainedAt?.toISOString() ?? null,
          deployedAt: m.deployedAt?.toISOString() ?? null,
          classified: count(),
          // Answered by the Node rules because the ML service was slow or down.
          fallback: count('rules_fallback'),
          corrected: corrections.find((c) => c.modelVersion === m.version)?._count._all ?? 0,
        };
      }),
    });
  });

  // ---------- Anonymised training data (FR-9, DR-2) ----------
  router.get('/export/training.csv', async (req, res) => {
    const admin = currentUser(req);
    const q = parse(exportQuery, req.query);
    const range = {
      from: q.from ? dayStart(q.from) : undefined,
      to: q.to ? new Date(dayStart(q.to).getTime() + DAY) : undefined,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kaziforce-training-${stamp}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    // A byte-order mark so Excel opens Kiswahili and other text correctly.
    res.write('\uFEFF');
    let rows: number;
    try {
      rows = await writeTrainingCsv(prisma, (chunk) => res.write(chunk), range);
    } catch (error) {
      // The file has started downloading: break it off, so nobody mistakes it for a full one.
      logger.error({ err: error }, 'Training data export failed');
      res.destroy(error as Error);
      return;
    }
    res.end();
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: 'export.training_data',
        targetType: 'export',
        targetId: admin.id,
        metadata: { rows, from: q.from ?? null, to: q.to ?? null, title: `${rows} rows` },
      },
    });
  });

  return router;
}
