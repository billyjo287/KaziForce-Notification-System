// The logged-in user's own account: profile, language, phone verification and the onboarding
// answers (PRD FR-1, FR-5; onboarding steps 2 and 3).
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { badRequest, conflict, forbidden } from '../../lib/httpError.js';
import { prisma } from '../../lib/prisma.js';
import type { RateLimiters } from '../../lib/rateLimits.js';
import { sendSms } from '../../lib/sms.js';
import { sha256, sixDigitCode } from '../../lib/tokens.js';
import { parse } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { PRESETS, channelOrderFor } from './presets.js';
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
