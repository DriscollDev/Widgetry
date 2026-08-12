// apps/api/src/email/send.ts
//
// EX-15: the transactional-email transport. Resend is the ratified provider
// (Eng §3.2); this module is the only place in the codebase that talks to it,
// so swapping providers is a one-file change and every auth email goes out with
// the same configured sender.
//
// Two deliberate behaviours, both load-bearing:
//
//   1. sendEmail NEVER throws. Better-Auth awaits these callbacks inside
//      sign-up and forget-password. A provider outage must not turn sign-up
//      into a 500, and must not make /forget-password answer differently for a
//      real account than for an unknown one (§11.7's no-enumeration rule is the
//      same principle). Failures are logged and swallowed.
//
//   2. With no RESEND_API_KEY the message - link and all - is logged instead of
//      sent, so the verification/reset flows are exercisable offline. That path
//      prints a live credential, so it must never run in production: env.ts
//      requires RESEND_API_KEY when NODE_ENV=production precisely to make this
//      branch unreachable there.

import { Resend } from 'resend';
import { env } from '../env.js';

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative. Required, not optional - see templates.ts. */
  text: string;
}

/**
 * The slice of pino this module uses. Auth emails are sent from Better-Auth
 * callbacks, which have no Fastify request in scope, so there is no
 * `request.log` to reach for - the auth plugin injects the server logger via
 * setEmailLogger() at boot instead. Until it does (unit tests, the CLI that
 * generates the auth schema) we fall back to console.
 */
export interface EmailLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

const consoleLogger: EmailLogger = {
  info: (obj, msg) => console.info(msg, obj),
  warn: (obj, msg) => console.warn(msg, obj),
  error: (obj, msg) => console.error(msg, obj),
};

let log: EmailLogger = consoleLogger;

/** Called once from the auth plugin so email logs join the api's pino stream. */
export function setEmailLogger(logger: EmailLogger): void {
  log = logger;
}

/**
 * The logger currently in effect. For callers that decide *not* to send
 * something and still want that decision on the same log stream - notably the
 * FR-1.7 reset gate in auth.ts.
 */
export function emailLogger(): EmailLogger {
  return log;
}

// Constructed lazily and once: `new Resend()` at module scope would read the
// env before dotenv has run under the Better-Auth CLI, and a per-send client
// would rebuild an HTTP agent on every email. `null` is the resolved "no key
// configured" state, distinct from `undefined` meaning "not resolved yet".
let client: Resend | null | undefined;

function transport(): Resend | null {
  if (client === undefined) {
    client = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
  }
  return client;
}

export async function sendEmail(email: OutboundEmail): Promise<void> {
  const resend = transport();

  if (!resend) {
    // Dev/test only - see the header note. The body is logged in full because
    // the whole point is to make the tokenized link clickable from the console.
    log.warn(
      { to: email.to, subject: email.subject, body: email.text },
      'RESEND_API_KEY is not set - logging this email instead of sending it (EX-15)',
    );
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    if (error) {
      // Resend reports delivery failures in the payload, not by throwing.
      log.error(
        { to: email.to, subject: email.subject, err: error.message, code: error.name },
        'transactional email rejected by Resend',
      );
      return;
    }

    log.info(
      { to: email.to, subject: email.subject, messageId: data?.id },
      'transactional email sent',
    );
  } catch (err) {
    // Network-level failure. Swallowed on purpose - see (1) in the header.
    log.error({ to: email.to, subject: email.subject, err }, 'transactional email failed to send');
  }
}
