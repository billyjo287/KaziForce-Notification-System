import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

// connectionTimeoutMillis: give up quickly when Postgres is down instead of hanging.
// max: connections this process may open (DATABASE_POOL_MAX; see docs/performance.md).
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 3000,
  max: env.DATABASE_POOL_MAX,
});

export const prisma = new PrismaClient({ adapter });
