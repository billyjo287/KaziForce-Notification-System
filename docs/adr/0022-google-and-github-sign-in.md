# ADR 0022: "Continue with Google" and "Continue with GitHub"

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

Typing an email, a name, a password and a 6-digit code is the slowest part of joining, and many
workers already have a Google account on their Android phone. Billy asked for more ways to sign
up and log in.

## Decision

1. **OAuth 2.0 authorisation-code flow, written with `fetch`** (`backend/src/modules/auth/oauth.ts`),
   no new library. Google also uses PKCE. A random `state` is kept in Redis for 10 minutes and in
   a short `kf_oauth` cookie; both must match on the way back, and each state works once.
2. **Only a verified email is accepted** (Google `email_verified`, GitHub's primary verified
   address). A provider account is found again by its own id (`OAuthAccount` table), not by
   email. An existing KaziForce account with the same verified email is linked automatically.
3. **Sign-up needs a role.** The buttons appear on the sign-up page after "looking for work or
   hiring" is chosen. A log-in with an unknown account is sent to the sign-up page.
4. **The usual session.** Success sets the same refresh cookie as a password log-in, then
   `/oauth/done` gets the login token. No KaziForce 6-digit code is asked: the provider already
   checked the person.
5. **Behind Vercel the callback goes through the website** (`OAUTH_CALLBACK_BASE`), so the cookie
   belongs to the website, as for the password log-in (ADR 0011).
6. **Off unless configured.** `GET /api/auth/oauth/providers` lists only providers with keys; the
   pages show nothing otherwise.

## Consequences

- New table `OAuthAccount` (migration `20261123190000_oauth_accounts`).
- New settings: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`,
  `GITHUB_CLIENT_SECRET`, `OAUTH_CALLBACK_BASE` (docs/DEPLOYMENT.md section 15).
- People who join this way have no password until they use "Forgot your password?".
- More providers (for example Microsoft) need one entry in `providers` and one profile reader.
- Tests: `backend/tests/oauth.test.ts` (8, with a fake provider), `socialSignIn.test.tsx` (3).
