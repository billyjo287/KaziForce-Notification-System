# ADR 0014 — App shell size after the design refresh: 205 KB

- **Status:** Accepted
- **Date:** 2026-10-31
- **Phase:** design refresh, Step 6 (employer dashboard); raised again in Step 8 (moments)

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

## Update, Step 8 (moments): 205 KB

The shared moments every page can show (the hopping-logo loader, the chai-cup empty inbox, the
offline banner with signal bars, the "4 ☺ 4" page and the shaking error tile) add 1.3 KB to the
first visit. Measured after the change:

| First visit to | Size |
|---|---|
| /worker/home | 191.4 KB |
| /employer/home | 193.7 KB |
| /worker/alerts | 202.3 KB |
| /employer/alerts | 204.0 KB |

To keep it small, the loader's hopping logo and its lines are a separate download that uses
only React. Making the 404 page a separate download was tried and made the first visit bigger
(+0.7 KB), because it split the shared router code into extra files, so it stays in the main
file. Billy accepted a limit of **205 KB** (+2 KB, about 15 ms on "Fast 3G").

## Consequences

- CI passes again; any later growth beyond 205 KB still fails the build.
- 3 KB on a "Fast 3G" connection is about 20 ms, so the person does not notice it.
- If Alerts is reworked later, the limit should go back to 200 KB.
