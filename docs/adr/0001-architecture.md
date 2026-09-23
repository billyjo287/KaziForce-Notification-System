# ADR 0001 — Overall architecture of the KaziForce notification system

- **Status:** Accepted
- **Date:** 2026-09-24
- **Context source:** approved proposal, `CLAUDE.md` section 5, `docs/PRD.md`

## Context

KaziForce treats every notification the same, so urgent job alerts get lost among routine
updates. We need a system that filters spam, ranks each notification by urgency and delivers it
on the right channel, while running on a student budget, working on mid-range Android phones on
slow connections, and staying ready for machine-learning models that are trained later.

## Decisions

1. **One processing pipeline, in a fixed order.**
   Create notification → validate → save (status `queued`) → put a `notification.process` job
   on the queue → worker asks the ML service `/predict` → if spam: block and log for admin
   review; otherwise attach the priority → the Channel Router applies the user's preferences and
   quiet hours → one queue job per channel → the channel adapter sends → one `DeliveryLog` row per
   attempt → Socket.IO pushes to the user's private room.
   _Why:_ each step can be tested, retried and measured on its own, and the queue (BullMQ on
   Redis) absorbs bursts without losing work.

2. **The Node worker calls the ML service over REST.** The Python service does not read the
   queue. _Why:_ this is the interface promised in the proposal, keeps the ML service simple
   (stateless HTTP), and lets it be replaced or scaled on its own.

3. **ML timeout fallback.** If `/predict` does not answer within 500 ms or returns an error,
   Node's own rule-based classifier decides and the notification records
   `predictionSource = "rules_fallback"`. _Why:_ an urgent job alert must never wait on, or be
   lost because of, the ML service.

4. **Urgent routing = "first choice, with a safety net".** In-app immediately plus the user's
   first external channel from their `channelOrder`. Escalate to the next channel if the send
   fails after retries, or if the alert is not opened within the window (10 minutes, or half the
   time left before the job deadline if that is shorter). An optional per-user "send on both"
   switch sends on the first two channels together. Users without WhatsApp never get WhatsApp.
   _Why:_ reaches people fast without sending every alert twice (SMS costs money and duplicates
   add to alert fatigue). Full rules: PRD FR-4 and FR-4b.

5. **Retries.** Exponential backoff, at most 3 retries per channel, then the delivery is marked
   `failed` and shown on the admin dashboard. _Why:_ covers short provider outages without
   flooding a provider that is down.

6. **Channel adapters share one base class.** Every channel (in-app, WhatsApp, SMS, email)
   extends `ChannelAdapter` (`send()`, `name`, retry policy). _Why:_ adding a channel must not
   require changing the router (open/closed principle; NFR-5 maintainability).

7. **Mock mode by default.** `CHANNEL_MODE=mock` makes every external adapter log to the console
   and database instead of calling Twilio, Africa's Talking or Resend. Development email goes to
   Mailpit (http://localhost:8025). _Why:_ the whole system runs locally and in CI with zero API
   keys and zero cost.

8. **Timezone and phone format.** Quiet hours and the 08:00 daily summary use `Africa/Nairobi`.
   Phone numbers are stored in E.164 format (`+254…`). _Why:_ one unambiguous format for storage,
   validation and the SMS/WhatsApp providers.

9. **A minimal host marketplace with three sides.** Worker, Employer and Admin portals contain
   only enough of KaziForce (profiles, post a job, apply, change application status, simple
   messages, announcements, admin user/job management) to create real notification events. No
   payments, ratings, reviews, advanced search or matching. One responsive website serves phones
   and desktops; there is no separate mobile app. _Why:_ keeps the project focused on the
   notification system, which is what the thesis evaluates.

10. **External messages carry no personal details.** WhatsApp and SMS show a short summary and a
    link; the details need a login. _Why:_ protects users whose phone is lost or stolen, and
    supports the Kenya Data Protection Act 2019.

## Supporting choices made in Phase 0

- **Monorepo** with `/frontend`, `/backend`, `/ml-service` and npm workspaces for the two Node
  apps, so one `npm install` sets up both.
- **Local services in Docker Compose:** Postgres 17 (matches Supabase), Redis 8 with append-only
  persistence and `noeviction` (required by BullMQ, and so queued jobs survive a restart), Mailpit,
  and the ML service itself. Postgres is exposed on port 5434 to avoid clashing with other local
  databases.
- **Prisma 7** with the `prisma-client` generator and the `pg` driver adapter.
- **ML-ready from day one:** the `MLMetadata` table and every classification, correction and
  interaction field (PRD section 5) exist in the first migration, and the `/predict` request and
  response shapes are fixed in `ml-service/app/schemas.py`.

## Consequences

- More moving parts than a single server (API, worker, ML service, Redis, Postgres), but each
  has a `/health` check and runs with one command locally.
- The ML service can be down without stopping notifications (rules fallback), at the cost of
  lower-quality decisions while it is down; `predictionSource` makes this measurable.
- Swapping the rule-based classifier for trained models later changes nothing outside
  `/ml-service`.
