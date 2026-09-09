// apps/api/test/unit/update-widget-contract.test.ts
//
// UpdateWidgetRequest - the PATCH /v1/widgets/:id contract: retention (US-H2,
// FR-5.2, F8.2) and placement (US-W2 #170, US-W3 #158).
//
// Pure schema, no database, and that matters more than usual here: the
// integration suite that would otherwise cover this endpoint is gated on a
// database whose name ends in `_ci_test`, and that guard does not currently
// match on developer machines - so those tests skip silently. Until that is
// fixed, this file is the only thing that actually runs on every PR.
//
// The rules asserted below mirror the `widgets_retention_hours_check` and
// `widgets_grid_*_check` CHECK constraints. If one stops holding, the failure
// mode is not a clean 400 - it is a Postgres 23514 surfacing as a 500 on input
// the client fully controls.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WIDGET_RETENTION_HOURS,
  GRID_COLUMNS,
  UpdateWidgetRequest,
  WIDGET_MAX_SPAN,
  WIDGET_RETENTION_HOURS_MAX,
  WIDGET_RETENTION_HOURS_MIN,
} from '@widgetry/shared';

describe('UpdateWidgetRequest - retention bounds (FR-5.2)', () => {
  it('accepts the documented range boundaries', () => {
    // 12 hours and 30 days, the two numbers US-H2 states in prose.
    expect(
      UpdateWidgetRequest.safeParse({ retentionHours: WIDGET_RETENTION_HOURS_MIN }).success,
    ).toBe(true);
    expect(
      UpdateWidgetRequest.safeParse({ retentionHours: WIDGET_RETENTION_HOURS_MAX }).success,
    ).toBe(true);
  });

  it('pins the constants to the values FR-5.2 states', () => {
    // These are duplicated in the database CHECK constraint, so a change here
    // that is not mirrored there produces 500s rather than 400s.
    expect(WIDGET_RETENTION_HOURS_MIN).toBe(12);
    expect(WIDGET_RETENTION_HOURS_MAX).toBe(720);
    expect(DEFAULT_WIDGET_RETENTION_HOURS).toBe(168);
  });

  it('rejects the values just outside each boundary', () => {
    // The off-by-one cases. 11 and 721 both look plausible and both violate the
    // constraint.
    expect(
      UpdateWidgetRequest.safeParse({ retentionHours: WIDGET_RETENTION_HOURS_MIN - 1 }).success,
    ).toBe(false);
    expect(
      UpdateWidgetRequest.safeParse({ retentionHours: WIDGET_RETENTION_HOURS_MAX + 1 }).success,
    ).toBe(false);
  });

  it('rejects zero and negatives', () => {
    expect(UpdateWidgetRequest.safeParse({ retentionHours: 0 }).success).toBe(false);
    expect(UpdateWidgetRequest.safeParse({ retentionHours: -168 }).success).toBe(false);
  });

  it('rejects a non-integer', () => {
    // `integer` in the column type, so 24.5 would be silently truncated or
    // rejected by the driver depending on the path. Neither is a good answer.
    expect(UpdateWidgetRequest.safeParse({ retentionHours: 24.5 }).success).toBe(false);
  });

  it('rejects a numeric string', () => {
    // No coercion on this field on purpose: a form that sends "168" has a bug,
    // and coercing it here hides the bug in every other field too.
    expect(UpdateWidgetRequest.safeParse({ retentionHours: '168' }).success).toBe(false);
  });
});

describe('UpdateWidgetRequest - PATCH semantics', () => {
  it('rejects an empty body', () => {
    // A PATCH that changes nothing is a client bug; a 200 would hide it behind a
    // successful-looking round trip. Same rule as UpdateBoardRequest.
    const result = UpdateWidgetRequest.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a body whose only field is unknown', () => {
    // Zod strips unknown keys, so `{ retention_hours: 24 }` - the snake_case
    // spelling someone will eventually send - parses down to `{}` and must fail
    // rather than silently succeeding while changing nothing.
    expect(UpdateWidgetRequest.safeParse({ retention_hours: 24 }).success).toBe(false);
  });

  it('accepts each grid placement field on its own', () => {
    // These were withheld while FR-3.3's server-side overlap check did not
    // exist - accepting a move without it would have let two widgets be placed
    // on the same cells. The check landed in #188, race-safe inside the
    // handler's transaction, so the fields are contract now. A drag sends only
    // {gridCol, gridRow} and a resize only {gridWidth, gridHeight}, hence
    // one-field-at-a-time here rather than a single all-four body.
    for (const field of ['gridCol', 'gridRow', 'gridWidth', 'gridHeight']) {
      const result = UpdateWidgetRequest.safeParse({ [field]: 1 });
      expect(result.success, `${field} must be accepted`).toBe(true);
    }
  });

  it('still enforces the grid bounds on the fields it now accepts', () => {
    // Accepting the field is not accepting any value for it: the bounds mirror
    // the widgets_grid_*_check constraints, so an out-of-range placement is a
    // 400 from the contract rather than a Postgres 23514 surfacing as a 500.
    expect(UpdateWidgetRequest.safeParse({ gridCol: GRID_COLUMNS }).success).toBe(false);
    expect(UpdateWidgetRequest.safeParse({ gridCol: -1 }).success).toBe(false);
    expect(UpdateWidgetRequest.safeParse({ gridRow: -1 }).success).toBe(false);
    expect(UpdateWidgetRequest.safeParse({ gridWidth: WIDGET_MAX_SPAN + 1 }).success).toBe(false);
    expect(UpdateWidgetRequest.safeParse({ gridHeight: 0 }).success).toBe(false);
  });

  it('accepts placement and retention together', () => {
    // The two slices shipped on separate branches against the same method+path
    // and were merged into one schema. Neither may have narrowed the other.
    const result = UpdateWidgetRequest.safeParse({
      gridCol: 3,
      gridRow: 4,
      gridWidth: 2,
      gridHeight: 2,
      retentionHours: 24,
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      gridCol: 3,
      gridRow: 4,
      gridWidth: 2,
      gridHeight: 2,
      retentionHours: 24,
    });
  });

  it('does not accept config or refreshIntervalSeconds yet', () => {
    // Both are pending the registry-backed validation described on the schema.
    expect(UpdateWidgetRequest.safeParse({ config: { url: 'https://x.test/' } }).success).toBe(
      false,
    );
    expect(UpdateWidgetRequest.safeParse({ refreshIntervalSeconds: 3600 }).success).toBe(false);
  });

  it('ignores unknown fields alongside a valid one rather than failing', () => {
    // The complement of the rule above: a client sending an extra field WITH a
    // real change gets the change applied. Strictness here would break every
    // client that round-trips a full widget object back into a PATCH.
    const result = UpdateWidgetRequest.safeParse({ retentionHours: 24, notAField: 5 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ retentionHours: 24 });
  });
});
