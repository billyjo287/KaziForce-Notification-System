// Data retention (DR-4, NFR-2 Kenya Data Protection Act 2019), run every night at 03:30 Nairobi:
//   accounts   deleted ACCOUNT_DELETION_DAYS after the person asked (they can cancel until
//              then). With the nightly run that is at most 15 days: well inside the 30 required.
//              Deleting a user removes everything that is theirs (database cascade): profile,
//              preferences, notifications and their delivery logs, jobs posted, applications,
//              messages, sessions. Alerts they sent to OTHER people stay (the other person's
//              history and the training data), but their name is replaced with "a former user"
//              and the words of their chat messages are removed (forgetSender, below).
//   delivery logs older than 180 days are removed.
//   notifications are kept (at least 90 days is required): they are the future training data,
//              and the ML export is anonymised (Phase 7).
//   housekeeping: expired tracked links, finished domain events after 30 days, old sessions,
//              used or expired reset links and phone codes.
import type { Language, PrismaClient } from '../generated/prisma/client.js';
import { formerUserText } from '../pipeline/templates.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const ACCOUNT_DELETION_DAYS = 14;
export const DELIVERY_LOG_DAYS = 180;
const EVENT_DAYS = 30;
const SESSION_DAYS = 30;

/** The day the account will be deleted, for "Your account will be deleted on ...". */
export const deletionDate = (requestedAt: Date) =>
  new Date(requestedAt.getTime() + ACCOUNT_DELETION_DAYS * DAY_MS);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replaces a person's name in text with "a former user" (in `language`): the full name, its
 * parts of 4 letters or more ("Wanjiru" in "Wanjiru Kamau") and the company name, as whole words
 * only. Capitalised at the start of a sentence.
 */
export function replaceName(
  text: string,
  person: { name: string; companyName: string | null },
  language: Language,
) {
  const names = [
    person.name,
    ...person.name.split(/\s+/).filter((part) => part.length >= 4),
    ...(person.companyName ? [person.companyName] : []),
  ]
    .map((n) => n.trim())
    .filter((n) => n.length >= 3);
  if (!names.length) return text;
  const unique = [...new Set(names)].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(${unique.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`,
    'giu',
  );
  const { name } = formerUserText(language);
  return text.replace(pattern, (_match, _name, offset: number, whole: string) =>
    offset === 0 || /[.!?]\s*$/.test(whole.slice(0, offset))
      ? name[0]!.toUpperCase() + name.slice(1)
      : name,
  );
}

/**
 * Before an account is deleted: in the alerts it sent to other people, its name becomes
 * "a former user", and chat messages lose their words (the messages themselves are deleted
 * with the account, so the alert must not keep a copy).
 */
async function forgetSender(
  prisma: PrismaClient,
  person: { id: string; name: string; companyName: string | null },
) {
  const sent = await prisma.notification.findMany({
    where: { senderId: person.id, recipientId: { not: person.id } },
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      recipient: { select: { language: true } },
    },
  });
  const updates = sent.flatMap((n) => {
    const { language } = n.recipient;
    const title = replaceName(n.title, person, language);
    const message =
      n.type === 'message'
        ? formerUserText(language).removedMessage
        : replaceName(n.message, person, language);
    return title === n.title && message === n.message
      ? []
      : [prisma.notification.update({ where: { id: n.id }, data: { title, message } })];
  });
  for (let i = 0; i < updates.length; i += 500) {
    await prisma.$transaction(updates.slice(i, i + 500));
  }
}

export async function runRetention(
  prisma: PrismaClient,
  now: Date,
  onUserDeleted?: (userId: string) => Promise<void>,
) {
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);

  const due = await prisma.user.findMany({
    where: { deletionRequestedAt: { lte: daysAgo(ACCOUNT_DELETION_DAYS) }, role: { not: 'admin' } },
    select: { id: true, name: true, companyName: true },
  });
  for (const user of due) await forgetSender(prisma, user);
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
