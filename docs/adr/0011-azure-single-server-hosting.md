# ADR 0011 — Hosting the backend on one Azure for Students virtual machine

- **Status:** Accepted (replaces the Railway part of ADR 0009)
- **Date:** 2026-10-06
- **Phase:** before Phase 9 (deployment)

## Context

The proposal (sections 3.8.7 and 3.8.9) planned Vercel for the website, Railway or Render for the
backend, Supabase for Postgres and Upstash for Redis. Phase 8 prepared Railway. The project must
run at no cost:

- **Railway**'s free plan gives USD 1 of usage a month (after a one-off USD 5 trial): far too
  little for four always-on services (API, worker, ML service, Redis).
- **Render**'s free plan stops web services after 15 minutes without traffic, offers no free
  background workers, deletes free Postgres after 30 days, and its free Redis keeps data only
  in memory. A sleeping backend cannot send an urgent alert, and lost queues break NFR-3.
- **Upstash**'s free Redis (500,000 commands a month) was already ruled out: idle BullMQ
  workers use millions (DEPLOYMENT.md, section 13).
- **Supabase**'s free plan (500 MB, 2 projects, paused after 7 days without activity) is enough.

## Decision

1. **Website on Vercel, Postgres on Supabase**, as planned (both free).
2. **Everything else on one Ubuntu virtual machine in Azure**, paid for by the Azure for
   Students credit (USD 100, no card; when it runs out the machine stops, nothing is billed).
   Docker Compose (`deploy/azure/docker-compose.yml`) runs:
   - `caddy`: HTTPS with an automatic Let's Encrypt certificate on the free Azure DNS name
     (`<label>.<region>.cloudapp.azure.com`); the only container with open ports (80, 443).
   - `migrate`: runs `npm run db:release` (migrations and bootstrap) to completion before the
     API and worker start, like Railway's pre-deploy command.
   - `api`, `worker` (same image, different commands; database pools 8 and 20, as in ADR 0009).
   - `ml-service` and `redis` (append-only file, `noeviction`), reachable only inside Docker's
     private network.
3. **Server region next to the database** (Germany West Central with Supabase Frankfurt): the
   worker and API make many small database calls, so their distance matters more than the
   distance to the phone, which talks to Vercel and the server only a few times per page.
4. **Updates are one command** (`deploy/azure/update.sh`: pull, build, migrate, restart). A
   safety check refuses to start while a setting is still a placeholder. One-time setup
   (`setup.sh`) installs Docker from Docker's own package source and adds 2 GB of swap.
5. Nothing in the application changed: the same image, settings and health check as on
   Railway. `TRUST_PROXY_HOPS` stays 2 (Vercel and Caddy instead of Vercel and Railway's edge).
   The Railway files were removed.

## Consequences

- **Free for the project's duration**, and portable: the same files run on any Ubuntu server
  (for example Oracle Cloud Always Free, if the credit runs out).
- **One machine is one point of failure**, and Billy looks after it (updates, restarts).
  Containers restart on their own after a crash or reboot (`restart: unless-stopped`), Redis
  keeps the queues on disk, and the database is managed by Supabase, so a server restart loses
  nothing (as tested for NFR-3 in Phase 8). Ubuntu installs security updates automatically.
- **Scaling** means a bigger machine rather than more machines; the load test (1,000 alerts a
  minute) ran on one laptop with the same containers.
- Checked before writing this ADR: the full stack (`migrate`, `api`, `worker`, `ml-service`,
  `redis`, `caddy` with HTTPS) was started from these files against a test database: health
  `ok`, admin log-in, the worker reaching the ML service privately, and a restart of the API
  and worker.
