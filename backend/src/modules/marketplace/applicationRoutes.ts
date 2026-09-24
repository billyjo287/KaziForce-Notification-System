// Applications: workers see theirs; employers see applicants per job and Accept / Reject them
// with Undo (PRD FR-2.2).
//
// Undo: the status changes at once, but its "application.status_changed" event is held for
// STATUS_UNDO_SECONDS before Phase 3 may act on it. Undo inside that window restores the old
// status and cancels the event, so the worker never gets an alert that is then taken back.
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { recordEvent } from '../../events/domainEvents.js';
import type { ApplicationStatus, Prisma } from '../../generated/prisma/client.js';
import { conflict, notFound } from '../../lib/httpError.js';
import { prisma } from '../../lib/prisma.js';
import { idParam, parse } from '../../lib/validate.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { jobInclude, serializeJob } from './serializers.js';

const applicantInclude = {
  worker: {
    select: {
      id: true,
      name: true,
      location: { select: { name: true } },
      skills: { select: { id: true, nameEn: true, nameSw: true } },
    },
  },
  _count: { select: { messages: true } },
} satisfies Prisma.ApplicationInclude;

type ApplicantRow = Prisma.ApplicationGetPayload<{ include: typeof applicantInclude }>;

function serializeApplicant(a: ApplicantRow) {
  return {
    id: a.id,
    status: a.status,
    note: a.note,
    appliedAt: a.createdAt.toISOString(),
    worker: {
      id: a.worker.id,
      name: a.worker.name,
      location: a.worker.location?.name ?? null,
      skills: a.worker.skills,
    },
    messageCount: a._count.messages,
  };
}

/** Routes under /api/employer (employers only). */
export function employerRoutes() {
  const router = Router();
  router.use(requireAuth, requireRole('business'));

  router.get('/jobs', async (req, res) => {
    const me = currentUser(req);
    const jobs = await prisma.job.findMany({
      where: { employerId: me.id },
      include: {
        ...jobInclude,
        applications: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      items: jobs.map((job) => ({
        ...serializeJob(job),
        applicantCount: job.applications.length,
        newApplicantCount: job.applications.filter((a) => a.status === 'received').length,
      })),
    });
  });

  // One job with its applicants. Opening it marks new applications as "reviewed".
  router.get('/jobs/:id', async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const job = await prisma.job.findUnique({ where: { id }, include: jobInclude });
    if (!job || job.employerId !== me.id) throw notFound();

    const fresh = await prisma.application.findMany({ where: { jobId: id, status: 'received' } });
    if (fresh.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const application of fresh) {
          await tx.application.update({
            where: { id: application.id },
            data: { status: 'reviewed', statusChangedAt: new Date() },
          });
          await recordEvent(tx, 'application.status_changed', {
            applicationId: application.id,
            jobId: id,
            workerId: application.workerId,
            from: 'received',
            to: 'reviewed',
          });
        }
      });
    }

    const applicants = await prisma.application.findMany({
      where: { jobId: id },
      include: applicantInclude,
      orderBy: { createdAt: 'asc' },
    });
    res.json({ job: serializeJob(job), applicants: applicants.map(serializeApplicant) });
  });

  return router;
}

const statusSchema = z.object({ status: z.enum(['accepted', 'rejected']) });
const undoSchema = z.object({ undoId: z.uuid() });

/** Routes under /api/applications. */
export function applicationRoutes() {
  const router = Router();
  router.use(requireAuth);

  // Worker: "My applications".
  router.get('/mine', requireRole('worker'), async (req, res) => {
    const me = currentUser(req);
    const applications = await prisma.application.findMany({
      where: { workerId: me.id },
      include: { job: { include: jobInclude } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      items: applications.map((a) => ({
        id: a.id,
        status: a.status,
        note: a.note,
        appliedAt: a.createdAt.toISOString(),
        statusChangedAt: a.statusChangedAt?.toISOString() ?? null,
        job: serializeJob(a.job),
      })),
    });
  });

  // Employer: Accept or Reject in one tap.
  router.patch('/:id/status', requireRole('business'), async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const { status } = parse(statusSchema, req.body);
    const application = await prisma.application.findUnique({
      where: { id },
      include: { job: true },
    });
    if (!application || application.job.employerId !== me.id) throw notFound();
    if (application.status === status) {
      return res.json({ application: { id, status }, undoId: null, undoSeconds: 0 });
    }

    const from: ApplicationStatus = application.status;
    const { updated, event } = await prisma.$transaction(async (tx) => {
      const updated = await tx.application.update({
        where: { id },
        data: { status, statusChangedAt: new Date() },
      });
      const event = await recordEvent(
        tx,
        'application.status_changed',
        {
          applicationId: id,
          jobId: application.jobId,
          workerId: application.workerId,
          from,
          to: status,
        },
        { delaySeconds: env.STATUS_UNDO_SECONDS },
      );
      return { updated, event };
    });
    res.json({
      application: { id: updated.id, status: updated.status },
      undoId: event.id,
      undoSeconds: env.STATUS_UNDO_SECONDS,
    });
  });

  // Employer: Undo the last Accept/Reject while its event is still being held.
  router.post('/:id/undo', requireRole('business'), async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const { undoId } = parse(undoSchema, req.body);
    const application = await prisma.application.findUnique({
      where: { id },
      include: { job: true },
    });
    if (!application || application.job.employerId !== me.id) throw notFound();

    const event = await prisma.domainEvent.findUnique({ where: { id: undoId } });
    const payload = event?.payload as
      { applicationId?: string; from?: ApplicationStatus } | undefined;
    const stillHeld =
      event &&
      event.type === 'application.status_changed' &&
      payload?.applicationId === id &&
      !event.processedAt &&
      !event.cancelledAt &&
      event.availableAt > new Date();
    if (!stillHeld || !payload?.from) {
      throw conflict('undo_too_late', 'It is too late to undo this change.');
    }

    await prisma.$transaction([
      prisma.application.update({
        where: { id },
        data: { status: payload.from, statusChangedAt: new Date() },
      }),
      prisma.domainEvent.update({ where: { id: undoId }, data: { cancelledAt: new Date() } }),
    ]);
    res.json({ application: { id, status: payload.from } });
  });

  return router;
}
