# Deploying KaziForce (Vercel + Azure for Students + Supabase)

This guide puts KaziForce on the internet for free (ADR 0011):

| Part | Where | Cost |
| --- | --- | --- |
| Website (React) | **Vercel** (Hobby) | free |
| API, worker, ML service, Redis | **one Azure virtual machine** (Azure for Students credit) | free (uses the USD 100 student credit) |
| Postgres | **Supabase** (Free plan) | free |

```
 phone / laptop ──► Vercel (website; forwards /api) ──► Azure server: Caddy (HTTPS) ──► api ──► Supabase Postgres
        │                                                     ▲                       │
        └── live alerts (Socket.IO, login token) ─────────────┘          worker ──────┤── Redis
                                                                           └──► ml-service
```

On the server, Docker runs six small containers from `deploy/azure/docker-compose.yml`:

| Container | What it does |
| --- | --- |
| `caddy` | The only part the internet can reach (ports 80 and 443). Gets and renews a free HTTPS certificate on its own. |
| `migrate` | Runs once at every start: database tables, places, skills, the first admin. Never adds fake people, never deletes anything. |
| `api` | Express + Socket.IO |
| `worker` | Turns events into alerts and sends them (BullMQ, clock jobs) |
| `ml-service` | The classifier (private: only the worker calls it) |
| `redis` | The job queues, saved to disk so nothing is lost on a restart |

You need: the code on GitHub (GitHub Desktop), a Strathmore email address, and about an hour.
Commands in grey boxes are typed exactly as shown; replace only the parts in `<angle brackets>`.

---

## 1. Azure for Students

1. Open https://azure.microsoft.com/free/students and choose **Start free**.
2. Sign in with your **Strathmore email** and verify that you are a student. No card is needed.
3. You land in the Azure portal (https://portal.azure.com) with **USD 100 of credit** for 12
   months. When the credit is used up, everything simply stops: you are never billed.

## 2. Supabase (the database)

1. https://supabase.com → **New project**. Name `kaziforce`, a strong database password (save it
   in your password manager), region **Central EU (Frankfurt)** (pick the same area as the
   server in step 3).
2. When it is ready: **Connect** (top of the project page) → **Session pooler**. Copy the URI:
   `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
   - Use the **session** pooler (port **5432**), not the transaction pooler (port 6543): the
     worker listens for new events with Postgres LISTEN/NOTIFY, which the transaction pooler does
     not support. The session pooler also works over IPv4, which the Azure server uses.
3. **Project Settings → Database → Connection pooling → Pool size**: set it to **40** (the API
   uses up to 8 connections and the worker up to 20, plus migrations and the event listener).

A free Supabase project **pauses after 7 days without activity**. While people are testing it
stays awake. Before a demonstration, open the site the day before; if it was paused, press
**Restore** in Supabase.

## 3. The server (Azure virtual machine)

In the Azure portal: search **Virtual machines** → **Create** → **Azure virtual machine**.

**Basics tab**

| Field | Choose |
| --- | --- |
| Subscription | Azure for Students |
| Resource group | **Create new**: `kaziforce` |
| Virtual machine name | `kaziforce-server` |
| Region | **(Europe) Germany West Central** (next to Supabase Frankfurt). If the form says this region is not allowed for your subscription, pick another European region it accepts, and use the closest Supabase region in step 2. |
| Availability options | No infrastructure redundancy required |
| Security type | Standard |
| Image | **Ubuntu Server 24.04 LTS - x64 Gen2** |
| Size | **Standard_B2s** (2 processors, 4 GB memory). The portal shows the monthly price next to it; the USD 100 credit covers it for about 2–3 months, past the November submission. **Standard_B1ms** (1 processor, 2 GB) costs about half and also works, but the first build is slower. |
| Authentication type | **SSH public key** |
| Username | `azureuser` |
| SSH public key source | Generate new key pair; key pair name `kaziforce-key` |
| Public inbound ports | **Allow selected ports**: **SSH (22)**, **HTTP (80)**, **HTTPS (443)** |

**Disks tab:** OS disk type **Standard SSD** (cheaper than Premium; plenty fast).

**Management tab:** make sure **Auto-shutdown** is **off**: the server must run day and night,
or urgent alerts would wait.

Then **Review + create** → **Create** → **Download private key and create resource**. Keep the
downloaded `kaziforce-key.pem` safe: it is the key to your server (never commit or share it).

**Give the server a name.** When it is ready: **Go to resource** → on the **Overview** page,
next to **DNS name**, choose **Not configured** → **DNS name label**: for example
`kaziforce-api` → **Save**. Your server's address is now:

```
kaziforce-api.germanywestcentral.cloudapp.azure.com
```

(with your label and region). This is `<server address>` in the rest of this guide.

## 4. Connect to the server (from Windows)

In **PowerShell** on your laptop (one time: move the key and make it private, or SSH refuses it):

```powershell
mkdir $HOME\.ssh -Force
Move-Item $HOME\Downloads\kaziforce-key.pem $HOME\.ssh\
icacls $HOME\.ssh\kaziforce-key.pem /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

Then, every time you want to work on the server:

```powershell
ssh -i $HOME\.ssh\kaziforce-key.pem azureuser@<server address>
```

Type `yes` the first time. You are now typing on the server (the prompt shows
`azureuser@kaziforce-server`). `exit` returns to your laptop.

## 5. Install the app on the server

On the server:

```bash
git clone https://github.com/<your GitHub name>/<repository>.git kaziforce
cd kaziforce
bash deploy/azure/setup.sh
exit
```

- If the repository is **private**, GitHub asks for a password: create a token on GitHub →
  **Settings → Developer settings → Fine-grained tokens** → access to this repository only,
  **Contents: Read-only**, and paste the token as the password.
- `setup.sh` installs Docker, adds 2 GB of swap (extra memory on disk) and creates the settings
  file `deploy/azure/.env`. `exit` and connect again (step 4) so Docker works without `sudo`.

## 6. The settings

Make two random secrets (on the server; copy each result somewhere safe for a moment):

```bash
docker run --rm node:22-alpine node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Open the settings file:

```bash
cd ~/kaziforce
nano deploy/azure/.env
```

Fill in every `CHANGE-ME` (each line has a comment explaining it):

| Setting | Value |
| --- | --- |
| `API_DOMAIN` | `<server address>` (no `https://`) |
| `ACME_EMAIL` | your email (only used if the HTTPS certificate has a problem) |
| `PUBLIC_API_URL` | `https://<server address>` |
| `FRONTEND_ORIGIN`, `PUBLIC_APP_URL` | your Vercel address, e.g. `https://kaziforce.vercel.app` (you get it in step 8; a guess is fine now, fix it then) |
| `DATABASE_URL` | the Supabase session pooler URI from step 2, with your database password |
| `JWT_ACCESS_SECRET` | the first random secret |
| `AFRICASTALKING_WEBHOOK_SECRET` | the second random secret |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | the first admin account (password 12+ characters) |
| `RESEND_API_KEY`, `TWILIO_*`, `AFRICASTALKING_API_KEY` | your sandbox keys ([sandbox-test.md](sandbox-test.md)) |

`CHANNEL_MODE=sandbox` uses the providers' test accounts. With `mock`, nothing is sent: SMS
codes appear only in the logs and emails (such as password resets) are not delivered, because
the server has no fake inbox.

Save with **Ctrl + O**, **Enter**, then **Ctrl + X**. The file stays on the server only.

## 7. Start it

```bash
bash deploy/azure/update.sh
```

The first time takes 5–15 minutes (it builds the app). The script refuses to start while a
`CHANGE-ME` is left, and says which. When it finishes, open in your browser:

```
https://<server address>/health
```

You should see `"status":"ok"` with the database and Redis `"up"`.

Then, in `deploy/azure/.env`, delete the `ADMIN_PASSWORD` line once you can log in as the admin
(step 9), and apply it with `cd ~/kaziforce/deploy/azure && docker compose up -d`.

**Logs** (Ctrl + C to stop watching):

```bash
cd ~/kaziforce/deploy/azure
docker compose logs -f api worker
```

## 8. Vercel (the website)

1. On your laptop, **edit `frontend/vercel.json`**: replace `YOUR-SERVER.cloudapp.azure.com`
   with `<server address>`. Commit and push with GitHub Desktop.
   - Why: the website forwards `/api/...` to the server, so the login cookie belongs to the
     website's own address and browsers that block other sites' cookies (Safari, Brave) keep
     people logged in. Live alerts connect to the server directly; they log in with a token.
2. Vercel → **Add New → Project** → import the repository.
   - **Root directory:** `frontend`
   - Framework: **Vite** (install and build commands come from `vercel.json`).
   - **Environment variables:**
     - `VITE_API_URL` = `https://<server address>`
     - `VITE_SAME_ORIGIN_API` = `true`
3. **Deploy.** Your site is at `https://<project>.vercel.app`. If that differs from
   `FRONTEND_ORIGIN` / `PUBLIC_APP_URL` in `deploy/azure/.env`, fix both on the server and run:

   ```bash
   cd ~/kaziforce/deploy/azure && docker compose up -d --force-recreate api worker
   ```

The build adds a Content Security Policy to the pages that allows only your own site and your
server (`vite.config.ts`); `vercel.json` adds the other security headers.

## 9. Check that everything works

1. Open the website and create a worker account. In sandbox mode the phone code arrives as an
   SMS **in the Africa's Talking simulator** (https://simulator.africastalking.com).
2. In a private window, create an employer account, post a job in the worker's place, and send
   the worker a message: the worker's **Alerts** page updates without refreshing.
3. Log in as the admin (`ADMIN_EMAIL`): the **Overview** shows today's alerts and the queues.
4. Reload the website after 20 minutes: you should still be logged in (the cookie works).

## 10. Provider webhooks (delivery reports and STOP)

Now that the server has a public HTTPS address, providers can report back. Use `PUBLIC_API_URL`:

- **Twilio** (WhatsApp sandbox settings), **When a message comes in**:
  `https://<server address>/webhooks/twilio/inbound` (POST). Delivery reports need nothing more.
  Templates and going live: [twilio-whatsapp-templates.md](twilio-whatsapp-templates.md).
- **Africa's Talking** (SMS → Callback URLs): delivery reports
  `https://<server address>/webhooks/africastalking/<AFRICASTALKING_WEBHOOK_SECRET>/delivery`,
  opt-out `.../<AFRICASTALKING_WEBHOOK_SECRET>/optout`.
- **Resend:** verify your own domain in Resend to send from it (and to anyone, not only your own
  address), then change `EMAIL_FROM`.

The API refuses to start in sandbox or live mode if a provider key is missing, and says which.
Going live (`CHANNEL_MODE=live`) costs money per message.

## 11. Updates

1. On your laptop: commit and push with GitHub Desktop. Vercel rebuilds the website by itself.
2. On the server:

   ```bash
   cd ~/kaziforce && bash deploy/azure/update.sh
   ```

   It fetches the new code, rebuilds, runs new database migrations before the API starts, and
   restarts what changed. Migrations only ever add or change; they never run the sample-data
   seed (it refuses to run with `NODE_ENV=production`).

## 12. Watching the credit

- Azure portal → search **Education** → **Overview** shows the student credit left.
- Azure portal → **Cost Management** shows what the server costs per day. Expect the virtual
  machine, its disk and its public address; nothing else.
- To pause the cost (for example after the project), open the virtual machine → **Stop**. A
  stopped server costs only its disk (cents a day); **Start** brings it back with everything as
  it was. The address stays the same.

## 13. Idle Redis traffic (BullMQ tuning)

Redis runs on the server, so there is no limit on Redis commands. The workers are still tuned
to talk to Redis less when idle (useful if Redis is ever moved to a hosted plan with limits):

| Setting | Redis commands per minute (idle) | Per month |
| --- | ---: | ---: |
| BullMQ defaults (`drainDelay` 5 s, stalled check every 30 s) | 734 | about 31.7 million |
| Tuned (`drainDelay` 30 s, stalled check every 120 s) | 172 | about 7.4 million |

That is 77% fewer commands (measured with `backend/scripts/measure-redis-idle.mjs`). The
settings are `QUEUE_DRAIN_DELAY_SECONDS` and `QUEUE_STALLED_CHECK_SECONDS`
(`backend/.env.example`). New jobs still start at once; the longer wait only applies when there
is nothing to do. Trade-off: if the worker process crashes mid-job, that job is picked up again
after about 2 minutes instead of 30 seconds. (This is also why Upstash's free tier, 500,000
commands a month, is not used: CLAUDE.md.)

## 14. Troubleshooting

| What you see | What to do |
| --- | --- |
| `update.sh`: `still has values to fill in` | Fill in the settings it lists (step 6) |
| `/health` does not open at all | In Azure, the virtual machine → **Networking**: ports 80 and 443 must be allowed. Check `docker compose ps` shows `caddy` running. |
| Browser warns about the certificate | `API_DOMAIN` must be exactly `<server address>`; `docker compose logs caddy` says why Let's Encrypt refused |
| `migrate` exited with an error | `docker compose logs migrate`: usually `DATABASE_URL` (session pooler URI, right password) |
| API logs: `JWT_ACCESS_SECRET: Set a new random secret for production` | Make a new secret (step 6) |
| Bootstrap: `Set ADMIN_PASSWORD to a new password` | Give the first admin a 12+ character password |
| Logged out on every reload | `vercel.json` still says `YOUR-SERVER`, or `VITE_SAME_ORIGIN_API` is not `true` |
| Alerts only appear after a refresh | `VITE_API_URL` is wrong, or `FRONTEND_ORIGIN` does not match the website address |
| Everyone shares one log-in limit ("Too many tries") | `TRUST_PROXY_HOPS` must be `2` (Vercel and Caddy) |
| The first build stops with "killed" | Not enough memory: check the swap exists (`swapon --show`), or resize the server to B2s |
| SSH: `UNPROTECTED PRIVATE KEY FILE` | Run the `icacls` command in step 4 again |
| Site down after the credit ran out | Azure stopped the server. Move to another plan (for example Azure pay-as-you-go) or Oracle Cloud Always Free; the same `deploy/azure` files work on any Ubuntu server |
