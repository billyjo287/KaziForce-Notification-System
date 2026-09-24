import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { HttpError } from './lib/httpError.js';
import {
  createRateLimiters,
  DEFAULT_RATE_LIMITS,
  type RateLimitSettings,
} from './lib/rateLimits.js';
import { adminRoutes } from './modules/admin/adminRoutes.js';
import { authRoutes } from './modules/auth/authRoutes.js';
import { applicationRoutes, employerRoutes } from './modules/marketplace/applicationRoutes.js';
import { jobRoutes } from './modules/marketplace/jobRoutes.js';
import { lookupRoutes } from './modules/marketplace/lookupRoutes.js';
import { messageRoutes } from './modules/marketplace/messageRoutes.js';
import { meRoutes } from './modules/me/meRoutes.js';
import { notificationRoutes } from './modules/notifications/notificationRoutes.js';
import { healthRouter, type HealthCheck } from './routes/health.js';

export interface AppOptions {
  frontendOrigin: string;
  healthChecks: Record<string, HealthCheck>;
  logger?: Logger;
  /** Tests pass their own limits; each app gets its own counters. */
  rateLimits?: Partial<RateLimitSettings>;
}

/** Builds the Express app. Dependencies are passed in so tests can swap them for fakes. */
export function createApp({ frontendOrigin, healthChecks, logger, rateLimits }: AppOptions) {
  const app = express();
  const limits = createRateLimiters({ ...DEFAULT_RATE_LIMITS, ...rateLimits });

  app.set('trust proxy', 1); // Railway/Vercel put one proxy in front; needed for correct IPs
  app.use(helmet());
  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (logger) app.use(pinoHttp({ logger }));

  app.use(healthRouter(healthChecks));

  const api = Router();
  api.use('/auth', authRoutes(limits));
  api.use('/me', meRoutes(limits));
  api.use(lookupRoutes());
  api.use('/jobs', jobRoutes());
  api.use('/employer', employerRoutes());
  api.use('/applications', applicationRoutes());
  api.use('/conversations', messageRoutes());
  api.use('/notifications', notificationRoutes());
  api.use('/admin', adminRoutes());
  app.use('/api', api);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
  });

  const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({
        error: { code: error.code, message: error.message, details: error.details },
      });
      return;
    }
    // Broken JSON in the request body.
    if (error?.type === 'entity.parse.failed') {
      res
        .status(400)
        .json({ error: { code: 'invalid_input', message: 'The request was not valid.' } });
      return;
    }
    // Two requests creating the same unique thing at the same moment.
    if (error?.code === 'P2002') {
      res.status(409).json({ error: { code: 'conflict', message: 'This already exists.' } });
      return;
    }
    req.log?.error({ err: error }, 'Unhandled error');
    res.status(500).json({
      error: { code: 'server_error', message: 'Something went wrong. Please try again.' },
    });
  };
  app.use(errorHandler);

  return app;
}
