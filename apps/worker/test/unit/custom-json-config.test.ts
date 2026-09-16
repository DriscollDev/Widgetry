// apps/worker/test/unit/custom-json-config.test.ts
//
// E6: the Custom JSON config schema. It is what the api validates widget
// writes against (EX-19), so every rejection here is a 400 the user sees
// instead of a broken widget.

import { describe, expect, it } from 'vitest';
import { CUSTOM_JSON_MAX_HEADERS, CustomJsonConfig, parseWidgetConfig } from '@widgetry/shared';

const VALID = {
  url: 'https://api.example.com/v1/stats',
  path: 'data.items[0].price',
  displayFormat: 'value',
};

function issuesFor(config: unknown): string[] {
  const result = CustomJsonConfig.safeParse(config);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
}

function withHeader(name: string, value = 'x') {
  return { ...VALID, headers: [{ name, value }] };
}

describe('CustomJsonConfig - accepted', () => {
  it('fills in the GET method and an empty header list', () => {
    expect(CustomJsonConfig.parse(VALID)).toEqual({ ...VALID, method: 'GET', headers: [] });
  });

  it('is the registry schema for custom_json', () => {
    expect(parseWidgetConfig('custom_json', VALID).success).toBe(true);
    expect(parseWidgetConfig('custom_json', {}).success).toBe(false);
  });

  it.each(['value', 'key_value', 'timeline'])('accepts the %s display format', (format) => {
    expect(CustomJsonConfig.safeParse({ ...VALID, displayFormat: format }).success).toBe(true);
  });

  it('accepts ordinary headers, including tabs and Latin-1 in values', () => {
    const config = {
      ...VALID,
      headers: [
        { name: 'Accept', value: 'application/vnd.api+json' },
        { name: 'X-Client', value: 'dash\tboard' },
        { name: 'Accept-Language', value: 'fr-CA, café' },
      ],
    };
    expect(CustomJsonConfig.safeParse(config).success).toBe(true);
  });

  it(`accepts ${CUSTOM_JSON_MAX_HEADERS} headers`, () => {
    const headers = Array.from({ length: CUSTOM_JSON_MAX_HEADERS }, (_, i) => ({
      name: `X-H${i}`,
      value: 'v',
    }));
    expect(CustomJsonConfig.safeParse({ ...VALID, headers }).success).toBe(true);
  });
});

describe('CustomJsonConfig - rejected', () => {
  it.each([
    ['a missing URL', { ...VALID, url: undefined }, 'url'],
    ['a relative URL', { ...VALID, url: '/v1/stats' }, 'url'],
    ['a non-http scheme', { ...VALID, url: 'file:///etc/passwd' }, 'url'],
    ['credentials in the URL', { ...VALID, url: 'https://u:p@api.example.com/' }, 'url'],
    ['a non-GET method', { ...VALID, method: 'POST' }, 'method'],
    ['an unparseable path', { ...VALID, path: 'data..x' }, 'path'],
    ['an empty path', { ...VALID, path: '' }, 'path'],
    ['an unknown display format', { ...VALID, displayFormat: 'gauge' }, 'displayFormat'],
    ['an unknown key', { ...VALID, apiKey: 'secret' }, ''],
  ])('rejects %s', (_label, config, path) => {
    expect(issuesFor(config)).toContain(path);
  });

  it.each(['Host', 'accept-encoding', 'Content-Length', 'Transfer-Encoding', 'Connection'])(
    'rejects the reserved header %s',
    (name) => {
      expect(issuesFor(withHeader(name))).toContain('headers.0.name');
    },
  );

  it.each(['X-HTTP-Method-Override', 'X-HTTP-Method', 'x-method-override'])(
    'rejects the method-override header %s (US-C1: GET only)',
    (name) => {
      expect(issuesFor(withHeader(name, 'DELETE'))).toContain('headers.0.name');
    },
  );

  it.each([
    'Authorization',
    'Cookie',
    'X-Api-Key',
    'X-RapidAPI-Key',
    'Ocp-Apim-Subscription-Key',
    'X-Auth-Token',
    'X-Session-Id',
    'X-Client-Secret',
    'X-Password',
  ])('rejects the credential-bearing header %s (FR-6.1)', (name) => {
    const result = CustomJsonConfig.safeParse(withHeader(name));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('API key setting');
  });

  it.each(['X Api', 'X-Api:', 'Ünicode', ''])('rejects the header name %j', (name) => {
    expect(issuesFor(withHeader(name))).toContain('headers.0.name');
  });

  it.each([
    'a\r\nX-Injected: 1',
    'a\nb',
    'a\u0000b',
    'a\u007Fb',
    'price €', // above Latin-1: Node refuses to send it
    'smile \u{1F600}',
  ])('rejects the header value %j', (value) => {
    expect(issuesFor(withHeader('X-A', value))).toContain('headers.0.value');
  });

  it('rejects a header set twice, case-insensitively', () => {
    const headers = [
      { name: 'X-Client', value: '1' },
      { name: 'x-client', value: '2' },
    ];
    expect(issuesFor({ ...VALID, headers })).toContain('headers.1.name');
  });

  it(`rejects more than ${CUSTOM_JSON_MAX_HEADERS} headers`, () => {
    const headers = Array.from({ length: CUSTOM_JSON_MAX_HEADERS + 1 }, (_, i) => ({
      name: `X-H${i}`,
      value: 'v',
    }));
    expect(issuesFor({ ...VALID, headers })).toContain('headers');
  });
});
