# ADR 0007 — Preferences, quiet hours, the daily summary and data retention

- **Status:** Accepted
- **Date:** 2026-09-30
- **Phase:** 6 (Sprint 4: preferences, quiet hours and the daily summary)

## Context

PRD FR-5 (preference management with presets first and details behind "Customise"), FR-8 (daily
summary at 08:00 Africa/Nairobi), NFR-2 (account deletion within 30 days, Kenya Data Protection
Act 2019) and DR-4 (keep notifications at least 90 days, remove delivery logs after 180 days,
scheduled cleanup job). CLAUDE.md decision 8: Africa/Nairobi for quiet hours and the summary.

## Decisions

1. **One settings API, one change at a time.** `GET` / `PATCH /api/me/preferences`. Every field
   is optional, so the screen saves each change at once and "Undo" simply sends the old values
   back. The preset name is never trusted from the client: it is worked out from the settings
   (`presetFor`): the preset they match exactly, or "custom". Choosing a preset and changing
   single settings in the same request is refused.
2. **UserPreferenceManager** (`backend/src/preferences`) reads preferences for the delivery engine
   from a Redis cache (`<prefix>:preferences:<userId>`, 5 minutes) and falls back to the database
   if Redis is down. Every write clears the cached copy: the settings screen, onboarding, the
   channel suggestion, and WhatsApp STOP / SMS opt-out webhooks, and account deletion. The
   5-minute lifetime bounds one rare race (the worker reads the old row just before a change and
   caches it just after the change cleared the cache).
3. **Quiet hours** are a pure function (`quietHours.ts`): "HH:MM" start and end in Nairobi time;
   the start minute is quiet, the end minute is not; start after end crosses midnight
   (22:00-06:00); start = end is refused by the API and means "never quiet" if stored. Kenya has
   no daylight saving time, so "minutes until the end" is exact. A broken stored value means no
   quiet hours (never hold a message by mistake).
4. **Holding, not dropping.** During quiet hours the router returns `heldUntil` for MEDIUM and LOW
   external sends (URGENT and its escalation always go). The alert gets
   `Notification.heldUntil` and a delayed `held.release` job (queue `held`, job id includes the
   time). At release the alert is **planned again** with the settings of that moment, so a change
   made in the night is respected (e.g. longer quiet hours hold it again). A released alert is
   skipped if it was already read in the app, or if its job deadline has passed. In-app delivery
   is never held.
5. **"Everything" means everything.** A channel set to "Everything" now also gets LOW alerts
   (in "Tell me everything", email). Phase 5 kept LOW in the app for every preset, which made the
   "Everything" option meaningless and contradicted the onboarding text "Every alert also comes
   to you by email". In the other presets nothing changes: LOW stays in the app and goes into the
   daily summary.
6. **Daily summary.** A BullMQ job scheduler (`upsertJobScheduler`, pattern `0 8 * * *`,
   tz `Africa/Nairobi`) starts `daily-summary`, which adds one `daily-summary.user` job per person
   with news (3 tries each). Job id `summary-<user>-<Nairobi date>`, so a retried run never sends
   twice. Content: LOW notifications (after admin correction) of the 24 hours before the run,
   not spam, not marked "Not important to me", grouped by category in a fixed order, newest first,
   at most 8 per group plus "and N more", each linking to the alert in the app; footer button
   "Manage your notification preferences" (`/<side>/settings#notifications`). In the person's
   language. Nobody with the setting off, a suspended account or a pending deletion gets one; no
   news, no email. Titles are shown (they can contain a job title or a sender's name): unlike SMS
   and WhatsApp, email needs the person's password to read. `npm run jobs:run -w backend --
   summary` runs it on demand for demos.
7. **Account deletion.** "Delete my account" needs the password (rate-limited like login), sets
   `deletionRequestedAt` and emails a confirmation that also warns the owner if it was not them.
   The account is deleted **14 days** later by the nightly job (at most 15 days: well inside the
   30 required), which gives a way back ("Keep my account" in Settings). While a deletion is
   pending, nothing is sent outside the app. Deleting the user row removes everything that is
   theirs through database cascades (preferences, notifications and delivery logs, jobs,
   applications, messages, sessions). Admin accounts cannot be deleted this way.
8. **Retention job** (`retention`, 03:30 Nairobi): deletes due accounts; delivery logs older than
   180 days; expired tracked links; domain events finished more than 30 days ago (their payloads
   can contain names); expired sessions and sessions revoked more than 30 days ago; used or
   expired reset links and phone codes after a day. Notifications are kept (at least 90 days is
   required, and they are the future training data; the ML export is anonymised in Phase 7).
9. **Nobody outside the app while suspended.** The delivery engine now also skips suspended
   accounts (they cannot log in to see the alert).
10. **Settings screen.** Order: where urgent alerts go (up/down buttons, not drag-only, with the
    keyboard focus following the moved channel), "I use WhatsApp", "Send urgent alerts on both"
    (with "SMS may cost more"), three presets, then "Customise" (per-channel on/off and what it
    gets, quiet hours with the phone's own time pickers, daily summary). One line of help under
    every control; each list row says why a channel would be skipped (no verified phone, replied
    STOP, switched off). Changes show at once and roll back if saving fails. Words live in
    `settingsPage.en/sw.json` and download with the Settings page.
11. **Bundle.** The app shell stays at 199.9 KB. Importing `<Skeleton>` into the new section made
    the bundler split `EmptyState` into its own file (+0.3 KB of file overhead, over budget), so
    the section draws its three grey placeholders itself.

## Deferred

- Per-user time zones: everyone is in Kenya for now (CLAUDE.md decision 8).
- Admin view of held alerts and summary counts: Phase 7 dashboard (`heldUntil` is stored).
- Names in other people's notification titles are kept after an account is deleted (e.g. "New
  message from Wanjiru" in the employer's alert list); anonymising those is a Phase 8 privacy
  pass item.
