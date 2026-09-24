// Jobs: browse and apply (workers), post and manage applicants (employers). PRD FR-2.1, FR-2.2.
import { Router } from 'express';
import { z } from 'zod';
import { recordEvent } from '../../events/domainEvents.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { badRequest, conflict, notFound } from '../../lib/httpError.js';
import { prisma } from '../../lib/prisma.js';
import { PAGE_SIZE, idParam, pageQuery, parse } from '../../lib/validate.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { jobInclude, serializeJob } from './serializers.js';

const MAX_DEADLINE_DAYS = 90;

const listQuery = z.object({
  locationId: z.uuid().optional(),
  skillId: z.uuid().optional(),
  page: pageQuery,
});

const postJobSchema = z.object({
  title: z.string().trim().min(5, 'Use at least 5 characters').max(120),
  description: z.string().trim().min(10, 'Use at least 10 characters').max(2000),
  locationId: z.uuid(),
  skillId: z.uuid(),
  pay: z.string().trim().max(80).optional(),
  deadline: z.iso.datetime({ offset: true }),
  urgent: z.boolean().default(false),
});

const applySchema = z.object({ note: z.string().trim().max(500).optional() });

/** Open jobs whose deadline has not passed. */
const openJobs = (): Prisma.JobWhereInput => ({ status: 'open', deadline: { gt: new Date() } });

export function jobRoutes() {
  const router = Router();
  router.use(requireAuth);

  // Browse open jobs (anyone logged in), newest first, with simple filters.
  router.get('/', async (req, res) => {
    const me = currentUser(req);
    const query = parse(listQuery, req.query);
    const where: Prisma.JobWhereInput = {
      ...openJobs(),
      ...(query.locationId && { locationId: query.locationId }),
      ...(query.skillId && { skillId: query.skillId }),
    };
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          ...jobInclude,
          applications: { where: { workerId: me.id }, select: { id: true, status: true } },
        },
        orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.job.count({ where }),
    ]);
    res.json({
      items: jobs.map((job) => ({
        ...serializeJob(job),
        myApplication: job.applications[0] ?? null,
      })),
      total,
      page: query.page,
      pageSize: PAGE_SIZE,
    });
  });

  router.get('/:id', async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        ...jobInclude,
        applications: { where: { workerId: me.id }, select: { id: true, status: true } },
        _count: { select: { applications: true } },
      },
    });
    // Removed jobs are only visible to their employer and admins.
    if (!job || (job.status === 'removed' && me.role === 'worker')) throw notFound();
    const isOwner = job.employerId === me.id;
    res.json({
      job: {
        ...serializeJob(job),
        myApplication: job.applications[0] ?? null,
        applicantCount: isOwner || me.role === 'admin' ? job._count.applications : undefined,
        isMine: isOwner,
      },
    });
  });

  // Post a job on one page (employers).
  router.post('/', requireRole('business'), async (req, res) => {
    const me = currentUser(req);
    const input = parse(postJobSchema, req.body);
    const deadline = new Date(input.deadline);
    const maxDeadline = Date.now() + MAX_DEADLINE_DAYS * 24 * 60 * 60 * 1000;
    if (deadline.getTime() <= Date.now() || deadline.getTime() > maxDeadline) {
      throw badRequest('invalid_input', 'Choose a closing time in the future (within 90 days).', {
        fields: { deadline: 'Choose a time in the future, within 90 days' },
      });
    }
    const [location, skill] = await Promise.all([
      prisma.location.count({ where: { id: input.locationId } }),
      prisma.skill.count({ where: { id: input.skillId } }),
    ]);
    if (!location || !skill)
      throw badRequest('invalid_input', 'Choose a place and skill from the list.');

    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          employerId: me.id,
          title: input.title,
          description: input.description,
          locationId: input.locationId,
          skillId: input.skillId,
          pay: input.pay || null,
          deadline,
          urgency: input.urgent ? 'urgent' : 'normal',
        },
        include: jobInclude,
      });
      await recordEvent(tx, 'job.posted', {
        jobId: created.id,
        employerId: me.id,
        locationId: created.locationId,
        skillId: created.skillId,
        urgent: input.urgent,
      });
      return created;
    });
    res.status(201).json({ job: serializeJob(job) });
  });

  // One-tap apply with an optional short note (workers).
  router.post('/:id/apply', requireRole('worker'), async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const { note } = parse(applySchema, req.body ?? {});
    const job = await prisma.job.findFirst({ where: { id, ...openJobs() } });
    if (!job) throw conflict('job_closed', 'This job is no longer open.');

    const existing = await prisma.application.findUnique({
      where: { jobId_workerId: { jobId: id, workerId: me.id } },
    });
    if (existing) throw conflict('already_applied', 'You have already applied for this job.');

    const application = await prisma.$transaction(async (tx) => {
      const created = await tx.application.create({
        data: { jobId: id, workerId: me.id, note: note || null },
      });
      await recordEvent(tx, 'application.created', {
        applicationId: created.id,
        jobId: id,
        workerId: me.id,
        employerId: job.employerId,
      });
      return created;
    });
    res.status(201).json({ application: { id: application.id, status: application.status } });
  });

  return router;
}
