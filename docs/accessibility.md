# Accessibility and page speed (Phase 8, updated after it)

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

**Phase 8** (the website drawn only by JavaScript):

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

**Improvements made in Phase 8:** the log-in and sign-up pages no longer wait for the server to
ask "is this person logged in?" when the browser has never logged in (one round trip less); the
main font is requested with the page instead of after the stylesheet; the 3D hero on the landing
page now shows the still picture on 2G and 3G connections (it was downloading 130 KB and keeping
a slow phone busy for over a second).

**After Phase 8: ready-made pages** ([ADR 0010](adr/0010-ready-made-guest-pages.md)). The
landing, log-in and sign-up pages are now sent as finished HTML with their styles inside, and the
app downloads after the page is on screen. Fast 3G, two ways of measuring:

| Page | LCP, Chrome's own throttling: before → after | LCP, Lighthouse simulation: before → after | Performance (Chrome throttling) |
| --- | ---: | ---: | ---: |
| Landing | 4.14 s → **1.13 s** | 5.41 s → 4.52 s | 78 → 81 |
| Log in | 4.40 s → **1.32 s** | 5.24 s → 3.98 s | 76 → 86 |
| Sign up | 4.14 s → **1.15 s** | — → 4.01 s | 78 → 82 |

- **Chrome's own throttling** (`--throttling-method=devtools`, what DevTools' "Fast 3G" does):
  the browser delays every request by 562 ms and limits the speed. **The target (LCP under
  2.5 s) is met on all three pages.** It does not slow down opening the connection itself.
- **Lighthouse's simulation** (its default) adds opening a new secure connection (about four
  round trips: 2.25 s before the first byte) and counts the font as if it blocked the text
  (our font is set to show text at once in the phone's own font, then swap). Under this model
  a stripped page with no font and no app still measures **2.9 s**, so 2.5 s cannot be reached
  on a first visit by any page; ours went from 5.2–5.4 s to 4.0–4.5 s.
- **On a real phone's first visit** expect roughly the first figure plus the connection:
  about 3 s. Visits after that reuse the browser's cached files and, often, the connection.
- The time until the page fully responds is about the same as before (4.3–4.5 s with Chrome
  throttling), but people can read and start typing about 3 seconds earlier; anything typed or
  pressed meanwhile is kept.
- Lighthouse accessibility and best practices stay at 100; no layout shift (CLS 0–0.02).

**After deploying**, run Google's PageSpeed Insights (https://pagespeed.web.dev) on the real
addresses (landing, log in): that measures the real Vercel servers, HTTP/2 or HTTP/3 and
compression.
