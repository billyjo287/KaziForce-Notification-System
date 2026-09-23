# KaziForce Intelligent Notification System

A real-time notification system for KaziForce, a Kenyan workforce marketplace. It checks each
notification for spam, ranks it as **Urgent**, **Important** or **For later**, and sends it on the
right channel (in-app, WhatsApp, SMS or email), with the user in control of channels and quiet
hours.

Capstone project, BSc Informatics & Computer Science, Strathmore University.
Requirements: [docs/PRD.md](docs/PRD.md) · Build phases: [docs/ROADMAP.md](docs/ROADMAP.md) ·
Architecture decisions: [docs/adr/](docs/adr/)

## What's in the repository

| Folder        | What it is                                                     | Runs on               |
| ------------- | -------------------------------------------------------------- | --------------------- |
| `frontend/`   | The website (React + Vite + TypeScript + Tailwind)             | http://localhost:5173 |
| `backend/`    | The API, database schema (Prisma) and, later, queue workers    | http://localhost:4000 |
| `ml-service/` | Spam and priority classifier (Python, FastAPI)                 | http://localhost:8000 |
| `docs/`       | Requirements, roadmap and architecture decision records (ADRs) |                       |

Docker runs the supporting services for you:

| Service    | What it does                                    | Address                      |
| ---------- | ----------------------------------------------- | ---------------------------- |
| Postgres   | The database                                    | `localhost:5434`             |
| Redis      | Stores the job queues                           | `localhost:6379`             |
| Mailpit    | A fake email inbox: every email sent lands here | http://localhost:8025        |
| ML service | Same as `ml-service/`, running in a container   | http://localhost:8000/health |

**No API keys are needed.** `CHANNEL_MODE=mock` (the default) means WhatsApp, SMS and email are
only logged, never really sent.

## 1. Install these first (once per computer)

1. **Node.js 24 LTS** (at least 22.22) with **npm 11.20 or newer**: https://nodejs.org. Check with
   `node -v` and `npm -v`. If npm is older, run `npm install -g npm@latest`. Older npm versions
   have a bug that silently deletes a part of Vite that Windows needs, and the website then
   fails to start with "Cannot find native binding".
2. **Docker Desktop**: https://www.docker.com/products/docker-desktop. Open it and wait until it
   says "Engine running".
3. **Python 3.12, 64-bit** (at least 3.11): https://www.python.org/downloads. On Windows, tick
   **"Add python.exe to PATH"** during install. Check with `python --version`. Only needed to
   lint or test the ML service; the app itself runs the ML service inside Docker.
4. **Git** or **GitHub Desktop**, to get the code.

## 2. First-time setup

Open a terminal in the project folder and run:

```bash
npm run setup
```

This one command:

1. copies each `.env.example` to `.env` (your local settings; never committed to Git),
2. installs the exact Node package versions recorded in `package-lock.json` (`npm ci`),
3. starts Postgres, Redis, Mailpit and the ML service in Docker,
4. creates the database tables (Prisma migrations),
5. fills the database with fake sample data (made-up Kenyan names; every password is
   `Password123!`).

## 3. Run the app (every day)

```bash
npm run dev
```

Starts the Docker services, then the backend and the frontend together. Stop with **Ctrl + C**.
To also stop the Docker services: `npm run stop`.

Then open:

- http://localhost:5173: the website (it shows whether the backend, database and Redis are
  working)
- http://localhost:4000/health: backend health (database and Redis)
- http://localhost:8000/health: ML service health
- http://localhost:8025: Mailpit fake inbox

## 4. Checks and tests

Docker must be running (the backend tests use the real database and Redis).

```bash
npm run lint          # ESLint, frontend + backend
npm run typecheck     # TypeScript, frontend + backend
npm test              # Vitest tests, frontend + backend
npm run format        # auto-format with Prettier
```

ML service (one-time Python setup, then lint and test):

```bash
cd ml-service
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate
pip install -r requirements-dev.txt

ruff check .          # lint
ruff format --check . # formatting
pytest                # tests
```

GitHub Actions runs all of these automatically on every push
([.github/workflows/ci.yml](.github/workflows/ci.yml)).

## 5. Useful database commands

Run from the project root:

| Command                         | What it does                                       |
| ------------------------------- | -------------------------------------------------- |
| `npm run db:studio -w backend`  | Opens Prisma Studio, a web page to browse the data |
| `npm run db:seed -w backend`    | Wipes and reloads the fake sample data             |
| `npm run db:migrate -w backend` | After editing `schema.prisma`: create a migration  |
| `npm run db:reset -w backend`   | Deletes everything and rebuilds the database       |

## Troubleshooting

- **"Cannot find native binding"** when the website starts: your npm is too old (see step 1).
  Update npm, then delete the `node_modules` folders and run `npm ci`. If `package-lock.json`
  shows as changed in GitHub Desktop, discard that change first.

- **"port is already allocated"** when Docker starts: another program uses that port. Change
  the port in the root `.env` (and `DATABASE_URL` in `backend/.env` if it is the Postgres port).
- **"Cannot reach the server"** on the website: the backend is not running. Start it with
  `npm run dev` and check the terminal for errors.
- **Backend says "Invalid environment variables"**: compare `backend/.env` with
  `backend/.env.example`.
- **Something is badly stuck:** `docker compose down` then `npm run dev`. To also delete the
  local database and start fresh: `docker compose down -v`, then `npm run setup`.
