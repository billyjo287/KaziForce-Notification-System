# Performance and resilience (Phase 8)

How fast KaziForce delivers alerts under load, and what happens when Redis or Postgres restarts
in the middle. Targets come from PRD NFR-1 and NFR-3.

## How the tests were run

- **Where:** one Windows 11 laptop. Postgres 17, Redis 8 and the ML service in Docker Desktop;
  the API and the worker as the **built** Node app (`node dist/...`, `NODE_ENV=production`), in
  mock channel mode (WhatsApp, SMS and email are "accepted" by test providers, as with real ones
  but without sending). Separate database (`kaziforce_load`) and queue names (`kf-load`).
- **Load:** [k6](https://k6.io) (`loadtest/notifications.js`) sends **1,000 messages a minute
  for 10 minutes** (10,000 in total) from 100 employers to 100 workers; each message becomes one
  notification. One in five says "URGENT ... today", which the classifier marks Urgent (in-app +
  WhatsApp, with the safety net); the rest are Important (in-app + email). At the same time k6
  calls the ML service's `/predict` directly, 5 times a second.
- **Measuring "on screen":** 100 Socket.IO connections act as the workers' open browsers
  (`backend/scripts/loadtest/listener.ts`) and record when each alert arrives.
- **Repeat it:** `docker compose up -d`, `npm run build -w backend`, then
  `.\loadtest\run.ps1` (add `-Chaos` for the resilience test, `-Duration 1m` for a rehearsal).
  Results land in `loadtest/data/report.txt`.

## Results (10 minutes at 1,000 a minute)

| Measure | Median | 95th percentile | 99th | Target |
| --- | ---: | ---: | ---: | --- |
| In-app: notification created → on the worker's screen | **34 ms** | **77 ms** | 122 ms | median < 200 ms |
| Urgent: created → accepted by the provider (first try) | **59 ms** | **132 ms** | 209 ms | 95% within 2 s |
| `/predict` (ML service, under load) | **5.8 ms** | **13 ms** | 28 ms | < 300 ms (hard limit 500 ms) |
| API: "send message" request | 20 ms | 37 ms | | |
| Event saved → notifications created (outbox) | 19 ms | 39 ms | 95 ms | |

- 10,000 messages sent, **0 failed requests**, 0 dropped by k6.
- 10,000 notifications created and **all 10,000 sent**; 10,000 live alerts received.
- **100% of urgent alerts** reached the provider within 2 seconds (slowest: 0.59 s).
- `/predict` never needed the 500 ms fallback: all 10,000 classifications came from the ML
  service ("rules", 0 "rules_fallback").

### Bottlenecks found and fixed

| Run (1-minute rehearsals) | Outbox p95 | In-app p95 (on screen) | Urgent → provider p95 |
| --- | ---: | ---: | ---: |
| First rehearsal (as built in Phase 7) | 763 ms | 227 ms | 434 ms |
| Outbox: 4 events at a time instead of 1 | 1,425 ms | 249 ms | 467 ms |
| + database pool 25 instead of 10 | 625 ms | 119 ms | 215 ms |
| Full 10-minute run (both changes) | **39 ms** | **77 ms** | **132 ms** |

1. **Database connections.** Each process had Prisma's default pool of 10 connections, shared
   by the outbox (4 open transactions), the notification worker (20 jobs at a time) and the
   channel workers. Work queued for a free connection. The pool size is now a setting
   (`DATABASE_POOL_MAX`): 20 for the worker and 8 for the API in production
   ([DEPLOYMENT.md](DEPLOYMENT.md)). This was the main fix (in-app p95 halved).
2. **Outbox one event at a time.** The relay turned one domain event into notifications per
   transaction, one after another. It now runs 4 loops side by side; `FOR UPDATE SKIP LOCKED`
   makes each loop take a different event, so nothing is handled twice. On its own this made
   things worse (more transactions fighting for 10 connections), which is how the pool problem
   was found.
3. The first rehearsals also showed a short warm-up at the start and one 6-second pause where
   the outbox fell up to 0.9 s behind and then caught up on its own (the computer or Docker,
   not a steady bottleneck); it did not appear in the 10-minute run.

## Resilience: Redis and Postgres restarted during the load

Same load; `backend/scripts/loadtest/chaos.mjs` restarts **Redis after 2 minutes** and
**Postgres after 5 minutes** (`docker restart`); `watch-health.mjs` asks `/health` twice a
second.

| What happened | Result | Target (NFR-3) |
| --- | --- | --- |
| Redis restarted (minute 2) | `/health` showed Redis down for **3.1 s**, then everything flowed again | recover within 30 s |
| Postgres restarted (minute 5) | `/health` showed the database down for **1.6 s** | recover within 30 s |
| Messages the API could not accept during the restarts | 26 of 10,001 (0.26%): the sender got an error and nothing was saved | |
| Accepted messages that became notifications and were sent | **9,975 of 9,975**: no queued job was lost | nothing lost |
| Alerts that reached the worker's screen | **9,975 of 9,975** | |
| Urgent alerts at the provider within 2 s (whole run) | 99.95% (slowest 6.2 s: queued during an outage) | 95% |
| In-app, created → on screen (whole run) | median 81 ms, p95 155 ms | |

Why nothing is lost: Redis writes every change to disk (`appendonly yes`), so queued jobs
survive its restart; domain events and notifications are saved in Postgres **before** any job is
queued (the outbox), and a sweeper re-queues anything left "queued"; every job id is the
notification id, so a retried job never sends twice. During the restarts the outbox fell up to
6.6 s behind and caught up within seconds.

### What the resilience test found and fixed

1. **Live alerts published while Redis restarted were lost on screen** (first run: 59 of 9,975
   never appeared live; they were saved and showed after a refresh). Redis's live message
   channel keeps no copy, and the browsers stayed connected, so they never fetched what they
   missed. Now, when the API's Redis connection comes back, it asks every open page to fetch its
   alerts again, the same catch-up a page does after its own reconnect
   (`notifications:resync`).
2. **The test tools themselves:** a sleeping laptop paused a run for 40 minutes (the run script
   now keeps the computer awake while it runs), and a PowerShell variable named like the
   `-Chaos` switch silently turned the restarts off (renamed).

## Idle Redis traffic

See [DEPLOYMENT.md, section 8](DEPLOYMENT.md#8-idle-redis-traffic-bullmq-tuning): 734 commands a
minute with BullMQ's defaults, 172 tuned (77% fewer).

## Limits of these numbers

- One laptop runs everything, including k6 and the 100 listeners, so the numbers include their
  load too. Production has separate machines but also network hops (Vercel → Railway →
  Supabase), which add tens of milliseconds to each request.
- Mock mode measures our pipeline up to "accepted by the provider", as NFR-1 asks; real
  WhatsApp/SMS delivery to a phone adds the provider's own time.
- The ML service answers with the rule-based model; a trained model (Phase 9) will be slower and
  should be measured again with the same script.
