# Roadmap — the build phases

Billy pastes a detailed prompt for each phase. This file is only the overview, so you know where each phase fits. Work on ONE phase at a time and stop for review at the end. Never start Phase 9 unless Billy explicitly asks.

Phases 2–8 map to the six Scrum sprints in Billy's proposal (Phases 2–3 = Sprint 1, Phase 4 = Sprint 2, Phase 5 = Sprint 3, Phase 6 = Sprint 4, Phase 7 = Sprint 5, Phase 8 = Sprint 6).

- **Phase 0 — Foundations** — monorepo, Docker Compose (Postgres, Redis, Mailpit), env files, health checks, lint, CI, first Prisma schema and seed data.
- **Phase 1 — Design system, app shell and landing page (frontend only, mock data)** — visual direction approved by Billy, design tokens, accessible components, responsive app shell for all three sides, i18n (English/Kiswahili), mock Alerts dashboard, landing page with GSAP + one lazy-loaded Three.js hero.
- **Phase 2 — Auth and the minimal marketplace (Worker, Employer and Admin sides)** — auth, onboarding (phone verification, WhatsApp question, channel order, preset), worker, employer and admin portals of the minimal marketplace, domain events (no notifications yet).
- **Phase 3 — Real-time notification pipeline (Sprint 1)** — domain events become notifications, BullMQ pipeline, Socket.IO live in-app delivery, DeliveryLog and interaction tracking.
- **Phase 4 — ML service with rule-based model v0 (Sprint 2)** — FastAPI ML service with the rule-based classifier behind the fixed /predict contract, 500 ms timeout with Node fallback, spam blocking.
- **Phase 5 — Channel routing and adapters (Sprint 3)** — channel adapters (WhatsApp, SMS, email, in-app) with mock/sandbox/live modes, "first choice, with a safety net" routing and escalation, delivery webhooks, channel suggestion.
- **Phase 6 — Preferences, quiet hours and the daily summary (Sprint 4)** — preferences screen, quiet hours, daily summary at 08:00 Africa/Nairobi, account deletion and data retention jobs.
- **Phase 7 — Admin dashboard and ML-readiness (Sprint 5)** — admin overview, delivery logs, spam review and priority correction, announcements, model versions, anonymised CSV export, employer delivery status.
- **Phase 8 — Hardening, testing and deployment (Sprint 6)** — load and resilience tests, accessibility, performance and security passes, deployment (Vercel, Railway, Supabase), user guides.
- **Phase 9 — LATER: model training (do not start until Billy says so)** — LATER: synthetic data, training, evaluation, SHAP, swapping the trained models in behind /predict.
