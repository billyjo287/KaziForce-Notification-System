import { pino } from 'pino';
import { env } from '../config/env.js';

// Readable coloured logs in development; plain JSON (easy for log tools to search) elsewhere.
export const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
    },
  }),
});
