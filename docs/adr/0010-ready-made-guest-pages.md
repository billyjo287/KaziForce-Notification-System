# ADR 0010 — Ready-made HTML for the landing, log-in and sign-up pages

- **Status:** Accepted
- **Date:** 2026-10-03
- **Phase:** after Phase 8 (page load on slow connections)

## Context

NFR-1 asks for the largest piece of the first screen (LCP) within 2.5 s on "Fast 3G" (562 ms
per round trip, 1.4 Mbit/s). The website was drawn only by JavaScript in the browser, so a phone
showed nothing until the page, the app (about 90 KB compressed) and then the page's own code had
downloaded, in three waves. Phase 8 measured 5.2–5.4 s (ADR 0009). The pages people meet before
logging in (landing, log in, sign up) matter most: a first impression on a slow phone.

## Decisions

1. **Build-time copies, not a server.** After `vite build`, the same React components are drawn
   once in Node (`src/prerender.tsx`, `scripts/prerender.mjs`, with a stand-in browser from
   jsdom) and saved as `dist/index.html`, `login.html` and `register.html`. Every other address
   gets `dist/app.html`, the plain page (`vercel.json`). The website stays static files on
   Vercel: no rendering server to run, pay for or secure.
2. **Each copy is one self-contained download.** The styles are inside the page (no stylesheet to
   wait for: one round trip less) and the app's code sits in `<template id="kf-app">`. A small
   script at the top of the page starts it once the browser reports the page as drawn, so the
   app's code (about 180 KB) never competes with the first picture (after 3 s at the latest, for tabs opened
   in the background).
3. **The app replaces the copy, it does not "hydrate" it.** `main.tsx` waits until the page's own
   code has arrived and then swaps in the live page in one go. Hydration (reusing the HTML) would
   need the server and browser output to match exactly, which the saved language, theme and
   login make fragile. The swap is invisible because the content is identical.
4. **Nothing done early is lost** (`src/lib/prerenderTakeover.ts`, downloaded with the page's
   code so the app shell is unchanged). Typed text and choices are copied into the live form,
   the focus and the scroll position are kept, and the last button pressed (for example
   **Log in**) is pressed again. Until then a form never sends itself: a plain HTML form would
   put the password in the address bar.
5. **The copy is hidden when it would be wrong.** The copies are English, light/dark following
   the device. The script at the top of the page hides the copy (the app draws the page as
   before) for Kiswahili visitors, on the log-in and sign-up pages for browsers that are logged
   in (they are sent on), and on any address other than the one it was made for. It also applies
   a saved theme and text size before the first picture, so a dark page never flashes white.
6. **Security.** That script is the only inline script; the Content Security Policy allows it by
   its SHA-256 fingerprint, worked out at build time (`vite.config.ts`). No `'unsafe-inline'`
   for scripts.
7. **Scroll animations** only hide sections that are still below the screen, so nothing the
   person can already see blinks out when the app takes over.

## Results (Lighthouse 13.5, mobile, Fast 3G, CPU 4× slower)

| Page | Before: LCP (Chrome throttling) | After | Before: LCP (Lighthouse simulation) | After |
| --- | ---: | ---: | ---: | ---: |
| Landing | 4.14 s | **1.13 s** | 5.41 s | 4.52 s |
| Log in | 4.40 s | **1.32 s** | 5.24 s | 3.98 s |
| Sign up | 4.14 s | **1.15 s** | — | 4.01 s |

"Chrome throttling" slows every request in the browser itself (DevTools' Fast 3G). The
simulation also counts opening a new secure connection (about four round trips: 2.25 s) and
treats the font as blocking; with that model even a stripped page without the font and the app
measures 2.9 s, so no first visit can reach 2.5 s in it. Details: [accessibility.md](../accessibility.md).
The time until the page fully responds is about the same (4.2–4.4 s before, 4.3–4.5 s now, with
Chrome throttling): the gain is that people can read, and start typing, about 3 seconds earlier.

## Consequences

- The build has a second step (`vite build --ssr` + `scripts/prerender.mjs`, about 3 s). The
  three pages' components must not touch the browser while drawing (effects are fine).
- A Kiswahili visitor's first visit is as before (the app draws the page); a Kiswahili copy
  could be added the same way if needed.
- The browser tests (`e2e/prerender.spec.ts`) hold the app back and check that the pages show,
  that early typing and an early "Log in" press work, and that the copy is hidden when wrong.
