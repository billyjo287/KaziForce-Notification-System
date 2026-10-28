// Admin decisions about single notifications (PRD FR-3, FR-9): release a blocked one ("not
// spam", delivered now), confirm a block, or correct a priority. Each decision is saved as a
// training label (correctedSpam / correctedPriority, who and when) and written to AuditLog.
import { Router } from 'express';
import { z } from 'zod';
import { recordEvent } from '../../events/domainEvents.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { conflict, notFound } from '../../lib/httpError.js';
import { prisma } from '../../lib/prisma.js';
import { requestRelease } from '../../lib/queue.js';
import { idParam, parse } from '../../lib/validate.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';

const priority = z.enum(['urgent', 'medium', 'low']);

/** Saves the correction and the audit entry together. */
async function decide(
  adminId: string,
  id: string,
  action: string,
  data: Prisma.NotificationUpdateInput,
  metadata: Record<string, unknown> = {},
) {
  return prisma.$transaction(async (tx) => {
    const n = await tx.notification.update({
      where: { id },
      data: { ...data, correctedBy: { connect: { id: adminId } }, correctedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action,
        targetType: 'notification',
        targetId: id,
        metadata: { title: n.title, ...metadata },
      },
    });
    return n;
  });
}

export function reviewRoutes() {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  async function blocked(id: string) {
    const n = await prisma.notification.findUnique({ where: { id } });
    if (!n) throw notFound();
    if (n.status !== 'blocked' || n.correctedSpam !== null) {
      throw conflict('already_reviewed', 'Someone already decided about this one.');
    }
    return n;
  }

  // "Not spam, deliver it now", optionally with the right priority.
  router.post('/review/spam/:id/release', async (req, res) => {
    const admin = currentUser(req);
    const { id } = parse(idParam, req.params);
    const input = parse(z.object({ priority: priority.optional() }), req.body ?? {});
    const n = await blocked(id);
    await decide(
      admin.id,
      id,
      'notification.released',
      {
        correctedSpam: false,
        status: 'queued',
        ...(input.priority &&
          input.priority !== n.predictedPriority && { correctedPriority: input.priority }),
      },
      input.priority ? { priority: input.priority } : {},
    );
    await requestRelease(id);
    res.json({ ok: true });
  });

  // "Yes, this is spam": stays blocked, and is no longer waiting for review.
  router.post('/review/spam/:id/confirm', async (req, res) => {
    const admin = currentUser(req);
    const { id } = parse(idParam, req.params);
    await blocked(id);
    await decide(admin.id, id, 'notification.spam_confirmed', { correctedSpam: true });
    res.json({ ok: true });
  });

  // ---------- Job posts held by the scam check (jobRoutes.ts) ----------
  // A held job was never listed and sent no alerts. "Publish" announces it now (alerts go out
  // and later checks trust the admin); "Remove" takes it down for good with a reason the
  // employer sees.
  router.get('/review/jobs', async (_req, res) => {
    const jobs = await prisma.job.findMany({
      where: { status: 'held' },
      include: {
        employer: { select: { id: true, name: true, companyName: true } },
        location: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({
      items: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        description: j.description,
        pay: j.pay,
        location: j.location.name,
        employer: { id: j.employer.id, name: j.employer.companyName ?? j.employer.name },
        spamScore: j.spamScore,
        explanation: j.spamReasons,
        createdAt: j.createdAt.toISOString(),
      })),
    });
  });

  async function heldJob(id: string) {
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) throw notFound();
    if (job.status !== 'held') {
      throw conflict('already_reviewed', 'Someone already decided about this one.');
    }
    return job;
  }

  router.post('/review/jobs/:id/publish', async (req, res) => {
    const admin = currentUser(req);
    const { id } = parse(idParam, req.params);
    const job = await heldJob(id);
    await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id },
        data: { status: 'open', reviewedAt: new Date(), reviewedById: admin.id },
      });
      if (job.deadline > new Date()) {
        await recordEvent(tx, 'job.posted', {
          jobId: id,
          employerId: job.employerId,
          locationId: job.locationId,
          skillId: job.skillId,
          urgent: job.urgency === 'urgent',
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: 'job.published_after_check',
          targetType: 'job',
          targetId: id,
          metadata: { title: job.title, spamScore: job.spamScore },
        },
      });
    });
    res.json({ ok: true });
  });

  router.post('/review/jobs/:id/remove', async (req, res) => {
    const admin = currentUser(req);
    const { id } = parse(idParam, req.params);
    const job = await heldJob(id);
    const reason = 'It looked like a scam (asking workers for money).';
    const now = new Date();
    await prisma.$transaction([
      prisma.job.update({
        where: { id },
        data: {
          status: 'removed',
          removedReason: reason,
          removedAt: now,
          removedById: admin.id,
          reviewedAt: now,
          reviewedById: admin.id,
        },
      }),
      prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: 'job.removed_as_scam',
          targetType: 'job',
          targetId: id,
          reason,
          metadata: { title: job.title, spamScore: job.spamScore },
        },
      }),
    ]);
    res.json({ ok: true });
  });

  // The right priority for any notification (a training label; it also changes how an alert
  // still waiting for its outside channels is sent).
  router.post('/notifications/:id/priority', async (req, res) => {
    const admin = currentUser(req);
    const { id } = parse(idParam, req.params);
    const input = parse(z.object({ priority }), req.body);
    const n = await prisma.notification.findUnique({ where: { id } });
    if (!n) throw notFound();
    const updated = await decide(
      admin.id,
      id,
      'notification.priority_corrected',
      { correctedPriority: input.priority === n.predictedPriority ? null : input.priority },
      { from: n.correctedPriority ?? n.predictedPriority, to: input.priority },
    );
    res.json({
      priority: updated.correctedPriority ?? updated.predictedPriority ?? 'medium',
      correctedPriority: updated.correctedPriority,
    });
  });

  // Announcements: how many people an audience reaches (shown before sending).
  router.get('/announcements/audience', async (req, res) => {
    const { audience } = parse(
      z.object({ audience: z.enum(['everyone', 'worker', 'business']) }),
      req.query,
    );
    const people = await prisma.user.count({
      where: {
        role: { in: audience === 'everyone' ? ['worker', 'business'] : [audience] },
        // The same people the announcement listener reaches.
        status: 'active',
        deletionRequestedAt: null,
      },
    });
    res.json({ people });
  });

  return router;
}
