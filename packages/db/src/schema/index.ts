// packages/db/src/schema/index.ts
//
// Aggregates every table Drizzle Kit should see. Our four app tables plus the
// Better-Auth tables (user/session/account/verification) generated into
// ./auth.ts by the Better-Auth CLI.

export * from './boards.js';
export * from './widgets.js';
export * from './widget-snapshots.js';
export * from './api-credentials.js';
export * from './auth.js';
