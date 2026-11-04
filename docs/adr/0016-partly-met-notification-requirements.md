# ADR 0016 — Closing the partly-met notification requirements (SRS FR-NOT)

- **Status:** Accepted
- **Date:** 2026-11-04
- **Phase:** after the design refresh, before deployment

## Context

The KaziForce platform documents (`docs/requirements/`, SRS v2 section 6.13) were checked against
the build on 4 November 2026: 24 of 38 notification requirements met, 8 partly met, 6 not met
(`docs/requirements-gap.md`). Billy asked to finish the 8 partly-met ones first. Several add
settings, which pulls against the golden rule (CLAUDE.md section 2), so each stays behind the
existing "Customise" section or on an admin page; people who only pick a preset see no change.

## Decision

1. **Mark as unread (FR-NOT-025).** A "Mark as unread" button on an open alert. The API already
   accepted `read: false` (it was used by Undo); the alert goes back to unread and the count up.
2. **Search (FR-NOT-027).** `GET /api/notifications?q=words`: every word must appear in the title
   or text, any letter case, across the whole history (not only the newest 200). The Alerts page
   has a "Search your alerts" box; the results part is downloaded only when someone types
   (app shell size, ADR 0014) and asks the server after a 300 ms pause.
3. **Summary every day, Monday or month (FR-NOT-037).** `UserPreference.summaryFrequency`
   (`daily` | `weekly` | `monthly`, default daily). The 08:00 Nairobi job still runs daily and
   picks the people whose summary is due: daily always, weekly on Mondays (last 7 days), monthly
   on the 1st (the last month). The email's words say which period it covers. The switch is now
   called "Summary email"; "How often" appears under it when it is on.
4. **Types of alerts, on/off and per channel (FR-NOT-031, FR-NOT-032).** The five notification
   categories (`new_job`, `application_update`, `new_applicant`, `message`, `announcement`) are
   the "types" people see; each side sees only its own. `UserPreference.categorySettings` (JSON,
   missing = on, every channel). Per type:
   - **Channels:** tick boxes for the person's own channels. They only *narrow* the channel
     settings (a channel switched off stays off) and are applied in the router
     (`usableChannels`), so new channels still need no router change.
   - **Off:** the alert is still saved, marked read and `Notification.mutedByPreference = true`:
     no live pop-up, no SMS/email, not in the summary. It stays findable in the list and is a
     training signal (like "Not important to me"). If reading the setting fails, the alert is
     delivered: a missed alert is worse than an unwanted one.
5. **"Always send" (FR-NOT-035).** `NotificationRule` (one row per category, `mandatory`). A
   mandatory type ignores the person's off switch and channel ticks; Settings shows it locked
   ("Always on", with the reason). The migration makes **News from KaziForce** mandatory to start.
   Admins change it on the new **Notification rules** page; every change is in the audit log.
   The worker reads the rules through a 30-second in-memory cache.
6. **Editable SMS and email wording (FR-NOT-003, FR-NOT-011).** Every SMS and email is built from
   one short summary line per category, language and urgency ("You have a new message") plus a
   tracked link. Admins edit that line on the Notification rules page, with a live SMS preview
   and the email subject. Rules (checked on the server too): 3–80 plain characters that one SMS
   can carry (no emoji or curly quotes), so the SMS stays one message, and **no placeholders**,
   so no personal details can ever reach a lost phone (CLAUDE.md decision 10). Each save is a
   new `MessageWording` row (versions are never changed, as the DDD asks for templates); the
   newest is used; "Back to the built-in wording" saves a version with no text. Every save is
   in the audit log. WhatsApp keeps Twilio's pre-approved templates, which carry the same line.
   The worker reads the wording through a 30-second cache.

## Consequences

- One migration: `20261104124748_requirement_gaps_partials` (enum `SummaryFrequency`, two
  `UserPreference` columns, `Notification.mutedByPreference`, tables `NotificationRule` and
  `MessageWording`, and the starting rule). It must be applied before deploying.
- The app shell is at 204.8 KB of the 205 KB limit (ADR 0014): the search box had to lose its
  icon. Anything else added to the Alerts page must be loaded on demand.
- An admin change reaches the worker within 30 seconds, not instantly.
- Muted alerts count as "sent" in delivery statistics but have no delivery rows.
- Tests: backend `tests/requirementGaps.test.ts` (search, summary frequency, types and channels
  in the real delivery engine and worker, rules, wording); frontend tests for each screen; the
  new admin page is in the 320 px, reduced-motion and axe checks (`e2e/polish.spec.ts`).
