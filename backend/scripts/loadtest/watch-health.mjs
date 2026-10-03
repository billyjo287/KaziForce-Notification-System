// Resilience test helper: asks /health twice a second and prints every change ("database down
// at ...", "back up after 7.5 s"), so recovery times can be read from loadtest/data/health.log.
const URL = 'http://localhost:4002/health';
let last = null;
let since = Date.now();

async function check() {
  let state;
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(2000) });
    const body = await res.json();
    state = `database ${body.checks.database.status}, redis ${body.checks.redis.status}`;
  } catch {
    state = 'API not answering';
  }
  if (state !== last) {
    const now = Date.now();
    const lasted = last ? ` (previous state lasted ${((now - since) / 1000).toFixed(1)} s)` : '';
    console.log(`${new Date(now).toISOString()} ${state}${lasted}`);
    last = state;
    since = now;
  }
}

setInterval(() => void check(), 500);
void check();
