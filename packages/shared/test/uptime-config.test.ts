// US-W-Uptime. The type had exactly one setting - the URL - and everything
// else about the tile was fixed. These pin the settings added on top, and the
// line that separates them from the ones §4.4 deliberately refused: every one
// of them is read-side, so the request the worker makes is unchanged.

import { describe, expect, it } from 'vitest';
import {
  UPTIME_MAX_DEGRADED_MS,
  UptimeConfig,
  uptimeDisplayStatus,
  uptimeStatusFor,
} from '../src/index';

const URL = 'https://example.test/health';

describe('UptimeConfig', () => {
  it('still accepts the bare url every existing row was written with', () => {
    expect(UptimeConfig.parse({ url: URL })).toEqual({
      url: URL,
      label: '',
      showHistory: true,
    });
  });

  it('accepts the full set', () => {
    const config = { url: URL, label: 'Status page', degradedAboveMs: 800, showHistory: false };
    expect(UptimeConfig.parse(config)).toEqual(config);
  });

  it.each([
    ['a zero threshold', { url: URL, degradedAboveMs: 0 }],
    ['a negative threshold', { url: URL, degradedAboveMs: -1 }],
    ['a fractional threshold', { url: URL, degradedAboveMs: 12.5 }],
    ['a threshold past the cap', { url: URL, degradedAboveMs: UPTIME_MAX_DEGRADED_MS + 1 }],
    ['a label over the cap', { url: URL, label: 'x'.repeat(41) }],
    ['an unknown key', { url: URL, method: 'POST' }],
  ])('rejects %s', (_label, config) => {
    expect(UptimeConfig.safeParse(config).success).toBe(false);
  });

  it('labels every field for the generic form', () => {
    for (const [key, field] of Object.entries(UptimeConfig.shape)) {
      expect(field.description, `${key} has no label`).toBeTruthy();
    }
    // The specific regression: this field had no label, so the form rendered
    // the raw key and the control read "url".
    expect(UptimeConfig.shape.url.description).toBe('URL to check');
  });
});

describe('uptimeDisplayStatus', () => {
  it('leaves the polled split alone when no threshold is set', () => {
    expect(uptimeDisplayStatus('up', 5000, undefined)).toBe('up');
    expect(uptimeDisplayStatus('down', 1, undefined)).toBe('down');
  });

  it('calls a slow but responding target degraded', () => {
    expect(uptimeDisplayStatus('up', 801, 800)).toBe('degraded');
    expect(uptimeDisplayStatus('up', 800, 800)).toBe('up');
  });

  it('never degrades a target that is down', () => {
    // It did not respond slowly - it did not respond. Degraded would read as
    // "working, just slow", which is the opposite of true.
    expect(uptimeDisplayStatus('down', 9999, 100)).toBe('down');
  });

  it('does not touch what the worker records', () => {
    // The threshold is a lens over stored history, not a change to it: moving
    // it re-reads the same snapshots rather than invalidating them.
    expect(uptimeStatusFor(200)).toBe('up');
    expect(uptimeStatusFor(500)).toBe('down');
  });
});
