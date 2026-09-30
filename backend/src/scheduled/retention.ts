// Data retention (DR-4, NFR-2 Kenya Data Protection Act 2019), run every night at 03:30 Nairobi:
//   accounts   deleted ACCOUNT_DELETION_DAYS after the person asked (they can cancel until
//              then). With the nightly run that is at most 15 days: well inside the 30 required.
//              Deleting a user removes everything that is theirs (database cascade): profile,
//              preferences, notifications and their delivery logs, jobs posted, applications,
//              messages, sessions.
//   delivery logs older than 180 days are removed.
//   notifications are kept (at least 90 days is required): they are the future training data,
//              and the ML export is anonymised (Phase 7).
//   housekeeping: expired tracked links, finished domain events after 30 days, old sessions,
//              used or expired reset links and phone codes.
import type { PrismaClient } from '../generated/prisma/client.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const ACCOUNT_DELETION_DAYS = 14;
export const DELIVERY_LOG_DAYS = 180;
const EVENT_DAYS = 30;
const SESSION_DAYS = 30;

/** The day the account will be deleted, for "Your account will be deleted on ...". */
export const deletionDate = (requestedAt: Date) =>
  new Date(requestedAt.getTime() + ACCOUNT_DELETION_DAYS * DAY_MS);

export async function runRetention(
  prisma: PrismaClient,
  now: Date,
  onUserDeleted?: (userId: string) => Promise<void>,
) {
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);

  const due = await prisma.user.findMany({
    where: { deletionRequestedAt: { lte: daysAgo(ACCOUNT_DELETION_DAYS) }, role: { not: 'admin' } },
    select: { id: true },
  });
  const accounts = await prisma.user.deleteMany({ where: { id: { in: due.map((u) => u.id) } } });
  for (const { id } of due) await onUserDeleted?.(id);

  const [deliveryLogs, trackedLinks, domainEvents, sessions, resetTokens, phoneCodes] =
    await prisma.$transaction([
      prisma.deliveryLog.deleteMany({ where: { createdAt: { lt: daysAgo(DELIVERY_LOG_DAYS) } } }),
      prisma.trackedLink.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.domainEvent.deleteMany({
        where: {
          OR: [
            { processedAt: { lt: daysAgo(EVENT_DAYS) } },
            { cancelledAt: { lt: daysAgo(EVENT_DAYS) } },
          ],
        },
      }),
      prisma.session.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: daysAgo(SESSION_DAYS) } }],
        },
      }),
      prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: daysAgo(1) } } }),
      prisma.phoneVerification.deleteMany({ where: { expiresAt: { lt: daysAgo(1) } } }),
    ]);

  return {
    accounts: accounts.count,
    deliveryLogs: deliveryLogs.count,
    trackedLinks: trackedLinks.count,
    domainEvents: domainEvents.count,
    sessions: sessions.count,
    resetTokens: resetTokens.count,
    phoneCodes: phoneCodes.count,
  };
}
