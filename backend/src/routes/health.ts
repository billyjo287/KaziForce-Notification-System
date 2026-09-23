import { Router } from 'express';

/** A check resolves when the dependency is reachable and throws when it is not. */
export type HealthCheck = () => Promise<unknown>;

type CheckResult =
  { status: 'up'; latencyMs: number } | { status: 'down'; latencyMs: number; error: string };

const CHECK_TIMEOUT_MS = 2000;

async function runCheck(check: HealthCheck): Promise<CheckResult> {
  const started = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timed out')), CHECK_TIMEOUT_MS);
      }),
    ]);
    return { status: 'up', latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /health: 200 when every dependency is up, 503 when any is down,
 * with one entry per dependency so it is obvious which one failed.
 */
export function healthRouter(checks: Record<string, HealthCheck>): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const names = Object.keys(checks);
    const results = await Promise.all(names.map((name) => runCheck(checks[name]!)));
    const report = Object.fromEntries(names.map((name, i) => [name, results[i]]));
    const allUp = results.every((result) => result.status === 'up');

    res.status(allUp ? 200 : 503).json({
      status: allUp ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: report,
    });
  });

  return router;
}
