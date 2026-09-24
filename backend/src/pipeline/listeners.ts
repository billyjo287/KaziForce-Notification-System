// Listeners: turn each domain event into notifications for the right people (PRD FR-2).
//   job.posted                  -> workers in the same place OR with the job's skill (FR-2.1)
//   application.created         -> the employer: "New applicant"
//   application.status_changed  -> the worker: reviewed / accepted / rejected (FR-2.2)
//   message.sent                -> the other person in the conversation (FR-2.3)
//   admin.announcement          -> everyone, or all workers, or all employers (FR-2.4)
// Each listener only DESCRIBES the notifications; createNotifications.ts checks and saves them.
import type { DomainEventPayloads, DomainEventType } from '../events/domainEvents.js';
import type { Prisma, Role } from '../generated/prisma/client.js';
import type { NotificationInput } from './createNotifications.js';
import { applicationStatusText, jobAlertText, messageText, newApplicantText } from './templates.js';

type Tx = Prisma.TransactionClient;
type Listener<T extends DomainEventType> = (
  tx: Tx,
  payload: DomainEventPayloads[T],
) => Promise<NotificationInput[]>;

const companyName = (u: { name: string; companyName: string | null }) => u.companyName ?? u.name;
const sidePath = (role: Role) => (role === 'business' ? '/employer' : '/worker');

/** Only people who can still use the app get broadcast alerts. */
const reachable = { status: 'active', deletionRequestedAt: null } as const;

const jobPosted: Listener<'job.posted'> = async (tx, { jobId }) => {
  const job = await tx.job.findUnique({
    where: { id: jobId },
    include: {
      employer: { select: { id: true, name: true, companyName: true } },
      location: { select: { name: true } },
      skill: { select: { nameEn: true, nameSw: true } },
    },
  });
  // Removed or closed before we got to it: nobody should be sent there.
  if (!job || job.status !== 'open' || job.deadline <= new Date()) return [];

  // Simple rule, no matching algorithm: same place OR same skill.
  const workers = await tx.user.findMany({
    where: {
      role: 'worker',
      ...reachable,
      OR: [{ locationId: job.locationId }, { skills: { some: { id: job.skillId } } }],
    },
    select: { id: true, language: true },
  });

  const now = new Date();
  return workers.map((worker) => ({
    type: 'job_alert',
    category: 'new_job',
    recipientId: worker.id,
    recipientRole: 'worker',
    senderId: job.employer.id,
    senderRole: 'business',
    ...jobAlertText(worker.language, {
      title: job.title,
      company: companyName(job.employer),
      skill: worker.language === 'sw' ? job.skill.nameSw : job.skill.nameEn,
      location: job.location.name,
      pay: job.pay,
      deadline: job.deadline,
      urgent: job.urgency === 'urgent',
    }),
    link: `/worker/jobs/${job.id}`,
    jobId: job.id,
    deadlineAt: job.deadline,
    createdAt: now,
  }));
};

const applicationCreated: Listener<'application.created'> = async (tx, { applicationId }) => {
  const application = await tx.application.findUnique({
    where: { id: applicationId },
    include: {
      worker: { select: { id: true, name: true } },
      job: {
        select: {
          id: true,
          title: true,
          deadline: true,
          employer: { select: { id: true, language: true } },
        },
      },
    },
  });
  if (!application) return [];
  const { job, worker } = application;
  return [
    {
      type: 'status_update',
      category: 'new_applicant',
      recipientId: job.employer.id,
      recipientRole: 'business',
      senderId: worker.id,
      senderRole: 'worker',
      ...newApplicantText(job.employer.language, worker.name, job.title),
      link: `/employer/jobs/${job.id}`,
      jobId: job.id,
      deadlineAt: job.deadline,
      createdAt: new Date(),
    },
  ];
};

const statusChanged: Listener<'application.status_changed'> = async (tx, payload) => {
  const application = await tx.application.findUnique({
    where: { id: payload.applicationId },
    include: {
      worker: { select: { id: true, language: true } },
      job: {
        select: {
          id: true,
          title: true,
          employer: { select: { id: true, name: true, companyName: true } },
        },
      },
    },
  });
  // Changed again since (e.g. Accept, then Reject a few seconds later): only the latest counts,
  // so the worker never gets "accepted" followed by "not successful".
  if (!application || application.status !== payload.to) return [];
  if (payload.to !== 'reviewed' && payload.to !== 'accepted' && payload.to !== 'rejected') {
    return [];
  }
  const { job, worker } = application;
  return [
    {
      type: 'status_update',
      category: 'application_update',
      recipientId: worker.id,
      recipientRole: 'worker',
      senderId: job.employer.id,
      senderRole: 'business',
      ...applicationStatusText(worker.language, payload.to, companyName(job.employer), job.title),
      link: '/worker/jobs?tab=applications',
      jobId: job.id,
      deadlineAt: null,
      createdAt: new Date(),
    },
  ];
};

const messageSent: Listener<'message.sent'> = async (tx, { messageId }) => {
  const message = await tx.message.findUnique({
    where: { id: messageId },
    include: {
      sender: { select: { id: true, name: true, companyName: true, role: true } },
      recipient: { select: { id: true, role: true, language: true } },
      application: { select: { id: true, jobId: true } },
    },
  });
  if (!message) return [];
  const { sender, recipient } = message;
  if (recipient.role === 'admin' || sender.role === 'admin') return [];
  return [
    {
      type: 'message',
      category: 'message',
      recipientId: recipient.id,
      recipientRole: recipient.role,
      senderId: sender.id,
      senderRole: sender.role,
      ...messageText(
        recipient.language,
        sender.role === 'business' ? companyName(sender) : sender.name,
        message.body,
      ),
      link: `${sidePath(recipient.role)}/messages/${message.application.id}`,
      jobId: message.application.jobId,
      deadlineAt: null,
      createdAt: new Date(),
    },
  ];
};

const announcement: Listener<'admin.announcement'> = async (tx, payload) => {
  const roles: Role[] =
    payload.audience === 'everyone' ? ['worker', 'business'] : [payload.audience];
  const people = await tx.user.findMany({
    where: { role: { in: roles }, ...reachable },
    select: { id: true, role: true },
  });
  const now = new Date();
  return people.map((person) => ({
    type: 'announcement',
    category: 'announcement',
    recipientId: person.id,
    recipientRole: person.role,
    senderId: payload.adminId,
    senderRole: 'admin',
    title: payload.title,
    message: payload.message,
    link: null,
    jobId: null,
    deadlineAt: null,
    createdAt: now,
  }));
};

const listeners: { [T in DomainEventType]: Listener<T> } = {
  'job.posted': jobPosted,
  'application.created': applicationCreated,
  'application.status_changed': statusChanged,
  'message.sent': messageSent,
  'admin.announcement': announcement,
};

export const isKnownEvent = (type: string): type is DomainEventType => type in listeners;

/** The notifications one event should create (not yet checked or saved). */
export function notificationsFor(
  tx: Tx,
  event: { type: DomainEventType; payload: unknown },
): Promise<NotificationInput[]> {
  const listener = listeners[event.type] as Listener<DomainEventType>;
  return listener(tx, event.payload as DomainEventPayloads[DomainEventType]);
}
