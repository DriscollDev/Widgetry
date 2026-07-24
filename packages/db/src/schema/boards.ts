// packages/db/src/schema/boards.ts
//
// A board is a grid of widgets owned by one user. Authority: Eng Doc §5.2.
//
// user_id FKs to the Better-Auth `user` table (Eng §5.1), which is generated
// into ./auth.ts by the Better-Auth CLI. Better-Auth uses text ids, hence
// user_id is text (not uuid).

import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, index, check } from 'drizzle-orm/pg-core';
import { tstz } from './column-types.js';
import { user } from './auth.js';

export const boards = pgTable(
  'boards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // 'auto' | 'manual' - see check below.
    refreshMode: text('refresh_mode').notNull(),
    // Board refresh interval: how often the CLIENT re-queries the board view.
    // NOT the widget poll interval (that lives on widgets). Null when manual.
    refreshIntervalSeconds: integer('refresh_interval_seconds'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('boards_user_id_created_at_idx').on(t.userId, t.createdAt.desc()),
    check('boards_refresh_mode_check', sql`${t.refreshMode} in ('auto', 'manual')`),
    check(
      'boards_refresh_interval_check',
      sql`(${t.refreshMode} = 'auto' and ${t.refreshIntervalSeconds} in (30, 60, 300, 900, 1800, 3600))
          or (${t.refreshMode} = 'manual' and ${t.refreshIntervalSeconds} is null)`,
    ),
  ],
);
