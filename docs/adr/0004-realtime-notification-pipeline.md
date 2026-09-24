# ADR 0004 — Real-time notification pipeline

- **Status:** Accepted
- **Date:** 2026-09-24
- **Phase:** 3 (Sprint 1: domain events become live in-app notifications)

## Context

PRD FR-2 asks for notifications from job posts, application changes, messages and admin
announcements, for both workers and employers; FR-6 asks for live in-app delivery with reconnect
and catch-up; NFR-1 sets a median in-app latency under 200 ms; NFR-3 says no queued job may be lost
when Redis or Postgres drops. CLAUDE.md section 5 fixes the pipeline order (save as QUEUED, BullMQ
`notification.process`, classify, route, deliver, DeliveryLog, Socket.IO push).

## Decisions

1. **Two processes.** `src/server.ts` runs the REST API and Socket.IO; `src/worker.ts` runs the
   outbox relay and the BullMQ worker. On Railway they become two services, so heavy work never
   slows the website. `npm run dev` starts both (plus the website).
2. **Outbox relay, one event per transaction.** The relay locks one due `DomainEvent`
   (`FOR UPDATE SKIP LOCKED`, so several workers never take the same event), asks its listener
   which notifications it creates, saves them as QUEUED and marks the event processed, all in one
   transaction. Only then does it add the BullMQ jobs.
3. **Instant wake-up with Postgres NOTIFY.** `recordEvent` also runs `pg_notify` inside the same
   transaction; Postgres delivers it only on commit, so the worker wakes exactly when the event is
   saved. A one-second check handles events held for Undo (`availableAt`) and missed signals.
4. **Nothing is lost, nothing is sent twice.** A failing event is retried with growing gaps
   (2, 4, 8, 16 s) and set aside after 5 attempts (`attempts`, `lastError`), so it cannot block
   the others. A sweeper re-queues notifications still QUEUED after 30 s (e.g. Redis was down).
   The BullMQ job id is the notification id, and the worker only claims notifications that are
   QUEUED (or PROCESSING after a crash), so duplicates do nothing. BullMQ retries 3 times with
   exponential backoff, then the notification is marked FAILED. Events older than 24 hours are
   skipped (stale alerts are noise).
5. **Listeners (simple rules, no matching algorithm).** `job.posted` goes to active workers in the
   same place OR with the job's skill; `application.created` goes to the employer; status changes
   go to the worker, but only if the status is still the one in the event (Accept then Reject
   within the Undo window sends only "not successful"); messages go to the other person;
   announcements go to everyone, all workers or all employers. Text is written in each
   recipient's language (English or Kiswahili).
6. **Input contract enforced in one place** (`createNotifications.ts`, DR-3): type, recipient,
   text of 1–1,000 characters and a time are required; incomplete notifications are rejected and
   logged, never saved. Titles are shortened to 120 characters; message text is never cut.
7. **Classification placeholder.** `classify()` returns MEDIUM and not-spam, and leaves
   `modelVersion` and `predictionSource` empty so these rows are not mistaken for model output in
   training data. Phase 4 replaces only this function (ML `/predict` with the 500 ms fallback).
8. **Live delivery through Redis publish/subscribe.** The worker publishes
   `{ userId, notification }` on one Redis channel; every API process passes it to Socket.IO room
   `user:<id>`. This works with one API process or several, with no extra library.
9. **Socket.IO security.** Connecting requires the same JWT as the REST API; suspended users are
   refused. Suspension and "log out of all devices" close that user's live connections at once;
   the browser then checks its session and logs out if it was ended.
10. **Delivery tracking.** Each in-app delivery gets a DeliveryLog row (`sentAt`). The browser
    confirms receipt over the socket (`deliveredAt`; also set when a list fetch includes it);
    opening sets `openedAt`, the main action sets `clickedAt`, "Not important to me" sets
    `dismissedAt`.
11. **Browser side.** socket.io-client (12.5 KB gzipped) is a separate download after login, so the
    app shell stays under 200 KB. Socket.IO starts with long-polling and upgrades to WebSocket.
    Every (re)connection refetches the alert list (catch-up). A "Reconnecting…" banner appears if
    the connection is down for more than 2 seconds. On pages other than Alerts, Urgent and
    Important alerts show a short message with "Open"; "For later" alerts stay quiet.
12. **Times are compared in UTC.** Prisma stores UTC times without a time zone and our Postgres
    container runs on Africa/Nairobi time, so the relay compares with `now() AT TIME ZONE 'UTC'`.
    (Plain `now()` made held events due 3 hours early; the automated test caught it.)

## Measured

`backend/tests/pipeline.test.ts`, local machine, API + worker in one process: a posted job reached
the worker's socket in 136 ms (first request); over 20 messages the median was 44 ms, 95th
percentile 62 ms, slowest 65 ms (target: median under 200 ms). The test fails if the median goes
over 200 ms.

## Consequences

- One more process to run and deploy (the worker).
- The worker holds one extra Postgres connection for LISTEN.
- Messages and applications pages refresh from live alerts; the 15-second polling remains only as
  a backup.
- Announcements can be sent through the API now; the admin page to write them is Phase 7.
