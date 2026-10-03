// Resilience test (docs/performance.md): restarts Redis 2 minutes into the load test and
// Postgres 3 minutes after that, and writes what it did (with times) to its output.
import { execSync } from 'node:child_process';

const wait = (seconds) => new Promise((r) => setTimeout(r, seconds * 1000));
const log = (text) => console.log(`${new Date().toISOString()} ${text}`);

async function restart(container) {
  log(`restarting ${container}`);
  const start = Date.now();
  execSync(`docker restart ${container}`, { stdio: 'ignore' });
  log(`${container} restarted (docker took ${((Date.now() - start) / 1000).toFixed(1)} s)`);
}

log('chaos started');
await wait(120);
await restart('kaziforce-redis-1');
await wait(180);
await restart('kaziforce-postgres-1');
log('chaos done');
