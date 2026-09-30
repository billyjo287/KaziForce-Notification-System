// Development helper: asks the running worker to do a clock job now instead of at its time.
//   npm run jobs:run -w backend -- summary     the 08:00 daily summary (see it in Mailpit)
//   npm run jobs:run -w backend -- retention   the 03:30 retention cleanup
import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import { queueConnection } from '../lib/queue.js';
import { SCHEDULED_QUEUE } from './scheduledJobs.js';

const JOBS = { summary: 'daily-summary', retention: 'retention' } as const;
const which = process.argv[2] as keyof typeof JOBS | undefined;
if (!which || !(which in JOBS)) {
  console.error('Say which job: summary or retention');
  process.exit(1);
}

const connection = queueConnection();
const queue = new Queue(SCHEDULED_QUEUE, { connection, prefix: env.QUEUE_PREFIX });
await queue.add(JOBS[which], {}, { removeOnComplete: true });
console.log(`Asked the worker to run "${JOBS[which]}" now. Is the worker running (npm run dev)?`);
await queue.close();
await connection.quit();
