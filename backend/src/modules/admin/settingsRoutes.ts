// Admin settings for notifications (ADR 0016):
//   Notification rules  which alert categories are "Always send" (SRS FR-NOT-035)
//   Message wording     the SMS and email wording, with every version kept (FR-NOT-003, 011)
// Every change is written to AuditLog.
import { Router } from 'express';
import { z } from 'zod';
import { LANGUAGES, listWording, saveWording, wordingProblem } from '../../channels/wording.js';
import { badRequest } from '../../lib/httpError.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { CATEGORIES } from '../../preferences/categories.js';
import { mandatoryCategories } from '../../preferences/index.js';

const categoryParam = z.object({ category: z.enum(CATEGORIES) });
const ruleSchema = z.object({ mandatory: z.boolean() }).strict();
const wordingSchema = z
  .object({
    category: z.enum(CATEGORIES),
    language: z.enum(LANGUAGES as ['en', 'sw']),
    urgent: z.boolean(),
    /** null = back to the built-in wording. */
    text: z.string().max(200).nullable(),
  })
  .strict();

const WORDING_ERRORS = {
  empty: 'Write at least 3 characters.',
  too_long: 'Use at most 80 characters, so the SMS stays one message.',
  characters: 'Use plain letters and punctuation only (no emoji or curly quotes).',
} as const;

export function settingsRoutes() {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  // ---------- Notification rules ----------
  router.get('/notification-rules', async (_req, res) => {
    const rows = await prisma.notificationRule.findMany({
      include: { updatedBy: { select: { name: true } } },
    });
    const byCategory = new Map(rows.map((r) => [r.category, r]));
    res.json({
      items: CATEGORIES.map((category) => {
        const row = byCategory.get(category);
        return {
          category,
          mandatory: row?.mandatory ?? false,
          updatedAt: row?.updatedAt.toISOString() ?? null,
          updatedBy: row?.updatedBy?.name ?? null,
        };
      }),
    });
  });

  router.put('/notification-rules/:category', async (req, res) => {
    const admin = currentUser(req);
    const { category } = parse(categoryParam, req.params);
    const { mandatory } = parse(ruleSchema, req.body);
    await prisma.$transaction([
      prisma.notificationRule.upsert({
        where: { category },
        create: { category, mandatory, updatedById: admin.id },
        update: { mandatory, updatedById: admin.id },
      }),
      prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: mandatory ? 'notification_rule.mandatory' : 'notification_rule.optional',
          // Rules are keyed by category, not by an id: the category is in the metadata.
          targetType: 'notification_rule',
          targetId: admin.id,
          metadata: { category },
        },
      }),
    ]);
    // This process sees it at once; the worker within 30 seconds (preferences/categories.ts).
    mandatoryCategories.clear();
    res.json({ category, mandatory });
  });

  // ---------- Message wording ----------
  router.get('/wording', async (_req, res) => {
    res.json({ items: await listWording(prisma) });
  });

  router.post('/wording', async (req, res) => {
    const admin = currentUser(req);
    const input = parse(wordingSchema, req.body);
    if (input.text !== null) {
      const problem = wordingProblem(input.text);
      if (problem) throw badRequest(`wording_${problem}`, WORDING_ERRORS[problem]);
    }
    const saved = await saveWording(prisma, input, admin.id);
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: input.text === null ? 'wording.reset' : 'wording.changed',
        targetType: 'message_wording',
        targetId: saved.id,
        metadata: {
          category: input.category,
          language: input.language,
          urgent: input.urgent,
          version: saved.version,
          text: saved.text,
        },
      },
    });
    // The worker picks it up within 30 seconds (channels/wording.ts).
    res.status(201).json({ version: saved.version });
  });

  return router;
}
