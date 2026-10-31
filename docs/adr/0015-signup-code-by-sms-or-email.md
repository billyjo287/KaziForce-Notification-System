# ADR 0015 — Sign-up code by SMS or email; confirming the email later

- **Status:** Accepted
- **Date:** 2026-10-31
- **Phase:** design refresh (between Steps 7 and 8), extends ADR 0013

## Context

ADR 0013 sends the sign-up code by email only, and the log-in code by SMS only when the account
has a confirmed phone. Billy asked that people can choose SMS or email both when signing up and
when logging in. Many Kenyan workers check SMS more than email.

## Decision

1. **Sign-up step 5, "Where should we send your code?"** (step 6 is the code). Email (the address
   typed in step 2) is chosen already; SMS asks for a Kenyan mobile number and the same consent
   tick box as onboarding ("I agree to receive WhatsApp and SMS messages…", Kenya Data
   Protection Act 2019). Nothing is sent before "Send my code". On the code screen, an SMS
   sign-up can still switch to "Send it by email instead".
2. **The way the right code came is what is confirmed.** By email: as before. By SMS: the phone
   is saved as confirmed with the consent, and onboarding skips its phone step; the email is
   **not** confirmed yet (`User.emailVerifiedAt` is empty).
3. **No email to an unconfirmed address.** `emailVerifiedAt` defaults to the time the row is
   made, so every existing account, the seed data and email sign-ups count as confirmed. While it
   is empty: the email channel cannot be used (the router skips it, so urgent alerts go to SMS),
   no daily summary, no "new log-in" or account-deletion email, no password-reset link, and no
   log-in code by email while SMS works. A typo in the address therefore never sends someone
   else a link into the account.
4. **"Confirm your email address"** on the Home pages and in Settings: a code to the email
   (`POST /api/auth/email/send`, `/email/resend`, `/email/code`, same rules as other codes: 6
   digits, 5 minutes, 5 tries, a new one after 30 seconds). It loads only for people who need it,
   so the app shell does not grow (ADR 0014).
5. **Log-in:** an account without a confirmed phone still sees "By SMS", greyed out, with
   "Confirm a phone number in Settings to get codes by SMS", so people learn it exists. Email is
   chosen already; the code is sent when they press "Send my code".
6. With `ACCOUNT_CODES=false` (tests, load tests) the choice is shown but ignored: the account is
   made at once with a trusted email, as before.

## Consequences

- One small database change: `User.emailVerifiedAt` (migration `20261031111650_email_verified_at`).
- Someone who signed up by SMS and never confirms the email cannot reset a forgotten password by
  email. They confirm the email first (in Settings). A reset by SMS is a possible later addition.
- SMS sign-up costs one SMS per code in sandbox/live mode; mock mode prints it in the terminal.
