# ADR 0006 — Channel adapters, routing and the urgent safety net

- **Status:** Accepted
- **Date:** 2026-09-29
- **Phase:** 5 (Sprint 3: multi-channel delivery)

## Context

PRD FR-4 ("first choice, with a safety net"), FR-4b (channel suggestion) and FR-7 (delivery
tracking). CLAUDE.md section 5: adapters extend one `ChannelAdapter` base class, new channels must
not change the router, exponential backoff with retries, mock mode with zero API keys, external
messages carry no personal details.

## Decisions

1. **One base class.** `ChannelAdapter` (`backend/src/channels`) has a name, a number of tries,
   `addressFor(recipient)` (the address to use, or null if this channel must not reach this
   person) and `sendWithProvider()`. Mock mode is handled once in the base class: the message is
   logged and recorded, nothing is sent (email goes to Mailpit so it can be read). Adapters:
   `InAppAdapter` (Socket.IO via Redis), `WhatsAppAdapter` (Twilio), `SmsAdapter`
   (Africa's Talking), `EmailAdapter` (Resend, or SendGrid with `EMAIL_PROVIDER=sendgrid`). All
   call the providers' HTTPS APIs directly: no SDKs, fewer dependencies.
2. **The router is a pure function** (`router.ts`) of priority, preferences, the recipient and
   the adapters, so every FR-4 rule is unit-tested without a database. A channel is usable if it
   is switched on, its threshold includes the priority, and `addressFor` returns an address
   (WhatsApp: uses WhatsApp, verified number, consent, not opted out). New channels need no
   router change.
   - URGENT: first usable channel now; the next one if still unopened after the window
     (10 minutes, or half the time left before the job deadline if shorter); "send on both" sends
     the first two at once with no escalation.
   - MEDIUM: every usable channel whose threshold includes "important" (email in the
     Recommended preset). LOW: in-app only (daily summary in Phase 6).
3. **Queues.** One BullMQ queue per external channel (`channel-whatsapp`, `channel-sms`,
   `channel-email`), job id `<notification>-<channel>` so a channel is never used twice for the
   same alert. In-app stays a direct push (fastest path, Phase 3). An `escalation` queue holds the
   delayed "escalation check".
4. **Tries.** 3 tries per channel (the first try + 2 retries), exponential backoff from
   `CHANNEL_RETRY_DELAY_MS` (2 s, 4 s). *Interpretation:* the PRD says "fails after 3 retries"
   and the requested test says "WhatsApp fails 3 times → SMS"; we chose 3 tries in total, which
   matches the test and the seed data. Errors that retrying cannot fix (invalid number, opted out,
   outside the WhatsApp 24-hour window) stop at once. One DeliveryLog row per try, with the
   provider message id or the error.
5. **Escalation.** The check runs when the window ends: if the alert is unopened (read in the app,
   a tracked-link click, or a WhatsApp "read" report) and not escalated yet, the next usable
   channel is sent and `escalatedAt` / `escalatedTo` saved. When a channel gives up (after its
   tries, or a provider later reports "failed"/"undelivered"), the next channel is tried at once.
   The window check escalates once; failures keep moving down the list so a message gets through.
6. **Tracked links** (`/o/<8 characters>`, served by the backend at `PUBLIC_API_URL`): one per
   notification and channel, 30 days. Opening one sets `clickedAt` and `openedAt` for that
   channel, then redirects to the alert in the app (login required for any detail).
7. **Texts** (`messages.ts`): "KaziForce (Urgent): You have a new message. Open: <link>", in
   English or Kiswahili. Summaries name only the kind of alert, never people, message text or job
   details. SMS text is plain GSM, at most 160 characters (tested for every category, language
   and priority). The email has one large button, tables and inline styles for Gmail on phones.
8. **Webhooks.** Twilio status callbacks and inbound messages check `X-Twilio-Signature`
   (HMAC-SHA1 of the URL and sorted fields). Africa's Talking does not sign, so its addresses
   contain a secret (`AFRICASTALKING_WEBHOOK_SECRET`). Delivered → `deliveredAt`; WhatsApp "read"
   → `openedAt`; failed → escalate. WhatsApp STOP (and ACHA / SITAKI) switches WhatsApp off
   (`whatsappOptedOutAt`), START switches it back on; an Africa's Talking opt-out switches SMS off.
9. **WhatsApp templates.** Live WhatsApp needs approved templates for business-initiated
   messages; the adapter uses them when `TWILIO_TEMPLATE_ALERT_EN/_SW` are set, otherwise plain
   text (sandbox). The templates to submit are in `docs/twilio-whatsapp-templates.md`.
10. **FR-4b suggestion** (`suggestion.ts`): over at least 5 urgent alerts opened through an outside
    channel, if one channel was opened first in at least 80% and is not the first choice, a
    one-time card in Settings asks "Make SMS your first choice?". Only "Yes" changes
    `channelOrder`; either answer sets `channelSuggestionShownAt`.
11. **Separate Redis connection for delivery.** Sharing the notification queue's connection made
    in-app alerts wait behind channel work (median 70 ms → 130 ms in the pipeline test); the
    delivery engine gets its own.
12. **Account SMS and email** (phone codes, password reset) now go through the same SMS and email
    adapters, so they work with the real providers in sandbox/live mode too.

## Measured (mock mode, pipeline test, 20 urgent alerts)

Creation → "accepted by provider" (WhatsApp): median 60 ms, 95th percentile 70–127 ms
(target: 95% within 2 s). In-app latency over 20 messages: median 70 ms.

## Deferred

Quiet hours (holding medium alerts, only urgent gets through) and the daily summary: Phase 6.
Email delivery webhooks (Resend/SendGrid events): not needed for FR-4 because email "opened"
comes from the tracked link; can be added in Phase 7 for the admin dashboard.
