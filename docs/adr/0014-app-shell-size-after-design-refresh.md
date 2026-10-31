# ADR 0014 — App shell size after the design refresh: 203 KB

- **Status:** Accepted
- **Date:** 2026-10-31
- **Phase:** design refresh, Step 6 (employer dashboard)

## Context

PRD NFR-1 sets the app shell at "≤ ~200 KB gzipped" of JavaScript. The design refresh gave
workers and employers a Home page and kept the motion library for the new micro-interactions.
Each side now downloads only its own frame, and every page is its own download. Measured with
`npm run build:report`:

| First visit to | Size |
|---|---|
| /worker/home | 189.4 KB |
| /employer/home | 191.3 KB |
| /worker/alerts | 201.1 KB |
| /employer/alerts | 202.6 KB |

Everyone who logs in lands on Home (well under 200 KB). Only a direct first visit to Alerts,
for example from the link in an SMS, is 1–3 KB over. The extra is the shared animation
"elements" code, Axios and per-file overhead; removing it would mean rewriting the Alerts page
(tabs and motion), which is beyond a design-only job.

## Decision

Billy accepted the measured size: the bundle check (`frontend/scripts/bundle-report.mjs`) now
fails above **203 KB** instead of 200 KB. This stays within the PRD's "about 200 KB".

## Consequences

- CI passes again; any later growth beyond 203 KB still fails the build.
- 3 KB on a "Fast 3G" connection is about 20 ms, so the person does not notice it.
- If Alerts is reworked later, the limit should go back to 200 KB.
