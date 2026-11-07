// Jobs that run on a clock, in the worker process (BullMQ job schedulers, Africa/Nairobi time):
//   daily-summary       08:00  finds who has news and adds one "daily-summary.user" job each
//   daily-summary.user         one person's summary email (3 tries; once per person per day)
//   retention           03:30  account deletion and data retention (retention.ts)
// A scheduler is stored in Redis, so a restarted worker keeps the same timetable; a run missed
// while the worker was down happens when it starts again.
import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { EmailContent } from '../channels/EmailAdapter.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { idleFriendly } from '../lib/queue.js';
import { TIMEZONE } from '../preferences/quietHours.js';
import { buildSummaryFor, summaryCutoff, summaryRecipients } from './dailySummary.js';
import { runRetention } from './retention.js';

export const SCHEDULED_QUEUE = 'scheduled';
export const DAILY_SUMMARY_PATTERN = '0 8 * * *'; // 08:00 every day
export const RETENTION_PATTERN = '30 3 * * *'; // 03:30 every day, when the site is quiet

interface SummaryJobData {
  userId: string;
  /** The end of the 24 hours covered (the time the summary run started), ISO-8601. */
  until: string;
}

export interface ScheduledJobsOptions {
  prisma: PrismaClient;
  connection: Redis;
  prefix: string;
  logger: Logger;
  sendEmail: (email: EmailContent) => Promise<unknown>;
  publicAppUrl: string;
  /** Called for every deleted account (e.g. to clear its cached preferences). */
  onUserDeleted?: (userId: string) => Promise<void>;
  /** Tests start without the clock, and run the jobs themselves. */
  schedule?: boolean;
}

/** "2026-10-02" in Nairobi: one summary per person per Nairobi day. */
const nairobiDate = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: TIMEZONE });

export function startScheduledJobs(options: ScheduledJobsOptions) {
  const { prisma, connection, prefix, logger } = options;
  const queue = new Queue(SCHEDULED_QUEUE, {
    connection,
    prefix,
    defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
  });

  /** 08:00: one job per person who has something to read. */
  async function startDailySummary(until: Date) {
    const userIds = await summaryRecipients(prisma, until);
    await queue.addBulk(
      userIds.map((userId) => ({
        name: 'daily-summary.user',
        data: { userId, until: until.toISOString() } satisfies SummaryJobData,
        opts: {
          jobId: `summary-${userId}-${nairobiDate(until)}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
        },
      })),
    );
    logger.info({ people: userIds.length }, 'Daily summary started');
    return userIds;
  }

  async function sendSummary({ userId, until }: SummaryJobData) {
    const email = await buildSummaryFor(prisma, userId, new Date(until), options.publicAppUrl);
    if (!email) return 'nothing to send';
    // One SummaryLog row per try, like the DeliveryLog of one alert (BT-09).
    const log = {
      userId,
      frequency: email.frequency,
      periodStart: email.periodStart,
      periodEnd: email.periodEnd,
      alertCount: email.count,
    };
    let result: unknown;
    try {
      result = await options.sendEmail({
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.summaryLog
        .create({ data: { ...log, status: 'failed', error: message.slice(0, 500) } })
        .catch(() => {});
      throw error; // tried again later (3 tries)
    }
    const providerMessageId =
      (result as { providerMessageId?: string } | undefined)?.providerMessageId ?? null;
    await prisma.summaryLog.create({ data: { ...log, status: 'sent', providerMessageId } });
    logger.info({ userId, count: email.count }, 'Daily summary sent');
    return 'sent';
  }

  async function retention(now: Date) {
    const removed = await runRetention(prisma, now, options.onUserDeleted);
    logger.info(removed, 'Retention cleanup done');
    return removed;
  }

  async function process(job: Job) {
    switch (job.name) {
      case 'daily-summary':
        // The clock's run covers up to 08:00 exactly, even if it starts late (BT-08). A run asked
        // for by hand (runNow.ts, for a demo) covers up to this moment.
        return startDailySummary(
          (job.data as { untilNow?: boolean }).untilNow ? new Date() : summaryCutoff(new Date()),
        );
      case 'daily-summary.user':
        return sendSummary(job.data as SummaryJobData);
      case 'retention':
        return retention(new Date());
      default:
        throw new Error(`Unknown scheduled job: ${job.name}`);
    }
  }

  const worker = new Worker(SCHEDULED_QUEUE, process, {
    connection,
    prefix,
    concurrency: 5,
    ...idleFriendly(),
  });
  worker.on('error', (error) => logger.error({ err: error }, 'Scheduled jobs worker error'));

  const ready =
    options.schedule === false
      ? Promise.resolve()
      : Promise.all([
          queue.upsertJobScheduler(
            'daily-summary',
            { pattern: DAILY_SUMMARY_PATTERN, tz: TIMEZONE },
            { name: 'daily-summary' },
          ),
          queue.upsertJobScheduler(
            'retention',
            { pattern: RETENTION_PATTERN, tz: TIMEZONE },
            { name: 'retention' },
          ),
        ]).then(() => undefined);

  return {
    queue,
    ready,
    startDailySummary,
    sendSummary,
    retention,
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}

export type ScheduledJobs = ReturnType<typeof startScheduledJobs>;
