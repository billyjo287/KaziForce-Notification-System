// The logged-in user's own account: profile, language, phone verification, the onboarding
// answers, notification preferences and account deletion (PRD FR-1, FR-5, NFR-2; onboarding
// steps 2 and 3).
import bcrypt from 'bcrypt';
import { Router } from 'express';
import { z } from 'zod';
import { channelSuggestion } from '../../channels/suggestion.js';
import { env } from '../../config/env.js';
import { badRequest, conflict, forbidden } from '../../lib/httpError.js';
import { sendEmail } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import type { RateLimiters } from '../../lib/rateLimits.js';
import { sendSms } from '../../lib/sms.js';
import { sha256, sixDigitCode } from '../../lib/tokens.js';
import { parse } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { userPreferences } from '../../preferences/index.js';
import { TIME_PATTERN } from '../../preferences/quietHours.js';
import {
  normalizeChannelSettings,
  presetFor,
  toPreferences,
  type UserPreferences,
} from '../../preferences/UserPreferenceManager.js';
import { deletionDate } from '../../scheduled/retention.js';
import { deletionRequestedEmail } from './emails.js';
import { PRESETS, channelOrderFor, type ExternalChannel } from './presets.js';
import { serializeUser, userWithProfile } from './serializeUser.js';

const MAX_SKILLS = 5;
const CODE_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;

/** Kenyan mobile number in E.164: +254 then 9 digits starting with 7 or 1. */
const kenyanPhone = z.string().regex(/^\+254[17]\d{8}$/, 'Use a Kenyan mobile number');

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  locationId: z.uuid().nullable().optional(),
  skillIds: z.array(z.uuid()).max(MAX_SKILLS, `Choose at most ${MAX_SKILLS} skills`).optional(),
  companyName: z.string().trim().min(2).max(120).optional(),
});

async function sendMe(res: import('express').Response, userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: userWithProfile,
  });
  res.json({ user: serializeUser(user) });
}

// ---------- Notification preferences (FR-5) ----------

const channelName = z.enum(['whatsapp', 'sms', 'email']);
const channelSetting = z
  .object({
    enabled: z.boolean(),
    threshold: z.enum(['everything', 'urgent_and_important', 'urgent_only']),
  })
  .partial()
  .strict();
const time = z.string().regex(TIME_PATTERN, 'Use a time like 21:00');

/**
 * Every field is optional: the settings screen saves one change at a time, and "Undo" sends the
 * old values back. The preset name is never sent with settings: it is worked out from them.
 */
const preferencesSchema = z
  .object({
    channelOrder: z
      .array(channelName)
      .min(1)
      .max(3)
      .refine((list) => new Set(list).size === list.length, 'Each channel once'),
    usesWhatsApp: z.boolean(),
    urgentOnBothChannels: z.boolean(),
    preset: z.enum(['recommended', 'urgent_only', 'everything']),
    channelSettings: z
      .object({ whatsapp: channelSetting, sms: channelSetting, email: channelSetting })
      .partial()
      .strict(),
    quietHours: z
      .object({ enabled: z.boolean(), start: time, end: time })
      .strict()
      .refine((q) => q.start !== q.end, {
        message: 'The start and end must be different',
        path: ['end'],
      }),
    dailySummary: z.boolean(),
  })
  .partial()
  .strict()
  .refine(
    (input) => !input.preset || (!input.channelSettings && input.dailySummary === undefined),
    {
      message: 'Choose a preset or change single settings, not both at once',
    },
  );

const ALL_CHANNELS: ExternalChannel[] = ['whatsapp', 'sms', 'email'];

/** Every channel the person can use, once, in their order (WhatsApp only if they use it). */
function completeOrder(order: ExternalChannel[], usesWhatsApp: boolean): ExternalChannel[] {
  const allowed = ALL_CHANNELS.filter((c) => usesWhatsApp || c !== 'whatsapp');
  const kept = order.filter((c) => allowed.includes(c));
  return [...kept, ...allowed.filter((c) => !kept.includes(c))];
}

const reachSelect = {
  usesWhatsApp: true,
  phoneVerified: true,
  whatsappOptedOutAt: true,
  smsOptedOutAt: true,
} as const;

type Reach = {
  usesWhatsApp: boolean;
  phoneVerified: boolean;
  whatsappOptedOutAt: Date | null;
  smsOptedOutAt: Date | null;
};

/** What the settings screen shows: the preferences plus why a channel may not reach the person. */
function serializePreferences(preferences: UserPreferences, reach: Reach) {
  return {
    ...preferences,
    channelOrder: completeOrder(preferences.channelOrder, reach.usesWhatsApp),
    usesWhatsApp: reach.usesWhatsApp,
    phoneVerified: reach.phoneVerified,
    // Replied STOP (WhatsApp) or opted out with the network (SMS): off until switched on again.
    optedOut: { whatsapp: reach.whatsappOptedOutAt !== null, sms: reach.smsOptedOutAt !== null },
  };
}

export function meRoutes(limits: RateLimiters) {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    await sendMe(res, currentUser(req).id);
  });

  router.patch('/profile', async (req, res) => {
    const me = currentUser(req);
    const input = parse(profileSchema, req.body);
    if (input.skillIds && me.role !== 'worker') throw forbidden();
    if (input.companyName !== undefined && me.role !== 'business') throw forbidden();

    if (input.locationId) {
      const exists = await prisma.location.count({ where: { id: input.locationId } });
      if (!exists) throw badRequest('invalid_input', 'Choose a place from the list.');
    }
    if (input.skillIds?.length) {
      const found = await prisma.skill.count({ where: { id: { in: input.skillIds } } });
      if (found !== new Set(input.skillIds).size) {
        throw badRequest('invalid_input', 'Choose skills from the list.');
      }
    }

    await prisma.user.update({
      where: { id: me.id },
      data: {
        name: input.name,
        companyName: input.companyName,
        locationId: input.locationId,
        skills: input.skillIds ? { set: input.skillIds.map((id) => ({ id })) } : undefined,
      },
    });
    await sendMe(res, me.id);
  });

  router.patch('/language', async (req, res) => {
    const { language } = parse(z.object({ language: z.enum(['en', 'sw']) }), req.body);
    await prisma.user.update({ where: { id: currentUser(req).id }, data: { language } });
    await sendMe(res, currentUser(req).id);
  });

  // Onboarding step 2a: phone number + consent -> send a 6-digit code by SMS.
  router.post('/phone', limits.phoneCode, async (req, res) => {
    const me = currentUser(req);
    const input = parse(
      z.object({
        phone: kenyanPhone,
        consent: z.literal(true, { error: 'Please agree to receive messages' }),
      }),
      req.body,
    );
    const owner = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (owner && owner.id !== me.id) {
      throw conflict('phone_taken', 'This number is already used by another account.');
    }

    const code = sixDigitCode();
    await prisma.phoneVerification.create({
      data: {
        userId: me.id,
        phone: input.phone,
        codeHash: sha256(`${me.id}:${code}`),
        expiresAt: new Date(Date.now() + CODE_MINUTES * 60 * 1000),
      },
    });
    // No personal details in SMS (CLAUDE.md, decision 10).
    sendSms(input.phone, `Your KaziForce code is ${code}. It works for ${CODE_MINUTES} minutes.`);
    res.json({
      ok: true,
      // Mock mode only: lets automated tests read the code. Never sent in production.
      ...(env.CHANNEL_MODE === 'mock' && env.NODE_ENV !== 'production' && { mockCode: code }),
    });
  });

  // Onboarding step 2b: check the code; the number becomes verified and consent is recorded.
  router.post('/phone/verify', async (req, res) => {
    const me = currentUser(req);
    const { code } = parse(
      z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6 digits') }),
      req.body,
    );
    const pending = await prisma.phoneVerification.findFirst({
      where: { userId: me.id, verifiedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending || pending.expiresAt < new Date() || pending.attempts >= MAX_CODE_ATTEMPTS) {
      throw badRequest('code_expired', 'This code has expired. Ask for a new one.');
    }
    if (pending.codeHash !== sha256(`${me.id}:${code}`)) {
      await prisma.phoneVerification.update({
        where: { id: pending.id },
        data: { attempts: { increment: 1 } },
      });
      throw badRequest('code_wrong', 'That code is not right. Check the SMS and try again.');
    }
    const owner = await prisma.user.findUnique({ where: { phone: pending.phone } });
    if (owner && owner.id !== me.id) {
      throw conflict('phone_taken', 'This number is already used by another account.');
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.phoneVerification.update({ where: { id: pending.id }, data: { verifiedAt: now } }),
      prisma.user.update({
        where: { id: me.id },
        data: {
          phone: pending.phone,
          phoneVerified: true,
          consentSmsWhatsapp: true,
          consentAt: now,
        },
      }),
    ]);
    await sendMe(res, me.id);
  });

  // Onboarding step 2c: "Do you use WhatsApp on this number?" + "Where do you check messages most?"
  router.patch('/channels', async (req, res) => {
    const me = currentUser(req);
    const input = parse(
      z.object({
        usesWhatsApp: z.boolean(),
        checksMost: z.enum(['whatsapp', 'sms', 'email']),
      }),
      req.body,
    );
    await prisma.user.update({
      where: { id: me.id },
      data: {
        usesWhatsApp: input.usesWhatsApp,
        preference: {
          update: { channelOrder: channelOrderFor(input.usesWhatsApp, input.checksMost) },
        },
      },
    });
    await userPreferences.invalidate(me.id);
    await sendMe(res, me.id);
  });

  // Onboarding step 3: pick a preset. This also finishes onboarding.
  router.patch('/preset', async (req, res) => {
    const me = currentUser(req);
    const { preset } = parse(
      z.object({ preset: z.enum(['recommended', 'urgent_only', 'everything']) }),
      req.body,
    );
    await prisma.user.update({
      where: { id: me.id },
      data: {
        onboardingCompletedAt: new Date(),
        preference: {
          update: {
            preset,
            channelSettings: PRESETS[preset].channelSettings,
            dailySummary: PRESETS[preset].dailySummary,
          },
        },
      },
    });
    await userPreferences.invalidate(me.id);
    await sendMe(res, me.id);
  });

  // The notification part of Settings (FR-5).
  router.get('/preferences', async (req, res) => {
    const me = currentUser(req);
    if (me.role === 'admin') throw forbidden();
    const [preferences, reach] = await Promise.all([
      userPreferences.get(me.id),
      prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: reachSelect }),
    ]);
    res.json({ preferences: serializePreferences(preferences, reach) });
  });

  // One change (or an undo) at a time. Saved at once; the cached copy is cleared.
  router.patch('/preferences', async (req, res) => {
    const me = currentUser(req);
    if (me.role === 'admin') throw forbidden();
    const input = parse(preferencesSchema, req.body);
    const [row, reach] = await Promise.all([
      prisma.userPreference.findUniqueOrThrow({ where: { userId: me.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: reachSelect }),
    ]);
    const current = toPreferences(row);
    const usesWhatsApp = input.usesWhatsApp ?? reach.usesWhatsApp;

    // Saying "yes, I use WhatsApp" adds it at the end of the list, where the person sees it and
    // can move it up.
    const turnedOnWhatsApp = usesWhatsApp && !reach.usesWhatsApp;
    let channelOrder = completeOrder(
      current.channelOrder.filter((c) => !turnedOnWhatsApp || c !== 'whatsapp'),
      usesWhatsApp,
    );
    if (input.channelOrder) {
      if (completeOrder(input.channelOrder, usesWhatsApp).length !== input.channelOrder.length) {
        throw badRequest('invalid_input', 'Put each of your channels in the list once.');
      }
      channelOrder = completeOrder(input.channelOrder, usesWhatsApp);
    }

    let channelSettings = current.channelSettings;
    let dailySummary = input.dailySummary ?? current.dailySummary;
    if (input.preset) {
      channelSettings = PRESETS[input.preset].channelSettings;
      dailySummary = PRESETS[input.preset].dailySummary;
    }
    if (input.channelSettings) {
      channelSettings = normalizeChannelSettings(
        Object.fromEntries(
          ALL_CHANNELS.map((c) => [c, { ...channelSettings[c], ...input.channelSettings![c] }]),
        ),
      );
    }
    // Switching WhatsApp or SMS on here (logged in) is the person's own choice: it undoes a STOP.
    const switchedOn = (c: 'whatsapp' | 'sms') => input.channelSettings?.[c]?.enabled === true;

    await prisma.user.update({
      where: { id: me.id },
      data: {
        usesWhatsApp,
        ...(switchedOn('whatsapp') && { whatsappOptedOutAt: null }),
        ...(switchedOn('sms') && { smsOptedOutAt: null }),
        preference: {
          update: {
            channelOrder,
            channelSettings,
            dailySummary,
            preset: presetFor(channelSettings, dailySummary),
            urgentOnBothChannels: input.urgentOnBothChannels,
            quietHours: input.quietHours,
          },
        },
      },
    });
    await userPreferences.invalidate(me.id);

    const [preferences, updated, user] = await Promise.all([
      userPreferences.get(me.id),
      prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: reachSelect }),
      prisma.user.findUniqueOrThrow({ where: { id: me.id }, include: userWithProfile }),
    ]);
    res.json({
      preferences: serializePreferences(preferences, updated),
      user: serializeUser(user),
    });
  });

  // ---------- Account deletion (NFR-2, DR-4) ----------

  // "Delete my account": asks for the password, then the retention job deletes the account after
  // the waiting time. Until then the person can log in and cancel; nothing is sent outside the app.
  router.post('/deletion', limits.login, async (req, res) => {
    const me = currentUser(req);
    if (me.role === 'admin') throw forbidden();
    const { password } = parse(z.object({ password: z.string().min(1).max(200) }), req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw badRequest('password_wrong', 'That password is not right.');
    }
    if (!user.deletionRequestedAt) {
      const requestedAt = new Date();
      await prisma.user.update({
        where: { id: me.id },
        data: { deletionRequestedAt: requestedAt },
      });
      const side = user.role === 'business' ? 'employer' : 'worker';
      sendEmail({
        to: user.email,
        ...deletionRequestedEmail(
          user.name,
          deletionDate(requestedAt),
          `${env.PUBLIC_APP_URL}/${side}/settings`,
          user.language,
        ),
      });
    }
    await sendMe(res, me.id);
  });

  // "Keep my account": cancels the request.
  router.delete('/deletion', async (req, res) => {
    const me = currentUser(req);
    await prisma.user.update({ where: { id: me.id }, data: { deletionRequestedAt: null } });
    await sendMe(res, me.id);
  });

  // FR-4b: "You usually open SMS fastest. Make SMS your first choice?" (shown once).
  router.get('/channel-suggestion', async (req, res) => {
    res.json({ suggestion: await channelSuggestion(prisma, currentUser(req).id) });
  });

  // The person's answer. Only "yes" changes the channel order; either answer hides it for good.
  router.post('/channel-suggestion', async (req, res) => {
    const me = currentUser(req);
    const { accept } = parse(z.object({ accept: z.boolean() }), req.body);
    const suggestion = await channelSuggestion(prisma, me.id);
    if (!suggestion) throw conflict('no_suggestion', 'There is no suggestion to answer.');
    const preference = await prisma.userPreference.findUniqueOrThrow({ where: { userId: me.id } });
    await userPreferences.update(me.id, {
      channelSuggestionShownAt: new Date(),
      ...(accept && {
        channelOrder: [
          suggestion.channel,
          ...preference.channelOrder.filter((c) => c !== suggestion.channel),
        ],
      }),
    });
    await sendMe(res, me.id);
  });

  // "Skip for now": finish onboarding with the recommended settings already in place.
  router.post('/onboarding/finish', async (req, res) => {
    const me = currentUser(req);
    await prisma.user.update({
      where: { id: me.id },
      data: { onboardingCompletedAt: new Date() },
    });
    await sendMe(res, me.id);
  });

  return router;
}
