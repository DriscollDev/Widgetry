// packages/net/src/outbound.ts
//
// The limits Eng §11.3 step 5 and step 6 put on ANY outbound request made on
// behalf of a user-supplied URL.
//
// They lived in the worker's config until the api needed the same gate for the
// custom widget's config preview. They are not worker policy - they are the
// gate's policy, and a second copy in the api would be a second set of limits
// that could drift apart silently. That is the whole reason this package
// exists.

/** Eng §11.3 step 5: per-request timeout for any outbound fetch. */
export const OUTBOUND_TIMEOUT_MS = 5_000;

/** Eng §11.3 step 5: hard cap on a response body. */
export const OUTBOUND_MAX_BYTES = 256 * 1024;

/** Eng §11.3 step 6: at most three redirects, each re-validated. */
export const OUTBOUND_MAX_REDIRECTS = 3;

/**
 * Sent on every outbound request. A monitored host's operator seeing unexplained
 * traffic should be able to find out what it is, and some WAFs reject a missing
 * or empty User-Agent outright - which would read to the user as their site
 * being down.
 */
export const OUTBOUND_USER_AGENT = 'Widgetry/0.1 (+https://github.com/pokeballers/widgetry)';
