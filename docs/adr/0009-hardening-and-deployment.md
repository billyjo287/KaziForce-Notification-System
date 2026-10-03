# ADR 0009 — Hardening, performance and deployment

- **Status:** Accepted
- **Date:** 2026-10-02
- **Phase:** 8 (Sprint 6: hardening, testing and deployment)

## Context

NFR-1 (1,000 notifications a minute; in-app median < 200 ms; 95% of urgent sends at the
provider within 2 s), NFR-2 (security), NFR-3 (no queued job lost; recover within 30 s),
NFR-4 (WCAG 2.2 AA) and the hosting choices in CLAUDE.md (Vercel, Railway, Supabase, not the
Upstash free tier).

## Decisions

1. **Load and resilience tests are part of the repository** (`loadtest/`,
   `backend/scripts/loadtest/`), run on the built app in production mode against their own
   database and queues. Results and method: [performance.md](../performance.md).
2. **Database pool is a setting** (`DATABASE_POOL_MAX`, default 10; worker 20, API 8 in
   production). The load test showed Prisma's default 10 connections were the main bottleneck.
3. **The outbox relay handles 4 events at a time** (was 1). `FOR UPDATE SKIP LOCKED` keeps each
   event to one loop. (Updates ADR 0004, decision 2.)
4. **Catch-up after a Redis outage.** Redis pub/sub keeps no copy of live messages; when the
   API's subscription reconnects it emits `notifications:resync` and every open page fetches its
   list, as after its own reconnect.
5. **BullMQ idle polling tuned:** `drainDelay` 30 s (was 5), stalled-job check every 120 s
   (was 30): 734 → 172 Redis commands a minute for an idle worker. New jobs still start at once;
   a crashed worker's job is retried after about 2 minutes instead of 30 seconds.
6. **Redis connections use `family: 0`** (IPv4 or IPv6), as Railway's private network requires.
   The worker warns at start-up if Redis is not set to `appendonly yes` and `noeviction`.
7. **Security pass.**
   - Per-user rate limits on everything people create: messages 30 a minute, applications 30
     an hour, job posts 20 an hour, announcements 10 an hour (log-in and password reset stay
     per network address). `TRUST_PROXY_HOPS` makes those addresses right behind Vercel and
     Railway.
   - Production refuses the example `JWT_ACCESS_SECRET`; the sample-data seed refuses to run in
     production; a separate **bootstrap** (`npm run db:bootstrap`) creates only places, skills
     and the admin (never with the example password) and is safe to run on every deploy.
   - Logs never contain headers (login tokens, cookies) or secrets in addresses (the Africa's
     Talking webhook path, tracked-link codes); pino also redacts password and token fields.
     Health checks are not logged.
   - Webhook fields from Africa's Talking are validated like every other input.
   - Website: a Content Security Policy is added at build time (only our own scripts; the
     browser may talk only to our API), plus HSTS, no framing, nosniff, referrer and
     permissions policies (`frontend/vercel.json`).
   - `npm audit` and `pip-audit`: 0 known vulnerabilities; gitleaks on the project files: no
     secrets.
8. **The website forwards `/api` to the backend** (Vercel rewrite) so the login cookie is
   first-party: Safari and other browsers that block other sites' cookies keep people logged
   in. Live alerts connect to the API directly with the login token. `VITE_SAME_ORIGIN_API`.
9. **One backend image** (`backend/Dockerfile`, built from the repository root) for the API and
   the worker (different start commands); runtime packages only. Railway runs migrations and the
   bootstrap before each API deploy (`npm run db:release`). Supabase through its **session
   pooler** (LISTEN/NOTIFY and IPv4). Step by step: [DEPLOYMENT.md](../DEPLOYMENT.md).

## Deferred

- The actual deploy needs the owner's accounts and is left to Billy, following DEPLOYMENT.md.
- A real screen-reader session (NVDA on Windows, TalkBack on Android) by a person: the
  automated checks and the accessibility tree review cannot replace it (checklist in
  [accessibility.md](../accessibility.md)).
- Rate-limit counters live in each API process's memory: with more than one API instance, use
  a shared (Redis) store.
