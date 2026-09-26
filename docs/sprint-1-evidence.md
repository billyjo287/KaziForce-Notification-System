# Sprint 1 evidence: data preparation and development environment

**Project:** Intelligent Multi-Channel Notification Prioritisation for Workforce Marketplaces (KaziForce)
**Student:** Billy John Igiraneza · **Supervisor:** Dr Vincent Ochango · Strathmore University

This page maps each Sprint 1 requirement to where it can be seen in the repository, and to a
command that demonstrates it. Build phases are listed in [ROADMAP.md](ROADMAP.md); the
requirements are in [PRD.md](PRD.md).

---

## 1. A properly set up development environment

| Evidence | Where / how to check |
| --- | --- |
| One-command setup (installs packages, creates settings files, starts services, builds and fills the database) | `npm run setup` ([README](../README.md), section 2) |
| One-command daily start (services, API, notification worker and website together) | `npm run dev` |
| Local services in Docker: PostgreSQL 17, Redis 8, Mailpit (fake email inbox), ML service | [docker-compose.yml](../docker-compose.yml) |
| Runs with **no API keys**: WhatsApp, SMS and email are simulated (`CHANNEL_MODE=mock`) | [backend/.env.example](../backend/.env.example) |
| Every setting documented, secrets never committed | `.env.example` in the root and each app; `.env` ignored in [.gitignore](../.gitignore) |
| Health checks for each service | http://localhost:4000/health (database + Redis), http://localhost:8000/health (ML service) |
| Separate databases for development, automated tests and browser tests | `kaziforce`, `kaziforce_test`, `kaziforce_e2e` |

## 2. A clean and professionally organised codebase

| Evidence | Where / how to check |
| --- | --- |
| Monorepo with one folder per part of the system | `frontend/` (React + TypeScript), `backend/` (Express + TypeScript + Prisma), `ml-service/` (Python FastAPI), `docs/` |
| Consistent code style, checked automatically | ESLint + Prettier (TypeScript), ruff (Python): `npm run lint`, `npm run format:check` |
| Type safety throughout | TypeScript strict mode: `npm run typecheck` |
| Automated tests | 52 backend (API, accounts, roles, suspension, marketplace, notification pipeline), 61 frontend unit, 8 ML service, and 69 browser tests with accessibility checks at phone and desktop sizes: `npm test`, `npm run test:e2e -w frontend` |
| Architecture decisions recorded | [docs/adr/](adr/): 0001 overall architecture, 0002 frontend, 0003 accounts and events, 0004 real-time notification pipeline |
| Design documented | [docs/design/visual-direction.md](design/visual-direction.md) (colours with contrast ratios, type, layout) |
| Setup guide a classmate can follow | [README.md](../README.md) |

## 3. All code maintained using Git version control

| Evidence | Where / how to check |
| --- | --- |
| Repository on GitHub with commit history per build phase | The repository's **Commits** page |
| Conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`) | Commit history |
| Secrets and generated files kept out of Git | [.gitignore](../.gitignore) (`.env`, `node_modules`, build output, datasets, trained models) |
| Every push is checked automatically | See section 5 |

## 4. Data, databases, APIs and other resources prepared

| Evidence | Where / how to check |
| --- | --- |
| Database schema: 15 tables | [backend/prisma/schema.prisma](../backend/prisma/schema.prisma): the core notification tables from the thesis ERD (User, Notification, UserPreference, DeliveryLog, MLMetadata), the marketplace tables that generate events (Job, Application, Message), plus Location, Skill, Session, PasswordResetToken, PhoneVerification, AuditLog, DomainEvent |
| Versioned database changes (migrations) | [backend/prisma/migrations/](../backend/prisma/migrations/): `init`, `phase2_accounts_marketplace`, `phase3_pipeline` |
| Sample data (fake Kenyan-style people, no real persons) | `npm run db:seed -w backend`: 10 users (workers, employers, admin), jobs, applications, messages, notifications with delivery logs, ML model registry entry |
| Reference data | 40 Kenyan towns/areas and 26 skills (English + Kiswahili): [backend/src/data/lookups.ts](../backend/src/data/lookups.ts) |
| Data collected for the ML phase from day one | Each notification stores predicted priority, spam score, model version, prediction source, admin corrections and "Not important to me"; each delivery stores sent, delivered, opened, clicked and dismissed times |
| Fixed ML interface, so trained models can replace the rules later without other changes | `/predict` request and response: [ml-service/app/schemas.py](../ml-service/app/schemas.py) |
| REST API (accounts, jobs, applications, messages, alerts, admin, announcements) | [backend/src/modules/](../backend/src/modules/) |
| Real-time notification pipeline: marketplace events become notifications for workers and employers, processed by a BullMQ job queue (Redis) and pushed live over Socket.IO | [backend/src/pipeline/](../backend/src/pipeline/), [backend/src/realtime/](../backend/src/realtime/), [ADR 0004](adr/0004-realtime-notification-pipeline.md) |
| Measured in-app delivery time (target: median under 200 ms) | Median 44 ms over 20 messages; printed by [backend/tests/pipeline.test.ts](../backend/tests/pipeline.test.ts) on every test run |
| Browse the data | `npm run db:studio -w backend` (Prisma Studio) |
| Training datasets | Planned for the ML phase (synthetic data, then training); folder prepared at [ml-service/data/](../ml-service/data/) |

## 5. Appropriate use of automation

| Evidence | Where / how to check |
| --- | --- |
| Continuous integration on every push and pull request: install, lint, type-check and test all three apps, browser tests with accessibility (axe) checks, bundle size check | [.github/workflows/ci.yml](../.github/workflows/ci.yml); results in the repository's **Actions** tab |
| Scripted environment and database | `npm run setup`, `npm run dev`, `db:deploy`, `db:seed`, `db:reset` |
| Automatic test databases (created, migrated and seeded before each test run) | [backend/tests/globalSetup.ts](../backend/tests/globalSetup.ts), [backend/scripts/e2e-server.mjs](../backend/scripts/e2e-server.mjs) |
| Automated quality gates | Formatting, lint, types, accessibility (axe), in-app latency (fails if the median passes 200 ms), and a bundle-size report that fails the build if the app exceeds its size budget |

---