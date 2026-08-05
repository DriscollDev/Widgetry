# @widgetry/api

Fastify HTTP API. Behind a SvelteKit proxy  the browser never talks to this
service directly (Engineering Doc §2.3).

```bash
pnpm --filter @widgetry/api dev          # tsx watch, listens on PORT (default 3000)
pnpm --filter @widgetry/api test:unit    # no database needed
pnpm --filter @widgetry/api test:integration  # needs TEST_DATABASE_URL (ci-test)
```

## Routes so far

| Method  | Path            | Auth | Notes                                    |
| ------- | --------------- | ---- | ---------------------------------------- |
| GET     | `/v1/health`    | No   | Railway liveness probe (§16.3)           |
| \*      | `/v1/auth/*`    | Varies | Better-Auth: sign-up, sign-in, sign-out, get-session, verify-email, password reset |

Everything else under `/v1/` is rejected with `401 unauthenticated` by the
session hook before routing (EX-13). The public allowlist lives in
`src/plugins/auth.ts`  adding to it needs review.

## Env

Beyond what `.env.example` already documents, this service reads:

| Variable                | Required | Notes                                                              |
| ----------------------- | -------- | ------------------------------------------------------------------ |
| `HOST` / `PORT`         | No       | Default `0.0.0.0` / `3000`. Must agree with `API_ORIGIN`.           |
| `BETTER_AUTH_SECRET`    | **Yes**  | ≥32 characters; the process refuses to start otherwise.             |
| `PASSWORD_BREACH_CHECK` | No       | Default `true`. See "Breached-password check" below.                |

There is **no** `BETTER_AUTH_URL`. Better-Auth's `baseURL` is `APP_ORIGIN`,
because every auth URL a user actually clicks (verification links, OAuth
callbacks) has to point at the web service, not at this one.

Google sign-in registers only when `GOOGLE_OAUTH_CLIENT_ID` **and**
`GOOGLE_OAUTH_SECRET` are both non-empty, so a developer without Google
credentials can still boot the api.

## What the web service's `/v1/*` proxy must do

Three things, or auth breaks in ways that are annoying to debug:

1. **Forward the `Cookie` header both ways.** The session lives in
   `better-auth.session_token` (HttpOnly, SameSite=Lax, 30-day Max-Age). The
   proxy must pass `Cookie` upstream and relay `Set-Cookie` back  including
   *multiple* `Set-Cookie` headers, which some proxy helpers silently collapse
   into one comma-joined value that browsers then discard.

2. **Forward the browser's `Origin` header.** Better-Auth validates it against
   `trustedOrigins` (= `APP_ORIGIN`) on any state-changing request that carries
   a cookie. Strip it and those requests fail with `403 MISSING_OR_NULL_ORIGIN`.

3. **Forward `X-Forwarded-For`.** The api runs with `trustProxy`, and the
   5-attempts-per-minute auth limit (EX-42) is keyed on client IP. Without it
   every user shares the web service's IP and one attacker locks out everyone.

Useful endpoints for the sign-in/sign-up screens:

```
POST /v1/auth/sign-up/email   { name, email, password }  -> 200 { token, user } + Set-Cookie
POST /v1/auth/sign-in/email   { email, password }        -> 200 { token, user } + Set-Cookie
POST /v1/auth/sign-out        {}                         -> 200
GET  /v1/auth/get-session                                -> 200 { session, user } | null
```

Failures from `/v1/auth/*` use Better-Auth's own body shape
(`{ message, code }`), **not** the `{ error: { code, message } }` envelope from
§6.1  that envelope covers everything this service routes itself. Worth
knowing when writing the error-display component.

## Auth policy, and where it is pinned

`src/auth.ts` sets policy the feature spec states in prose; `test/unit/auth-config.test.ts`
asserts each one so a Better-Auth default can't quietly replace it (its own
defaults are 8-character passwords and 7-day sessions).

- FR-1.4  sessions expire after 30 days of inactivity (`expiresIn` + `updateAge`)
- FR-1.5  passwords must be ≥12 characters and not in the breach corpus
- FR-1.7  unverified accounts *can* sign in; the web side shows a banner (EX-16)
- Eng §11.5  argon2id at 19 MiB / t=2 / p=1, asserted against the encoded hash
  string in `test/unit/password.test.ts`, not against our own constants

### Breached-password check

`haveIBeenPwned` queries `api.pwnedpasswords.com` with the first 5 characters of
the password's SHA-1 (k-anonymity  the password itself never leaves the
process). It **fails closed**: if that host is unreachable, sign-up and
password-change return 500 rather than accepting a password we could not check.

That is the right default and the wrong thing to discover during a capstone
demo on conference wifi, which is why `PASSWORD_BREACH_CHECK=false` exists.
Tests set it to `false` so CI never depends on an external host.

## Still outstanding

- **EX-15**: `sendVerificationEmail` / `sendResetPassword` log the link to stdout
  instead of sending it through Resend. Must not ship.
- Per-user 120/min default rate limit (§6.4)  nothing to apply it to until the
  board/widget routes exist.
- `packages/config` is still a stub; `src/env.ts` should move there once the
  worker and web need the same loader (§4).
- `requireBoardOwnership` / `requireWidgetOwnership` (EX-17) land with the first
  board route.
