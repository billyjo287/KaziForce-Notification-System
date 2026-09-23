// Prisma settings: where the schema and migrations live, how to seed, and which database to use.
// Prisma does not read .env by itself, so dotenv loads it here.
import dotenv from 'dotenv';
import { defineConfig, env } from 'prisma/config';

dotenv.config({ quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
