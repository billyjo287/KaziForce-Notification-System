// A/B test of priority routing (docs/ml-v2-plan.md step 8, proposal: "A/B test, opt-out rate").
//   Group A: every alert the same way (in the app, plus email when allowed): channels/router.ts
//            planUniform. Group B: normal priority routing (urgent by SMS/WhatsApp, escalation,
//            low alerts in the daily summary).
// The admin puts volunteers (who agreed to take part) in a group, and later downloads one CSV:
// one row per alert they received, with the time to open it and whether the person opted out
// since joining (switched a channel or a category off, replied STOP, or asked to delete the
// account). People are shown by a random token, never by name.
import { Router } from 'express';
import { z } from 'zod';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { notFound } from '../../lib/httpError.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { currentUser } from '../../middleware/auth.js';
import { settingFor } from '../../channels/router.js';
import { CATEGORIES, normalizeCategorySettings } from '../../preferences/categories.js';
import { csvLine, makeTokenizer } from './trainingExport.js';

const EXTERNAL = ['whatsapp', 'sms', 'email'] as const;

export interface Baseline {
  channelsOn: string[];
  categoriesOff: string[];
}

/** The settings that matter for opt-outs: which outside channels and categories are on. */
export function snapshot(
  pref: { channelSettings: unknown; categorySettings: unknown } | null,
): Baseline {
  const categories = normalizeCategorySettings(pref?.categorySettings);
  return {
    channelsOn: EXTERNAL.filter((c) => settingFor(pref?.channelSettings, c).enabled),
    categoriesOff: CATEGORIES.filter((c) => !categories[c].enabled),
  };
}

/** What the person switched off since joining the test ("" when nothing). */
export function optOuts(
  baseline: Baseline,
  now: Baseline,
  user: {
    abAssignedAt: Date | null;
    whatsappOptedOutAt: Date | null;
    smsOptedOutAt: Date | null;
    deletionRequestedAt: Date | null;
  },
): string[] {
  const since = (d: Date | null) =>
    d !== null && user.abAssignedAt !== null && d >= user.abAssignedAt;
  return [
    ...baseline.channelsOn
      .filter((c) => !now.channelsOn.includes(c))
      .map((c) => `channel_off:${c}`),
    ...now.categoriesOff
      .filter((c) => !baseline.categoriesOff.includes(c))
      .map((c) => `category_off:${c}`),
    ...(since(user.whatsappOptedOutAt) ? ['stop:whatsapp'] : []),
    ...(since(user.smsOptedOutAt) ? ['stop:sms'] : []),
    ...(since(user.deletionRequestedAt) ? ['account_deletion'] : []),
  ];
}

// People by account id or by email (the admin page pastes the volunteers' emails).
const who = {
  userIds: z.array(z.uuid()).max(500).optional(),
  emails: z.array(z.string().trim().toLowerCase().pipe(z.email())).max(500).optional(),
};
const oneOf = (v: { userIds?: string[]; emails?: string[] }) =>
  (v.userIds?.length ?? 0) + (v.emails?.length ?? 0) > 0;
const assignSchema = z
  .object({
    ...who,
    // "random": shuffled, then split as evenly as possible between A and B.
    group: z.enum(['A', 'B', 'random']),
  })
  .refine(oneOf, 'Give at least one person');
const removeSchema = z.object(who).refine(oneOf, 'Give at least one person');

const whoWhere = (v: { userIds?: string[]; emails?: string[] }) => ({
  OR: [{ id: { in: v.userIds ?? [] } }, { email: { in: v.emails ?? [] } }],
});

export const AB_COLUMNS = [
  'user_token',
  'group',
  'role',
  'priority',
  'type',
  'category',
  'created_at',
  'channels_sent',
  'opened',
  'seconds_to_open',
  'marked_not_important',
  'user_opted_out',
  'user_opt_outs',
] as const;

const DAY = 24 * 60 * 60 * 1000;

export async function writeAbCsv(db: PrismaClient, write: (chunk: string) => void) {
  const token = makeTokenizer();
  const users = await db.user.findMany({
    where: { abGroup: { in: ['A', 'B'] } },
    select: {
      id: true,
      role: true,
      abGroup: true,
      abAssignedAt: true,
      abBaseline: true,
      whatsappOptedOutAt: true,
      smsOptedOutAt: true,
      deletionRequestedAt: true,
      preference: { select: { channelSettings: true, categorySettings: true } },
    },
  });
  write(csvLine([...AB_COLUMNS]));
  let rows = 0;
  for (const u of users) {
    const outs = optOuts(
      (u.abBaseline as Baseline | null) ?? snapshot(u.preference),
      snapshot(u.preference),
      u,
    );
    const alerts = await db.notification.findMany({
      where: {
        recipientId: u.id,
        createdAt: { gte: u.abAssignedAt ?? new Date(Date.now() - 365 * DAY) },
        status: { in: ['sent', 'held'] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        predictedPriority: true,
        correctedPriority: true,
        type: true,
        category: true,
        createdAt: true,
        readAt: true,
        markedNotImportant: true,
        mutedByPreference: true,
        deliveries: { select: { channel: true, sentAt: true, openedAt: true, clickedAt: true } },
      },
    });
    for (const n of alerts) {
      // Muted alerts are marked read automatically: that is not the person opening it.
      const opens = [
        ...(n.readAt && !n.mutedByPreference ? [n.readAt] : []),
        ...n.deliveries.flatMap((d) => [d.openedAt, d.clickedAt].filter((x): x is Date => !!x)),
      ].sort((a, b) => a.getTime() - b.getTime());
      const first = opens[0] ?? null;
      write(
        csvLine([
          token(u.id),
          u.abGroup,
          u.role,
          n.correctedPriority ?? n.predictedPriority ?? 'medium',
          n.type,
          n.category,
          n.createdAt.toISOString(),
          [...new Set(n.deliveries.filter((d) => d.sentAt).map((d) => d.channel))].join(';'),
          first !== null,
          first ? Math.max(0, Math.round((first.getTime() - n.createdAt.getTime()) / 1000)) : null,
          n.markedNotImportant,
          outs.length > 0,
          outs.join(';'),
        ]),
      );
      rows++;
    }
  }
  return { rows, users: users.length };
}

export function abTestRoutes() {
  const router = Router();

  // Who is in the test, per group, and how many opted out so far.
  router.get('/ab-test', async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { abGroup: { in: ['A', 'B'] } },
      select: {
        id: true,
        name: true,
        role: true,
        abGroup: true,
        abAssignedAt: true,
        abBaseline: true,
        whatsappOptedOutAt: true,
        smsOptedOutAt: true,
        deletionRequestedAt: true,
        preference: { select: { channelSettings: true, categorySettings: true } },
      },
      orderBy: { abAssignedAt: 'asc' },
    });
    res.json({
      items: users.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        group: u.abGroup,
        assignedAt: u.abAssignedAt?.toISOString() ?? null,
        optOuts: optOuts(
          (u.abBaseline as Baseline | null) ?? snapshot(u.preference),
          snapshot(u.preference),
          u,
        ),
      })),
    });
  });

  router.post('/ab-test/assign', async (req, res) => {
    const admin = currentUser(req);
    const input = parse(assignSchema, req.body);
    const asked = new Set([...(input.userIds ?? []), ...(input.emails ?? [])]);
    const found = await prisma.user.findMany({
      where: { ...whoWhere(input), role: { not: 'admin' } },
      select: {
        id: true,
        email: true,
        preference: { select: { channelSettings: true, categorySettings: true } },
      },
    });
    const missing = [...asked].filter((a) => !found.some((u) => u.id === a || u.email === a));
    if (missing.length > 0) {
      throw notFound(`Not found (or an admin account): ${missing.slice(0, 10).join(', ')}`);
    }
    // Fisher-Yates shuffle, then alternate A, B, A, B...
    const order = [...found];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const now = new Date();
    const groups = order.map((u, i) => ({
      id: u.id,
      group: input.group === 'random' ? (i % 2 === 0 ? 'A' : 'B') : input.group,
      baseline: snapshot(u.preference),
    }));
    await prisma.$transaction([
      ...groups.map((g) =>
        prisma.user.update({
          where: { id: g.id },
          data: {
            abGroup: g.group,
            abAssignedAt: now,
            abBaseline: g.baseline as unknown as Prisma.InputJsonObject,
          },
        }),
      ),
      prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: 'ab_test.assigned',
          targetType: 'export',
          targetId: admin.id,
          metadata: { users: groups.length, group: input.group },
        },
      }),
    ]);
    res.json({ items: groups.map((g) => ({ id: g.id, group: g.group })) });
  });

  router.post('/ab-test/remove', async (req, res) => {
    const admin = currentUser(req);
    const input = parse(removeSchema, req.body);
    const [result] = await prisma.$transaction([
      prisma.user.updateMany({
        where: whoWhere(input),
        data: { abGroup: null, abAssignedAt: null, abBaseline: Prisma.DbNull },
      }),
      prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: 'ab_test.removed',
          targetType: 'export',
          targetId: admin.id,
          metadata: { users: (input.userIds?.length ?? 0) + (input.emails?.length ?? 0) },
        },
      }),
    ]);
    res.json({ removed: result.count });
  });

  router.get('/ab-test/export.csv', async (req, res) => {
    const admin = currentUser(req);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kaziforce-ab-test-${stamp}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.write('﻿');
    const result = await writeAbCsv(prisma, (chunk) => res.write(chunk));
    res.end();
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: 'export.ab_test',
        targetType: 'export',
        targetId: admin.id,
        metadata: result,
      },
    });
  });

  return router;
}
