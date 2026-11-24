# ADR 0024: Log-in codes through Gmail, alerts through the channel providers

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

The project has no budget. Each SMS code costs Africa's Talking credit, Firebase phone sign-in is
billed per SMS, and Resend without an own domain emails only the account owner. Alerts on several
channels (WhatsApp, SMS, email, in-app) are the subject of the research and must stay.

## Decision

1. **`ACCOUNT_EMAIL=gmail`**: account emails (6-digit codes, password resets, new-log-in alerts) go
   through a dedicated, always-live Gmail sender (`accountEmailAdapter()` in
   `backend/src/channels/index.ts`), whatever `CHANNEL_MODE` or `MOCK_CHANNELS` say. So codes reach
   people even when the alert channels are kept in mock mode to save credit.
2. **`CODE_SMS=when-no-email`**: a log-in code goes by email whenever the account has a confirmed
   email; SMS only for phone-only accounts (`loginContact()` in `accountCodes.ts`).
3. **Google and GitHub sign-in (ADR 0022) first**: those people need no code at all.
4. **Alerts unchanged**: urgent on WhatsApp (Twilio) or SMS (Africa's Talking), medium by email
   (`EMAIL_PROVIDER=gmail` or Resend), low in-app and in the daily summary. `MOCK_CHANNELS`
   keeps a channel without credit log-only.

## Consequences

- Both settings default to the old behaviour (`channel`, `choice`), so nothing changes until set.
- Gmail allows about 500 emails a day: enough for testing and the presentation, not for a launch.
- Tests: `accountCodes.test.ts` (where codes go, Gmail settings needed).
