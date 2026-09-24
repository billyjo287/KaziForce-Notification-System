# ADR 0003 — Accounts, sessions and domain events

- **Status:** Accepted
- **Date:** 2026-09-24
- **Phase:** 2 (accounts and the minimal marketplace)

## Context

PRD FR-1 asks for email + password accounts with bcrypt and JWT (short access token, refresh token
in an httpOnly cookie), role checks, suspension, "log out of all devices", password reset and a
new-login email. Phase 3 must turn marketplace activity into notifications without missing any.

## Decisions

1. **Two tokens.** A 15-minute JWT access token kept only in the page's memory (never
   localStorage), and a 30-day opaque refresh token in an httpOnly, SameSite=Lax cookie scoped to
   `/api/auth`. Cookie endpoints also require an `X-Requested-With: KaziForce` header, which other
   websites cannot send (CSRF protection).
2. **Sessions table, hashed and rotated.** Only the SHA-256 hash of each refresh token is stored.
   Every refresh replaces the token; if an already-replaced token is used again (after a 30-second
   grace period for two tabs refreshing at once), it was probably stolen, so every session of that
   user is ended. "Log out of all devices", a password reset and a suspension all revoke every
   session.
3. **Suspension is immediate.** The auth middleware re-reads the user on every request, so a
   suspended user is refused at once rather than when the access token expires.
4. **Admins are never created by sign-up.** The seed script creates the admin from `ADMIN_EMAIL`,
   `ADMIN_PASSWORD` and `ADMIN_NAME`.
5. **Rate limits** (express-rate-limit): 10 log-in/sign-up attempts per 15 minutes per address,
   5 password-reset requests per hour, 3 SMS codes per hour per user. Unknown emails and wrong
   passwords get the same answer and take the same time.
6. **Onboarding step 1 (worker or employer) is on the sign-up page**, so an account never exists
   without a role. Steps 2 (phone + consent + SMS code + two channel questions) and 3 (preset) can
   be skipped. In mock mode the SMS code is printed in the backend console.
7. **Domain events use an outbox table.** `job.posted`, `application.created`,
   `application.status_changed`, `message.sent` and `admin.announcement` are written to
   `DomainEvent` inside the same database transaction as the change, so an event can never be lost
   or recorded for a change that was rolled back. Phase 3 reads unprocessed events.
8. **Undo for Accept / Reject holds the event.** The status changes at once, but its event gets
   `availableAt = now + 15 s` (`STATUS_UNDO_SECONDS`). Undo inside the window restores the old
   status and cancels the event, so a worker never receives an alert that is then taken back, and
   closing the browser cannot lose the employer's decision.
9. **Admin actions are audited** in `AuditLog` in the same transaction (suspend, reactivate,
   remove job), each with a required reason.
10. **Places and skills are lookup tables** (`Location`, `Skill`, Kiswahili names for skills), so
    users pick from lists and Phase 3's simple matching ("same place or skill") is exact.

## Consequences

- Stolen refresh cookies have a short useful life and trigger a full log-out when reused.
- Every account change needs one extra database read per request (acceptable at this scale).
- The outbox needs a worker to process it (Phase 3); until then events simply accumulate.
- The first download of the app grew with TanStack Query and axios; Kiswahili, the admin "More"
  menu and toast messages are now separate downloads to keep the app shell under 200 KB.
