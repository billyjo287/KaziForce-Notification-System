# ADR 0023: Email through a Gmail account for the student deployment

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

Resend's free plan allows 100 emails a day, and without a verified domain it delivers only to the
account owner's own address, so other people could not receive sign-up and log-in codes. SMS
codes cost Africa's Talking credit, and Firebase phone sign-in is billed per SMS on the paid plan.
The project has no budget.

## Decision

1. Add `EMAIL_PROVIDER=gmail`: SMTP to `smtp.gmail.com:465` with a Gmail app password
   (`GMAIL_USER`, `GMAIL_APP_PASSWORD`). No domain is needed; a free Gmail account sends about
   500 emails a day.
2. Log-in and sign-up codes go by email by default; SMS codes stay available where credit exists.
3. "Continue with Google / GitHub" (ADR 0022) is offered first, so most people need no code.
4. Alerts keep their own channels: WhatsApp (Twilio), SMS (Africa's Talking), email (Gmail),
   in-app. `MOCK_CHANNELS` keeps a channel without credit in log-only mode.

## Consequences

- Fine for testing, the usability study and the presentation; not for a real launch (Gmail's
  daily cap and sender reputation). For production, verify a domain in Resend or SendGrid.
- The app password is a secret: only in `deploy/azure/.env`, never in Git.
