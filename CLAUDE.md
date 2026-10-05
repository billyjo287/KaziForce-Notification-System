# CLAUDE.md — KaziForce Intelligent Notification System

You are building the capstone project of Billy John Igiraneza (Strathmore University, BSc Informatics & Computer Science, supervisor Dr Vincent Ochango). This file is your standing brief. Read it at the start of every session. The full requirements live in `docs/PRD.md` and the list of build phases lives in `docs/ROADMAP.md`. Read both before writing any code. Billy gives you the detailed instructions for each phase by pasting a prompt.

## 1. What we are building, in one paragraph

KaziForce is a Kenyan workforce marketplace where businesses post short-term jobs and workers apply. Today every notification is treated the same, so urgent job alerts (which can expire in minutes) get lost among routine updates, and people start ignoring everything. We are building a real-time notification system that (1) checks each notification for spam/fraud, (2) classifies it as URGENT, MEDIUM or LOW, and (3) sends it through the right channel: urgent in-app plus the user's first-choice channel (WhatsApp or SMS) with escalation to their next channel if unopened, medium via email plus in-app, low in-app only and rolled into a daily summary email. Users control their channel order, thresholds and quiet hours. There are three sides: Worker (job seeker), Employer ("Business" in the thesis) and Admin. Admins manage users and jobs and monitor delivery and spam. The machine learning models are trained LATER; until then a rule-based classifier sits behind the exact same interface.

## 2. The golden rule: simple enough for anyone aged 18 to 80

Every screen must pass this test: *could a 70-year-old using a mid-range Android phone on a slow connection, who has never used this app, complete the task without help?* If not, simplify. When a feature and simplicity conflict, simplicity wins and you flag the trade-off to Billy instead of shipping the complex version.

Design references to follow (trusted sources, not blogs): W3C WCAG 2.2 level AA; W3C WAI guidance on older users; Nielsen Norman Group's 10 usability heuristics; the GOV.UK Design System (plain language, one thing per page, big tap targets); Apple Human Interface Guidelines and Google Material 3 (touch targets, motion). Concrete rules are in `docs/PRD.md` section 6.

## 3. Tech stack (fixed by the approved proposal — do not swap without asking)

- **Frontend:** React + Vite + TypeScript, Tailwind CSS, React Router, TanStack Query (server state), Zustand (small UI state only), react-hook-form + zod, Radix UI primitives (accessible dialogs, switches, dropdowns), lucide-react icons, i18next (English + Kiswahili), socket.io-client, Axios.
- **Motion:** GSAP (page/section choreography, landing page), Motion (motion.dev, formerly Framer Motion) for component micro-interactions, Three.js (ONE lazy-loaded hero on the public landing page only). See the motion rules in `docs/PRD.md` section 7.
- **Backend:** Node.js (LTS) + Express + TypeScript, Socket.IO, BullMQ on Redis, Prisma ORM on PostgreSQL, JWT auth + bcrypt, zod validation, helmet, express-rate-limit, pino logging.
- **ML service:** Python 3.11+, FastAPI, scikit-learn, spaCy, joblib (SHAP later). Exposes REST only.
- **Channels:** Twilio WhatsApp API, Africa's Talking SMS, Resend email (SendGrid as a drop-in alternative), Socket.IO in-app.
- **Infra:** Local dev with Docker Compose (Postgres + Redis + Mailpit fake inbox). Deploy: Vercel (frontend), Railway (backend, worker, ML service, Redis), Supabase Postgres. Do NOT use Upstash free tier for BullMQ: idle BullMQ workers poll Redis constantly (~3.8M commands/month per idle queue), far above its 500K commands/month.
- **Testing:** Vitest + React Testing Library, Supertest, Playwright + @axe-core/playwright, pytest, k6 for load tests.

Always install the current stable version of each package and check its official docs before using an API you are unsure about. Do not invent library APIs.

## 4. Repository layout (monorepo, matches thesis section 5.2.3)

```
/frontend        React app (Vite)
/backend         Express API, Socket.IO server, BullMQ workers, Prisma schema, channel adapters
/ml-service      FastAPI service, rule-based model now, trained models later
  /data          (gitignored) raw + synthetic datasets
  /training      training scripts (empty stubs until the ML phase)
  /models        serialised models (gitignored except a README)
/docs            PRD, build plan, design exports, ADRs (architecture decision records)
docker-compose.yml, .env.example, README.md
```

## 5. Architecture decisions already made (do not re-open without asking)

1. **Pipeline order:** create notification → validate → save (status QUEUED) → enqueue `notification.process` → worker calls ML service `/predict` → spam? block + log for admin review : attach priority → Channel Router applies user preferences + quiet hours → enqueue one job per channel → channel adapter sends → DeliveryLog row per attempt → Socket.IO pushes to the user's room.
2. **The Node worker calls the ML service over REST** (the proposal's interface requirement). The ML service does not consume BullMQ directly.
3. **ML timeout fallback:** if `/predict` does not answer within 500 ms or errors, use the rule-based classifier in Node and record `predictionSource = "rules_fallback"`.
4. **Urgent routing = "first choice, with a safety net":** in-app immediately + the user's first external channel from their `channelOrder`; escalate to the next channel if the send fails after retries OR the alert isn't opened within the window (10 min, or half the time to the job deadline if shorter). Optional per-user "send on both" switch. Users without WhatsApp never get WhatsApp. Full rules: PRD FR-4 and FR-4b.
5. **Retries:** exponential backoff, max 3 retries per channel, then mark FAILED and surface on the admin dashboard.
6. **Channel adapters** extend one `ChannelAdapter` base class (`send()`, `name`, retry policy). New channels must not require changes to the router.
7. **Mock mode:** `CHANNEL_MODE=mock` makes every external adapter log to the console and DB instead of calling Twilio/Africa's Talking/Resend. Emails in development go to Mailpit (http://localhost:8025). Mock mode is the default in development so the app runs with zero API keys.
8. **Timezone:** Africa/Nairobi for quiet hours and the 08:00 daily summary. Phone numbers stored in E.164 (+254...).
9. **Minimal host marketplace, three sides:** Worker, Employer and Admin portals, with only enough of KaziForce (profiles, post job, apply, change application status, simple messages, announcements, admin user/job management) to generate real notification events. No payments, ratings, reviews, advanced search or matching algorithms. One responsive website serves phones and desktops; there is no separate mobile app.
10. **External messages carry no personal details:** WhatsApp/SMS show a short summary + link; details need a login (protects users whose phone is lost or stolen).

## 6. Build "ML-ready" from day one

The models are trained later, but the data they need must be collected now:
- Every notification stores: type, text, recipient role, createdAt (hour of day derivable), predictedPriority, spamScore, modelVersion, predictionSource (`ml` | `rules` | `rules_fallback`).
- Every delivery/interaction stores: channel, sentAt, deliveredAt, openedAt, clickedAt, dismissedAt, error. Response time = openedAt − sentAt.
- Admins can correct a priority or spam verdict; store it as `correctedPriority` / `correctedSpam`. These become training labels.
- Users get one simple action on each notification: "Not important to me". Store it; it is both user control and a training signal.
- An admin-only export produces an anonymised CSV (user IDs replaced with random tokens, no names/phones/emails) matching data requirement DR-2.
- The ML service's `/predict` request/response schema is fixed now (see PRD section 5) so swapping rules for a trained model later changes nothing outside `/ml-service`.
- `MLMetadata` table exists from the first migration.

## 7. How to work with Billy

- Work one phase at a time (see `docs/ROADMAP.md`); Billy pastes the prompt for each phase. At the end of each phase: run tests, summarise what was built in plain English, list anything you deferred, and stop for review. Do not start the next phase uninvited.
- Before a big change, show a short plan first.
- Explain in plain, jargon-free English. When you must use a technical term, define it in one line.
- Keep it small. Prefer fewer screens, fewer settings, fewer dependencies. If you are about to add a library, say why in one sentence.
- Never commit secrets. Keep `.env.example` updated with every variable and a comment explaining it.
- Record important technical choices as short ADRs in `docs/adr/` (useful for thesis Chapter 5).
- **Git is Billy's job.** Never run git commands (no commit, push, pull, branch, reset, or init). Billy commits and pushes himself with GitHub Desktop. At the end of each phase, suggest a short commit message in conventional style (`feat:`, `fix:`, `test:`, `docs:`) that he can copy, and remind him if any file that should stay private (like `.env`) would show up as a change.

## 8. Definition of done for any feature

Works on a 360 px wide phone and a 1440 px desktop; keyboard accessible; passes axe with no serious violations; respects `prefers-reduced-motion`; has loading, empty and error states written in plain language; has at least one automated test; English and Kiswahili strings live in the i18n files (no hard-coded UI text).
