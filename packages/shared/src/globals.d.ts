// packages/shared/src/globals.d.ts
//
// This package is imported by web (browser), api and worker (Node), so its
// tsconfig deliberately carries `lib: ["ES2022"]` and neither `DOM` nor
// `@types/node`. That keeps a browser global from compiling in the worker and a
// Node global from compiling in the browser - a constraint worth keeping.
//
// The cost is that genuinely universal runtime globals are also invisible.
// `URL` is the WHATWG URL Standard, present in every browser and in Node since
// v10, so declaring the slice of it we use is accurate rather than a fudge.
//
// Add to this only for globals that are standardised in BOTH environments. If
// something is Node-only, it does not belong in this package at all.

declare class URL {
  constructor(input: string, base?: string);
  /** Includes the trailing colon, e.g. `"https:"`. */
  readonly protocol: string;
  /** Host without port. Empty string for schemes that have no host. */
  readonly hostname: string;
  readonly href: string;
}
