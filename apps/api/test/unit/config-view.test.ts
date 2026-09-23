import { describe, expect, it } from 'vitest';
import { allowlistedKeys, toConfigView } from '../../src/widgets/config-view.js';

describe('toConfigView (Task #235)', () => {
  it('sends only url for uptime', () => {
    expect(toConfigView('uptime', { url: 'https://example.test/health', extra: 1 })).toEqual({
      url: 'https://example.test/health',
    });
  });

  it('sends the slot model for custom_json, never headers, apiKey or method', () => {
    const slots = [
      { primitive: 'ring', label: 'CPU', jsonPath: 'data.cpu', max: 100 },
      { primitive: 'badge', label: 'State', jsonPath: 'data.state' },
    ];
    const view = toConfigView('custom_json', {
      url: 'https://example.test/api',
      method: 'GET',
      title: 'Production API',
      layoutId: 'split',
      accent: 'primary',
      slots,
      headers: [{ name: 'X-Trace', value: 'secret-value' }],
      apiKey: { in: 'header', name: 'X-Api-Key' },
    });

    expect(view).toEqual({
      url: 'https://example.test/api',
      title: 'Production API',
      layoutId: 'split',
      accent: 'primary',
      slots,
    });
    expect(JSON.stringify(view)).not.toContain('secret-value');
    expect(view).not.toHaveProperty('headers');
    expect(view).not.toHaveProperty('apiKey');
    // Always 'GET' for MVP (US-C1) and nothing renders it, so it stays server-side.
    expect(view).not.toHaveProperty('method');
  });

  it('carries everything the renderer needs to draw', () => {
    // The adapter in apps/web refuses to draw without layoutId and slots, so a
    // narrowing here would blank every custom widget on the board rather than
    // fail loudly. Pin the two that matter.
    expect(allowlistedKeys('custom_json')).toEqual(expect.arrayContaining(['layoutId', 'slots']));
  });

  it('sends nothing for something that is not a widget type', () => {
    // This used to list clock, weather and stock, none of which had a config at
    // all. All seven have real schemas now and all seven have an entry, so what
    // is left to check is that the lookup is a genuine allowlist: a key off
    // Object.prototype must not resolve to one.
    expect(toConfigView('constructor', { url: 'x' })).toBeNull();
    expect(toConfigView('__proto__', { url: 'x' })).toBeNull();
    expect(toConfigView('not_a_type', { url: 'x' })).toBeNull();
  });

  it('sends the clock display settings, under both the live and retired ids', () => {
    const config = {
      display: 'both',
      face: 'analog',
      timeZone: 'Asia/Tokyo',
      hour12: false,
      showSeconds: true,
      dateStyle: 'full',
      label: 'Tokyo office',
    };
    expect(toConfigView('clock', config)).toEqual(config);
    // `datetime` is retired, not removed, and its rows still have to render.
    expect(toConfigView('datetime', config)).toEqual(config);
  });

  it('returns null when the stored config is not a plain object', () => {
    expect(toConfigView('uptime', null)).toBeNull();
    expect(toConfigView('uptime', 'https://example.test')).toBeNull();
    expect(toConfigView('uptime', ['https://example.test'])).toBeNull();
  });

  it('omits allowlisted keys the config does not have', () => {
    expect(toConfigView('custom_json', { url: 'https://example.test/api' })).toEqual({
      url: 'https://example.test/api',
    });
  });

  it('does not invent keys for a config written before the slot model', () => {
    // A row still carrying path + displayFormat sends neither: they are not on
    // the allowlist, so an old row degrades to "cannot draw" rather than
    // reaching the renderer as a config it does not understand.
    const view = toConfigView('custom_json', {
      url: 'https://example.test/api',
      path: 'data.price',
      displayFormat: 'value',
    });
    expect(view).toEqual({ url: 'https://example.test/api' });
  });
});
