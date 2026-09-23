// packages/net/src/index.ts
//
// The SSRF gate, and nothing else. Two callers: the worker's fetchers, which
// poll user-supplied URLs on a schedule, and the api's custom-widget config
// preview, which fetches one on demand while somebody is filling in the form.
//
// Both go through `safeFetch`. There is no second path, and adding one is a
// review-blocking defect (Eng §11.3).

export * from './outbound.js';
export * from './safe-fetch.js';
