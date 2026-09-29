# ADR 0005 — Rule-based classifier v0 behind /predict, with a Node fallback

- **Status:** Accepted
- **Date:** 2026-09-28
- **Phase:** 4 (Sprint 2: priority classification and spam detection)

## Context

PRD FR-3: every notification is scored for spam and classified URGENT / MEDIUM / LOW; spam is
blocked and kept for admin review. The models are trained later (Phase 9), so a rule-based
classifier answers now, behind the fixed `/predict` contract (PRD section 5). CLAUDE.md section 5:
the worker waits at most 500 ms for `/predict`, then uses rules in Node and records
`predictionSource = "rules_fallback"`.

## Decisions

1. **One interface, chosen by a setting.** In the ML service, `/predict` only talks to a
   `Classifier` (`app/classifiers/base.py`). `CLASSIFIER=rules` loads `RuleBasedClassifier`
   ("rules-v0"); `CLASSIFIER=trained` will load `TrainedClassifier` from `MODEL_PATH` in Phase 9
   (a documented placeholder today that refuses to start). No code outside `/ml-service` changes
   when the trained model arrives.
2. **The rules are data.** Keyword lists, weights and thresholds live in `rules_v0.json`. The
   Python classifier and the Node fallback (`backend/src/pipeline/rulesV0.ts`) are line-by-line
   ports reading the same rules; the backend keeps a copy, and a test fails if the two copies
   differ. Numbers are whole percentages so both languages compute exactly the same scores.
3. **Rules v0 (PRD section 5).**
   - Priority: URGENT for a deadline within 60 minutes (90%), an accepted application (85%), or
     urgent words in English or Kiswahili ("urgent", "today", "expires", "action required",
     "haraka", "leo", "dharura"…; 75%, +5% per extra word). Otherwise MEDIUM for messages and
     application updates, LOW for ordinary job alerts and announcements. Urgent words do not
     upgrade announcements: they go to everyone and the PRD makes them "For later".
   - Spam (score out of 100, spam at 50 or more): payment requests ("registration fee",
     "send ksh", "tuma pesa", "ada ya usajili"…) 60; scam phrases ("you have won",
     "congratulations you are hired", "umeshinda"…) 40; a shortened link 45 or another unknown
     link 35 (KaziForce links are trusted); mostly capital letters 20; "!!!" 15. Admin and system
     messages are always trusted.
   - Phrases are matched as whole words after lower-casing and replacing everything but a-z and
     0-9 with spaces, so "leo" does not match "Leonard" and "M-Pesa" matches "m pesa".
   - Our own job alerts say "Pay: KSh 1,000", so "pay ksh" is **not** a payment phrase.
4. **One set of examples for both.** `ml-service/tests/fixtures/rules_v0_examples.json` holds 28
   labelled messages (English and Kiswahili, real alert wording, fake-job scams, links). pytest
   checks the Python classifier and `/predict`; Vitest checks the Node copy gives the identical
   answer for every one. Any trained model must also get these right.
5. **Fallback.** `classify()` calls `/predict` with `AbortSignal.timeout(500 ms)` and checks the
   answer's shape; on timeout, an error status, a malformed answer or no service, it uses the
   Node rules and records `rules_fallback`. The worker logs "ML service unavailable" once per
   outage, not once per notification.
6. **Spam is blocked.** The notification gets status BLOCKED, no DeliveryLog and no live push,
   and appears in `GET /api/admin/review/spam` (admins only) with its score and the rules that
   fired. The page to release or confirm it is Phase 7.
7. **What is stored.** `predictedPriority`, `priorityConfidence`, `isSpam`, `spamScore`,
   `modelVersion`, `predictionSource` and `explanation` on every notification: the ML training
   data (CLAUDE.md section 6).
8. **Model registry.** The first time the worker sees a model version it registers it in
   `MLMetadata` and marks it active (earlier versions stay listed, inactive). The seed also
   creates rules-v0.
9. **Docker.** `npm run dev` now rebuilds the ML service image when its code changes
   (`docker compose up --build`), so the running service always matches the code.

## Measured

- `/predict` from Node to the ML service in Docker (the backend's view, 200 requests):
  p50 8 ms, p95 11 ms. From Python (`ml-service/scripts/benchmark.py`, 500 requests):
  p50 10 ms, p95 13 ms. Target: under 300 ms; the backend gives up at 500 ms.
- On Windows, Python's HTTP client took about 40 ms longer per request with "localhost" than
  with "127.0.0.1" (it tries IPv6 first); Node was not affected. The benchmark uses 127.0.0.1.

## Consequences

- Keyword rules are easy to explain in the thesis and to audit, but naive: a legitimate message
  that says "today" becomes Urgent, and a scam without the listed phrases gets through. Admin
  corrections (Phase 7) and "Not important to me" record where the rules were wrong; these are
  the training labels for Phase 9.
- Changing a rule means editing `rules_v0.json` in both places (the test enforces it) and
  updating the examples. A changed rule set should get a new version name (e.g. rules-v1).
