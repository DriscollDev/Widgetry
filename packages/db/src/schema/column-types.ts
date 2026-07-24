// packages/db/src/schema/column-types.ts
//
// Shared column helpers for our app tables.
//  - tstz: timestamptz always, never timestamp (schema convention).
//  - bytea: Drizzle pg-core has no native bytea; api_credentials needs it for
//    the six envelope-encryption columns (Eng §5.2 / §10.2).

import { customType, timestamp } from 'drizzle-orm/pg-core';

/** timestamptz column. Chain .notNull()/.defaultNow() at the call site. */
export const tstz = (name: string) => timestamp(name, { withTimezone: true });

/** Postgres bytea, surfaced as Node Buffer in and out. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});
