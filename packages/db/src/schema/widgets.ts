// packages/db/src/schema/widgets.ts
//
// A widget instance placed on a board. Authority: Eng Doc §5.2.
//
// refresh_interval_seconds here is the WIDGET poll interval (worker cadence,
// min 3600s), distinct from boards.refresh_interval_seconds. polling_mode is
// denormalized from the widget-type registry (Eng §7.1) so the scheduler sweep
// (§8.1) needs no code join. last_polled_at is NEVER null - it is jitter-seeded
// at insert time in the widget-create API code (§5.2), not defaulted here.

import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, index, check } from 'drizzle-orm/pg-core';
import { tstz } from './column-types.js';
import { boards } from './boards.js';

export const widgets = pgTable(
  'widgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    widgetType: text('widget_type').notNull(),
    pollingMode: text('polling_mode').notNull(),
    gridCol: integer('grid_col').notNull(),
    gridRow: integer('grid_row').notNull(),
    gridWidth: integer('grid_width').notNull(),
    gridHeight: integer('grid_height').notNull(),
    config: jsonb('config').notNull().default({}),
    // Meaningful only for polling_mode = 'server'; min 3600s (FR-4.2).
    refreshIntervalSeconds: integer('refresh_interval_seconds'),
    retentionHours: integer('retention_hours').notNull().default(168),
    lastPolledAt: tstz('last_polled_at').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('widgets_board_id_idx').on(t.boardId),
    // Partial index for the master-scheduler sweep (Eng §8.1).
    index('widgets_scheduler_idx')
      .on(t.pollingMode, t.lastPolledAt)
      .where(sql`${t.pollingMode} = 'server'`),
    check(
      'widgets_widget_type_check',
      sql`${t.widgetType} in ('uptime', 'weather', 'stock', 'currency', 'datetime', 'clock', 'custom_json')`,
    ),
    check('widgets_polling_mode_check', sql`${t.pollingMode} in ('client', 'server')`),
    check('widgets_grid_col_check', sql`${t.gridCol} between 0 and 11`),
    check('widgets_grid_row_check', sql`${t.gridRow} >= 0`),
    check('widgets_grid_width_check', sql`${t.gridWidth} between 1 and 6`),
    check('widgets_grid_height_check', sql`${t.gridHeight} between 1 and 6`),
    check(
      'widgets_refresh_interval_check',
      sql`${t.refreshIntervalSeconds} is null or ${t.refreshIntervalSeconds} >= 3600`,
    ),
    check('widgets_retention_hours_check', sql`${t.retentionHours} between 12 and 720`),
  ],
);
