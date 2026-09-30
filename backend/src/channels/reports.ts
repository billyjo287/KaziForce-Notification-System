// What the providers tell us after a send (PRD FR-7): delivered, read (WhatsApp) or failed, and
// opt-outs (STOP). Used by the webhook routes in the API process.
import type { PrismaClient } from '../generated/prisma/client.js';
import { requestEscalation } from '../lib/queue.js';

export type ReportOutcome = 'accepted' | 'delivered' | 'read' | 'failed';

/**
 * Updates the DeliveryLog row with this provider message id. "read" also counts as opened
 * (stops the escalation); "failed" asks the worker to try the next channel at once.
 */
export async function applyDeliveryReport(
  prisma: PrismaClient,
  providerMessageId: string,
  outcome: ReportOutcome,
  error?: string,
) {
  const log = await prisma.deliveryLog.findFirst({ where: { providerMessageId } });
  if (!log || outcome === 'accepted') return log;
  const now = new Date();

  if (outcome === 'failed') {
    await prisma.deliveryLog.update({
      where: { id: log.id },
      data: { status: 'failed', error: (error ?? 'Reported as failed').slice(0, 500) },
    });
    // The worker checks the rest: urgent? not opened? a next channel?
    await requestEscalation(log.notificationId);
    return log;
  }

  await prisma.deliveryLog.update({
    where: { id: log.id },
    data: {
      status: 'delivered',
      deliveredAt: log.deliveredAt ?? now,
      ...(outcome === 'read' && { openedAt: log.openedAt ?? now }),
    },
  });
  return log;
}

type OptChannel = 'whatsapp' | 'sms';

/**
 * The person replied STOP (or opted out with their network): switch that channel off in their
 * preferences and remember when (Kenya Data Protection Act: easy opt-out). START reverses it.
 */
export async function setChannelOptOut(
  prisma: PrismaClient,
  phone: string,
  channel: OptChannel,
  optedOut: boolean,
) {
  const user = await prisma.user.findUnique({
    where: { phone },
    include: { preference: { select: { channelSettings: true } } },
  });
  if (!user) return null;
  const settings = { ...((user.preference?.channelSettings as Record<string, object>) ?? {}) };
  settings[channel] = {
    ...(settings[channel] ?? { threshold: 'urgent_only' }),
    enabled: !optedOut,
  };
  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(channel === 'whatsapp'
        ? { whatsappOptedOutAt: optedOut ? new Date() : null }
        : { smsOptedOutAt: optedOut ? new Date() : null }),
      ...(user.preference && { preference: { update: { channelSettings: settings } } }),
    },
  });
  return user;
}
