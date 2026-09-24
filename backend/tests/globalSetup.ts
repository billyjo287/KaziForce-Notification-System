// Runs once before the backend tests: brings the separate TEST database up to date and fills it
// with the fake seed data (admin, worker1..6, employer1..3, jobs, locations, skills).
// Your development database is never touched.
import 'dotenv/config';
import { execSync } from 'node:child_process';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://kaziforce:kaziforce@localhost:5434/kaziforce_test';

export default function setup() {
  if (!/test/.test(new URL(TEST_DATABASE_URL).pathname)) {
    throw new Error(`Refusing to run tests against a non-test database: ${TEST_DATABASE_URL}`);
  }
  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: 'test' };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('npx tsx prisma/seed.ts', { env, stdio: 'pipe' });
}
