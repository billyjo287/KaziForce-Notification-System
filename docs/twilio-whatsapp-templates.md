# WhatsApp templates to submit (Twilio + Meta)

WhatsApp only lets a business start a conversation with an **approved template**. Free text is
allowed only inside the 24-hour "customer service window" that opens when the person writes to
you. KaziForce alerts are started by us (a job, an application update), so live WhatsApp needs
templates. The Twilio **sandbox** is different: after you join it from your phone, free text works,
so development needs no templates.

## What to submit

Submit these in the Twilio Console under **Messaging > Content Template Builder**, category
**Utility** (transactional updates the person asked for, not marketing). Two templates, one per
language, with the same shape:

| Name | Language | Body | Button |
| --- | --- | --- | --- |
| `kaziforce_alert_en` | English | `KaziForce: {{1}}. Open the app to see the details.` | Call to action, "Visit website", text **Open**, dynamic URL `https://<your API domain>/o/{{2}}` |
| `kaziforce_alert_sw` | Swahili | `KaziForce: {{1}}. Fungua programu kuona maelezo.` | Call to action, "Visit website", text **Fungua**, dynamic URL `https://<your API domain>/o/{{2}}` |

Sample values to give Meta for review: `{{1}}` = "An urgent job near you" / "Kazi ya haraka
karibu nawe", `{{2}}` = `k7Qp2xZa`.

- `{{1}}` is always one of the short summaries in `backend/src/channels/messages.ts` ("You have a
  new message", "News about your job application"...). It never contains names, message text or
  job details: a lost or stolen phone reveals little (PRD FR-4).
- `{{2}}` is the tracked-link code. Opening it counts as "opened" for that alert (stopping the
  urgent escalation), then asks the person to log in and shows the alert.
- `<your API domain>` is `PUBLIC_API_URL` (the backend on Railway), because `/o/...` is served
  by the backend.

When both are approved, copy their Content SIDs (they start with `HX`) into `backend/.env`:

```
TWILIO_TEMPLATE_ALERT_EN=HX...
TWILIO_TEMPLATE_ALERT_SW=HX...
```

With these set, the WhatsApp adapter sends the template (ContentSid + the two variables) instead
of plain text. Without them it sends plain text, which works in the sandbox only.

## Setting up the sandbox (development)

1. Twilio Console > **Messaging > Try it out > Send a WhatsApp message**. From your phone, send
   the "join ..." code to the sandbox number.
2. In `backend/.env`: `CHANNEL_MODE=sandbox`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` (the sandbox number).
3. Twilio must reach your computer for delivery reports: run `ngrok http 4000` and set
   `PUBLIC_API_URL` to the ngrok address.
4. In the sandbox settings, set **"When a message comes in"** to
   `<PUBLIC_API_URL>/webhooks/twilio/inbound` (POST). That is how STOP and START arrive.

Delivery reports (`sent`, `delivered`, `read`, `failed`) go to
`<PUBLIC_API_URL>/webhooks/twilio/status`; the adapter sets this on every message. Both addresses
check Twilio's signature (`X-Twilio-Signature`), so requests from anyone else are refused.

## Opt-out (STOP)

When someone replies **STOP** (also STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, or in Kiswahili
ACHA, SITAKI), KaziForce switches WhatsApp off in their preferences, records the date
(`User.whatsappOptedOutAt`) and replies once in their language. Urgent alerts then go to their
next channel. **START** (or ANZA) switches WhatsApp back on. Meta also expects an opt-out
instruction in marketing templates; ours are utility templates, but the reply above tells people
how to stop.

## Before going live

- A WhatsApp Business sender (your own number, approved by Meta through Twilio) replaces the
  sandbox number in `TWILIO_WHATSAPP_FROM`.
- Template approval usually takes minutes to a day. A template can be rejected if the example
  values look like marketing; keep them factual as above.
- Each template message costs money (Meta's utility rate for Kenya). SMS through Africa's Talking
  is the fallback and is used first for people who do not use WhatsApp.
