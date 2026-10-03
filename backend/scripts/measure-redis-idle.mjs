// Measures how many commands an IDLE worker sends to Redis (docs/DEPLOYMENT.md, section 8).
// Start ONLY the worker (nothing else may use this Redis), wait 30 s, then:
//   node scripts/measure-redis-idle.mjs 180
// Prints commands per minute and per month, and the busiest commands.
import 'dotenv/config';
import { Redis } from 'ioredis';

const seconds = Number(process.argv[2] ?? 180);
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

async function stats() {
  const text = await redis.info('commandstats');
  const calls = new Map();
  for (const line of text.split('\n')) {
    const m = /^cmdstat_([^:]+):calls=(\d+)/.exec(line.trim());
    if (m) calls.set(m[1], Number(m[2]));
  }
  return calls;
}

const before = await stats();
await new Promise((r) => setTimeout(r, seconds * 1000));
const after = await stats();

const delta = [...after]
  .map(([cmd, n]) => [cmd, n - (before.get(cmd) ?? 0)])
  .filter(([cmd, n]) => n > 0 && cmd !== 'info') // our own INFO calls do not count
  .sort((a, b) => b[1] - a[1]);
const total = delta.reduce((t, [, n]) => t + n, 0);
const perMinute = (total / seconds) * 60;
console.log(
  `${total} commands in ${seconds} s = ${perMinute.toFixed(1)} per minute, about ${Math.round(perMinute * 60 * 24 * 30).toLocaleString('en')} per month`,
);
console.log(
  'busiest:',
  delta
    .slice(0, 8)
    .map(([c, n]) => `${c} ${n}`)
    .join(', '),
);
await redis.quit();
