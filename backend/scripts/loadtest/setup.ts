// Load test, step 1: empties the load-test database and creates PAIRS employer/worker pairs, each
// with a job and an application, so the employer can message the worker. Writes
// loadtest/data/pairs.json: one row per pair with the employer's login token (k6 sends as the
// employer) and the worker's (the listener receives as the worker).
//   npm run load:setup -w backend
import './applyEnv.mjs';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { queueConnection } from '../../src/lib/queue.js';
import { prisma } from '../../src/lib/prisma.js';
import { signAccessToken } from '../../src/lib/tokens.js';
import { PRESETS } from '../../src/modules/me/presets.js';
import { DATA_DIR } from './env.mjs';

const PAIRS = Number(process.env.PAIRS ?? 100);

// Run BEFORE starting the load-test server (loadtest/run.ps1 does): a running worker would hold
// locks on the tables being emptied.
execSync('npx prisma migrate deploy', { stdio: 'inherit' });

// Jobs left in Redis by an earlier (interrupted) run would point at rows emptied below.
const redis = queueConnection();
let cursor = '0';
do {
  const [next, keys] = await redis.scan(cursor, 'MATCH', 'kf-load:*', 'COUNT', 1000);
  if (keys.length) await redis.del(...keys);
  cursor = next;
} while (cursor !== '0');
await redis.quit();

// Everything except the migration history and the classifier registry.
const tables = await prisma.$queryRaw<{ tablename: string }[]>`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'MLMetadata')`;
await prisma.$executeRawUnsafe(
  `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
);

const location = await prisma.location.create({
  data: { slug: 'westlands', name: 'Westlands', county: 'Nairobi' },
});
const skill = await prisma.skill.create({
  data: { slug: 'warehouse', nameEn: 'Warehouse work', nameSw: 'Kazi ya ghala' },
});

const preference = {
  channelOrder: ['whatsapp', 'sms', 'email'] as ('whatsapp' | 'sms' | 'email')[],
  channelSettings: PRESETS.recommended.channelSettings,
  // Measured at any time of day: quiet hours would hold the important emails.
  quietHours: { enabled: false, start: '21:00', end: '07:00' },
};

const pairs = [];
for (let i = 0; i < PAIRS; i++) {
  const n = String(i).padStart(3, '0');
  const employer = await prisma.user.create({
    data: {
      email: `load.employer${n}@example.com`,
      passwordHash: 'not-used',
      name: `Load Employer ${n}`,
      companyName: `Load Company ${n}`,
      role: 'business',
      onboardingCompletedAt: new Date(),
      preference: { create: preference },
    },
  });
  const worker = await prisma.user.create({
    data: {
      email: `load.worker${n}@example.com`,
      passwordHash: 'not-used',
      name: `Load Worker ${n}`,
      role: 'worker',
      phone: `+2547100${n.padStart(5, '0')}`,
      phoneVerified: true,
      consentSmsWhatsapp: true,
      consentAt: new Date(),
      usesWhatsApp: true,
      locationId: location.id,
      onboardingCompletedAt: new Date(),
      preference: { create: preference },
    },
  });
  const job = await prisma.job.create({
    data: {
      employerId: employer.id,
      title: `Load test job ${n}`,
      description: 'A job used by the load test.',
      locationId: location.id,
      skillId: skill.id,
      deadline: new Date(Date.now() + 7 * 24 * 3600_000),
    },
  });
  const application = await prisma.application.create({
    data: { jobId: job.id, workerId: worker.id },
  });
  pairs.push({
    applicationId: application.id,
    workerId: worker.id,
    employerToken: signAccessToken(employer),
    workerToken: signAccessToken(worker),
  });
}

mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(`${DATA_DIR}pairs.json`, JSON.stringify(pairs));
console.log(`Created ${PAIRS} employer/worker pairs -> loadtest/data/pairs.json`);
await prisma.$disconnect();
