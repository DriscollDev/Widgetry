// Public surface of @widgetry/shared.
//
// Contracts here are imported by BOTH apps/web and apps/api so a request shape
// can never drift between the two (Eng §6.3). Still to come:
//   src/api/       snapshots, credentials contracts; the real widget contract
//                  (./api/widgets.js is a placement-only stub - see its header)
//
// src/widgets/ is the EX-19 registry (§7.1). Every type is registered so
// `polling` resolves for all seven; only `uptime` has a real config schema so
// far - see that module's scope note.

export * from './api/auth.js';
export * from './api/boards.js';
export * from './api/errors.js';
export * from './api/health.js';
export * from './api/me.js';
export * from './api/widgets.js';

export * from './widgets/index.js';
