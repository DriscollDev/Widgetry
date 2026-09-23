// apps/worker/src/logger.ts
//
// Eng §15.1: pino, JSON output, standard fields `level`/`time`/`service`/`msg`.
// Railway's log viewer is the destination for MVP, and it parses JSON lines - so
// pretty-printing is development-only and must never be enabled in production,
// where it would turn structured logs into unqueryable text.
//
// `requestId`/`userId` from §15.1 have no analogue here: the worker serves no
// requests and acts for no user. Its equivalent correlation fields are `jobId`
// and `widgetId`, attached per job by `job.log`-style child loggers in the job
// handlers, per §15.1's "one log line per job completion with jobId, widgetId,
// duration, success/fail".

import { pino, type Logger } from 'pino';
import { env } from './env.js';

export type { Logger };

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'worker' },
  // ISO timestamps rather than pino's default epoch millis, to match what the
  // api emits so a single Railway log search can span both services.
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service' },
        },
      }
    : {}),
  /**
   * Belt and braces against FR-6.2 / the CLAUDE.md credential invariant:
   * decrypted API keys exist in worker memory for the duration of one outbound
   * request, and the surest way for one to escape is a well-meaning
   * `log.debug({ config })` or an error object that captured a headers map.
   * Nothing should be passing these to the logger in the first place - this is
   * the second line, not the first.
   */
  redact: {
    paths: [
      'apiKey',
      '*.apiKey',
      'credential',
      '*.credential',
      'headers.authorization',
      '*.headers.authorization',
      'headers["x-api-key"]',
      '*.headers["x-api-key"]',
    ],
    censor: '[redacted]',
  },
});
