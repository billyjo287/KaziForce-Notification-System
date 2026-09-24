// Domain events: "something happened" records that the worker turns into notifications.
// They are written to the DomainEvent table INSIDE the same database transaction as the change,
// so an event can never be lost or recorded for a change that was rolled back.
// Events that may be handled at once also send a Postgres NOTIFY signal. Postgres delivers it
// only when the transaction commits, so the worker wakes up exactly when the event is saved.
import type { Prisma } from '../generated/prisma/client.js';

export interface DomainEventPayloads {
  'job.posted': {
    jobId: string;
    employerId: string;
    locationId: string;
    skillId: string;
    urgent: boolean;
  };
  'application.created': {
    applicationId: string;
    jobId: string;
    workerId: string;
    employerId: string;
  };
  'application.status_changed': {
    applicationId: string;
    jobId: string;
    workerId: string;
    from: string;
    to: string;
  };
  'message.sent': {
    messageId: string;
    applicationId: string;
    senderId: string;
    recipientId: string;
  };
  'admin.announcement': {
    adminId: string;
    audience: 'everyone' | 'worker' | 'business';
    title: string;
    message: string;
  };
}

export type DomainEventType = keyof DomainEventPayloads;

/** Postgres channel the worker LISTENs on. */
export const EVENT_SIGNAL = 'kaziforce_domain_event';

export async function recordEvent<T extends DomainEventType>(
  tx: Prisma.TransactionClient,
  type: T,
  payload: DomainEventPayloads[T],
  options: { delaySeconds?: number } = {},
) {
  const delaySeconds = options.delaySeconds ?? 0;
  const event = await tx.domainEvent.create({
    data: { type, payload, availableAt: new Date(Date.now() + delaySeconds * 1000) },
  });
  // Delayed events are picked up by the worker's regular check once their time comes.
  if (delaySeconds === 0) await tx.$executeRaw`SELECT pg_notify(${EVENT_SIGNAL}, ${event.id})`;
  return event;
}
