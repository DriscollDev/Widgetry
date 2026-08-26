// apps/api/test/unit/boards-contract.test.ts
//
// CreateBoardRequest / UpdateBoardRequest (F3.1, FR-2.2, FR-2.3) and the widget
// placement stub. Pure schema, no database - which matters here more than usual,
// because the integration suite that would otherwise cover this is gated on a
// `_ci_test` database and currently skips on every developer machine (see the
// note in boards.test.ts). These rules have to be asserted somewhere that always
// runs.
//
// The rules under test are the ones that mirror database CHECK constraints. If
// any of these stops holding, the failure mode is not a 400 - it is a constraint
// violation surfacing as a 500 on input the client fully controls.

import { describe, expect, it } from 'vitest';
import {
  BOARD_NAME_MAX_LENGTH,
  BOARD_REFRESH_INTERVALS_SECONDS,
  CreateBoardRequest,
  CreateWidgetRequest,
  UpdateBoardRequest,
  WIDGET_TYPES,
} from '@widgetry/shared';

describe('CreateBoardRequest (US-B1, SCR-MOD-01)', () => {
  it('accepts a manual board with no interval', () => {
    const result = CreateBoardRequest.safeParse({ name: 'Ops', refreshMode: 'manual' });
    expect(result.success).toBe(true);
  });

  it('accepts a manual board that sends an explicit null interval', () => {
    // Both spellings mean the same thing - a client that always sends the field
    // must not have to delete the key to switch to manual.
    const result = CreateBoardRequest.safeParse({
      name: 'Ops',
      refreshMode: 'manual',
      refreshIntervalSeconds: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts every FR-2.3 interval in auto mode', () => {
    for (const seconds of BOARD_REFRESH_INTERVALS_SECONDS) {
      const result = CreateBoardRequest.safeParse({
        name: 'Ops',
        refreshMode: 'auto',
        refreshIntervalSeconds: seconds,
      });
      expect(result.success, `${seconds}s should be accepted`).toBe(true);
    }
  });

  it('rejects an auto board with no interval', () => {
    // The half of boards_refresh_interval_check that a missing field trips.
    const result = CreateBoardRequest.safeParse({ name: 'Ops', refreshMode: 'auto' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['refreshIntervalSeconds']);
  });

  it('rejects a manual board that carries an interval', () => {
    // The other half. A client switching auto -> manual must clear the interval,
    // not leave the old one behind.
    const result = CreateBoardRequest.safeParse({
      name: 'Ops',
      refreshMode: 'manual',
      refreshIntervalSeconds: 300,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an interval outside the FR-2.3 set', () => {
    // 45 is plausible, ordered, and not in the constraint's value list - exactly
    // the sort of value that would reach Postgres and come back a 500.
    const result = CreateBoardRequest.safeParse({
      name: 'Ops',
      refreshMode: 'auto',
      refreshIntervalSeconds: 45,
    });
    expect(result.success).toBe(false);
  });

  it('trims the name and rejects one that is only whitespace', () => {
    // SCR-MOD-01 lists whitespace-only names as rejected. Trim runs before the
    // length check, so "   " is a 0-length name rather than a 3-character one.
    expect(CreateBoardRequest.safeParse({ name: '   ', refreshMode: 'manual' }).success).toBe(
      false,
    );

    const padded = CreateBoardRequest.safeParse({ name: '  Ops  ', refreshMode: 'manual' });
    expect(padded.success).toBe(true);
    expect(padded.data?.name, 'the trimmed value is what reaches the handler').toBe('Ops');
  });

  it('enforces the FR-2.2 name length at the boundary', () => {
    const atLimit = 'x'.repeat(BOARD_NAME_MAX_LENGTH);
    expect(CreateBoardRequest.safeParse({ name: atLimit, refreshMode: 'manual' }).success).toBe(
      true,
    );
    expect(
      CreateBoardRequest.safeParse({ name: `${atLimit}x`, refreshMode: 'manual' }).success,
    ).toBe(false);
  });
});

describe('UpdateBoardRequest (US-B3, US-B5, SCR-MOD-02)', () => {
  it('accepts a rename on its own', () => {
    const result = UpdateBoardRequest.safeParse({ name: 'Renamed' });
    expect(result.success).toBe(true);
  });

  it('accepts a complete refresh pair on its own', () => {
    const result = UpdateBoardRequest.safeParse({
      refreshMode: 'auto',
      refreshIntervalSeconds: 900,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty body', () => {
    // A PATCH that changes nothing is a client bug, and answering 200 to it
    // hides that bug behind a successful-looking round trip.
    const result = UpdateBoardRequest.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an interval sent without a mode', () => {
    // Deliberate: validating the interval against the STORED mode would make
    // the same body legal or illegal depending on a row the client cannot see.
    const result = UpdateBoardRequest.safeParse({ refreshIntervalSeconds: 300 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['refreshMode']);
  });

  it('applies the same pairing rule as create', () => {
    expect(UpdateBoardRequest.safeParse({ refreshMode: 'auto' }).success).toBe(false);
    expect(
      UpdateBoardRequest.safeParse({ refreshMode: 'manual', refreshIntervalSeconds: 60 }).success,
    ).toBe(false);
  });
});

describe('CreateWidgetRequest (stub - placement only)', () => {
  const placement = { gridCol: 0, gridRow: 0, gridWidth: 2, gridHeight: 2 };

  it('accepts every widget type in the FR-3.6 catalog', () => {
    for (const widgetType of WIDGET_TYPES) {
      const result = CreateWidgetRequest.safeParse({ ...placement, widgetType });
      expect(result.success, `${widgetType} should be accepted`).toBe(true);
    }
  });

  it('rejects a type outside the widgets_widget_type_check list', () => {
    const result = CreateWidgetRequest.safeParse({ ...placement, widgetType: 'kanban' });
    expect(result.success).toBe(false);
  });

  it('rejects a widget that runs off the right edge of the grid', () => {
    // FR-3.1. The case no column CHECK can catch: gridCol 10 and gridWidth 6
    // each pass their own bound, and 10 + 6 = 16 > 12.
    const result = CreateWidgetRequest.safeParse({
      ...placement,
      gridCol: 10,
      gridWidth: 6,
      widgetType: 'clock',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['gridWidth']);
  });

  it('accepts a widget that ends exactly on the last column', () => {
    const result = CreateWidgetRequest.safeParse({
      ...placement,
      gridCol: 6,
      gridWidth: 6,
      widgetType: 'clock',
    });
    expect(result.success).toBe(true);
  });

  it('enforces the FR-3.2 size bounds', () => {
    expect(
      CreateWidgetRequest.safeParse({ ...placement, gridWidth: 7, widgetType: 'clock' }).success,
    ).toBe(false);
    expect(
      CreateWidgetRequest.safeParse({ ...placement, gridHeight: 0, widgetType: 'clock' }).success,
    ).toBe(false);
  });

  it('ignores a config field rather than storing one', () => {
    // The stub must not quietly start accepting widget config through an
    // unvalidated passthrough - that is the decision EX-19 owns. Zod strips
    // unknown keys by default; this pins that behaviour so a later `.passthrough()`
    // has to be a deliberate, visible change.
    const result = CreateWidgetRequest.safeParse({
      ...placement,
      widgetType: 'custom_json',
      config: { url: 'https://example.test/data.json' },
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('config');
  });
});
