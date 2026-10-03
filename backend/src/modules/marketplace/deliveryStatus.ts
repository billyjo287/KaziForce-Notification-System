// What an employer may know about the alerts they caused (Phase 7): for their job, how many
// workers the job alert reached and saw (numbers only: who got a job alert is the workers'
// business), and for each applicant, whether they saw the latest status update and message.
import type { PrismaClient } from '../../generated/prisma/client.js';

export type DeliveryState = 'seen' | 'delivered' | 'sent' | 'waiting' | 'not_delivered';

type ForState = {
  status: string;
  readAt: Date | null;
  deliveries: { deliveredAt: Date | null; openedAt: Date | null; clickedAt: Date | null }[];
};

/** One plain state per alert, the furthest it got. */
export function deliveryState(n: ForState): DeliveryState {
  if (n.status === 'blocked' || n.status === 'failed') return 'not_delivered';
  if (n.readAt || n.deliveries.some((d) => d.openedAt || d.clickedAt)) return 'seen';
  if (n.deliveries.some((d) => d.deliveredAt)) return 'delivered';
  if (n.status === 'sent') return 'sent';
  return 'waiting';
}

const STATES: DeliveryState[] = ['seen', 'delivered', 'sent', 'waiting', 'not_delivered'];

export async function jobDeliveryStatus(prisma: PrismaClient, jobId: string, employerId: string) {
  const alerts = await prisma.notification.findMany({
    where: {
      jobId,
      senderId: employerId,
      category: { in: ['new_job', 'application_update', 'message'] },
    },
    select: {
      category: true,
      recipientId: true,
      status: true,
      readAt: true,
      createdAt: true,
      deliveries: { select: { deliveredAt: true, openedAt: true, clickedAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const jobAlert = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<DeliveryState, number>;
  // Later alerts overwrite earlier ones: each applicant's LATEST update and message.
  const applicants: Record<
    string,
    { statusUpdate: DeliveryState | null; message: DeliveryState | null }
  > = {};
  for (const n of alerts) {
    const state = deliveryState(n);
    if (n.category === 'new_job') {
      jobAlert[state]++;
      continue;
    }
    const entry = (applicants[n.recipientId] ??= { statusUpdate: null, message: null });
    if (n.category === 'application_update') entry.statusUpdate = state;
    else entry.message = state;
  }
  const total = STATES.reduce((sum, s) => sum + jobAlert[s], 0);
  return { jobAlert: { total, ...jobAlert }, applicants };
}
