// packages/db/src/schema/widget-snapshots.ts
//
// Poll results for server-polled widgets. High-volume, purged daily by
// retention_hours (Eng §5.2, §8.3). Exactly one of value/error is populated per
// row: value on success, error on failure. The (widget_id, captured_at DESC)
// index is the only access pattern.

import { pgTable, bigserial, uuid, jsonb, index } from 'drizzle-orm/pg-core';
import { tstz } from './column-types.js';
import { widgets } from './widgets.js';

export const widgetSnapshots = pgTable(
  'widget_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    widgetId: uuid('widget_id')
      .notNull()
      .references(() => widgets.id, { onDelete: 'cascade' }),
    capturedAt: tstz('captured_at').notNull().defaultNow(),
    value: jsonb('value'),
    error: jsonb('error'),
  },
  (t) => [index('widget_snapshots_widget_id_captured_at_idx').on(t.widgetId, t.capturedAt.desc())],
);
