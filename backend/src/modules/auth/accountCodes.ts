// 6-digit codes that confirm who it is (ACCOUNT_CODES, ADR 0013):
// - log in on a new phone or computer: after the right password, a code by SMS (verified phone
//   only) or email, the person chooses;
// - sign up: a code by email or by SMS to the phone number typed, the person chooses (ADR 0015);
// - confirm the email address later, in the app, after an SMS sign-up.
// "Remember this phone or computer for 30 days" lets that device skip the code next time.
//
// A code is valid 5 minutes, allows 5 wrong tries and can be sent again after 30 seconds (at most
// 4 times). It is kept in Redis only as a hash, under a hashed random "challenge" id that the page
// holds; nothing is logged in until the code is right.
import type { Request, Response, CookieOptions } from 'express';
import { env } from '../../config/env.js';
import type { Language } from '../../generated/prisma/client.js';
import { badRequest } from '../../lib/httpError.js';
import { logger } from '../../lib/logger.js';
import { sendEmail } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { sendSms } from '../../lib/sms.js';
import { randomToken, sha256, sixDigitCode } from '../../lib/tokens.js';

export const CODE_SECONDS = 5 * 60;
export const RESEND_SECONDS = 30;
const CODE_TRIES = 5;
const MAX_SENDS = 4;
/** Time to pick SMS or email before the first code is sent. */
const CHALLENGE_SECONDS = 10 * 60;
const DEVICE_COOKIE = 'kf_device';
export const TRUSTED_DEVICE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CodeChannel = 'sms' | 'email';
type Purpose = 'login' | 'signup' | 'email';

/** Kept in Redis while a code is being asked for. */
interface Challenge {
  purpose: Purpose;
  /** Log-in and email confirmation: whose account it is. */
  userId?: string;
  /** Sign-up: the new account, created only once the code is right (the password as a hash). */
  signup?: {
    role: 'worker' | 'business';
    name: string;
    email: string;
    passwordHash: string;
    language: Language;
    /** SMS sign-up: agreed to get SMS and WhatsApp messages (Kenya Data Protection Act). */
    consentSms?: boolean;
  };
  name: string;
  language: Language;
  /**
   * Where the code may go: a verified phone (log-in) or the number typed (sign-up), and the
   * email address (left out at log-in when it is not confirmed and a phone can be used).
   */
  phone?: string;
  email?: string;
  channel?: CodeChannel;
  codeHash?: string;
  codeExpiresAt?: number;
  lastSentAt?: number;
  sends: number;
  tries: number;
}

/** What the page shows after a code was sent. */
export interface CodeSent {
  channel: CodeChannel;
  to: string;
  expiresInSeconds: number;
  resendInSeconds: number;
  /** OTP_DEMO_MODE only: shown on screen for presentations. */
  demoCode?: string;
  /** Mock mode outside production only: lets automated tests read the code. */
  mockCode?: string;
}

const key = (challengeId: string) => `kf:account-code:${sha256(challengeId)}`;

// ---------- Email or phone number, as typed ----------

export type Identifier = { kind: 'email'; email: string } | { kind: 'phone'; phone: string };

/**
 * "wanjiru@gmail.com", "0712 345 678", "712345678", "+254 712-345-678" ... People type their
 * number in many ways; Kenyan mobile numbers become E.164 (+2547..., +2541...).
 */
export function parseIdentifier(raw: string): Identifier | null {
  const value = raw.trim();
  if (value.includes('@')) {
    const email = value.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
      ? { kind: 'email', email }
      : null;
  }
  const digits = value.replace(/[\s\-().]/g, '');
  const match = /^(?:\+?254|0)?([17]\d{8})$/.exec(digits);
  return match ? { kind: 'phone', phone: `+254${match[1]}` } : null;
}

/** The account an email or a verified phone number belongs to. */
export function findAccount(identifier: Identifier) {
  return identifier.kind === 'email'
    ? prisma.user.findUnique({ where: { email: identifier.email } })
    : prisma.user.findFirst({ where: { phone: identifier.phone, phoneVerified: true } });
}

// ---------- Masked addresses ("w•••@gmail.com", "07•• ••• 678") ----------

export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, local.length > 3 ? 2 : 1)}•••@${domain}`;
}

export function maskPhone(phone: string): string {
  return `0${phone.slice(4, 5)}•• ••• ${phone.slice(-3)}`;
}

// ---------- Challenges ----------

type NewChallenge = Pick<
  Challenge,
  'purpose' | 'userId' | 'signup' | 'name' | 'language' | 'phone' | 'email'
>;

export async function createChallenge(data: NewChallenge): Promise<string> {
  const challengeId = randomToken();
  const challenge: Challenge = { ...data, sends: 0, tries: 0 };
  await redis.set(key(challengeId), JSON.stringify(challenge), 'EX', CHALLENGE_SECONDS);
  return challengeId;
}

async function loadChallenge(challengeId: string, purpose: Purpose): Promise<Challenge> {
  const saved = await redis.get(key(challengeId));
  const challenge = saved ? (JSON.parse(saved) as Challenge) : null;
  if (!challenge || challenge.purpose !== purpose) {
    throw badRequest('login_code_expired', 'This code has expired. Start again.');
  }
  return challenge;
}

/** The ways a code can reach this person, masked, for "Where should we send your code?". */
export function codeOptions(challenge: Pick<Challenge, 'phone' | 'email'>) {
  return [
    ...(challenge.phone ? [{ channel: 'sms' as const, to: maskPhone(challenge.phone) }] : []),
    ...(challenge.email ? [{ channel: 'email' as const, to: maskEmail(challenge.email) }] : []),
  ];
}

/**
 * Sends a new code (the first one, again, or the other way). Without a channel: the same way as
 * the last one, or email.
 */
export async function sendCode(
  challengeId: string,
  purpose: Purpose,
  requested?: CodeChannel,
): Promise<CodeSent> {
  const challenge = await loadChallenge(challengeId, purpose);
  const channel = requested ?? challenge.channel ?? 'email';
  const to = channel === 'sms' ? challenge.phone : challenge.email;
  if (!to) throw badRequest('code_channel_unavailable', 'This code cannot be sent that way.');

  const now = Date.now();
  if (challenge.lastSentAt && now - challenge.lastSentAt < RESEND_SECONDS * 1000) {
    throw badRequest('code_too_soon', 'Please wait a few seconds before asking for a new code.');
  }
  if (challenge.sends >= MAX_SENDS) {
    await redis.del(key(challengeId));
    throw badRequest('login_code_expired', 'Too many codes were sent. Start again.');
  }

  const code = sixDigitCode();
  const updated: Challenge = {
    ...challenge,
    channel,
    codeHash: sha256(`${challengeId}:${code}`),
    codeExpiresAt: now + CODE_SECONDS * 1000,
    lastSentAt: now,
    sends: challenge.sends + 1,
    tries: 0,
  };
  await redis.set(key(challengeId), JSON.stringify(updated), 'EX', CODE_SECONDS);

  if (channel === 'sms') {
    sendSms(to, codeSms(code, purpose, challenge.language));
  } else {
    sendEmail({ to, ...codeEmail(challenge.name, code, purpose, challenge.language) });
  }
  if (env.OTP_DEMO_MODE)
    logger.info(
      `[demo code] ${purpose} code for ${channel === 'sms' ? maskPhone(to) : maskEmail(to)}: ${code}`,
    );

  return {
    channel,
    to: channel === 'sms' ? maskPhone(to) : maskEmail(to),
    expiresInSeconds: CODE_SECONDS,
    resendInSeconds: RESEND_SECONDS,
    ...(env.OTP_DEMO_MODE && { demoCode: code }),
    ...(env.CHANNEL_MODE === 'mock' && env.NODE_ENV !== 'production' && { mockCode: code }),
  };
}

/** Checks a code. Right: the challenge is used up and returned. Wrong: one try fewer. */
export async function checkCode(challengeId: string, purpose: Purpose, code: string) {
  const challenge = await loadChallenge(challengeId, purpose);
  if (!challenge.codeHash || !challenge.codeExpiresAt || challenge.codeExpiresAt < Date.now()) {
    throw badRequest('login_code_expired', 'This code has expired. Ask for a new one.');
  }
  if (challenge.codeHash !== sha256(`${challengeId}:${code}`)) {
    challenge.tries += 1;
    if (challenge.tries >= CODE_TRIES) {
      await redis.del(key(challengeId));
      throw badRequest('login_code_expired', 'Too many wrong codes. Start again.');
    }
    await redis.set(key(challengeId), JSON.stringify(challenge), 'KEEPTTL');
    throw badRequest('login_code_wrong', 'That code is not right. Check it and try again.');
  }
  // Used once only: a second request with the same code finds nothing.
  if ((await redis.del(key(challengeId))) === 0) {
    throw badRequest('login_code_expired', 'This code has expired. Start again.');
  }
  return challenge;
}

// ---------- Messages (no personal details beyond the first name: CLAUDE.md, decision 10) ----------

/**
 * The last line lets Android phones offer to fill the code in by themselves (the WebOTP format:
 * "@<website> #<code>"); other phones show it as plain text.
 */
function codeSms(code: string, purpose: Purpose, language: Language) {
  const site = new URL(env.PUBLIC_APP_URL).host;
  const text =
    language === 'sw'
      ? `Msimbo wako wa KaziForce ni ${code}. Unafanya kazi kwa dakika 5. Usimpe mtu yeyote.`
      : `Your KaziForce ${purpose === 'signup' ? 'sign-up' : 'log-in'} code is ${code}. It works for 5 minutes. Never share it.`;
  return `${text}\n\n@${site} #${code}`;
}

function codeEmail(name: string, code: string, purpose: Purpose, language: Language) {
  const first = name.split(' ')[0] ?? name;
  if (purpose === 'email') {
    return language === 'sw'
      ? {
          subject: `${code} ni msimbo wako wa KaziForce`,
          text: `Habari ${first},

Andika msimbo huu kwenye KaziForce kuthibitisha barua pepe yako:

${code}

Unafanya kazi kwa dakika 5. Kama hukuomba hili, puuza barua pepe hii.

KaziForce`,
        }
      : {
          subject: `${code} is your KaziForce code`,
          text: `Hello ${first},

Type this code in KaziForce to confirm your email address:

${code}

It works for 5 minutes. If you did not ask for this, ignore this email.

KaziForce`,
        };
  }
  if (language === 'sw') {
    return {
      subject: `${code} ni msimbo wako wa KaziForce`,
      text:
        purpose === 'signup'
          ? `Habari ${first},\n\nAndika msimbo huu kumaliza kufungua akaunti yako ya KaziForce:\n\n${code}\n\nUnafanya kazi kwa dakika 5. Kama hukuomba hili, puuza barua pepe hii.\n\nKaziForce`
          : `Habari ${first},\n\nAndika msimbo huu kuingia kwenye KaziForce:\n\n${code}\n\nUnafanya kazi kwa dakika 5. Usimpe mtu yeyote. Kama hukujaribu kuingia, badilisha nenosiri lako: mtu anaweza kulijua.\n\nKaziForce`,
    };
  }
  return {
    subject: `${code} is your KaziForce code`,
    text:
      purpose === 'signup'
        ? `Hello ${first},\n\nType this code to finish creating your KaziForce account:\n\n${code}\n\nIt works for 5 minutes. If you did not ask for this, ignore this email.\n\nKaziForce`
        : `Hello ${first},\n\nType this code to log in to KaziForce:\n\n${code}\n\nIt works for 5 minutes. Never share it. If you did not try to log in, change your password: someone may know it.\n\nKaziForce`,
  };
}

// ---------- "Remember this phone or computer for 30 days" ----------

const deviceCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/auth',
  maxAge: TRUSTED_DEVICE_DAYS * DAY_MS,
});

/** True when this browser was remembered for this person in the last 30 days. */
export async function isTrustedDevice(req: Request, userId: string): Promise<boolean> {
  const token: unknown = req.cookies?.[DEVICE_COOKIE];
  if (typeof token !== 'string') return false;
  const device = await prisma.trustedDevice.findUnique({ where: { tokenHash: sha256(token) } });
  return !!device && device.userId === userId && device.expiresAt > new Date();
}

export async function trustDevice(req: Request, res: Response, userId: string) {
  const token = randomToken();
  await prisma.trustedDevice.create({
    data: {
      userId,
      tokenHash: sha256(token),
      userAgent: req.get('user-agent')?.slice(0, 500),
      expiresAt: new Date(Date.now() + TRUSTED_DEVICE_DAYS * DAY_MS),
    },
  });
  res.cookie(DEVICE_COOKIE, token, deviceCookieOptions());
}

/** "Log out of all devices" and a new password: every device must use a code again. */
export function forgetDevices(userId: string) {
  return prisma.trustedDevice.deleteMany({ where: { userId } });
}
