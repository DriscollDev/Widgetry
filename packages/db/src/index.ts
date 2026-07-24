// packages/db/src/index.ts
//
// Public surface of the data layer: the Drizzle client and the full schema.
// Schema design lives in Engineering Doc §5.

export { db, createDb } from './client.js';
export type { Database } from './client.js';
export * as schema from './schema/index.js';
