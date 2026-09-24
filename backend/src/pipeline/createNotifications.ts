// The one place notifications are created. Each one is checked against the input contract
// (PRD FR-2 / DR-3): a type, a recipient, text of at most 1,000 characters and a time. Incomplete
// ones are rejected (logged, never saved). Valid ones are saved with status QUEUED; the caller
// then adds a "notification.process" job for each.
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { fit } from './templates.js';

export const MAX_MESSAGE_LENGTH = 1000;
const MAX_TITLE_LENGTH = 120;

export const notificationInputSchema = z.object({
  type: z.enum(['job_alert', 'status_update', 'message', 'announcement']),
  category: z.string().min(1).max(40),
  recipientId: z.uuid(),
  recipientRole: z.enum(['worker', 'business', 'admin']),
  senderId: z.uuid().nullable(),
  senderRole: z.enum(['worker', 'business', 'admin', 'system']),
  // Titles are made by us and shortened to fit; the message is the content and is never cut.
  title: z
    .string()
    .trim()
    .min(1)
    .transform((t) => fit(t, MAX_TITLE_LENGTH)),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  link: z.string().startsWith('/').nullable(),
  jobId: z.uuid().nullable(),
  deadlineAt: z.date().nullable(),
  createdAt: z.date(),
});

export type NotificationInput = z.input<typeof notificationInputSchema>;

export interface Rejected {
  input: unknown;
  problems: string[];
}

/** Splits inputs into valid (ready to save) and rejected (with the reasons). */
export function validateNotifications(inputs: unknown[]) {
  const valid: z.output<typeof notificationInputSchema>[] = [];
  const rejected: Rejected[] = [];
  for (const input of inputs) {
    const result = notificationInputSchema.safeParse(input);
    if (result.success) valid.push(result.data);
    else {
      rejected.push({
        input,
        problems: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
  }
  return { valid, rejected };
}

/** Saves the valid notifications as QUEUED (in batches) and returns their ids. */
export async function saveNotifications(
  tx: Prisma.TransactionClient,
  inputs: unknown[],
): Promise<{ ids: string[]; rejected: Rejected[] }> {
  const { valid, rejected } = validateNotifications(inputs);
  const ids: string[] = [];
  for (let i = 0; i < valid.length; i += 500) {
    const created = await tx.notification.createManyAndReturn({
      data: valid.slice(i, i + 500).map((n) => ({ ...n, status: 'queued' as const })),
      select: { id: true },
    });
    ids.push(...created.map((c) => c.id));
  }
  return { ids, rejected };
}
