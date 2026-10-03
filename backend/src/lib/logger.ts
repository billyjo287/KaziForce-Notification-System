import { pino } from 'pino';
import { env } from '../config/env.js';

// Readable coloured logs in development; plain JSON (easy for log tools to search) elsewhere.
export const logger = pino({
  level: env.LOG_LEVEL,
  // Never write secrets to the logs, whatever an object passed to the logger contains.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
    ],
    censor: '[hidden]',
  },
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
    },
  }),
});
