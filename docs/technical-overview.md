# KaziForce Intelligent Notification System: technical overview

Material for thesis Chapter 5 (Implementation and Testing). It summarises how the system is
built and why, with references to the architecture decision records (ADRs) in
[`docs/adr/`](adr/) and the measured results in [performance.md](performance.md).

## 5.1 Purpose and scope

KaziForce is a Kenyan short-term job marketplace. Before this project every notification was
treated the same, so urgent job alerts (which can expire within an hour) were lost among routine
updates. The system built here (1) screens every notification for spam and fraud, (2) classifies
it as Urgent, Important or For later, and (3) delivers it on the channel the person is most
likely to see in time: in the app for everything, WhatsApp or SMS for urgent alerts (with
escalation to the next channel), email for important ones, and a daily summary for the rest.
Users control their channel order, what each channel receives, quiet hours and the summary.

A minimal host marketplace (profiles, job posts, applications, messages, announcements, admin
moderation) was built only to generate real notification events; payments, ratings and
matching algorithms are out of scope (ADR 0001, decision 9).

## 5.2 Architecture

```
 Browser (React SPA) ──REST──► API (Express, Socket.IO) ──► PostgreSQL
        ▲                          │  writes event + data in one transaction (outbox)
        │ Socket.IO                ▼
        │                    Worker process
        │                    ├─ outbox relay: event → notifications (QUEUED)
        │                    ├─ BullMQ "notifications": classify (ML service /predict, 500 ms
        │                    │   limit, Node rules as fallback) → spam? block : deliver in-app
        └──── Redis pub/sub ◄┤─ channel router → BullMQ queue per channel (WhatsApp, SMS, email)
                             ├─ escalation checks, quiet-hours holds, clock jobs (08:00, 03:30)
                             └─ channel adapters → Twilio / Africa's Talking / Resend (or mock)
 ML service (FastAPI): POST /predict (rule-based v0 now; trained models later, same contract)
```

Four deployable parts: the website (static files on Vercel), the API and the worker (one Node
image, two processes on Railway), and the ML service (Python, Railway, private network).
PostgreSQL (Supabase) holds all records; Redis (Railway) holds the job queues and carries live
updates between the worker and the API (ADR 0001, 0004, 0009).

**Technology** (fixed by the approved proposal): React 19 + Vite + TypeScript, Tailwind CSS,
TanStack Query, Radix UI, i18next (English and Kiswahili); Node.js + Express 5 + TypeScript,
Socket.IO, BullMQ on Redis, Prisma ORM on PostgreSQL, zod validation, JWT + bcrypt; Python
FastAPI for the ML service; Vitest, Supertest, Playwright with axe, pytest and k6 for testing.

## 5.3 The notification pipeline

1. **Events (outbox pattern).** A business action (job posted, application status changed,
   message sent, announcement) saves its data and a `DomainEvent` row in the same database
   transaction, and signals the worker with Postgres `NOTIFY`. Nothing can be "done but never
   announced" (ADR 0003, 0004).
2. **Notifications.** The worker's outbox relay locks due events (`FOR UPDATE SKIP LOCKED`, four
   at a time), asks a listener who must be told (e.g. workers in the job's place or with its
   skill), writes the texts in each recipient's language, saves the notifications as QUEUED and
   only then queues one BullMQ job each. A sweeper re-queues anything left QUEUED; the job id is
   the notification id, so a retry never sends twice.
3. **Classification.** The worker calls the ML service's `POST /predict` with the fixed contract
   (text, type, roles, time, deadline). If it does not answer within 500 ms, the same rules run
   inside Node (`predictionSource = rules_fallback`): an urgent alert never waits for, or is lost
   because of, the ML service (ADR 0005). Spam is blocked and queued for admin review.
4. **In-app delivery.** A `DeliveryLog` row, then a message on Redis pub/sub that the API turns
   into a Socket.IO event in the person's private room. The page confirms receipt
   (`deliveredAt`). After any reconnect, or if the API's Redis subscription was interrupted,
   pages fetch what they missed (ADR 0004, 0009).
5. **Channel routing** ("first choice, with a safety net", ADR 0006). A pure function of the
   priority, the person's preferences and which channels can reach them:
   - Urgent: the first usable channel at once; if it fails after 3 tries, or the alert is not
     opened within 10 minutes (or half the time left before the job's deadline), the next
     channel. Optionally "send on both".
   - Important: every channel set to receive important alerts (email by default).
   - For later: in the app and the 08:00 daily summary email.
   - Quiet hours (Nairobi time): only urgent alerts leave the app; others are held and planned
     again when the quiet hours end (ADR 0007).
6. **Channel adapters.** WhatsApp (Twilio), SMS (Africa's Talking), email (Resend or SendGrid)
   and in-app share one `ChannelAdapter` base class with mock, sandbox and live modes; a new
   channel needs no change to the router. External texts carry only a short summary and a
   tracked link, never names or message text (a lost phone reveals little). Delivery reports
   arrive on signed webhooks (ADR 0006).

## 5.4 Data model and ML-readiness

Core tables (thesis ERD): `User`, `UserPreference`, `Notification`, `DeliveryLog`, `MLMetadata`;
host tables: `Job`, `Application`, `Message`, lookups, `AuditLog`, `DomainEvent`,
`TrackedLink`. Every notification keeps what a future model needs: the input, the predicted
priority and spam score with model version and source, admin corrections (`correctedPriority`,
`correctedSpam`), the person's "Not important to me", and per-channel sent / delivered / opened
/ clicked / dismissed times (response time = opened − sent). Admins download an anonymised
training CSV: ids become random per-file tokens and names, phone numbers and emails are removed
from the text (ADR 0008). The ML service's contract is fixed, so training models in Phase 9
changes nothing outside `ml-service/`.

## 5.5 Security and privacy (NFR-2, Kenya Data Protection Act 2019)

- Passwords hashed with bcrypt; short-lived JWT access tokens; refresh token in an httpOnly,
  SameSite cookie, stored only as a hash and rotated; "log out of all devices".
- Every input checked with zod; rate limits on log-in, password reset, SMS codes and everything
  people create (per user); CORS limited to the website; helmet headers on the API; a Content
  Security Policy and HSTS on the website.
- Consent before any SMS/WhatsApp; STOP replies honoured; account deletion within 14 days
  (with a way back) by a nightly retention job, which also removes delivery logs after 180 days.
  In alerts the deleted person sent to others, their name becomes "a former user" and chat
  messages lose their words.
- Secrets only in environment variables; production refuses example secrets; logs never contain
  tokens, cookies or webhook secrets. Dependency audits (npm, pip) and a secret scan: clean.
  (ADR 0003, 0007, 0009.)

## 5.6 Usability and accessibility (NFR-4)

Designed for people aged 18 to 80 on mid-range Android phones: one main action per screen,
plain English and Kiswahili, priority shown as colour + icon + word ("Urgent", "Important",
"For later"), 44-pixel tap targets, a Large text setting, light/dark themes, reduced motion,
and undo instead of scary confirmations. Settings show three presets first and the details
behind "Customise". Checked with axe on every page (phone and desktop, light and dark,
English and Kiswahili), keyboard-only and 200% zoom tests, and Lighthouse on a throttled
mobile profile ([accessibility.md](accessibility.md)). The app shell stays under 200 KB of
compressed JavaScript; other pages load on demand. The pages before logging in arrive as
ready-made HTML, readable before the app has downloaded (ADR 0010).

## 5.7 Testing

| Level | Tool | Count (Phase 8) |
| --- | --- | ---: |
| Backend unit and integration (real Postgres and Redis) | Vitest + Supertest | 173 |
| Frontend components | Vitest + Testing Library | 80 |
| ML service | pytest | 56 |
| End to end, phone (360 px) and desktop (1440 px), with axe | Playwright | 94 (+8 run on one screen size only) |
| Load and resilience | k6 + Socket.IO listeners | 2 runs of 10,000 |

Continuous integration (GitHub Actions) runs formatting, lint and type checks, every test suite
above except load, the end-to-end browser tests, the bundle-size check and the production builds.

## 5.8 Results against the non-functional requirements

| Requirement | Target | Measured (10 min at 1,000 a minute) |
| --- | --- | --- |
| NFR-1 throughput | 1,000 notifications/min | 10,000 in 10 min, 0 failed, 0 dropped |
| NFR-1 in-app latency | median < 200 ms | median 34 ms, p95 77 ms (created → on screen) |
| NFR-1 urgent at provider | 95% within 2 s | 100% (median 59 ms, p95 132 ms) |
| NFR-1 `/predict` | < 300 ms | median 5.8 ms, p95 13 ms; no fallback needed |
| NFR-3 nothing lost | no queued job lost | Redis and Postgres restarted under load: 9,975 of 9,975 accepted messages delivered |
| NFR-3 recovery | < 30 s | Redis 3.1 s, Postgres 1.6 s |
| NFR-1 app shell size | ≤ ~200 KB gzipped | 199.7 KB |
| NFR-1 page load (LCP) | < 2.5 s on "Fast 3G" | Landing, log in, sign up: **1.1–1.3 s** with Chrome's Fast 3G throttling (was 4.1–4.4 s): met. Lighthouse's simulation, which adds opening a new connection: 4.0–4.5 s (was 5.2–5.4 s; its floor for any page is 2.9 s). Slow 4G: 2.35–2.41 s ([accessibility.md](accessibility.md), ADR 0010) |
| NFR-4 accessibility | WCAG 2.2 AA | axe: no serious issues on any page; Lighthouse accessibility 100; keyboard-only and 200% zoom tests pass |

Two bottlenecks were found and fixed by the load test (database connection pool; one-at-a-time
outbox), one resilience gap by the restart test (live alerts lost during a Redis restart), and
idle Redis traffic was reduced by 77% (performance.md; DEPLOYMENT.md, section 8).

## 5.9 Deployment

Vercel (website), Railway (API, worker, ML service, Redis), Supabase (Postgres through its
session pooler). The website forwards `/api` to Railway so the login cookie is first-party.
Migrations and a safe bootstrap run before each API deploy. Step by step:
[DEPLOYMENT.md](DEPLOYMENT.md).

## 5.10 Limitations and future work

- Page load on slow 3G: the landing, log-in and sign-up pages are now sent as ready-made HTML
  (ADR 0010). A first visit on a real Fast 3G phone still spends about 1.7 s opening the
  connection, and Kiswahili visitors' first visit is drawn by the app as before. The logged-in
  pages are drawn by the app (they need the person's data anyway).

- The classifier is rule-based (v0). Phase 9 trains models on synthetic and collected data and
  swaps them in behind the same `/predict` contract.
- Performance was measured on one laptop in mock mode; production adds network hops and real
  provider times.
- Rate-limit counters are per API process (fine for one instance).
- A person-led screen-reader session and usability tests with older users remain to be done.
