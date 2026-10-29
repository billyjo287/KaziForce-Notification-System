# ADR 0013 — Log-in codes by SMS or email, "remember this device", and step-by-step sign-in

- **Status:** Accepted
- **Date:** 2026-10-28
- **Phase:** after Phase 8, before deployment (replaces decision 5 of ADR 0012)

## Context

ADR 0012 added a demo-only code at log-in: the code was shown on screen, never sent. Billy asked
for the real thing: after the password, the person chooses to get the code **by SMS or by
email**, and a "smart" log-in and sign-up instead of the usual one-page forms, still simple
enough for someone aged 18 to 80 (CLAUDE.md, golden rule).

## Decision

1. **A code on new devices only** (`ACCOUNT_CODES`, on by default). After the right password,
   "Where should we send your code?" offers **SMS** to the verified phone (shown as
   `07•• ••• 678`) and **email** (`wa•••@gmail.com`). With no verified phone it goes straight
   to email. The code travels through the normal channel adapters: in mock mode the SMS is
   printed in the terminal and the email lands in Mailpit; in sandbox/live mode Africa's
   Talking and Resend. A code: 6 digits, 5 minutes, 5 wrong tries, a new one after 30 seconds
   (at most 4), kept in Redis only as a hash under a hashed random challenge id
   (`backend/src/modules/auth/accountCodes.ts`). No session exists until the code is right.
2. **"Remember this phone or computer for 30 days"**, ticked by default (with "do not tick on a
   shared computer"). A random token in an httpOnly cookie (`kf_device`, path `/api/auth`); only
   its hash is stored (`TrustedDevice` table). It belongs to one person. "Log out of all
   devices" and a new password delete every row, so every device needs a code again. This keeps
   the extra step rare: a person using their own phone sees it about once a month.
3. **Sign-up confirms the email with a code**, and the account is created only after it
   (the details wait in Redis with the password as a bcrypt hash). Nobody can claim someone
   else's address, and no half-made accounts are left behind. The phone keeps its own SMS code in
   onboarding, so each contact detail is proven on its own channel and can then receive codes.
4. **Email or phone number, one question at a time.** Log-in asks "Email or phone number" first
   (a confirmed phone number works like the email). If no account uses it, the page says so and
   offers "Create an account" with the email filled in, instead of a vague error after the
   password. Sign-up asks one thing per screen (GOV.UK pattern) with a step bar: role, email,
   name, password, code.
   - `POST /auth/check` answers only "exists: yes/no". Sign-up already revealed this
     (`email_taken`); it never reveals whose account it is, and has its own rate limit.
5. **Small helps that matter to older users:** "Did you mean gmail.com?" for mistyped email
   domains; password rules ticked off while typing, with easy guesses like `12345678` refused;
   one password box with **Show** instead of typing it twice; a Caps Lock warning; after two
   wrong passwords, a pointer to "Forgot your password?" (with the email carried over); the
   code box checks the code as soon as the sixth digit is typed or pasted; on Android Chrome the
   code can fill itself in from the SMS (WebOTP: the SMS ends with `@<site> #<code>`).
   Answers typed during sign-up (never the password) survive a reload.
6. **"Welcome back, Wanjiru"**: after a remembered log-in, this device keeps the first name and
   email (localStorage) and asks only for the password next time; "Not you?" and "Log out of all
   devices" forget them. The ready-made copy of the log-in page (ADR 0010) is skipped on such
   devices, because it cannot know the name.
7. **Demo mode stays** (`OTP_DEMO_MODE`): it now only *also* shows the sent code on screen, for
   presentations. Still refused in production.
8. **Tests log in with the password alone** (`ACCOUNT_CODES=false` in the backend tests, the
   browser-test server and the load test). The code steps have their own tests: backend
   `accountCodes.test.ts` (real Redis and database), frontend `auth.test.tsx`, and browser
   `auth.spec.ts` (the code screens with axe at 360 and 1440 px).

## Consequences

- One more screen on a new device; none on a remembered one.
- **Before going live with real users, Resend needs a verified domain.** Without one, Resend
  delivers only to the account owner's address, so other people could not receive an email
  code (new device or sign-up). Until then, `ACCOUNT_CODES=false` on the server keeps
  password-only log-in, or people with a verified phone choose SMS.
- SMS codes cost money on Africa's Talking live (sandbox is free); email codes are free.
- To keep the app's first download under 200 KB, the sign-in words, the job pages' words and the
  "why not important?" card now arrive with their own pages (199.7 KB).
