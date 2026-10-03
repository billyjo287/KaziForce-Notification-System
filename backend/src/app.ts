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
import { monitoringRoutes } from './modules/admin/monitoringRoutes.js';
import { reviewRoutes } from './modules/admin/reviewRoutes.js';
import { authRoutes } from './modules/auth/authRoutes.js';
import { applicationRoutes, employerRoutes } from './modules/marketplace/applicationRoutes.js';
import { jobRoutes } from './modules/marketplace/jobRoutes.js';
import { lookupRoutes } from './modules/marketplace/lookupRoutes.js';
import { messageRoutes } from './modules/marketplace/messageRoutes.js';
import { meRoutes } from './modules/me/meRoutes.js';
import { notificationRoutes } from './modules/notifications/notificationRoutes.js';
import { linkRoutes, webhookRoutes } from './modules/webhooks/webhookRoutes.js';
import { healthRouter, type HealthCheck } from './routes/health.js';

export interface AppOptions {
  frontendOrigin: string;
  healthChecks: Record<string, HealthCheck>;
  logger?: Logger;
  /** Tests pass their own limits; each app gets its own counters. */
  rateLimits?: Partial<RateLimitSettings>;
  trustProxyHops?: number;
}

/** An address without its secret parts, for the logs. */
export function safeUrl(url: string) {
  return url
    .replace(/(\/webhooks\/africastalking\/)[^/?]+/, '$1[hidden]')
    .replace(/^(\/o\/)[^/?]+/, '$1[hidden]')
    .replace(/([?&](token|code)=)[^&]+/g, '$1[hidden]');
}

/** Builds the Express app. Dependencies are passed in so tests can swap them for fakes. */
export function createApp({
  frontendOrigin,
  healthChecks,
  logger,
  rateLimits,
  trustProxyHops = 1,
}: AppOptions) {
  const app = express();
  const limits = createRateLimiters({ ...DEFAULT_RATE_LIMITS, ...rateLimits });

  // How many proxies stand between the visitor and us (Railway's edge = 1; Vercel forwarding
  // /api to Railway = 2). Needed to see each visitor's real address for the rate limits.
  app.set('trust proxy', trustProxyHops);
  app.use(helmet());
  app.use(
    cors({
      origin: frontendOrigin,
      credentials: true,
      // Lets the website read a download's file name (the admin's training data CSV).
      exposedHeaders: ['Content-Disposition'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (logger) {
    app.use(
      pinoHttp({
        logger,
        // Health checks come every few seconds from the host: not worth a log line each.
        autoLogging: { ignore: (req) => req.url === '/health' },
        // Only what helps to find a problem: no headers (login tokens, cookies) and no secrets
        // in addresses (the Africa's Talking webhook path contains one; tracked-link codes).
        serializers: {
          req: (req: { id: unknown; method: string; url: string }) => ({
            id: req.id,
            method: req.method,
            url: safeUrl(req.url),
          }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
      }),
    );
  }

  app.use(healthRouter(healthChecks));
  // Tracked links in SMS / WhatsApp / email, and the providers' delivery reports.
  app.use(linkRoutes());
  app.use('/webhooks', webhookRoutes());

  const api = Router();
  api.use('/auth', authRoutes(limits));
  api.use('/me', meRoutes(limits));
  api.use(lookupRoutes());
  api.use('/jobs', jobRoutes(limits));
  api.use('/employer', employerRoutes());
  api.use('/applications', applicationRoutes());
  api.use('/conversations', messageRoutes(limits));
  api.use('/notifications', notificationRoutes());
  api.use('/admin', adminRoutes(limits));
  api.use('/admin', reviewRoutes());
  api.use('/admin', monitoringRoutes());
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
