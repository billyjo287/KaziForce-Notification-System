# ADR 0019 — Installable app, platform policies, per-account log-in limit, summary log, data download, 12-month alerts

- **Status:** Accepted
- **Date:** 2026-11-07
- **Phase:** after ADR 0018, before Phase 9

## Context

After ADR 0018, `docs/requirements-gap.md` still had:
- three SRS requirements open: FR-NOT-016 and 017 (push for Android and iOS **applications**)
  and FR-NOT-034 (**organisation-wide** notification policies);
- audit findings BT-07, 08, 09, 11 and 12.

The SRS places FR-NOT-034 in a multi-tenant platform: many organisations, each with a tenant id
on every record. This build is one marketplace run by one organisation, KaziForce (CLAUDE.md
decision 9; see "Design differences" in the gap file). It has one responsive website and no app
store app.

## Decision

1. **Installable app** (FR-NOT-016/017):
   - The website already had a web app manifest and icons. Settings → Customise now has
     "KaziForce on your home screen":
     - one button where the browser offers installing (Chrome, Edge, Samsung Internet; kept from
       the browser's one-time `beforeinstallprompt` in `lib/installPrompt.ts`);
     - otherwise the steps in plain words (iPhone: Share, then "Add to Home Screen");
     - "installed" when it runs from the home screen.
   - Installed, KaziForce opens like an app, and its Web Push pop-ups arrive when it is closed.
     On Android, Chrome turns the install into a real app package (WebAPK). On iPhone, pop-ups
     work only from the home screen (iOS 16.4+).
   - **Accepted as met through the installable web app.** No app-store app is built; that stays
     out of scope. Be ready to explain this choice to the panel.
2. **Policies for everyone** (FR-NOT-034):
   - Organisation-wide means the one organisation, KaziForce: an admin sets a rule and it
     applies to every account, above each person's own settings.
   - The admin page "Notification rules" now starts with **For everyone**: the most SMS and
     WhatsApp messages per person per Nairobi day for alerts that are not urgent (No limit / 3 /
     5 / 10).
   - Urgent alerts always go: a missed urgent job is worse than one message too many. Above the
     limit, the alert still arrives in the app and, if chosen, by email.
   - With "Always send" (ADR 0016), there are two platform-wide policies. Each change is in the
     audit log.
   - Stored in `NotificationPolicy` (one row), and read by the worker with a 30-second cache
     (`preferences/policies.ts`, `channels/delivery.ts`).
   - Multi-tenant organisations remain out of scope (see "Design differences").
3. **Log-in limits that work behind Vercel** (BT-07):
   - Measured on the live server on 7 November: through the website every request had a fresh
     counter, because Caddy replaced the visitor's address with Vercel's, which changes each
     time. Directly, the counter went down.
   - Caddy now keeps the forwarded address (`trusted_proxies`), so each visitor counts
     separately again.
   - Because a direct caller could fake that address, a new limit counts tries **per account**
     (the email or phone typed, written one way): 10 per 15 minutes on log-in and "forgot
     password". It cannot be dodged, and it is what really stops password guessing.
   - Trade-off: someone who knows a person's email can make that account wait 15 minutes. That is
     usual and much smaller than password guessing.
4. **Summary period ends at 08:00 Nairobi** (BT-08). The clock's run covers up to 08:00 exactly,
   even if it starts late, so no alert falls between two summaries. A run asked for by hand
   (`jobs:run`, for demos) still covers up to that moment.
5. **Summary emails are recorded** (BT-09). A `SummaryLog` row per try (who, period, how many
   alerts, sent or failed), kept 180 days like delivery records. The admin overview shows how many
   were sent and failed in the last 24 hours. Diagram 4 is updated.
6. **"Download my data"** (BT-11, DPA 2019 right of access). A button in Settings downloads one
   JSON file (`GET /api/me/export`) with:
   - the account and alert settings;
   - the settings history;
   - jobs or applications, messages and alerts with their deliveries;
   - summary emails;
   - browsers with pop-ups, and remembered devices.

   It never includes the password or any token. Each download is in the audit log, and it shares
   the log-in rate limit.
7. **Alerts are deleted after 12 months** (BT-12). The nightly cleanup deletes notifications
   older than 365 days, with their delivery records and links. The Privacy page says so. Training
   uses the admin's anonymised exports, not the live rows.

## Consequences

- Two migrations: `…_summary_log` and `…_notification_policy`. They run by themselves at the next
  `update.sh`.
- **The Caddy change needs the server to pick up the new `Caddyfile`:** `update.sh` pulls it,
  and `docker compose up -d` restarts Caddy with it.
- The admin should download a training export before data is 12 months old. It is not yet a
  concern for this project.
- New tests:
  - per-account limit and its key;
  - 08:00 cutoff;
  - summary log;
  - overview tiles;
  - data download (server and button);
  - 12-month cleanup;
  - policy routes, the delivery limit and the admin control;
  - install card.
