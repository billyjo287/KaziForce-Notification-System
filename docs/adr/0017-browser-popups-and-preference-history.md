# ADR 0017 — Browser pop-ups (Web Push) and the history of preference changes

- **Status:** Accepted
- **Date:** 2026-11-04
- **Phase:** after ADR 0016, before deployment

## Context

After ADR 0016, six SRS notification requirements were still not met
(`docs/requirements-gap.md`): push on Android (FR-NOT-016), iOS (017) and the web (018), silent
background notifications (020), organisation-wide policies (034) and an audit history of
preference changes (038). KaziForce is one responsive website with no native app (CLAUDE.md
decision 9), and the minimal marketplace has no organisations. Billy approved one new library,
`web-push`, and chose to explain 034 in the thesis instead of building organisations.

## Decision

1. **Web Push (FR-NOT-018)** with the `web-push` library (3.6.7): it encrypts each message and
   signs it with the server's VAPID key pair, as the Web Push standard requires; writing that
   by hand would be risky. Keys come from `npm run push:keys -w backend` into `VAPID_PUBLIC_KEY`
   / `VAPID_PRIVATE_KEY` (private key never committed). Without keys pop-ups are off and the
   switch is hidden.
   - `PushSubscription` table: one row per browser (endpoint + keys), removed when the person
     switches pop-ups off or the push service answers 404/410 (SRS 6.13.3: expired device
     tokens removed automatically).
   - `PushAdapter` extends `ChannelAdapter` (CLAUDE.md decision 6), name `push`, added to the
     `Channel` enum for `DeliveryLog`. Like in-app it is not one of the ordered channels: the
     worker sends pop-ups right after the in-app alert, to every browser the person allowed.
     One `DeliveryLog` row per alert (sent if any browser accepted it).
   - Pop-ups use the browser makers' free push services, so they work in every `CHANNEL_MODE`
     (mock mode is about paid providers).
   - Switched-off alert types (ADR 0016) never pop up.
2. **No personal details on a locked screen.** The pop-up carries only the summary line an SMS
   would ("You have a new message", admin-editable, ADR 0016) and a link to the alert; details
   need the app (CLAUDE.md decision 10).
3. **Silent at night (FR-NOT-020).** During the person's quiet hours a non-urgent pop-up has
   `silent: true` (no sound or vibration). "Act now" pop-ups are normal and stay until dealt
   with. Browsers do not allow fully invisible pushes (`userVisibleOnly`), so "silent background
   notification" here means a pop-up without sound.
4. **Phones (FR-NOT-016, FR-NOT-017).** Without a native app, Android gets pop-ups through Chrome
   and other Android browsers; iPhones (iOS 16.4 or later) only after "Add to Home Screen" (the
   existing web app manifest). Settings explains this in one sentence when the browser cannot
   do pop-ups. Counted as **partly met**: real app push would need native apps (out of scope).
5. **The switch** "Pop-ups on this phone or computer" is the first item inside Customise. Each
   browser is switched on separately (`POST`/`DELETE /api/me/push`). If the person blocked
   notifications in the browser, a sentence says where to allow them.
6. **`public/sw.js`** handles only pop-ups and taps on them (open that alert, reusing an open
   tab). It caches nothing, so it can never show an old version of the site, and it is
   registered only when someone switches pop-ups on.
7. **History of preference changes (FR-NOT-038).** Every settings change (including onboarding
   choices and pop-ups on/off) is an `AuditLog` row: action `preferences.changed`, the person as
   actor and target, the change as metadata (settings only, never contact details). The admin
   sees it on that person's page; the main audit log stays admin actions only.
8. **FR-NOT-034 not built.** Organisation-wide policies need organisations, which the minimal
   marketplace leaves out (CLAUDE.md decision 9). Admin "Always send" rules (ADR 0016) already
   act as platform-wide policy. Explained in the thesis.

## Consequences

- Migration `20261104135012_web_push` (enum value `push`, table `PushSubscription`); new env
  variables in both `.env.example` files.
- Automated Chrome (Playwright) cannot subscribe to a push service, so the end-to-end pop-up is
  checked by hand in a normal browser; everything around it is tested (backend
  `tests/webPush.test.ts`: payload without personal details, silent at night, expired browsers
  removed, the API and its history; frontend `BrowserPopups.test.tsx`).
- With pop-ups, a person can get the same alert as a pop-up and by SMS/email. That is intended
  for urgent alerts; for the rest, the person can switch pop-ups off per device.
