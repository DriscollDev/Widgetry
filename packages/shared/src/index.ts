// Public surface of @widgetry/shared.
//
// Contracts here are imported by BOTH apps/web and apps/api so a request shape
// can never drift between the two (Eng §6.3).
//
// src/widgets/ is the EX-19 registry (§7.1). Every registered type now has a
// real config schema - the `NOT_YET_CONFIGURABLE` placeholder is gone, and so
// is the note that used to say only `uptime` had one. The catalog is SIX types:
// `datetime` is still registered and still parses, but it is the retired id for
// `clock` and is hidden from the catalog rather than removed (see
// ./widgets/clock.js for why removing it is a migration hazard, not a tidy-up).

export * from './api/auth.js';
export * from './api/boards.js';
export * from './api/credentials.js';
export * from './api/errors.js';
export * from './api/health.js';
export * from './api/me.js';
export * from './api/widget-data.js';
export * from './api/widget-preview.js';
export * from './api/widgets.js';

export * from './widgets/index.js';
