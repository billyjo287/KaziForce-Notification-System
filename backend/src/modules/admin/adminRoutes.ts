// Admin: users (search, view, suspend / reactivate), jobs (view, remove with a reason) and the
// audit log. Every change is written to AuditLog in the same transaction.
import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { badRequest, notFound } from '../../lib/httpError.js';
import { prisma } from '../../lib/prisma.js';
import { PAGE_SIZE, idParam, pageQuery, parse } from '../../lib/validate.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { jobInclude, serializeJob } from '../marketplace/serializers.js';

const userListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(['worker', 'business', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  page: pageQuery,
});
const jobListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['open', 'closed', 'removed']).optional(),
  page: pageQuery,
});
const reasonSchema = z.object({
  reason: z.string().trim().min(5, 'Write a short reason (at least 5 characters)').max(500),
});
const optionalReasonSchema = z.object({ reason: z.string().trim().max(500).optional() });

const userListSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  companyName: true,
  createdAt: true,
  lastLoginAt: true,
  location: { select: { name: true } },
} satisfies Prisma.UserSelect;

export function adminRoutes() {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  // ---------- Users ----------
  router.get('/users', async (req, res) => {
    const query = parse(userListQuery, req.query);
    const where: Prisma.UserWhereInput = {
      ...(query.role && { role: query.role }),
      ...(query.status && { status: query.status }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
          { phone: { contains: query.q } },
          { companyName: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: userListSelect,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ items: users, total, page: query.page, pageSize: PAGE_SIZE });
  });

  router.get('/users/:id', async (req, res) => {
    const { id } = parse(idParam, req.params);
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        ...userListSelect,
        phoneVerified: true,
        usesWhatsApp: true,
        suspendedAt: true,
        suspendedReason: true,
        skills: { select: { nameEn: true, nameSw: true } },
        _count: { select: { jobsPosted: true, applications: true } },
      },
    });
    if (!user) throw notFound();
    const history = await prisma.auditLog.findMany({
      where: { targetType: 'user', targetId: id },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({
      user,
      history: history.map((h) => ({
        id: h.id,
        action: h.action,
        reason: h.reason,
        by: h.actor.name,
        at: h.createdAt.toISOString(),
      })),
    });
  });

  router.post('/users/:id/suspend', async (req, res) => {
    const admin = currentUser(req);
    const { id } = parse(idParam, req.params);
    const { reason } = parse(reasonSchema, req.body);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound();
    if (target.role === 'admin') {
      throw badRequest('cannot_suspend_admin', 'Admin accounts cannot be suspended here.');
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { status: 'suspended', suspendedAt: now, suspendedReason: reason },
      }),
      // Suspended users are logged out everywhere at once.
      prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      }),
      prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: 'user.suspended',
          targetType: 'user',
          targetId: id,
          reason,
        },
      }),
    ]);
    res.json({ ok: true });
  });

  router.post('/users/:id/reactivate', async (req, res) => {
    const admin = currentUser(req);
    const { id } = parse(idParam, req.params);
    const { reason } = parse(optionalReasonSchema, req.body ?? {});
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound();

    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { status: 'active', suspendedAt: null, suspendedReason: null },
      }),
      prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: 'user.reactivated',
          targetType: 'user',
          targetId: id,
          reason: reason || null,
        },
      }),
    ]);
    res.json({ ok: true });
  });

  // ---------- Jobs ----------
  router.get('/jobs', async (req, res) => {
    const query = parse(jobListQuery, req.query);
    const where: Prisma.JobWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.q && {
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { employer: { companyName: { contains: query.q, mode: 'insensitive' } } },
          { employer: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      }),
    };
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: { ...jobInclude, _count: { select: { applications: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.job.count({ where }),
    ]);
    res.json({
      items: jobs.map((j) => ({ ...serializeJob(j), applicantCount: j._count.applications })),
      total,
      page: query.page,
      pageSize: PAGE_SIZE,
    });
  });

  router.post('/jobs/:id/remove', async (req, res) => {
    const admin = currentUser(req);
    const { id } = parse(idParam, req.params);
    const { reason } = parse(reasonSchema, req.body);
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) throw notFound();
    if (job.status === 'removed')
      throw badRequest('already_removed', 'This job was already removed.');

    const now = new Date();
    await prisma.$transaction([
      prisma.job.update({
        where: { id },
        data: { status: 'removed', removedReason: reason, removedAt: now, removedById: admin.id },
      }),
      prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: 'job.removed',
          targetType: 'job',
          targetId: id,
          reason,
          metadata: { title: job.title },
        },
      }),
    ]);
    res.json({ ok: true });
  });

  // ---------- Audit log ----------
  router.get('/audit-log', async (req, res) => {
    const { page } = parse(z.object({ page: pageQuery }), req.query);
    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.auditLog.count(),
    ]);
    // Human-readable names for the things acted on.
    const userIds = entries.filter((e) => e.targetType === 'user').map((e) => e.targetId);
    const jobIds = entries.filter((e) => e.targetType === 'job').map((e) => e.targetId);
    const [users, jobs] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
      prisma.job.findMany({ where: { id: { in: jobIds } }, select: { id: true, title: true } }),
    ]);
    const names = new Map([
      ...users.map((u) => [u.id, u.name] as const),
      ...jobs.map((j) => [j.id, j.title] as const),
    ]);
    res.json({
      items: entries.map((e) => ({
        id: e.id,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        targetName: names.get(e.targetId) ?? null,
        reason: e.reason,
        by: e.actor.name,
        at: e.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    });
  });

  return router;
}
