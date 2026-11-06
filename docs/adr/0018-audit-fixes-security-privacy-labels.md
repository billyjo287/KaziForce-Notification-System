# ADR 0018 — Audit fixes: security, privacy notice and training labels

- **Status:** Accepted
- **Date:** 2026-11-07
- **Phase:** after deployment, before Phase 9 (model training)

## Context

A full review of the system on 6 November 2026 (`docs/requirements-gap.md`, "Billy's Touch —
System Audit") listed 28 findings. Billy asked for the five most important groups to be fixed
first:
- data that could leave the project (BT-01, BT-04);
- server-side request forgery through pop-up subscriptions (BT-05);
- the training labels (BT-13, BT-14);
- the privacy notice (BT-10);
- the usability test (BT-25).

BT-02 (the live server cannot send outside messages) needs Billy's provider accounts, so it is a
deployment step, not code.

## Decision

1. **`.gitignore`** (BT-01) now keeps out:
   - `docs/requirements/` (KaziForce's own documents, not ours to publish; the repository is
     public);
   - `docs/Write-up/` (thesis drafts);
   - every `*.pem` and `*.key` file.
2. **No personal details in logs** (BT-04):
   - `lib/mask.ts` holds the masking used on screens (`maskEmail`, `maskPhone`) and a new
     `maskAddress`;
   - outside development, mock-mode sends log a masked address and the message length, never
     the number or the text. Verification codes were visible before;
   - SMS and email failure lines mask the address;
   - the logger also redacts any `phone` and `email` field.
3. **Pop-ups only to the browsers' push services** (BT-05):
   - a subscription is accepted only for `https://` addresses on Google, Mozilla, Apple or
     Microsoft push hosts, on the default port (`channels/pushServices.ts`);
   - the worker also refuses, and deletes, any other address already saved;
   - this stops a logged-in person from making the server send requests to any address of their
     choice.
4. **Fallback answers do not change the active model** (BT-13). Only answers from the ML service
   itself register a model version as active. A timeout answered by the Node rules
   (`rules_fallback`) is counted on the notification, as before. Otherwise every slow answer
   would mark `rules-v1` active again once a trained model is live.
5. **Checked labels are told apart from guesses** (BT-14):
   - new column `Notification.priorityReviewedAt` (migration `…_priority_reviewed_at`), set
     whenever an admin chooses a priority, **including the predicted one**;
   - "checked, and the model was right" is a label too; before, only a different choice was
     saved as a priority;
   - spam was already explicit (`correctedSpam`);
   - the training export gains `priority_label_source` and `spam_label_source` (`admin` or
     `model`). Phase 9 trains on `admin` rows and hand-labelled sets only, never on the
     classifier's own answers alone.
6. **Privacy notice** (BT-10): a `/privacy` page in English and Kiswahili, as the Data Protection
   Act 2019, section 29 requires. It says:
   - what is kept and why;
   - who receives it: Twilio, Africa's Talking, Resend, browser push services, Supabase, Azure,
     Vercel;
   - that it is stored in the EU;
   - how long it is kept;
   - the person's rights, including the ODPC.

   It is linked from the first sign-up step, the landing page footer and Settings, and loads only
   when opened (the app shell stays at 202.4 KB). The contact email comes from
   `VITE_PRIVACY_EMAIL`; without one, the page says how to reach the team from an account.
7. **Outside channels are never lost half-way** (BT-06, added 7 November):
   - `Notification.dispatchedAt` is set once the WhatsApp, SMS and email jobs are planned;
   - `pipeline/dispatchSweeper.ts` (in the worker, every 30 s) plans them again for alerts that
     are SENT, not switched off, still not dispatched after 30 s, and from the last hour;
   - the job ids keep a repeat from sending twice;
   - the migration marks every existing alert as dispatched, so nothing old is sent again.
8. **Usability test kit** (BT-25): `docs/usability-test.md` (5 people, 5 tasks, SUS in English
   and Kiswahili, a results table). Billy runs it.

**Not changed:** password reset to an unconfirmed email. The audit (BT-03) said codes-off
accounts could not reset their password. That was wrong: `User.emailVerifiedAt` defaults to the
time the account is made, so those accounts count as confirmed. Only people who signed up by SMS
and never confirmed their email get no reset link. That is ADR 0015's deliberate choice (a typo
must never send someone else a way into the account), and the "Confirm your email" banner covers
it. A change made during the fixes was undone.

## Consequences

- Two small migrations (`priorityReviewedAt`, `dispatchedAt`). They run on the server by
  themselves at the next `update.sh` (the `migrate` container).
- Logs on the server are less useful for debugging a single message: use the notification id in
  the log line and look at its DeliveryLog rows instead.
- A browser whose push service is not one of the four is refused. All current browsers use one of
  them; a new one would need adding to the list.
- New tests:
  - refused push addresses (`webPush.test.ts`);
  - a priority check that agrees with the model (`admin.test.ts`);
  - the label source columns in the export;
  - a fallback leaving a trained model active (`pipeline.test.ts`);
  - the Privacy page in both languages (`PrivacyPage.test.tsx`);
  - `/privacy` in the 320 px, reduced-motion and axe browser checks.
