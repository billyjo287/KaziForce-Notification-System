# ADR 0012 — Checking job posts for scams, "why not important?", and demo log-in codes

- **Status:** Accepted
- **Date:** 2026-10-22
- **Phase:** after Phase 8, before deployment (requested after a manual test)

## Context

A manual test showed a scam getting through: an employer posted a **job** whose description said
"Send 500ksh to secure the Job!!!! Send money on my M-Pesa: 07…". Job alerts carry a short
summary the system writes itself ("Mwangi Logistics needs Warehouse work in Embu…"), so the
classifier never saw what the employer wrote. Chat messages were already checked, because their
text is the alert. Two presentation requests came at the same time: an optional "why?" after "Not
important to me", and a code step at log-in and sign-up (not real SMS yet).

## Decision

1. **Check the job itself when it is posted** (`jobRoutes.ts`), with the same classifier as the
   alerts (ML service, or the Node rules after 500 ms). A job that looks like a scam gets the new
   status **held**: not listed, no `job.posted` event, so no alerts. It waits in the admin's Spam
   review; "publish" announces it then, "remove" takes it down with a reason the employer sees.
   The score and reasons are kept on every job.
2. **Safety net in the worker:** a job alert is also checked against the job's title and
   description, unless an admin already published the job (`reviewedAt`). This only decides
   spam; the priority still comes from the alert itself.
3. **rules-v1:** three scam signs added to the rules (an amount to send, a phone number next to
   M-Pesa or "send" words, "secure the job" phrases). Each alone stays under the spam limit.
   rules-v0 stays registered as the measured Sprint II baseline. The new rules were *not* tuned
   on the hand-written evaluation set; the report notes the change (88.7% → 89.3% spam accuracy,
   still 0 honest messages blocked).
4. **"Why not important?"** is an optional card above the list (not a pop-up, PRD 6.8) with six
   fixed reasons and an optional note. The reason goes into the anonymised training export; the
   free-text note never does (it might name people). Undo clears both.
5. **Demo codes** (`OTP_DEMO_MODE`, default off): log-in asks for a 6-digit code after the
   password, kept in Redis only as a hash, 5 minutes, 5 tries; the sign-up phone code is also
   shown. The page shows the code in a box labelled "Demo code". The server refuses this setting
   in production, because a code shown on screen protects nothing.

## Consequences

- Posting a job waits for one classification (normally under 10 ms; at most 500 ms).
- A false alarm delays an honest job until an admin publishes it. The employer is told why.
- The real code step later only needs to send the code by SMS or email instead of returning it.
