// apps/web/src/lib/renderers/custom-json-adapter.test.ts
//
// The board-widget -> CustomWidget mapping (Task #236, E6).
//
// Everything here reads a jsonb-derived payload, so the cases that matter are
// the malformed and out-of-step ones: a config that predates a schema change, a
// snapshot whose slot count no longer matches, a slot that stopped resolving.
// None of those may throw, and none may blank a widget that still has data.

import { describe, expect, it } from 'vitest';
import { toCustomJsonView } from './custom-json-adapter';
import type { RenderableWidget } from './types';

const SLOTS = [
  { primitive: 'ring', label: 'CPU', jsonPath: 'data.cpu', max: 100 },
  { primitive: 'bar', label: 'Memory', jsonPath: 'data.mem' },
  { primitive: 'badge', label: 'State', jsonPath: 'data.state' },
];

const CONFIG = {
  title: 'Production API',
  layoutId: 'hero-strip',
  accent: 'primary',
  url: 'https://api.example.com/v1/stats',
  slots: SLOTS,
};

function widget(over: Partial<RenderableWidget> = {}): RenderableWidget {
  return { id: 'w1', widgetType: 'custom_json', config: CONFIG, ...over };
}

function polled(slots: unknown[], capturedAt = new Date().toISOString()) {
  return { capturedAt, value: { slots, slotCount: slots.length }, error: null };
}

describe('toCustomJsonView - config', () => {
  it('maps an allowlisted config onto CustomWidget props', () => {
    const view = toCustomJsonView(widget({ latest: polled([{ ok: true, value: 41.2 }]) }));

    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.config.title).toBe('Production API');
    expect(view.config.layoutId).toBe('hero-strip');
    expect(view.config.accent).toBe('primary');
    expect(view.config.endpointUrl).toBe('https://api.example.com/v1/stats');
    expect(view.config.slots).toHaveLength(3);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'nope'],
    ['no layout', { slots: SLOTS }],
    ['no slots', { layoutId: 'single' }],
    ['an empty slot list', { layoutId: 'single', slots: [] }],
  ])('refuses to draw when the config is %s', (_label, config) => {
    const view = toCustomJsonView(widget({ config: config as never }));
    expect(view.ok).toBe(false);
  });

  it('refuses an unknown layout rather than silently drawing the fallback', () => {
    // getLayout() falls back to 'single' for an unknown id, which would draw one
    // slot of a three-slot config and look like it worked.
    const view = toCustomJsonView(widget({ config: { ...CONFIG, layoutId: 'mosaic' } }));
    expect(view.ok).toBe(false);
  });

  it('defaults a missing title and accent rather than failing', () => {
    const view = toCustomJsonView(widget({ config: { layoutId: 'single', slots: [SLOTS[0]] } }));
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.config.title).toBe('');
    expect(view.config.accent).toBe('primary');
  });
});

describe('toCustomJsonView - snapshots', () => {
  it('shows every slot loading when the widget has never been polled', () => {
    const view = toCustomJsonView(widget({ latest: null }));
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.slotData).toEqual([
      { state: 'loading' },
      { state: 'loading' },
      { state: 'loading' },
    ]);
  });

  it('maps resolved slots to values, positionally', () => {
    const view = toCustomJsonView(
      widget({
        latest: polled([
          { ok: true, value: 41.2 },
          { ok: true, value: 18 },
          { ok: true, value: 'degraded' },
        ]),
      }),
    );

    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.slotData.map((d) => d.value)).toEqual([41.2, 18, 'degraded']);
    expect(view.slotData.map((d) => d.state)).toEqual(['value', 'value', 'value']);
  });

  it('degrades one slot without touching its siblings', () => {
    const view = toCustomJsonView(
      widget({
        latest: polled([
          { ok: true, value: 41.2 },
          { ok: false, reason: 'Nothing was found at data.mem in the response.' },
          { ok: true, value: 'up' },
        ]),
      }),
    );

    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.slotData[0]).toMatchObject({ state: 'value', value: 41.2 });
    expect(view.slotData[1]).toMatchObject({ state: 'error' });
    expect(view.slotData[1].errorMessage).toContain('data.mem');
    expect(view.slotData[2]).toMatchObject({ state: 'value', value: 'up' });
  });

  it('surfaces a widget-level poll error as a whole-widget failure', () => {
    const view = toCustomJsonView(
      widget({
        latest: {
          capturedAt: new Date().toISOString(),
          value: null,
          error: { kind: 'timeout', message: 'The API did not respond in time.' },
        },
      }),
    );

    expect(view.ok).toBe(false);
    if (view.ok) return;
    expect(view.reason).toBe('The API did not respond in time.');
  });

  it('pads when the config gained a slot after the row was written (US-C6)', () => {
    // Two stored results, three configured slots.
    const view = toCustomJsonView(
      widget({
        latest: polled([
          { ok: true, value: 1 },
          { ok: true, value: 2 },
        ]),
      }),
    );

    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.slotData).toHaveLength(3);
    expect(view.slotData[2]).toEqual({ state: 'loading' });
  });

  it('truncates when the config lost a slot after the row was written (US-C6)', () => {
    const view = toCustomJsonView(
      widget({
        config: { ...CONFIG, layoutId: 'single', slots: [SLOTS[0]] },
        latest: polled([
          { ok: true, value: 1 },
          { ok: true, value: 2 },
          { ok: true, value: 3 },
        ]),
      }),
    );

    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.slotData).toHaveLength(1);
  });

  // Cast, because that is the point of these cases. Task #236 narrowed
  // `RenderableWidget.latest` from `unknown` to `LatestSnapshot | null`, which is
  // the right shape for callers - but the value reaching the adapter comes from a
  // jsonb column through an api allowlist, so a row that does not match the type
  // is a real thing that can arrive. The cast asserts these are deliberately
  // ill-formed, not that the type is wrong.
  const malformed = (latest: unknown) => latest as RenderableWidget['latest'];

  it.each([
    ['a malformed latest', { nope: true }],
    ['a latest with no capturedAt', { value: { slots: [] }, error: null }],
    ['a value that is not a slot record', { capturedAt: new Date().toISOString(), value: 7 }],
  ])('treats %s as never polled rather than throwing', (_label, latest) => {
    const view = toCustomJsonView(widget({ latest: malformed(latest) }));
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.slotData.every((d) => d.state === 'loading')).toBe(true);
  });
});

describe('toCustomJsonView - series primitives', () => {
  // Decided 2026-09-21: until GET /v1/widgets/:id/snapshots exists, a charting
  // slot shows its latest value rather than an empty chart or a false error.
  it('marks a line slot stale, keeping its value', () => {
    const view = toCustomJsonView(
      widget({
        config: {
          ...CONFIG,
          layoutId: 'split',
          slots: [SLOTS[0], { primitive: 'line', label: 'Latency', jsonPath: 'data.ms' }],
        },
        latest: polled([
          { ok: true, value: 41.2 },
          { ok: true, value: 128 },
        ]),
      }),
    );

    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.slotData[0].state).toBe('value');
    expect(view.slotData[1]).toMatchObject({ state: 'stale', value: 128 });
  });

  it('labels how long ago the value was captured', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const view = toCustomJsonView(
      widget({ latest: polled([{ ok: true, value: 1 }], twoHoursAgo) }),
    );

    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.slotData[0].updatedAtLabel).toBe('2 hr ago');
  });
});
