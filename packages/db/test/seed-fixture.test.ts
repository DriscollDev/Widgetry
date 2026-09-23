// packages/db/test/seed-fixture.test.ts
//
// Holds the demo fixture to the rules the database and the api would enforce
// (EX-12, EX-52, Feature Spec §9.2).
//
// The seed writes rows DIRECTLY rather than through POST /v1/boards/:id/widgets,
// so none of the api's validation runs against it. That is the gap these tests
// close: every config is parsed with the same Zod schema the api would use,
// every placement is checked with the same overlap algorithm, and every value
// is checked against the CHECK constraints in the migration. A fixture that
// fails here would be one the product itself would have rejected - and the
// failure would surface as a broken board mid-demo, which is the worst possible
// moment to find it.

import { describe, expect, it } from 'vitest';
import {
  getWidgetTypeDef,
  parseWidgetConfig,
  CustomJsonSnapshotValue,
  StockSnapshotValue,
  UptimeSnapshotValue,
  type WidgetType,
} from '@widgetry/shared';
import {
  HISTORY_POINTS,
  SEED_BOARDS,
  SEED_SNAPSHOT_COUNT,
  SEED_WIDGET_COUNT,
  type SeedWidget,
} from '../src/seed-fixture.js';

const allWidgets = SEED_BOARDS.flatMap((board) => board.widgets);

/** The api's own rectangle overlap test (apps/api/src/routes/widgets.ts). */
function overlaps(a: SeedWidget, b: SeedWidget): boolean {
  return (
    a.gridCol < b.gridCol + b.gridWidth &&
    b.gridCol < a.gridCol + a.gridWidth &&
    a.gridRow < b.gridRow + b.gridHeight &&
    b.gridRow < a.gridRow + a.gridHeight
  );
}

describe('the fixture matches what EX-52 specifies', () => {
  it('has three boards', () => {
    expect(SEED_BOARDS).toHaveLength(3);
  });

  it('has twenty-one widgets', () => {
    expect(SEED_WIDGET_COUNT).toBe(21);
    expect(allWidgets).toHaveLength(21);
  });

  it('gives every board a distinct name', () => {
    const names = SEED_BOARDS.map((board) => board.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('board rows satisfy boards_refresh_interval_check', () => {
  // The migration's CHECK: auto => interval in (30,60,300,900,1800,3600),
  // manual => interval is null. A violation is a 500 from the insert.
  const ALLOWED = [30, 60, 300, 900, 1800, 3600];

  it.each(SEED_BOARDS.map((board) => [board.name, board] as const))(
    '%s pairs refreshMode with a legal interval',
    (_name, board) => {
      if (board.refreshMode === 'auto') {
        expect(ALLOWED).toContain(board.refreshIntervalSeconds);
      } else {
        expect(board.refreshIntervalSeconds).toBeNull();
      }
    },
  );

  it('covers both refresh modes, so the demo shows each', () => {
    const modes = new Set(SEED_BOARDS.map((board) => board.refreshMode));
    expect(modes).toEqual(new Set(['auto', 'manual']));
  });
});

describe('widget placement satisfies FR-3.3 and the grid CHECKs', () => {
  it.each(allWidgets.map((w, i) => [i, w] as const))(
    'widget %i sits inside the 12-column grid',
    (_i, widget) => {
      expect(widget.gridCol).toBeGreaterThanOrEqual(0);
      expect(widget.gridCol).toBeLessThanOrEqual(11);
      expect(widget.gridRow).toBeGreaterThanOrEqual(0);
      expect(widget.gridWidth).toBeGreaterThanOrEqual(1);
      expect(widget.gridWidth).toBeLessThanOrEqual(6);
      expect(widget.gridHeight).toBeGreaterThanOrEqual(1);
      expect(widget.gridHeight).toBeLessThanOrEqual(6);
      // widgets_grid_col_check bounds the origin; this bounds the extent, which
      // no CHECK covers but the 12-column layout does.
      expect(widget.gridCol + widget.gridWidth).toBeLessThanOrEqual(12);
    },
  );

  it.each(SEED_BOARDS.map((board) => [board.name, board] as const))(
    '%s has no overlapping widgets',
    (_name, board) => {
      for (let i = 0; i < board.widgets.length; i += 1) {
        for (let j = i + 1; j < board.widgets.length; j += 1) {
          const a = board.widgets[i]!;
          const b = board.widgets[j]!;
          expect(
            overlaps(a, b),
            `${a.widgetType}@(${a.gridCol},${a.gridRow}) overlaps ${b.widgetType}@(${b.gridCol},${b.gridRow})`,
          ).toBe(false);
        }
      }
    },
  );
});

describe('every widget config is one the api would accept', () => {
  it.each(allWidgets.map((w, i) => [i, w] as const))(
    'widget %i parses against its type schema',
    (_i, widget) => {
      const result = parseWidgetConfig(widget.widgetType, widget.config);
      expect(
        result.success,
        result.success ? '' : JSON.stringify(result.error.issues, null, 2),
      ).toBe(true);
    },
  );

  it('shows every widget type Widgetry ships', () => {
    // This used to exclude weather, stock and currency because they had no
    // renderer and would have drawn as the fallback. All three are built now,
    // so a demo board can show one of each rather than three variations on
    // "a URL responded".
    //
    // `datetime` is absent because F5.1 and F5.2 merged: both clock rows are
    // `clock`, one of them configured to show the date, which is what that
    // type id used to mean.
    const used = new Set<WidgetType>(allWidgets.map((w) => w.widgetType));
    expect(used).toEqual(
      new Set(['uptime', 'custom_json', 'clock', 'weather', 'currency', 'stock']),
    );
  });

  it('covers both polling modes', () => {
    const modes = new Set(allWidgets.map((w) => getWidgetTypeDef(w.widgetType).polling));
    expect(modes).toEqual(new Set(['server', 'client']));
  });
});

describe('seeded history matches what the worker would write', () => {
  // A stored reading the renderer cannot read is a board of error tiles. These
  // parse EVERY reading with the same schema the worker writes against, not
  // just the newest - the timeline charts read all of them.
  const serverPolled = allWidgets.filter(
    (w) => getWidgetTypeDef(w.widgetType).polling === 'server',
  );

  /** The value rows of one widget's history. Error rows carry no value. */
  const valuesOf = (widget: SeedWidget) =>
    widget.history.filter((s) => s.error === null).map((s) => s.value);

  it('gives every server-polled widget a history long enough to draw', () => {
    // One reading was enough for the tile's current value and not enough for
    // the timeline strip, the custom line and uptime-strip slots, or the stock
    // sparkline - all of which need at least two points and look like nothing
    // with fewer than a dozen. On a freshly seeded board, which is the board a
    // demo is given, those charts were invisible.
    expect(serverPolled.length).toBeGreaterThan(0);
    for (const widget of serverPolled) {
      expect(widget.history.length, `${widget.widgetType} has too little history`).toBe(
        HISTORY_POINTS,
      );
    }
    expect(SEED_SNAPSHOT_COUNT).toBe(serverPolled.length * HISTORY_POINTS);
  });

  it('orders every history oldest first, with the newest last', () => {
    // The snapshots endpoint returns oldest-first and every series consumer
    // assumes it; a reversed fixture would draw every chart backwards.
    for (const widget of serverPolled) {
      const ages = widget.history.map((s) => s.minutesAgo);
      expect(ages).toEqual([...ages].sort((a, b) => b - a));
      expect(ages.at(-1)).toBe(0);
    }
  });

  it('keeps every reading inside the default retention window', () => {
    // retention_hours defaults to 168, and anything older is purged by the
    // maintenance job (Eng §8.3) - so seeding it would be writing rows that
    // vanish on the first sweep.
    for (const widget of serverPolled) {
      expect(Math.max(...widget.history.map((s) => s.minutesAgo))).toBeLessThan(168 * 60);
    }
  });

  it('sets exactly one of value and error on every reading (FR-5.1)', () => {
    for (const widget of serverPolled) {
      for (const snapshot of widget.history) {
        expect(snapshot.value === null).not.toBe(snapshot.error === null);
      }
    }
  });

  it('gives local and client-polled widgets no history at all', () => {
    const local = allWidgets.filter((w) => getWidgetTypeDef(w.widgetType).polling === 'client');
    expect(local.length).toBeGreaterThan(0);
    for (const widget of local) {
      expect(widget.history).toEqual([]);
    }
  });

  it.each(allWidgets.filter((w) => w.widgetType === 'uptime').map((w, i) => [i, w] as const))(
    'every uptime reading of widget %i is a valid UptimeSnapshotValue',
    (_i, widget) => {
      for (const value of valuesOf(widget)) {
        const result = UptimeSnapshotValue.safeParse(value);
        expect(result.success, result.success ? '' : JSON.stringify(result.error?.issues)).toBe(
          true,
        );
      }
    },
  );

  it.each(allWidgets.filter((w) => w.widgetType === 'custom_json').map((w, i) => [i, w] as const))(
    'every custom_json reading of widget %i is valid and matches its slot count',
    (_i, widget) => {
      const configuredSlots = (widget.config.slots as unknown[]).length;

      for (const value of valuesOf(widget)) {
        const result = CustomJsonSnapshotValue.safeParse(value);
        expect(result.success, result.success ? '' : JSON.stringify(result.error?.issues)).toBe(
          true,
        );
        if (!result.success) return;

        // A reading shorter than the config pads to loading slots in the
        // renderer - correct behaviour, but in a fixture it is a half-blank
        // widget, and across a SERIES it is a chart full of holes.
        expect(result.data.slotCount).toBe(configuredSlots);
        expect(result.data.slots).toHaveLength(configuredSlots);
      }
    },
  );

  it.each(allWidgets.filter((w) => w.widgetType === 'stock').map((w, i) => [i, w] as const))(
    'every stock reading of widget %i is a valid StockSnapshotValue',
    (_i, widget) => {
      for (const value of valuesOf(widget)) {
        const result = StockSnapshotValue.safeParse(value);
        expect(result.success, result.success ? '' : JSON.stringify(result.error?.issues)).toBe(
          true,
        );
      }
    },
  );

  it('includes a currently-down uptime widget, so FR-4.4 is demonstrable', () => {
    const current = allWidgets
      .filter((w) => w.widgetType === 'uptime')
      .map((w) => (w.history.at(-1)?.value as { status?: string } | null)?.status);
    expect(current).toContain('down');
    expect(current).toContain('up');
  });

  it('seeds error rows as well as down rows', () => {
    // Two different things - "the target answered badly" and "we could not run
    // the check at all" - that land in different columns and read differently
    // to a user. A fixture with only one of them demos half the split.
    const kinds = allWidgets.flatMap((w) =>
      w.history.filter((s) => s.error !== null).map((s) => s.error?.kind),
    );
    expect(kinds.length).toBeGreaterThan(0);
  });

  it('gives the status-shaped slots WORDS, not numbers', () => {
    // toWidgetStatus classifies a number as `degraded` on purpose, because a
    // bound number could be an HTTP status or an error count and those
    // disagree about which way is healthy. A strip seeded with numbers would
    // be a wall of amber: technically correct, and a terrible demo.
    const stripWidgets = allWidgets.filter(
      (w) =>
        w.widgetType === 'custom_json' &&
        (w.config.slots as { primitive: string }[]).some((s) => s.primitive === 'uptime-strip'),
    );
    expect(stripWidgets.length).toBeGreaterThan(0);

    for (const widget of stripWidgets) {
      const slots = widget.config.slots as { primitive: string }[];
      const index = slots.findIndex((s) => s.primitive === 'uptime-strip');

      for (const value of valuesOf(widget)) {
        const entry = (value as { slots: { value: unknown }[] }).slots[index];
        expect(typeof entry?.value).toBe('string');
      }
    }
  });
});

describe('the fixture shows off what the product can do', () => {
  it('uses every custom primitive at least once', () => {
    // Four of the seven were unreachable from the arrangement most people
    // picked first before the US-C4 revision, and the old fixture used five of
    // them. A demo board that never draws a line chart does not show that the
    // product can.
    const used = new Set(
      allWidgets
        .filter((w) => w.widgetType === 'custom_json')
        .flatMap((w) => (w.config.slots as { primitive: string }[]).map((s) => s.primitive)),
    );
    expect(used).toEqual(
      new Set(['ring', 'number', 'gauge', 'bar', 'badge', 'line', 'uptime-strip']),
    );
  });

  it('includes a widget carrying the full six-slot maximum', () => {
    const widest = Math.max(
      ...allWidgets
        .filter((w) => w.widgetType === 'custom_json')
        .map((w) => (w.config.slots as unknown[]).length),
    );
    expect(widest).toBe(6);
  });

  it('keeps one pre-revision config that still names a layout', () => {
    // Every custom widget saved before the US-C4 revision carries a layoutId
    // and they must keep rendering. Seeding one proves that on the demo board
    // rather than only in a unit test.
    const withLayout = allWidgets.filter(
      (w) => w.widgetType === 'custom_json' && w.config.layoutId !== undefined,
    );
    expect(withLayout).toHaveLength(1);
  });
});
