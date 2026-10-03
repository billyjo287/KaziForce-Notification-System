import { rateLimit } from 'express-rate-limit';

export interface RateLimitSettings {
  /** Log in / register attempts per 15 minutes per address. */
  login: number;
  /** "Forgot password" requests per hour per address. */
  passwordReset: number;
  /** SMS codes per hour per user. */
  phoneCode: number;
  // Things people create (PRD NFR-2: rate limits on create endpoints). Counted per logged-in
  // user, generous enough that nobody using the site normally ever meets them.
  /** Messages per minute per user. */
  message: number;
  /** Job applications per hour per worker. */
  apply: number;
  /** Jobs posted per hour per employer. */
  postJob: number;
  /** Announcements per hour per admin. */
  announce: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitSettings = {
  login: 10,
  passwordReset: 5,
  phoneCode: 3,
  message: 30,
  apply: 30,
  postJob: 20,
  announce: 10,
};

function limiter(limit: number, windowMs: number, keyByUser = false) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Log-in and password reset are counted per network address; the rest per logged-in user.
    ...(keyByUser && { keyGenerator: (req) => req.user?.id ?? 'anonymous' }),
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Too many tries. Please wait a few minutes and try again.',
        },
      });
    },
  });
}

/** Separate counters per app instance (tests create their own app with their own limits). */
export function createRateLimiters(settings: RateLimitSettings) {
  return {
    login: limiter(settings.login, 15 * 60 * 1000),
    passwordReset: limiter(settings.passwordReset, 60 * 60 * 1000),
    phoneCode: limiter(settings.phoneCode, 60 * 60 * 1000, true),
    message: limiter(settings.message, 60 * 1000, true),
    apply: limiter(settings.apply, 60 * 60 * 1000, true),
    postJob: limiter(settings.postJob, 60 * 60 * 1000, true),
    announce: limiter(settings.announce, 60 * 60 * 1000, true),
  };
}

export type RateLimiters = ReturnType<typeof createRateLimiters>;
