import type { Prisma } from '../../generated/prisma/client.js';

export const jobInclude = {
  location: { select: { id: true, name: true } },
  skill: { select: { id: true, nameEn: true, nameSw: true } },
  employer: { select: { id: true, name: true, companyName: true } },
} satisfies Prisma.JobInclude;

export type JobWithRelations = Prisma.JobGetPayload<{ include: typeof jobInclude }>;

/** A job as the website sees it. Open jobs past their deadline are shown as closed. */
export function serializeJob(job: JobWithRelations) {
  const status = job.status === 'open' && job.deadline < new Date() ? 'closed' : job.status;
  return {
    id: job.id,
    title: job.title,
    description: job.description,
    pay: job.pay,
    deadline: job.deadline.toISOString(),
    urgent: job.urgency === 'urgent',
    status,
    removedReason: job.status === 'removed' ? job.removedReason : null,
    location: job.location,
    skill: job.skill,
    employer: {
      id: job.employer.id,
      name: job.employer.companyName ?? job.employer.name,
    },
    createdAt: job.createdAt.toISOString(),
  };
}
