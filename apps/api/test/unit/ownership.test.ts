// apps/api/test/unit/ownership.test.ts
//
// EX-17 / Eng §11.7, the half that can be checked without a database: the SQL
// the ownership gate actually emits.
//
// This is the executable form of the invariant in CLAUDE.md - "every query
// touching widgets scopes ownership through boards.user_id". A widget lookup
// that quietly loses its join still compiles, still returns the right row for
// the owner, and only misbehaves for an attacker; nothing else in the suite
// would notice. Asserting the generated SQL does.

import { describe, expect, it } from 'vitest';
import { isUuid, ownedBoardQuery, ownedWidgetQuery } from '../../src/lib/ownership.js';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const WIDGET_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 'user_abc123';

describe('ownedBoardQuery', () => {
  const { sql, params } = ownedBoardQuery(BOARD_ID, USER_ID).toSQL();

  it('filters on the board id AND the owner', () => {
    expect(sql).toContain('"boards"."id" = $');
    expect(sql).toContain('"boards"."user_id" = $');
    expect(params).toContain(BOARD_ID);
    expect(params).toContain(USER_ID);
  });

  it('parameterises both values rather than inlining them', () => {
    expect(sql).not.toContain(BOARD_ID);
    expect(sql).not.toContain(USER_ID);
  });
});

describe('ownedWidgetQuery', () => {
  const { sql, params } = ownedWidgetQuery(WIDGET_ID, USER_ID).toSQL();

  it('joins through boards - the join IS the ownership check', () => {
    // `widgets` has no user column, so without this join the query is scoped by
    // widget id alone and any authenticated user could read any widget.
    expect(sql.toLowerCase()).toContain('inner join "boards"');
    expect(sql).toContain('"widgets"."board_id" = "boards"."id"');
  });

  it('filters on boards.user_id, not on widgets alone', () => {
    expect(sql).toContain('"boards"."user_id" = $');
    expect(sql).toContain('"widgets"."id" = $');
    expect(params).toContain(WIDGET_ID);
    expect(params).toContain(USER_ID);
  });

  it('parameterises both values rather than inlining them', () => {
    expect(sql).not.toContain(WIDGET_ID);
    expect(sql).not.toContain(USER_ID);
  });
});

describe('isUuid', () => {
  it('accepts the ids gen_random_uuid() produces', () => {
    expect(isUuid(BOARD_ID)).toBe(true);
    expect(isUuid('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe(true);
  });

  it('rejects input that would make Postgres raise 22P02 instead of returning no rows', () => {
    // Each of these reaching a uuid comparison is a 500 on attacker-controlled
    // input; the gate turns them into 404s instead.
    for (const bad of [
      'not-a-uuid',
      '',
      "1' or '1'='1",
      '11111111-1111-4111-8111-11111111111', // one char short
      '11111111111141118111111111111111', // no dashes
      null,
      undefined,
      42,
      {},
    ]) {
      expect(isUuid(bad), `${String(bad)} should be rejected`).toBe(false);
    }
  });
});
