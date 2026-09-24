// Starts the backend (API + notification worker) for the automated browser tests (Playwright),
// on its own database and queue names:
//   port 4001, database "kaziforce_e2e" (created, migrated and filled with sample data each run).
// Your development database and server (port 4000) are never touched.
import 'dotenv/config';
import { execSync, spawn } from 'node:child_process';

const base =
  process.env.DATABASE_URL ?? 'postgresql://kaziforce:kaziforce@localhost:5434/kaziforce';
const e2eDatabase =
  process.env.E2E_DATABASE_URL ?? base.replace(/\/[^/?]+(\?|$)/, '/kaziforce_e2e$1');

const env = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: '4001',
  DATABASE_URL: e2eDatabase,
  FRONTEND_ORIGIN: 'http://localhost:4173',
  PUBLIC_APP_URL: 'http://localhost:4173',
  CHANNEL_MODE: 'mock',
  QUEUE_PREFIX: 'kf-e2e',
  LOG_LEVEL: 'warn',
  // Many test log-ins come from one computer.
  LOGIN_RATE_LIMIT: '1000',
};

execSync('npx prisma migrate deploy', { env, stdio: 'inherit' });
execSync('npx tsx prisma/seed.ts', { env, stdio: 'inherit' });

// The API and the notification worker (live alerts need both).
const server = spawn('npx', ['tsx', 'src/server.ts'], { env, stdio: 'inherit', shell: true });
const worker = spawn('npx', ['tsx', 'src/worker.ts'], { env, stdio: 'inherit', shell: true });
const stop = () => {
  server.kill();
  worker.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => {
  worker.kill();
  process.exit(code ?? 0);
});
