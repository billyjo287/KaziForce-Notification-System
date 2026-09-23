import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { healthRouter, type HealthCheck } from './routes/health.js';

export interface AppOptions {
  frontendOrigin: string;
  healthChecks: Record<string, HealthCheck>;
  logger?: Logger;
}

/** Builds the Express app. Dependencies are passed in so tests can swap them for fakes. */
export function createApp({ frontendOrigin, healthChecks, logger }: AppOptions) {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  if (logger) app.use(pinoHttp({ logger }));

  app.use(healthRouter(healthChecks));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
    req.log?.error({ err: error }, 'Unhandled error');
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  };
  app.use(errorHandler);

  return app;
}
