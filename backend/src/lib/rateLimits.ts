import { rateLimit } from 'express-rate-limit';

export interface RateLimitSettings {
  /** Log in / register attempts per 15 minutes per address. */
  login: number;
  /** "Forgot password" requests per hour per address. */
  passwordReset: number;
  /** SMS codes per hour per user. */
  phoneCode: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitSettings = { login: 10, passwordReset: 5, phoneCode: 3 };

function limiter(limit: number, windowMs: number, keyByUser = false) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // SMS codes are counted per logged-in user; everything else per network address.
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
  };
}

export type RateLimiters = ReturnType<typeof createRateLimiters>;
