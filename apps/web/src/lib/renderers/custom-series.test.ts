// apps/web/src/lib/renderers/custom-series.test.ts
//
// Per-slot series extraction for the custom widget's charting primitives
// (US-C4's `line` and `uptime-strip`, EX-Snapshots-Endpoint).
//
// The status mapping is the part worth guarding hardest: the spec does not
// define what a JSON value means for an uptime strip, so this file is where
// that decision is written down and held. The conservative rule - anything not
// clearly a health signal is DEGRADED rather than up - is deliberate, and a
// future change that makes numbers "up" should have to delete a test that says
// why not.

import { describe, expect, it } from 'vitest';
import type { LatestSnapshot } from '@widgetry/shared';
import { lineSeries, slotValueAt, statusSeries, toWidgetStatus } from './custom-series';

/** A custom_json snapshot carrying the given per-slot values. */
function snap(values: unknown[], capturedAt = new Date().toISOString()): LatestSnapshot {
  return {
    capturedAt,
    value: {
      slots: values.map((value) =>
        value === undefined ? { ok: false, reason: 'unresolved' } : { ok: true, value },
      ),
      slotCount: values.length,
    },
    error: null,
  };
}

function errorSnap(): LatestSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    value: null,
    error: { kind: 'timeout', message: 'The request timed out.' },
  };
}

describe('slotValueAt', () => {
  it('reads the value at its position', () => {
    expect(slotValueAt(snap([1, 'two', true]), 1)).toBe('two');
  });

  it('is undefined for an error snapshot', () => {
    expect(slotValueAt(errorSnap(), 0)).toBeUndefined();
  });

  it('is undefined for a slot that did not resolve', () => {
    expect(slotValueAt(snap([undefined, 5]), 0)).toBeUndefined();
  });

  it('is undefined past the end - an older row predating a new slot (US-C6)', () => {
    expect(slotValueAt(snap([1]), 3)).toBeUndefined();
  });
});

describe('lineSeries', () => {
  it('collects numbers oldest-first', () => {
    const history = [snap([1]), snap([2]), snap([3])];
    expect(lineSeries(history, 0)).toEqual([1, 2, 3]);
  });

  it('skips gaps rather than plotting them as zero', () => {
    // A zero is a claim about the value; a gap is the truth.
    const history = [snap([1]), errorSnap(), snap([3]), snap([undefined]), snap([5])];
    expect(lineSeries(history, 0)).toEqual([1, 3, 5]);
  });

  it('ignores non-numeric readings bound to a line slot', () => {
    expect(lineSeries([snap(['up']), snap([2]), snap([true])], 0)).toEqual([2]);
  });

  it('reads the right slot when several are configured', () => {
    const history = [snap([1, 10]), snap([2, 20])];
    expect(lineSeries(history, 1)).toEqual([10, 20]);
  });

  it('is empty for a widget with no history', () => {
    expect(lineSeries([], 0)).toEqual([]);
  });
});

describe('toWidgetStatus - the cases that are unambiguous', () => {
  it('maps booleans', () => {
    expect(toWidgetStatus(true)).toBe('up');
    expect(toWidgetStatus(false)).toBe('down');
  });

  it.each(['up', 'ok', 'healthy', 'online', 'pass', 'SUCCESS', ' Ok '])(
    'reads %j as up',
    (word) => {
      expect(toWidgetStatus(word)).toBe('up');
    },
  );

  it.each(['down', 'fail', 'offline', 'ERROR', 'critical'])('reads %j as down', (word) => {
    expect(toWidgetStatus(word)).toBe('down');
  });

  it.each(['degraded', 'warning', 'partial'])('reads %j as degraded', (word) => {
    expect(toWidgetStatus(word)).toBe('degraded');
  });
});

describe('toWidgetStatus - the cases it refuses to guess', () => {
  it('does NOT read a number as healthy', () => {
    // The decision this file exists to protect. A number bound here could be an
    // HTTP status, a latency or an error count, and those disagree about which
    // direction is healthy.
    expect(toWidgetStatus(200)).toBe('degraded');
    expect(toWidgetStatus(0)).toBe('degraded');
    expect(toWidgetStatus(503)).toBe('degraded');
  });

  it('does not invert a field where zero is the good news', () => {
    // `errors_last_hour: 0` must never render as "down". This is the concrete
    // failure that ruled out treating 0 as falsy-therefore-down.
    expect(toWidgetStatus(0)).not.toBe('down');
  });

  it('treats an unrecognised string as degraded, not up', () => {
    expect(toWidgetStatus('maintenance')).toBe('degraded');
    expect(toWidgetStatus('')).toBe('degraded');
  });

  it('treats null and objects as degraded', () => {
    expect(toWidgetStatus(null)).toBe('degraded');
    expect(toWidgetStatus({ status: 'up' })).toBe('degraded');
  });
});

describe('statusSeries', () => {
  it('maps each snapshot in order', () => {
    const history = [snap([true]), snap([false]), snap(['ok'])];
    expect(statusSeries(history, 0)).toEqual(['up', 'down', 'up']);
  });

  it('counts an unreadable interval as down rather than closing the gap', () => {
    // Same reasoning as the uptime widget's own timeline (FR-4.4): "we could
    // not read this" is an unhealthy interval, and dropping it would hide the
    // incident by shortening the strip.
    const history = [snap([true]), errorSnap(), snap([true])];
    expect(statusSeries(history, 0)).toEqual(['up', 'down', 'up']);
  });

  it('keeps the strip the same length as the history', () => {
    const history = [snap([true]), snap([undefined]), errorSnap(), snap([false])];
    expect(statusSeries(history, 0)).toHaveLength(4);
  });

  it('is empty for a widget with no history', () => {
    expect(statusSeries([], 0)).toEqual([]);
  });
});
