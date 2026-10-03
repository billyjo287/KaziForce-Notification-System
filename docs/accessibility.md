# Accessibility and page speed (Phase 8)

Target: WCAG 2.2 level AA and the PRD's rule that a 70-year-old on a mid-range Android phone on
a slow connection can use every screen without help (PRD sections 2, 6 and NFR-4).

## What was checked

| Check | How | Result |
| --- | --- | --- |
| Automated rules (axe) | Every page, phone (360 px) and desktop (1440 px), light and dark, English and Kiswahili, in the browser tests (`frontend/e2e/*.spec.ts`) | No serious or critical problems |
| Keyboard only | `e2e/a11y.spec.ts`: log in with Tab and Enter only; "Skip to main content" appears on the first Tab and moves the focus past the menu; every focused control shows a 2-pixel (or wider) outline; open a job with Enter | Passes |
| 200% zoom | `e2e/a11y.spec.ts`: 640 CSS pixels wide (a 1280-pixel screen at 200%) with **Large** text: Alerts, Jobs, Messages, Settings and three admin pages | No sideways scrolling, every page heading visible |
| 400% zoom / smallest phones | 320 px wide (existing tests) | No sideways scrolling |
| Screen reader (what it announces) | `e2e/screen-reader.spec.ts` reads the accessibility tree: landmarks, one heading per page, names and help of every control, a polite live region for new alerts | Passes; trees reviewed by hand (below) |
| Lighthouse accessibility | Landing, log-in and Alerts pages, mobile profile | **100** on all three |

## Fixed in this pass

1. **Label in Name (WCAG 2.5.3).** The phone menu showed "5 Alerts" but announced "Alerts, 5
   unread"; people who use voice control say what they see. The count now follows the word in
   reading order (it still appears at the icon's corner) and the name is "Alerts 5 unread".
2. **Alert cards read as one long sentence.** A screen reader read "Urgent New Warehouse packers
   needed today Mwangi Logistics needs ..." without a pause. Invisible full stops now separate
   the priority, "New", the title, the text and the closing time.
3. **Console error on every page with a form:** the form-checking library tried to compile code,
   which our Content Security Policy refuses. Turned off (`src/lib/zod.ts`); Lighthouse "Best
   practices" went from 92 to 100.

## Screen reader review (accessibility tree, Alerts page)

Skip link first; a menu named "Main menu" ("Alerts 5 unread", Jobs, Messages, Settings); the
screen-colours choice and "Log out"; then the main area: one heading "Alerts", "You have 5
unread alerts.", tabs "Urgent 1 new / Important 1 new / For later 3 new", the filter buttons
with their pressed state, and the alert cards as buttons whose name starts with the priority.
New alerts are announced politely (they do not interrupt). Toasts sit in a "Notifications (F8)"
region.

**Still to do by a person** (about 15 minutes; the automated checks cannot hear what a real
screen reader says):

1. Windows: [NVDA](https://www.nvaccess.org) with Chrome. Android: TalkBack with Chrome.
2. Log in; go to Alerts with the menu; open an urgent alert; mark it "Not important to me";
   undo.
3. Settings: move SMS up with the arrow buttons; switch quiet hours on; check each switch is
   read with its help line.
4. Employer: post a job with the form only (no mouse); accept an applicant and undo.
5. Write down anything that is read in a confusing way.

## Page speed (Lighthouse 13.5, mobile emulation)

The site is served over HTTP/2 (as Vercel does) for the main numbers. "Slow 4G" is Lighthouse's
standard mobile profile (150 ms per round trip, 1.6 Mbit/s, CPU 4× slower); "Fast 3G" is the
profile named in the PRD (562 ms per round trip, 1.4 Mbit/s, CPU 4× slower).

| Page | Profile | Performance | LCP | First paint | Blocking time |
| --- | --- | ---: | ---: | ---: | ---: |
| Landing | Slow 4G | 74 | **2.35 s** | 1.69 s | 1,141 ms |
| Log in | Slow 4G | 95 | **2.41 s** | 2.11 s | 88 ms |
| Landing | Fast 3G | 47 | 5.41 s | 4.94 s | 884 ms |
| Log in | Fast 3G | 66 | 5.24 s | 4.99 s | 47 ms |
| Alerts (logged in)* | Slow 4G | 61 | 5.77 s | 3.21 s | 444 ms |

\* Measured over HTTP/1.1 (the test API cannot be called from an HTTPS page on this computer),
which is slower than production: the page needs about 30 small files, and HTTP/1.1 fetches
6 at a time. Measure it again after deploying (section below).

**Improvements made:** the log-in and sign-up pages no longer wait for the server to ask "is
this person logged in?" when the browser has never logged in (one round trip less); the main
font is requested with the page instead of after the stylesheet; the 3D hero on the landing
page now shows the still picture on 2G and 3G connections (it was downloading 130 KB and
keeping a slow phone busy for over a second).

**Not met:** the PRD target "LCP under 2.5 s on Fast 3G". The site is drawn by JavaScript in
the browser: before anything can be shown, the phone needs the page, the app and then the screen's own code (about 230 KB
compressed in all for the log-in page, in two waves of downloads). At 562 ms
per round trip, the round trips alone take about 2.8 s. Meeting it would need the first screen
sent as ready-made HTML (server-side rendering or pre-rendering the landing and log-in pages),
a bigger change than this phase; it is listed in the thesis as future work. On Lighthouse's
standard mobile profile the logged-out pages meet 2.5 s.

**After deploying**, run Google's PageSpeed Insights (https://pagespeed.web.dev) on the real
addresses (landing, log in): that measures the real Vercel servers, HTTP/2 or HTTP/3 and
compression.
