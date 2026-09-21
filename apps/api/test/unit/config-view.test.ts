import { describe, expect, it } from 'vitest';
import { toConfigView } from '../../src/widgets/config-view.js';

describe('toConfigView (Task #235)', () => {
  it('sends only url for uptime', () => {
    expect(toConfigView('uptime', { url: 'https://example.test/health', extra: 1 })).toEqual({
      url: 'https://example.test/health',
    });
  });

  it('never sends headers or apiKey for custom_json', () => {
    const view = toConfigView('custom_json', {
      url: 'https://example.test/api',
      method: 'GET',
      path: 'data.items[0].price',
      displayFormat: 'value',
      headers: [{ name: 'X-Trace', value: 'secret-value' }],
      apiKey: { in: 'header', name: 'X-Api-Key' },
    });
    expect(view).toEqual({
      url: 'https://example.test/api',
      method: 'GET',
      path: 'data.items[0].price',
      displayFormat: 'value',
    });
    expect(JSON.stringify(view)).not.toContain('secret-value');
    expect(view).not.toHaveProperty('headers');
    expect(view).not.toHaveProperty('apiKey');
  });

  it('sends nothing for types without an allowlist entry', () => {
    expect(toConfigView('clock', {})).toBeNull();
    expect(toConfigView('weather', { city: 'Providence' })).toBeNull();
    expect(toConfigView('constructor', { url: 'x' })).toBeNull();
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
});
