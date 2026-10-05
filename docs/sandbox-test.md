# Trying real WhatsApp, SMS and email on your computer (sandbox)

`CHANNEL_MODE=sandbox` sends through the providers' free test accounts instead of only logging.
About 20 minutes. You need: your Twilio, Africa's Talking and Resend accounts, your phone with
WhatsApp, and the email address you used to sign up to Resend.

## 1. Collect the keys

- **Twilio (WhatsApp).** Console home page: copy the **Account SID** and **Auth Token**. Then
  **Messaging > Try it out > Send a WhatsApp message**: from your phone, send the "join ..." code
  shown there to **+1 415 523 8886**. Only phones that joined can receive sandbox messages.
- **Africa's Talking (SMS).** Log in, open the **Sandbox** app, then **Settings > API Key** and
  create a key. The username stays `sandbox`. Sandbox SMS do **not** reach real phones: they
  appear in the simulator at https://simulator.africastalking.com. Open it and enter your phone
  number (+2547...).
- **Resend (email).** **API Keys > Create API key** (sending access). Until you add your own
  domain, Resend only sends **from** `onboarding@resend.dev` and only **to** the email address of
  your Resend account.

## 2. Put them in `backend/.env`

Open `backend/.env` (your private copy; it is never committed, and it must not appear as a
change in GitHub Desktop) and set:

```
CHANNEL_MODE=sandbox
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
AFRICASTALKING_USERNAME=sandbox
AFRICASTALKING_API_KEY=...
AFRICASTALKING_WEBHOOK_SECRET=...
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
EMAIL_FROM="KaziForce <onboarding@resend.dev>"
```

`AFRICASTALKING_WEBHOOK_SECRET` is any long random text; to make one, run
`node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.

Stop `npm run dev` (Ctrl + C) and start it again. If a key is missing, the `api` lines say
which one.

## 3. An account that can receive messages

1. http://localhost:5173 > **Create an account** > "I'm looking for work", with **your Resend
   email address**.
2. The next steps ask for your phone number: enter your WhatsApp number, tick the agreement,
   answer **Yes** to "Do you use WhatsApp on this number?". The code arrives as an SMS **in the
   Africa's Talking simulator**. Choose a place and a skill.

## 4. Send yourself alerts

In a private window, log in as `employer1@example.com` (password `Password123!`) and **Post a
job** in your place and skill, with **Urgent: yes**.

- **WhatsApp:** within seconds your phone gets "KaziForce (Urgent): ... Open: ...".
- **In the app:** the alert appears on your Alerts page at the same time.
- **SMS:** in Settings > Notifications, move SMS above WhatsApp, then post another urgent job.
  The SMS appears in the simulator.
- **Email:** apply for the job as yourself; as the employer, accept the application. The
  "Your application was accepted" email arrives in your inbox (an Important alert).
- **Admin > Delivery logs** shows each try as *Sent*.

The link in the message points to `localhost`, so it only opens on this computer.

## 5. Optional: delivery reports and STOP

Providers can only report "delivered" and "read", or pass on a STOP reply, if they can reach your
computer. Run `ngrok http 4000` (https://ngrok.com, free) and set `PUBLIC_API_URL` in
`backend/.env` to the address it shows. Then:

- Twilio sandbox settings, **When a message comes in**: `<PUBLIC_API_URL>/webhooks/twilio/inbound`
  (POST). Delivery reports need nothing more: every message asks for them.
- Africa's Talking sandbox, **SMS > Callback URLs > Delivery reports**:
  `<PUBLIC_API_URL>/webhooks/africastalking/<your secret>/delivery`.

Without ngrok, messages still go out; they just stay at *Sent*.

## Good to know

- The sample people (`...@example.com`) cannot receive email from Resend's test sender: their
  emails show as *Failed* in the delivery logs. That is expected in sandbox mode.
- The Twilio sandbox forgets your phone after 72 hours: send the "join ..." code again.
- Back to logging only: `CHANNEL_MODE=mock`, then restart.
- Going live (your own domain, an approved WhatsApp number and templates): see
  [DEPLOYMENT.md](DEPLOYMENT.md), section 6, and
  [twilio-whatsapp-templates.md](twilio-whatsapp-templates.md).
