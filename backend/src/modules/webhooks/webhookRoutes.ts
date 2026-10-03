// Addresses the providers call (PRD FR-4, FR-7), plus the tracked links in messages:
//
//   GET  /o/:token                                  tracked link: "opened", then to the app
//   POST /webhooks/twilio/status                    WhatsApp sent / delivered / read / failed
//   POST /webhooks/twilio/inbound                   WhatsApp replies: STOP turns WhatsApp off
//   POST /webhooks/africastalking/:secret/delivery  SMS delivery reports
//   POST /webhooks/africastalking/:secret/optout    SMS opt-outs
//
// Twilio requests are checked with their signature. Africa's Talking does not sign its requests,
// so their address contains a secret (AFRICASTALKING_WEBHOOK_SECRET) instead.
import { timingSafeEqual } from 'node:crypto';
import express, { Router, type Request } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { applyDeliveryReport, setChannelOptOut } from '../../channels/reports.js';
import { openTrackedLink } from '../../channels/trackedLinks.js';
import { isValidTwilioSignature } from '../../channels/twilioSignature.js';
import { forbidden } from '../../lib/httpError.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';

const STOP_WORDS = new Set([
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
  'CANCEL',
  'END',
  'QUIT',
  'ACHA',
  'SITAKI',
]);
const START_WORDS = new Set(['START', 'UNSTOP', 'ANZA']);

const REPLIES = {
  stop: {
    en: 'You will no longer get KaziForce messages on WhatsApp. Reply START to turn them back on.',
    sw: 'Hutapokea tena ujumbe wa KaziForce kwenye WhatsApp. Jibu ANZA kuziwasha tena.',
  },
  start: {
    en: 'KaziForce messages on WhatsApp are on again.',
    sw: 'Ujumbe wa KaziForce kwenye WhatsApp umewashwa tena.',
  },
};

const escapeXml = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

/** Rejects a request that Twilio did not sign. */
function requireTwilio(req: Request) {
  const token = env.TWILIO_AUTH_TOKEN;
  // The address Twilio called, as it sees it (behind a proxy or tunnel: PUBLIC_API_URL).
  const url = `${env.PUBLIC_API_URL.replace(/\/$/, '')}${req.originalUrl}`;
  const params = Object.fromEntries(
    Object.entries(req.body as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
  );
  if (!token || !isValidTwilioSignature(token, url, params, req.get('x-twilio-signature'))) {
    throw forbidden('invalid_signature', 'This request is not from Twilio.');
  }
  return params;
}

function requireAfricasTalkingSecret(secret: string | undefined) {
  const expected = env.AFRICASTALKING_WEBHOOK_SECRET;
  const ok =
    !!expected &&
    !!secret &&
    secret.length === expected.length &&
    timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
  if (!ok) throw forbidden('invalid_secret', 'Unknown address.');
}

/** Twilio message status -> our outcome. "sent"/"queued" add nothing to what we know. */
function twilioOutcome(status: string | undefined) {
  if (status === 'delivered') return 'delivered' as const;
  if (status === 'read') return 'read' as const;
  if (status === 'failed' || status === 'undelivered') return 'failed' as const;
  return 'accepted' as const;
}

/** Africa's Talking status -> our outcome. */
function africasTalkingOutcome(status: string | undefined) {
  if (status === 'Success') return 'delivered' as const;
  if (status === 'Failed' || status === 'Rejected') return 'failed' as const;
  return 'accepted' as const; // Sent, Submitted, Buffered: still on its way
}

// Africa's Talking form fields: checked like every other input (a repeated field would arrive
// as a list; anything unexpected is refused with 400).
const atDelivery = z.object({
  id: z.string().max(100).optional(),
  status: z.string().max(40).optional(),
  failureReason: z.string().max(200).optional(),
});
const atOptOut = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+\d{8,15}$/)
    .optional(),
});

export function linkRoutes() {
  const router = Router();
  router.get('/o/:token', async (req, res) => {
    const token = String(req.params.token).slice(0, 32);
    res.redirect(302, await openTrackedLink(prisma, token, env.PUBLIC_APP_URL));
  });
  return router;
}

export function webhookRoutes() {
  const router = Router();
  // Providers post ordinary HTML form fields.
  router.use(express.urlencoded({ extended: false, limit: '50kb' }));

  router.post('/twilio/status', async (req, res) => {
    const params = requireTwilio(req);
    const outcome = twilioOutcome(params.MessageStatus);
    if (params.MessageSid) {
      const error = params.ErrorCode
        ? `Twilio ${params.MessageStatus} (${params.ErrorCode})`
        : undefined;
      await applyDeliveryReport(prisma, params.MessageSid, outcome, error);
    }
    res.status(204).end();
  });

  router.post('/twilio/inbound', async (req, res) => {
    const params = requireTwilio(req);
    const phone = (params.From ?? '').replace(/^whatsapp:/, '');
    const word = (params.Body ?? '').trim().toUpperCase();
    let reply: string | null = null;
    if (STOP_WORDS.has(word) || START_WORDS.has(word)) {
      const optedOut = STOP_WORDS.has(word);
      const user = await setChannelOptOut(prisma, phone, 'whatsapp', optedOut);
      if (user) reply = REPLIES[optedOut ? 'stop' : 'start'][user.language];
    }
    // TwiML: an optional reply in the person's language (allowed: they just wrote to us).
    res
      .type('text/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Response>${
          reply ? `<Message>${escapeXml(reply)}</Message>` : ''
        }</Response>`,
      );
  });

  router.post('/africastalking/:secret/delivery', async (req, res) => {
    requireAfricasTalkingSecret(req.params.secret);
    const body = parse(atDelivery, req.body);
    if (body.id) {
      const outcome = africasTalkingOutcome(body.status);
      const error = body.failureReason ? `Africa's Talking: ${body.failureReason}` : undefined;
      await applyDeliveryReport(prisma, body.id, outcome, error);
    }
    res.status(204).end();
  });

  router.post('/africastalking/:secret/optout', async (req, res) => {
    requireAfricasTalkingSecret(req.params.secret);
    const phone = parse(atOptOut, req.body).phoneNumber;
    if (phone) await setChannelOptOut(prisma, phone, 'sms', true);
    res.status(204).end();
  });

  return router;
}
