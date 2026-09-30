// Short tracked links for SMS, WhatsApp and email: PUBLIC_API_URL/o/<8 characters>.
// Opening one counts as "opened" on that channel (PRD FR-4: stops the urgent escalation), then
// the person is sent to the alert in the app, where they must be logged in to see the details.
import { randomBytes } from 'node:crypto';
import type { Channel, PrismaClient } from '../generated/prisma/client.js';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes
const LINK_DAYS = 30;

function shortToken(length = 8): string {
  // Rejection sampling keeps every character equally likely.
  let token = '';
  while (token.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 256 - (256 % ALPHABET.length)) token += ALPHABET[byte % ALPHABET.length];
      if (token.length === length) break;
    }
  }
  return token;
}

/** The link for this notification on this channel (the same one on every retry). */
export async function trackedLinkFor(
  prisma: PrismaClient,
  publicApiUrl: string,
  notificationId: string,
  channel: Channel,
): Promise<string> {
  const link = await prisma.trackedLink.upsert({
    where: { notificationId_channel: { notificationId, channel } },
    create: {
      notificationId,
      channel,
      token: shortToken(),
      expiresAt: new Date(Date.now() + LINK_DAYS * 24 * 60 * 60 * 1000),
    },
    update: {},
  });
  return `${publicApiUrl.replace(/\/$/, '')}/o/${link.token}`;
}

/** Records a click (first one = opened on that channel). Returns where to send the person. */
export async function openTrackedLink(prisma: PrismaClient, token: string, publicAppUrl: string) {
  const home = publicAppUrl.replace(/\/$/, '');
  const link = await prisma.trackedLink.findUnique({
    where: { token },
    include: { notification: { select: { id: true, recipientRole: true } } },
  });
  if (!link || link.expiresAt < new Date()) return `${home}/login`;

  const now = new Date();
  await prisma.$transaction([
    prisma.trackedLink.update({
      where: { id: link.id },
      data: { clickCount: { increment: 1 }, firstClickedAt: link.firstClickedAt ?? now },
    }),
    prisma.deliveryLog.updateMany({
      where: { notificationId: link.notificationId, channel: link.channel, clickedAt: null },
      data: { clickedAt: now },
    }),
    prisma.deliveryLog.updateMany({
      where: { notificationId: link.notificationId, channel: link.channel, openedAt: null },
      data: { openedAt: now },
    }),
  ]);
  const side = link.notification.recipientRole === 'business' ? 'employer' : 'worker';
  return `${home}/${side}/alerts?open=${link.notification.id}`;
}
