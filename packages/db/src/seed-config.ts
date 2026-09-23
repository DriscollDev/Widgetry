// packages/db/src/seed-config.ts
//
// What the seed and the cleanup script read from the environment, resolved in
// one place and unit tested. Pure: no I/O, no process.exit.
//
// ----------------------------------------------------------------------------
// WHY THE API URL IS NOT JUST INTERNAL_API_URL.
//
// Eng §2.3 (locked): `api` is not publicly exposed in production - the browser
// only ever talks to `web`, which proxies every `/v1/*` path over Railway's
// private network. INTERNAL_API_URL names the api directly, which works from
// inside the private network and from a laptop in local dev, and NOT from a
// laptop pointed at production.
//
// The demo is presented against the production deployment, so the seed has to
// work from a laptop against prod. It does, because the proxy forwards
// `/v1/auth/*` like every other `/v1` path (apps/web/src/hooks.server.ts) -
// exactly the route the browser's own sign-up takes. So SEED_API_URL can be
// the PUBLIC web origin, and the request arrives at api through the proxy.
//
// Resolution order, first one set wins:
//   1. SEED_API_URL     - set this to the public web origin for production
//   2. INTERNAL_API_URL - local dev, where api is directly reachable
//   3. APP_ORIGIN       - the web origin, which proxies; a sane last resort
// ----------------------------------------------------------------------------

export type EnvLike = Record<string, string | undefined>;

export type Resolved<T> = { ok: true; value: T } | { ok: false; reason: string };

export const DEFAULT_DEMO_EMAIL = 'demo@widgetry.app';
export const DEFAULT_DEMO_PASSWORD = 'widgetry-demo-2026';
export const DEFAULT_DEMO_NAME = 'Demo User';

export type DemoAccount = {
  email: string;
  password: string;
  name: string;
};

/**
 * The demo account to create or reuse.
 *
 * Overridable because production sign-up sends a real verification email
 * through Resend: pointing SEED_DEMO_EMAIL at an inbox someone owns avoids a
 * hard bounce against a domain that does not receive mail. The seed marks the
 * account verified straight afterwards either way, so the email is a side
 * effect rather than a step.
 */
export function resolveDemoAccount(env: EnvLike): DemoAccount {
  return {
    email: env.SEED_DEMO_EMAIL?.trim() || DEFAULT_DEMO_EMAIL,
    password: env.SEED_DEMO_PASSWORD?.trim() || DEFAULT_DEMO_PASSWORD,
    name: env.SEED_DEMO_NAME?.trim() || DEFAULT_DEMO_NAME,
  };
}

/** Where to POST the sign-up. See the header for why this is not one variable. */
export function resolveApiUrl(env: EnvLike): Resolved<string> {
  const candidate =
    env.SEED_API_URL?.trim() || env.INTERNAL_API_URL?.trim() || env.APP_ORIGIN?.trim();

  if (!candidate) {
    return {
      ok: false,
      reason:
        'No api URL. Set SEED_API_URL to the origin that serves /v1 - for production ' +
        'that is the PUBLIC web origin, because api is not publicly exposed and the ' +
        'web service proxies /v1/* to it (Eng §2.3). INTERNAL_API_URL and APP_ORIGIN ' +
        'are used as fallbacks.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: `"${candidate}" is not a valid absolute URL.` };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: `"${candidate}" must be an http(s) URL.` };
  }

  // Trailing slashes would produce `//v1/auth/...`, which some proxies 404.
  return { ok: true, value: candidate.replace(/\/+$/, '') };
}

/**
 * Whether this is a rehearsal rather than a run.
 *
 * A dry run reads the target, reports exactly what it would change, and writes
 * nothing - which is how you confirm the seed works against production BEFORE
 * the day you need it to.
 */
export function isDryRun(argv: readonly string[], env: EnvLike): boolean {
  return argv.includes('--dry-run') || env.SEED_DRY_RUN === '1';
}

/** Whether cleanup should also remove the demo user row, not just their boards. */
export function shouldPurgeUser(argv: readonly string[]): boolean {
  return argv.includes('--purge-user');
}
