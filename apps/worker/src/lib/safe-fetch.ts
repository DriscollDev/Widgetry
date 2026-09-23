// apps/worker/src/lib/safe-fetch.ts
//
// The SSRF gate moved to `@widgetry/net` when the api needed it too - the
// custom widget's config preview fetches a user-supplied URL on demand, and a
// second implementation of this pipeline in the api would have been a second
// set of rules to keep in step. One gate, two callers.
//
// This module stays as the worker's door onto it so that the sentence every
// fetcher relies on is still true and still checkable in one place: every
// outbound request the worker makes on behalf of a user-supplied URL is
// imported from here. A fetcher importing `@widgetry/net` directly is not
// wrong, but it is one more place to look when answering "what can this
// service reach?", which is the question Eng §11.3 exists to make easy.

export {
  BlockedDestinationError,
  checkAddressAllowed,
  describeLocation,
  guardedLookup,
  headersForHop,
  requestOnce,
  resolveAndValidate,
  safeFetch,
  type BlockReason,
  type SafeFetchFailure,
  type SafeFetchOptions,
  type SafeFetchResult,
} from '@widgetry/net';
