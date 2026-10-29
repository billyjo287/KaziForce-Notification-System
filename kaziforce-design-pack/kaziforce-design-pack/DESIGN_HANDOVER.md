# KaziForce design refresh: handover for Claude Code

This pack changes how KaziForce **looks and feels**. It must not change how it **works**.
Everything here is visual: colours, type, spacing, the new logo, dark mode, motion and friendly copy.

---

## 0. Paste this into Claude Code first

> I'm giving you a design refresh for KaziForce. Read `kaziforce-design-pack/DESIGN_HANDOVER.md` fully before touching anything.
> This is a **design-only** job. Do not change any business logic, API calls, Socket.IO events, state management, routing, data shapes, validation, the ML service, database/Prisma code or backend files. Only change styling, presentational markup, static copy, and add the presentational components from the pack.
> Start by exploring the frontend and telling me, in a short list: the framework setup (Vite/CRA/Next), Tailwind version, where global CSS is imported, and which components render the landing page, worker dashboard, employer dashboard, admin console, loading states, empty states and error pages. Then wait for my go-ahead.
> Work on a new branch called `design-refresh`, one phase at a time (section 10), and commit after each phase. After each phase, run the existing tests and the build, and show me `git diff --stat` so I can confirm only frontend presentation files changed.

---

## 1. Ground rules (read twice)

**Allowed**
- CSS, Tailwind classes, inline styles, CSS variables.
- Presentational JSX: wrappers, layout divs, icons, headings, static text.
- New files from this pack (`theme.css`, components in `components/`, brand assets).
- Replacing a spinner or "Loading..." with `<KaziLoader />` **where the existing loading condition is already true**.
- Replacing an empty list's plain text with the empty state **where the existing empty condition is already true**.

**Not allowed**
- Changing props passed to data hooks, API URLs, request bodies, socket listeners, reducers/stores, context values, route paths, auth checks or form validation.
- Renaming or moving existing components or files that other code imports.
- Removing `data-testid`, `id`, `name` or `aria-*` attributes that exist today.
- Adding new npm dependencies (everything here is plain React + CSS). If you think one is truly needed, ask first.
- Inventing data. If a design shows a number or a name, it must come from data the component already receives. If it isn't available, leave that bit out and tell me.

If a design change would need a logic change, **stop and ask** instead of doing it.

---

## 2. What's in this pack and where it goes

| Pack file | Put it at | What it is |
|---|---|---|
| `styles/theme.css` | `src/styles/theme.css` | All colour tokens (light + dark), fonts, keyframes, motion classes, reduced-motion rule. Import once at the app root, before other CSS. |
| `styles/tailwind-tokens.md` | (instructions) | How to point Tailwind at the tokens (v3 and v4 versions). |
| `components/useTheme.js` | `src/components/brand/` | Light/dark state, saved in localStorage, follows the device setting on first visit. |
| `components/ThemeToggle.jsx` | `src/components/brand/` | Sun-to-moon toggle button. |
| `components/KaziMark.jsx` | `src/components/brand/` | Inline, animatable logo mark. |
| `components/KaziLoader.jsx` | `src/components/brand/` | Loading state: hopping logo head + rotating friendly lines + skeleton rows. |
| `components/SuccessBurst.jsx` | `src/components/brand/` | Check-mark pop with a small confetti ring for big wins. |
| `components/hooks.js` | `src/components/brand/` | `useCountUp`, `useReveal`, `useCountdown` (display only). |
| `components/copy.js` | `src/components/brand/` | Every friendly line in one place, with rules on where jokes are not allowed. |
| `brand/*.svg`, `brand/*.png` | `public/brand/` | Logo files (see section 3). |

Adjust import paths to the project's structure. If the project uses TypeScript, convert the components to `.tsx` with simple prop types; don't change their behaviour.

---

## 3. Brand

### Logo
The mark is a **K that is also a person**: the stem is the body, the arms make the K and point forward, and the head is a mint dot sending out a signal (the "ping"). It says *worker + alert + forward*. In the wordmark, the dot on the **i** in "kaziforce" is the same mint dot.

| File | Use |
|---|---|
| `kaziforce-logo-light.svg` | Header/nav on light backgrounds |
| `kaziforce-logo-dark.svg` | Header/nav on dark backgrounds, footer, admin header |
| `kaziforce-mark.svg` | Square mark: small spaces, avatars, social |
| `kaziforce-mark-mono-dark.svg` | Mark on an ink tile |
| `kaziforce-wordmark-light.svg` / `-dark.svg` | Word only, when the mark is already nearby |
| `kaziforce-favicon.svg`, `favicon-32.png` | Browser tab |
| `kaziforce-app-icon-192.png`, `kaziforce-mark-512.png` | PWA manifest / app icons |

Rules: never recolour, stretch, rotate or add effects to the logo. Keep clear space around it equal to the head's diameter. Minimum height: 28px for the full logo, 20px for the mark. Swap light/dark logo files with the theme. The header logo is a link to home with `alt="KaziForce home"`.

Add to `index.html` head:
```html
<link rel="icon" type="image/svg+xml" href="/brand/kaziforce-favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png">
<link rel="apple-touch-icon" href="/brand/kaziforce-app-icon-192.png">
<meta name="theme-color" content="#F5F6FA">
```

### Colours (full list in `theme.css`)
- **Kazi Indigo** `#3B3FB6`: primary buttons, active nav, links.
- **Ping Mint** `#4FD1A5`: highlights, the "I'm hiring" button, live dots. Text on mint is always dark `#0B1A2E`.
- **Night Ink** `#14162B`: text and dark sections.
- **Paper** `#F5F6FA`: page background.
- Priority colours: Urgent (red-orange), Medium (amber), Low (grey-blue). They **never change meaning** and are **always shown with an icon + the word** (Urgent / Medium / Low), never colour alone.
  Icons: Urgent = warning triangle, Medium = circle, Low = dash, Spam = circle with a slash.

### Type
- Headings: **Bricolage Grotesque** 700–800, tight letter-spacing (-1px on big headings).
- Body/UI: **Figtree** 400–700.
- Body text minimum 16px (17px default). Buttons 16–18px bold. Our users are 18 to 80.

### Shape
Radius: buttons 12–14px, cards 18–22px, big panels 28px, pills fully round. Soft shadow only on hover (`--kf-shadow`). Touch targets at least 44px tall, main buttons 52–60px.

---

## 4. Applying the tokens

1. Import `theme.css` at the root.
2. Wire Tailwind to the tokens (`styles/tailwind-tokens.md`).
3. Replace hard-coded colours in components with tokens (`bg-kf-surface`, `text-kf-muted`, `var(--kf-primary)` ...). **Search for hex codes and Tailwind palette classes like `bg-white`, `text-gray-*`, `bg-green-*`, `bg-blue-*` and map them:**

| Old intent | Token |
|---|---|
| page background | `--kf-bg` |
| card / panel / header | `--kf-surface` |
| subtle fill, secondary button | `--kf-surface-2` |
| borders | `--kf-line` (dividers `--kf-line-soft`, outlined buttons `--kf-line-strong`) |
| main text / secondary / captions / timestamps | `--kf-text` / `--kf-text-2` / `--kf-muted` / `--kf-faint` |
| primary button bg (white text) | `--kf-primary` |
| link / accent text / icon strokes | `--kf-primary-text` |
| dark section inside a light page | `--kf-inverse` with `--kf-on-inverse` text |
| urgent / medium / low badges | `--kf-urgent-*` / `--kf-medium-*` / `--kf-low-*` |
| success message | `--kf-success-bg` + `--kf-success-fg` |

Text on `--kf-primary` stays `#FFFFFF` in both themes. In SVGs, use `stroke="currentColor"` or `style={{ stroke: 'var(--kf-primary-text)' }}`; SVG attributes don't read CSS variables directly.

---

## 5. Dark mode

- The theme is a `data-theme="light|dark"` attribute on `<html>`. `useTheme` manages it, saves to `localStorage` key `kf-theme`, and follows the device setting on the first visit.
- Put `<ThemeToggle />` in **every** top bar (landing nav, worker, employer, admin). On the admin's dark header use `<ThemeToggle onDarkHeader />`.
- When the user toggles, show a small toast at the bottom centre for 2.6s with `COPY.theme.toDark` / `COPY.theme.toLight`. If the app already has a toast system, use it; otherwise a simple fixed `role="status"` div with `.kf-rise` is fine.
- **Stop the white flash on load**: add this as the first thing inside `<head>` in `index.html`:
```html
<script>
  (function () {
    try {
      var t = localStorage.getItem('kf-theme');
      if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', t);
    } catch (e) {}
  })();
</script>
```
- Check every screen in both themes: no white boxes left behind, no dark text on dark backgrounds, charts readable.

---

## 6. Screen by screen

Keep each screen's existing data and handlers. Restyle what's there to match these specs.

### Landing page
- **Nav:** logo (left), links (How it works, Smart alerts, For workers, For employers), then theme toggle, EN/SW language button, "Log in" (outlined), "Get started" (indigo). Wraps on phones.
- **Hero:** small pill "Built for Kenya's workers and employers" with a pulsing mint dot. Big heading "Find work. / Never miss / what matters." The word **matters** gets a hand-drawn mint underline that draws in (`.kf-underline` on an SVG path). Two big buttons: "I'm looking for work" (indigo) and "I'm hiring" (mint, dark text). Three ticks below: Works on any phone · English & Kiswahili · Alerts by SMS even without data.
- **Hero visual: "the alerts sort themselves."** A dark phone-like card titled "Your alerts". In order:
  1. Cards drop in one by one (`.kf-drop`, delays .5s / .85s / 1.15s): Urgent job offer, Medium payment, Low new jobs.
  2. Each card's priority badge **stamps** on like a rubber stamp (`.kf-stamp`, ~0.5s after its card).
  3. A scam card ("Pay KES 5,000 to secure your Dubai job!") drops in with a dashed red border and a "Spam caught" stamp, then **gets swept off to the right** and collapses (`kf-sweep`).
  4. A line fades in: "3 spam messages blocked today. You're welcome." The header label switches from "Sorting…" to "Sorted for you".
  5. After that, the whole card floats gently (`.kf-float`).
  This runs once per page load. It's sample content on a marketing page, so it may be static JSX.
- **Channels strip:** In-app, SMS, WhatsApp, Email chips. On hover the icon bobs.
- **How it works:** three cards with numbered tiles; on hover the card lifts and the number tilts.
- **Smart alerts (dark section):** four cards for Urgent / Medium / Low / Spam.
- **For workers / For employers:** two big panels (soft indigo, soft amber).
- **Built for everyone:** "Easy to use, whether you're 18 or 80."
- **CTA band (indigo):** "Ready? It takes one minute to join." + `COPY.landing.ctaSub`.
- **Footer:** dark logo, `COPY.landing.footer`, link columns.
- Sections below the fold use `useReveal()` + `.kf-reveal`, so they fade up as you scroll.

### Worker dashboard
- Top bar: logo, theme toggle, bell button (count bubble pops in; the bell **wiggles every few seconds only while there are urgent alerts**), avatar + name.
- Menu: Home, Find jobs, Alerts (with "N urgent" pill), Daily summary, Payments, Alert settings. Big 52px rows. Active item is indigo.
- Greeting "Habari, {name}" + one line about what's waiting.
- **Urgent offer banner:** white card, red-orange border, slow soft pulse glow (`.kf-glow`). The deadline shows a **live countdown** (`useCountdown(deadline)`), e.g. "Urgent · reply in 1:51:48 left". Buttons Accept / Decline call the **existing** handlers.
  - After accept (when the existing state says accepted): banner turns green, check pops and draws, `COPY.success.jobAccepted`.
  - After decline: calm grey line `COPY.success.jobDeclined`.
- **Alerts inbox:** tabs All / Urgent / Medium / Low with counts; selected tab is solid ink. Cards rise in with a 70ms stagger. Each card: badge (icon + word), time, title, body, "Also sent by: SMS, WhatsApp". Hover lifts the card.
  - Empty list per tab: chai cup icon with rising steam + `COPY.empty[tab]`.
  - Bottom strip: shield icon + `COPY.spam.workerLine`.
- **Today's summary:** dark card with three rows.
- **Jobs near you:** rows with title, place · time, pay in KES, "Apply". After applying (existing state): green "Applied" pill with a drawn tick and small grey "Fingers crossed for you".

### Employer dashboard
- Top bar: logo + amber "Employer" pill, theme toggle, "Post a job" (indigo), business avatar.
- Greeting + one line.
- **Urgent strip** (glow) e.g. a cancelled shift + "Find a replacement".
  - While the existing request is in flight: radar pulse circles + `COPY.success.replacementSearching` with three bouncing dots.
  - When done: green panel `COPY.success.replacementSent`.
- **Stat cards** (Active jobs, New applicants, Shifts filled, Paid out): numbers **count up** on load with `useCountUp(value)`.
- **Your jobs** table: rows fade in with a stagger; hover tints the row; status pills (Needs worker = urgent colours, Reviewing = medium, Filled = indigo soft, Completed = low). Table scrolls sideways on phones inside its own box.
- **New applicants:** cards with initials avatar, name, rating · jobs done · distance; Accept / Decline. Results show `COPY.success.applicantAccepted` (green, drawn tick) or `applicantDeclined` (grey).

### Admin console
- Dark header (always dark) with dark logo, "Admin" pill, nav, theme toggle on the right.
- Title "System overview" + "All channels running" pill with a **live pulsing green dot** (`.kf-live`).
- KPI cards count up.
- **Notifications this week:** stacked bars grow up from the bottom one day after another (`.kf-grow`, 70ms stagger). Legend shows colour + word.
- **Delivery by channel:** progress bars fill from left (`.kf-fill`, staggered).
- **Live notifications table:** when a new row arrives over Socket.IO (existing listener, don't touch it), give that row `.kf-newrow`: it slides in and briefly glows mint, then fades to normal. Priority badges are buttons; when the admin corrects one through the existing handler, show the toast `COPY.admin.priorityCorrected`.
- **Spam review queue:** cards with message, score, reason. Confirm spam → the message gets a strikethrough + `.kf-sweep` then `COPY.spam.adminBlocked`; Not spam → `COPY.spam.adminReleased`.

### Moments (shared states)
Use these wherever the app has the matching state today:
| State | Look | Copy |
|---|---|---|
| Loading (page or panel) | `<KaziLoader />` (use `compact` inside cards) | `COPY.loading` |
| Profile created / onboarding done | `<SuccessBurst />` + title + body + "Show me jobs" | `COPY.success.profileCreated` |
| Empty inbox | chai cup with steam | `COPY.empty.*` |
| Offline (`navigator.onLine === false`, display only) | signal bars fading in sequence + "SMS alerts are on" chip | `COPY.offline` |
| 404 route | big "4 ☺ 4" where the 0 is a smiling mint dot with a ping ring | `COPY.notFound` |
| Error boundary / failed request message | warning tile that shakes once | `COPY.error` |

---

## 7. Motion rules

- **Only animate `transform` and `opacity`** (plus SVG `stroke-dashoffset` and `r`). Never animate width/height/top/left in lists.
- Durations: micro 150–250ms, entrances 450–700ms, big moments ≤ 1.3s. Easing tokens are in `theme.css`.
- Stagger lists by 60–80ms, max ~8 items (after that, no delay).
- Loops are allowed **only** for: urgent glow, bell wiggle (only while urgent > 0), live dot, logo ping, loader, chai steam. Everything else plays once.
- Nothing flashes more than 3 times a second.
- `prefers-reduced-motion: reduce` must turn all of it off (already in `theme.css`; `useCountUp` and `useReveal` respect it too). Test it: macOS/iOS "Reduce motion", Windows "Animation effects off", Android "Remove animations".
- If GSAP is already in the project you may use it for the landing hero, but CSS is enough for everything here. Don't add Three.js for this refresh.

---

## 8. Copy tone

Warm, short, a bit cheeky, very Nairobi. One playful line per screen at most. **Never joke** about failed payments, account or security problems, safety notices, or anything marked Urgent. Those stay plain. All strings live in `copy.js` so they're easy to translate to Kiswahili later; don't scatter them through components.

---

## 9. Accessibility checklist

- Text contrast 4.5:1 (3:1 for 24px+). The token pairs already meet this; don't put muted text on coloured fills.
- Every interactive thing is a real `<button>` or `<a href>`. Icon-only buttons get `aria-label`. Decorative SVGs get `aria-hidden="true"`.
- Toggles use `aria-pressed`; tabs use `role="tab"` + `aria-selected`; toasts and status panels use `role="status"`.
- Visible focus ring (mint, in `theme.css`); don't remove outlines.
- Works at 320px wide with no sideways page scroll; wide tables scroll inside their own box.

---

## 10. Phases (commit after each)

1. **Foundation:** add `theme.css`, fonts, Tailwind wiring, brand files, favicon tags, no-flash script, `useTheme` + `ThemeToggle` in all top bars. *Check:* app looks the same apart from fonts/background; toggle works; build + tests pass.
2. **Tokens everywhere:** swap hard-coded colours for tokens, screen by screen. *Check:* every screen in light and dark.
3. **Landing page** restyle + hero animation + reveal on scroll.
4. **Worker dashboard** restyle + motion + copy.
5. **Employer dashboard** restyle + motion + copy.
6. **Admin console** restyle + motion + copy.
7. **Moments:** loader, empty, success, offline, 404, error.
8. **Polish:** reduced-motion test, 320px phone test, keyboard-only test, Lighthouse accessibility ≥ 95.

After every phase show me `git diff --stat`. Only files under the frontend (`src/`, `public/`, `index.html`, Tailwind config, CSS) should appear. If anything else shows up, revert it.

## 11. Done means

- Same features, same data, same behaviour as before. All existing tests pass.
- New logo, colours and fonts everywhere; light and dark both look intentional.
- Motion feels lively but calm, and fully switches off with reduced motion.
- Friendly copy appears in the right places and never on serious messages.
