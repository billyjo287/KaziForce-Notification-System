# ADR 0008 — Admin monitoring, spam review and the anonymised training export

- **Status:** Accepted
- **Date:** 2026-09-30
- **Phase:** 7 (Sprint 5: admin dashboard and ML-readiness)

## Context

PRD section 6 (admin pages), FR-3 (spam blocked and queued for admin review), FR-7 (delivery
success per channel, failed deliveries, queue backlog), FR-9 (corrections, anonymised CSV export,
model registry), DR-2/DR-6 (training data as CSV, pseudonymised IDs), and the employer's view of
the alerts they caused.

## Decisions

1. **Success rate per message, not per try.** The overview counts each (alert, channel) once: a
   message that failed twice and then got through counts as delivered, because retries are the
   safety net working. Rate = delivered / (delivered + failed); messages still being tried are
   shown separately, not counted as failures. Computed in SQL over `DeliveryLog`, in UTC (the
   database session runs in Nairobi time).
2. **Overview = big numbers + meters, not a colourful chart.** One meter per channel ("WhatsApp:
   90% got through", same green on a lighter green track, 5.8:1 light / 6.1:1 dark between fill
   and track) with the counts written beside it; a 24 hours / 7 days switch; the queues as a
   table (a plain list on phones, where four columns do not fit 360 px); the five latest
   failures. Every value is in words, so nothing depends on telling colours apart. "Today" starts
   at midnight in Nairobi. The page refreshes itself every 30 seconds; if Redis cannot be read,
   the queues say so and everything else still shows.
3. **Delivery log** lists every try with the alert it belongs to; filters (channel, result,
   Nairobi dates) live in the address, so Back and shared links keep them.
4. **Spam review decisions are training labels.** "Yes, it is spam" sets `correctedSpam = true`
   (stays blocked). "Not spam: deliver it" sets `correctedSpam = false`, the chosen priority
   (`correctedPriority`, only if it differs from the prediction), and queues the notification
   again with its own job id. The worker sees `correctedSpam = false` and **skips the
   classification**: otherwise the same rules would block it again. The model's original answer
   (`isSpam`, `predictedPriority`) is kept next to the correction. "Correct priority" works on
   any alert from the delivery log. Every decision records who and when (`correctedById`,
   `correctedAt`) and an AuditLog entry. A second decision on the same alert is refused (409).
5. **Announcements** show how many people the chosen audience reaches (the same rule as the
   announcement listener: active accounts not waiting for deletion), a live preview made with
   the real alert card, and ask once before sending (an announcement cannot be taken back).
6. **Model versions** list MLMetadata with the active version, how many alerts each classified,
   how many were answered by the Node fallback rules, and how many an admin corrected.
7. **Training export (CSV, one row per notification).** Columns: tokens for the notification,
   recipient and sender; roles, type, category; the scrubbed title and text; created_at,
   hour of day and weekday (Nairobi), minutes to the deadline; the classifier's answer; the
   corrections and the label to train on (correction if any, else prediction); delivery and
   interaction fields (channels sent, escalation, held for quiet hours, delivered, opened, opened
   via, clicked, dismissed, "Not important to me", failures) and `response_seconds` (first open
   minus first send).
   - **Tokens:** HMAC-SHA256 of the id with a random key made for each export and thrown away.
     The same person has the same token within one file (their history still teaches the model)
     but different tokens in the next file, and tokens cannot be reversed or joined to the
     database.
   - **Scrubbing:** every user's name, name parts of 4+ letters and company name become [NAME];
     phone numbers [PHONE]; email addresses [EMAIL]. Whole words only ("Ann" in "Annual" is
     untouched). Known limit: a person mentioned in a message who has no account is not
     removed; a Phase 8 privacy pass can add a names list if needed.
   - **Spreadsheet safety:** cells starting with = + - @ are prefixed with ' so Excel never runs
     them as formulas; a byte-order mark makes Excel read Kiswahili text correctly.
   - Streamed 500 rows at a time; each download is written to the AuditLog.
8. **Employer view.** The employer's job page shows "Who got your job alert": totals only
   (seen / delivered / sent / waiting / not delivered) with a "Seen by 8 of 12 workers" meter:
   which workers were told is their business. For people who applied, each applicant card shows
   whether they saw the employer's latest update and message.
9. **Admin home is the overview**; the phone menu shows Overview, Spam review, Users + More.
10. **Bundle.** Sharing the alert card with the admin pages split small files out of the app
    shell (+1.2 KB of file overhead). Fixes: the alert card, its badge and styles are kept in
    one small file (`alert-card` group in vite.config.ts), and the words of pages that are
    loaded on demand (landing, onboarding, profile, messages, employer) moved out of the main
    English/Kiswahili files into files that arrive with those pages. App shell: 199.5 KB.

## Deferred

- Charts over time (e.g. success rate per day): not needed for the thesis questions yet; the
  7-day switch covers "is it getting worse".
- Email delivery reports from Resend/SendGrid (ADR 0006): email "delivered" still means
  "accepted by the provider".
