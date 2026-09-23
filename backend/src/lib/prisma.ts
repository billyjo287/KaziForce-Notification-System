import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

// connectionTimeoutMillis: give up quickly when Postgres is down instead of hanging.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 3000 });

export const prisma = new PrismaClient({ adapter });
