// Route: /verify-email - SCR-AUTH-05 (Screen Inventory §5.1). US-A6 / FR-1.7.
//
// ---------------------------------------------------------------------------
// THIS PAGE DOES NOT VERIFY ANYTHING
// ---------------------------------------------------------------------------
// That asymmetry with /reset-password is deliberate and documented in
// apps/api/src/auth.ts: clicking a verification link IS the verification, so
// the emailed link points at Better-Auth's own `/v1/auth/verify-email` (reached
// through the web service, which proxies /v1/*). By the time a browser gets
// here, the token has already been consumed server-side and - because the api
// sets `autoSignInAfterVerification` - a session cookie has been issued.
//
// So this is the `callbackURL` those links carry: a landing page that reports
// what happened and points onward. Re-submitting the token here would be a
// second consumption of a single-use row, which is exactly the FR-1.8 failure
// the reset flow guards against.
//
// The one thing it can do honestly is read `locals.user`, which the hooks
// already resolved from the cookie. A verified session means it worked. No
// session means either the link was followed in a different browser than the
// one holding the session, or verification failed - and those two are not
// distinguishable from here, so the copy covers both.

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
  return {
    // Non-null only when the verification link was followed in this browser
    // and Better-Auth's auto-sign-in issued a cookie.
    signedIn: Boolean(locals.user),
    emailVerified: locals.user?.emailVerified ?? false,
    email: locals.user?.email ?? null,
  };
};
