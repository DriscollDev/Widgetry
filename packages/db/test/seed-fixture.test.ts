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
  UptimeSnapshotValue,
  type WidgetType,
} from '@widgetry/shared';
import { SEED_BOARDS, SEED_WIDGET_COUNT, type SeedWidget } from '../src/seed-fixture.js';

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

  it('has fifteen widgets', () => {
    expect(SEED_WIDGET_COUNT).toBe(15);
    expect(allWidgets).toHaveLength(15);
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

  it('only uses types that have a renderer today', () => {
    // The deliberate scope call recorded in seed-fixture.ts: weather, stock and
    // currency would draw as the fallback, so the fixture leaves them out.
    //
    // `datetime` left this set when F5.1 and F5.2 merged - both fixture rows
    // are `clock` now, one of them configured to show the date, which is what
    // that type id used to mean.
    const used = new Set<WidgetType>(allWidgets.map((w) => w.widgetType));
    expect(used).toEqual(new Set(['uptime', 'custom_json', 'clock']));
  });

  it('covers both polling modes', () => {
    const modes = new Set(allWidgets.map((w) => getWidgetTypeDef(w.widgetType).polling));
    expect(modes).toEqual(new Set(['server', 'client']));
  });
});

describe('seeded snapshots match what the worker would write', () => {
  // A snapshot the renderer cannot read is a board of error tiles. These parse
  // each one with the same schema the worker writes against.
  const serverPolled = allWidgets.filter(
    (w) => getWidgetTypeDef(w.widgetType).polling === 'server',
  );

  it('gives every server-polled widget a snapshot', () => {
    // Without one the board renders loading skeletons until the worker gets to
    // it, which for uptime's 3600s minimum can be most of an hour.
    expect(serverPolled.length).toBeGreaterThan(0);
    for (const widget of serverPolled) {
      expect(widget.snapshot, `${widget.widgetType} has no snapshot`).not.toBeNull();
    }
  });

  it('gives local widgets no snapshot', () => {
    const local = allWidgets.filter((w) => getWidgetTypeDef(w.widgetType).polling === 'client');
    expect(local.length).toBeGreaterThan(0);
    for (const widget of local) {
      expect(widget.snapshot).toBeNull();
    }
  });

  it.each(
    allWidgets.filter((w) => w.widgetType === 'uptime').map((w, i) => [i, w.snapshot] as const),
  )('uptime snapshot %i is a valid UptimeSnapshotValue', (_i, snapshot) => {
    const result = UptimeSnapshotValue.safeParse(snapshot);
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
  });

  it.each(allWidgets.filter((w) => w.widgetType === 'custom_json').map((w, i) => [i, w] as const))(
    'custom_json snapshot %i is valid and matches its slot count',
    (_i, widget) => {
      const result = CustomJsonSnapshotValue.safeParse(widget.snapshot);
      expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
      if (!result.success) return;

      // A snapshot shorter than the config pads to loading slots in the renderer;
      // correct behaviour, but in a fixture it just means a half-blank widget.
      const configuredSlots = (widget.config.slots as unknown[]).length;
      expect(result.data.slotCount).toBe(configuredSlots);
      expect(result.data.slots).toHaveLength(configuredSlots);
    },
  );

  it('includes at least one down uptime widget, so FR-4.4 is demonstrable', () => {
    const statuses = allWidgets
      .filter((w) => w.widgetType === 'uptime')
      .map((w) => (w.snapshot as { status?: string } | null)?.status);
    expect(statuses).toContain('down');
    expect(statuses).toContain('up');
  });
});
