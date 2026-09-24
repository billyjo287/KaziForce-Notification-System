// Domain events: "something happened" records that Phase 3 turns into notifications.
// They are written to the DomainEvent table INSIDE the same database transaction as the change,
// so an event can never be lost or recorded for a change that was rolled back.
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
  /** Defined now; the Announcements page that sends it arrives in Phase 7. */
  'admin.announcement': { announcementId: string; audience: 'everyone' | 'worker' | 'business' };
}

export type DomainEventType = keyof DomainEventPayloads;

export function recordEvent<T extends DomainEventType>(
  tx: Prisma.TransactionClient,
  type: T,
  payload: DomainEventPayloads[T],
  options: { delaySeconds?: number } = {},
) {
  return tx.domainEvent.create({
    data: {
      type,
      payload,
      availableAt: new Date(Date.now() + (options.delaySeconds ?? 0) * 1000),
    },
  });
}
