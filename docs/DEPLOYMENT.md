# Deploying KaziForce

This guide puts KaziForce on the internet:

| Part | Where | Why there |
| --- | --- | --- |
| Website (React) | **Vercel** | Free, fast for static sites, forwards `/api` to the backend |
| API (Express + Socket.IO) | **Railway**, service `api` | Long-running Node process with WebSockets |
| Worker (BullMQ, outbox, clock jobs) | **Railway**, service `worker` | Same image as the API, its own process |
| ML service (FastAPI) | **Railway**, service `ml-service` | Private: only the worker calls it |
| Redis (job queues) | **Railway** Redis | Close to the worker, no command limit |
| Postgres | **Supabase** | Managed Postgres with backups |

```
 phone / laptop ──► Vercel (website, /api forwarded) ──► Railway api ──► Supabase Postgres
        │                                                     │   ▲
        └── live alerts (Socket.IO, login token) ─────────────┘   │
                                     Railway worker ──────────────┘── Railway Redis
                                          └──► Railway ml-service (private network)
```

**Not Upstash's free tier for Redis.** An idle BullMQ worker still talks to Redis (it waits for
jobs and checks for stuck ones), about 3.8 million commands a month per idle queue with the
defaults. Upstash's free tier allows 500,000 a month. Railway Redis has no command limit. We
also tuned the workers to talk less (section 8).

Before you start you need: the code on GitHub (with GitHub Desktop), and free accounts on
[Supabase](https://supabase.com), [Railway](https://railway.com) (the Hobby plan, about USD 5 a
month, is needed for always-on services) and [Vercel](https://vercel.com).

Pick regions close to Kenya and to each other: **Supabase: Central EU (Frankfurt)**,
**Railway: EU West (Amsterdam)**. Vercel serves the website from everywhere.

---

## 1. Supabase (Postgres)

1. Supabase → **New project**. Name `kaziforce`, a strong database password (save it in your
   password manager), region **Central EU (Frankfurt)**.
2. When it is ready: **Connect** (top of the project page) → **Session pooler**. Copy the URI:
   `postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
   - Use the **session** pooler (port **5432**), not the transaction pooler (port 6543): the
     worker listens for new events with Postgres LISTEN/NOTIFY, which the transaction pooler
     does not support. The session pooler also works over IPv4, which Railway needs.
3. **Project Settings → Database → Connection pooling → Pool size**: set it to **40**. Each
   connection from our API or worker uses one; the API uses up to 8 and the worker up to 20
   (section 3), plus migrations and the event listener.

## 2. Railway: project, Redis and the ML service

1. Railway → **New project → Deploy from GitHub repo** → choose this repository. Railway may
   offer services by itself; delete anything it adds, we create them by hand below.
2. **Redis:** in the project, **New → Database → Redis**.
   Then make sure queued jobs survive a Redis restart: open the Redis service → **Settings →
   Deploy → Custom start command**. Keep everything that is there (it sets the password and
   the data folder) and add at the very end:
   ```
    --appendonly yes --maxmemory-policy noeviction
   ```
   `appendonly` writes every change to disk; `noeviction` stops Redis from throwing jobs away
   when its memory is full. The worker logs a clear warning at start-up if Redis is not set
   like this.
3. **ML service:** **New → GitHub repo** (this repository). Name it `ml-service`.
   - **Settings → Source → Root directory:** `/ml-service`
   - **Settings → Config-as-code → Railway config file:** `/ml-service/railway.json`
   - **Variables:** `CLASSIFIER=rules`, `LOG_LEVEL=info`
   - Do **not** generate a public domain: only the worker calls it, over Railway's private
     network at `http://ml-service.railway.internal:8000`.

## 3. Railway: the API and the worker

Both use **one Docker image** (`backend/Dockerfile`), built from the repository root.

1. **New → GitHub repo** → this repository. Name it `api`.
   - **Root directory:** `/` (the Dockerfile needs the whole repository)
   - **Railway config file:** `/backend/railway.api.json`
   - **Networking → Generate domain**: you get `https://api-production-xxxx.up.railway.app`.
2. **New → GitHub repo** → this repository again. Name it `worker`.
   - **Root directory:** `/`
   - **Railway config file:** `/backend/railway.worker.json`
   - No domain.
3. **Variables.** Put these on **both** `api` and `worker` (Railway → project → **Shared
   variables**, then share them with both services). Every variable is explained in
   `backend/.env.example`.

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the Supabase **session pooler** URI from step 1 |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` (Railway fills it in) |
| `QUEUE_PREFIX` | `kf` |
| `ML_SERVICE_URL` | `http://ml-service.railway.internal:8000` |
| `ML_TIMEOUT_MS` | `500` |
| `JWT_ACCESS_SECRET` | a new random secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` (production refuses the example one) |
| `FRONTEND_ORIGIN` | your Vercel address, e.g. `https://kaziforce.vercel.app` (step 4) |
| `PUBLIC_APP_URL` | the same Vercel address |
| `PUBLIC_API_URL` | the `api` domain, e.g. `https://api-production-xxxx.up.railway.app` |
| `TRUST_PROXY_HOPS` | `2` (Vercel forwards `/api` to Railway: two proxies) |
| `CHANNEL_MODE` | `mock` to start; `sandbox` or `live` with the provider keys (section 6) |
| `EMAIL_FROM` | `KaziForce <alerts@your-domain>` |
| `APP_TIMEZONE` | `Africa/Nairobi` |

Only on **api**: `DATABASE_POOL_MAX=8`, `ADMIN_EMAIL`, `ADMIN_NAME` and, for the very first
deploy only, `ADMIN_PASSWORD` (12+ characters, not the example).
Only on **worker**: `DATABASE_POOL_MAX=20` (the load test showed 10 is too few at 1,000
alerts a minute; see `docs/performance.md`).

4. **Deploy** `api` first. Before it starts, Railway runs `npm run db:release` (the
   `preDeployCommand` in `railway.api.json`): the migrations create the tables, and the
   bootstrap (`prisma/bootstrap.ts`) adds the places, skills and the admin account. It never adds fake
   people and never deletes anything. Then deploy `worker`.
5. Check: open `https://<api domain>/health`. You should see `"status":"ok"` with the database
   and Redis "up". In the `worker` logs: `Notification worker running (channel mode: mock)`.
6. Remove `ADMIN_PASSWORD` from the variables once the admin can log in.

## 4. Vercel (the website)

1. **Edit `frontend/vercel.json`** first: replace `https://YOUR-API.up.railway.app` with your
   `api` domain. Commit and push this change with GitHub Desktop.
   - Why: the website forwards `/api/...` to the backend. The login cookie then belongs to the
     website's own address, so browsers that block other sites' cookies (Safari, Brave) keep
     people logged in. Live alerts connect to the API directly; they log in with a token.
2. Vercel → **Add New → Project** → import the repository.
   - **Root directory:** `frontend`
   - Framework: **Vite** (the install and build commands come from `vercel.json`).
   - **Environment variables:**
     - `VITE_API_URL` = your `api` domain (`https://api-production-xxxx.up.railway.app`)
     - `VITE_SAME_ORIGIN_API` = `true`
3. **Deploy.** Your site is at `https://<project>.vercel.app`. If it differs from what you put in
   `FRONTEND_ORIGIN` and `PUBLIC_APP_URL` on Railway, fix those two and redeploy `api` and
   `worker`.

The build adds a Content Security Policy to the page that allows only your own site and your
API (`vite.config.ts`); `vercel.json` adds the other security headers (HSTS, no framing, no
sniffing, referrer policy, permissions policy).

## 5. Check that everything works

1. Open the website, create a worker account, verify a phone number. In mock mode the SMS code
   appears in the `api` logs on Railway (`[mock sms]`).
2. In a private window, create an employer account, post a job in the worker's place, and send
   the worker a message: the worker's **Alerts** page updates without refreshing.
3. Log in as the admin (`ADMIN_EMAIL`): the **Overview** shows today's alerts and the queues.
4. Reload the website after 20 minutes: you should still be logged in (the cookie works).

## 6. Real messages: Twilio, Africa's Talking, Resend

Start with `CHANNEL_MODE=sandbox`, then `live`. Add on **both** `api` and `worker`:

- **WhatsApp (Twilio):** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, and
  after approval `TWILIO_TEMPLATE_ALERT_EN/_SW`. In Twilio set "When a message comes in" to
  `<PUBLIC_API_URL>/webhooks/twilio/inbound`. Templates and sandbox steps:
  [twilio-whatsapp-templates.md](twilio-whatsapp-templates.md).
- **SMS (Africa's Talking):** `AFRICASTALKING_USERNAME`, `AFRICASTALKING_API_KEY`,
  `AFRICASTALKING_SENDER_ID`, and a long random `AFRICASTALKING_WEBHOOK_SECRET`. In their
  dashboard set the delivery report callback to
  `<PUBLIC_API_URL>/webhooks/africastalking/<secret>/delivery` and the opt-out callback to
  `.../<secret>/optout`.
- **Email (Resend):** verify your sending domain in Resend, then `EMAIL_PROVIDER=resend`,
  `RESEND_API_KEY`, and `EMAIL_FROM` on that domain. (SendGrid: `EMAIL_PROVIDER=sendgrid`,
  `SENDGRID_API_KEY`.)

The API refuses to start in sandbox or live mode if a provider key is missing, and says which.

## 7. Updates

Push to GitHub (GitHub Desktop): Railway rebuilds the services whose files changed (watch paths
in the `railway*.json` files) and runs new migrations before the API starts; Vercel rebuilds the
website. Migrations only ever add or change; they never run the sample-data seed (it refuses to
run with `NODE_ENV=production`).

## 8. Idle Redis traffic (BullMQ tuning)

Each BullMQ worker (we have 7: notifications, WhatsApp, SMS, email, escalation, quiet-hours
"held", and the clock jobs) keeps asking Redis for work even when nothing happens. Measured on
an idle worker (`INFO commandstats`, 5 minutes, development Docker Redis):

| Setting | Redis commands per minute (idle) | Per month |
| --- | ---: | ---: |
| BullMQ defaults (`drainDelay` 5 s, stalled check every 30 s) | 734 | about 31.7 million |
| Tuned (`drainDelay` 30 s, stalled check every 120 s) | 172 | about 7.4 million |

That is 77% fewer commands (measured with `backend/scripts/measure-redis-idle.mjs`, 3 minutes
each, only the worker running). With the defaults, our 7 workers matched the "about 3.8 million
a month per idle queue" estimate (4.5 million each); tuned, it is about 1.1 million each. The rest
comes mostly from the clock-jobs queue: it always holds the next 08:00 / 03:30 job, and BullMQ
then waits at most 10 seconds at a time. The settings are `QUEUE_DRAIN_DELAY_SECONDS` and
`QUEUE_STALLED_CHECK_SECONDS` (`backend/.env.example`); the defaults are the tuned values.

New jobs still start at once: a waiting worker is woken the moment a job is added; the longer
wait only applies when there is nothing to do. The trade-off: if the worker process itself
crashes mid-job, that job is picked up again after about 2 minutes instead of 30 seconds.

## 9. Costs (approximate, 2026)

| Service | Plan | Cost |
| --- | --- | --- |
| Vercel | Hobby | free |
| Supabase | Free (500 MB database, paused after a week without use) | free |
| Railway | Hobby: api + worker + ml-service + Redis | about USD 5–10 a month |
| Twilio WhatsApp, Africa's Talking SMS | pay per message | only in live mode |

Note: a free Supabase project pauses after 7 days without activity. For the thesis
demonstration, open the site the day before, or use the Pro plan.

## 10. Troubleshooting

| What you see | What to do |
| --- | --- |
| API logs: `JWT_ACCESS_SECRET: Set a new random secret for production` | Make a new secret (section 3) |
| API logs: `Can't reach database server` | Check `DATABASE_URL` is the **session pooler** URI and the password is right |
| Worker logs: `Redis may lose queued jobs on a restart` | Set the Redis start command (section 2) |
| Logged out on every reload | `vercel.json` still points at `YOUR-API`, or `VITE_SAME_ORIGIN_API` is not `true` |
| Alerts only appear after a refresh | `VITE_API_URL` is wrong, or `FRONTEND_ORIGIN` does not match the website address |
| Everyone shares one log-in limit ("Too many tries") | `TRUST_PROXY_HOPS` must be `2` behind Vercel |
| Bootstrap: `Set ADMIN_PASSWORD to a new password` | Give the first admin a 12+ character password |
| Worker logs: `ML service unavailable ... ECONNREFUSED` | The ML service listens on IPv6 (`--host ::`, right for Railway's private network). If your environment only reaches it over IPv4, set its start command to `uvicorn app.main:app --host 0.0.0.0 --port 8000`. Alerts still go out meanwhile: the worker's built-in rules take over. |
