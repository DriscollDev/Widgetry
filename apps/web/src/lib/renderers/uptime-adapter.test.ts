// apps/web/src/lib/renderers/uptime-adapter.test.ts
//
// The board-widget -> UptimeRenderer mapping (Story #223, US-W-Uptime, §4.4).
//
// This reads a jsonb-derived payload, so the cases that matter are the
// malformed and out-of-step ones: a row written before a schema change, a
// value that is not an uptime reading, a config missing its url. None may
// throw, and none may blank a widget that still has data.
//
// The up/down distinction carries a product decision worth pinning (see
// UptimeSnapshotValue in packages/shared): a target that refused the connection
// is a VALUE row saying 'down', not an error row. Errors mean we could not run
// the check at all.

import { describe, expect, it } from 'vitest';
import { toUptimeView } from './uptime-adapter';
import type { RenderableWidget } from './types';

const CONFIG = { url: 'https://api.example.com/health' };

function widget(over: Partial<RenderableWidget> = {}): RenderableWidget {
  return { id: 'w1', widgetType: 'uptime', config: CONFIG, ...over };
}

function polled(value: unknown, capturedAt = new Date().toISOString()) {
  return { capturedAt, value, error: null };
}

const UP = { status: 'up', httpStatus: 200, responseTimeMs: 143 };
const DOWN_NETWORK = { status: 'down', httpStatus: null, responseTimeMs: 5000 };

describe('toUptimeView - a healthy target', () => {
  it('maps a successful check onto the display values', () => {
    const view = toUptimeView(widget({ latest: polled(UP) }));

    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.target).toBe('https://api.example.com/health');
    expect(view.status).toBe('up');
    expect(view.httpStatus).toBe(200);
    expect(view.responseTimeMs).toBe(143);
    expect(view.updatedAtLabel).toBe('just now');
  });

  it('reports a 4xx as down, because the server answered but the endpoint did not', () => {
    const view = toUptimeView(
      widget({ latest: polled({ ...UP, status: 'down', httpStatus: 404 }) }),
    );

    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.status).toBe('down');
    expect(view.httpStatus).toBe(404);
  });
});

describe('toUptimeView - an unreachable target', () => {
  it('is a readable down state, not an error, when no response arrived', () => {
    const view = toUptimeView(widget({ latest: polled(DOWN_NETWORK) }));

    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.status).toBe('down');
    expect(view.httpStatus).toBeNull();
    expect(view.responseTimeMs).toBe(5000);
  });

  it('keeps the response time on a failed check so a chart has no holes', () => {
    const view = toUptimeView(widget({ latest: polled({ ...DOWN_NETWORK, responseTimeMs: 0 }) }));

    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.responseTimeMs).toBe(0);
  });
});

describe('toUptimeView - what it refuses to draw', () => {
  it('refuses a config with no url', () => {
    const view = toUptimeView(widget({ config: {}, latest: polled(UP) }));

    expect(view.ok).toBe(false);
    if (view.ok) return;
    expect(view.reason).toMatch(/no URL/i);
  });

  it('refuses a null config', () => {
    expect(toUptimeView(widget({ config: null, latest: polled(UP) })).ok).toBe(false);
  });

  it('says so when the widget has never been checked', () => {
    const view = toUptimeView(widget({ latest: null }));

    expect(view.ok).toBe(false);
    if (view.ok) return;
    expect(view.reason).toMatch(/not been checked/i);
  });

  it('surfaces a snapshot error message verbatim', () => {
    const view = toUptimeView(
      widget({
        latest: {
          capturedAt: new Date().toISOString(),
          value: null,
          error: { kind: 'blocked', message: 'That address is not allowed.' },
        },
      }),
    );

    expect(view.ok).toBe(false);
    if (view.ok) return;
    expect(view.reason).toBe('That address is not allowed.');
  });
});

describe('toUptimeView - malformed stored values', () => {
  // Each of these is a row a worker could have written before a schema change.
  // The bar is that none of them throws.
  it.each([
    ['a value that is not an object', 'up'],
    ['a null value', null],
    ['an array value', [{ status: 'up' }]],
    ['an unknown status', { status: 'flapping', httpStatus: 200, responseTimeMs: 12 }],
    ['a missing response time', { status: 'up', httpStatus: 200 }],
    ['a non-numeric response time', { status: 'up', httpStatus: 200, responseTimeMs: 'fast' }],
  ])('reads %s as undrawable rather than throwing', (_label, value) => {
    const view = toUptimeView(widget({ latest: polled(value) }));

    expect(view.ok).toBe(false);
    if (view.ok) return;
    expect(view.reason).toMatch(/could not be read/i);
  });

  it('tolerates a non-numeric httpStatus by reporting no response', () => {
    const view = toUptimeView(
      widget({ latest: polled({ status: 'down', httpStatus: 'gone', responseTimeMs: 7 }) }),
    );

    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.httpStatus).toBeNull();
  });

  it('tolerates extra keys a newer worker might write', () => {
    const view = toUptimeView(widget({ latest: polled({ ...UP, redirectCount: 2 }) }));

    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.status).toBe('up');
  });

  it('drops an unreadable capturedAt rather than showing NaN', () => {
    const view = toUptimeView(widget({ latest: polled(UP, 'not-a-date') }));

    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.updatedAtLabel).toBeUndefined();
  });
});
