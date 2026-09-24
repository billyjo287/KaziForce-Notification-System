# ADR 0002 — Frontend structure, design system and motion

- **Status:** Accepted
- **Date:** 2026-09-24
- **Phase:** 1 (design system, app shell and landing page)

## Context

The website must work for people aged 18 to 80 on mid-range Android phones and slow connections
(PRD sections 6 and 7, NFR-1: app shell JavaScript at most ~200 KB gzipped, Three.js never in the
app bundle). It has a public landing page and three logged-in sides (Worker, Employer, Admin).

## Decisions

1. **Visual direction "calm notice board"** (`docs/design/visual-direction.md`): warm neutrals, one
   brand green, and red / amber / slate reserved for the three priority levels. Every text colour
   pair passes WCAG 2.2 AA. Priority is always colour + icon (distinct shapes) + word.
2. **Design tokens as CSS variables** in `src/index.css`, exposed to Tailwind as utilities
   (`bg-canvas`, `text-urgent`, ...). Light and dark mode swap the variables only.
3. **Font: Atkinson Hyperlegible Next**, bundled (no Google Fonts request). Everything is sized in
   `rem`, so "Text size: Large" changes one number on `<html>`.
4. **Routes are separate downloads** (React Router `lazy`): landing page, log-in, and the logged-in
   app. Settings is its own download too, because its dropdown and switch code is not needed
   elsewhere.
5. **Motion split by job:** GSAP + ScrollTrigger only on the landing page; Motion (motion.dev) only
   in the logged-in app, loaded with `LazyMotion` so the animation engine arrives just after the
   first paint. Three.js is imported only by `heroScene.ts`, which `Hero.tsx` loads after the page
   is idle and only on capable devices.
6. **Reduced motion has two switches:** the device setting (`prefers-reduced-motion`) and the in-app
   "Reduce motion" setting. Both stop CSS transitions, Motion (`MotionConfig`), GSAP reveals and
   the 3D hero.
7. **Accessible primitives from Radix** (Dialog, Switch, Select, Toast) wrapped in our own
   components with visible labels, one line of help text, and errors written as icon + words.
8. **Mock data behind a store.** Alerts come from a small Zustand store with fake loading; Phase 3
   swaps it for the real API without changing the dashboard components.
9. **Proof, not promises:** `npm run build:report` measures each first visit and fails if Three.js
   or GSAP reaches the app bundle or the app shell exceeds 200 KB; Playwright + axe test every
   main page at 320, 360 and 1440 px in CI.

## Consequences

- A first visit to the app downloads about 171 KB of JavaScript (gzipped), under the 200 KB budget.
- The landing page stays fast on 3G: the 3D scene (about 129 KB) never blocks the first view and is
  skipped entirely for Data Saver, low-memory devices, no WebGL, or reduced motion.
- Kiswahili translations were written without a native-speaker review; they must be checked
  before user testing.
