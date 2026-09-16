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
    ['an unknown key', { ...VALID, token: 'secret' }, ''],
    // The key itself never lives in config (FR-6.1) - only where it goes.
    ['a plaintext API key', { ...VALID, apiKey: 'sk_live_secret' }, 'apiKey'],
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

describe('CustomJsonConfig - API key placement (US-C2)', () => {
  it.each([
    [{ in: 'header', name: 'Authorization' }],
    [{ in: 'header', name: 'X-RapidAPI-Key' }],
    [{ in: 'query', name: 'apikey' }],
    [{ in: 'query', name: 'api_key.v2~x' }],
  ])('accepts %j, including credential-looking header names', (apiKey) => {
    expect(CustomJsonConfig.safeParse({ ...VALID, apiKey }).success).toBe(true);
  });

  it('requires https when a key is attached (FR-6.4)', () => {
    const config = {
      ...VALID,
      url: 'http://api.example.com/v1/stats',
      apiKey: { in: 'header', name: 'X-Api-Key' },
    };
    const result = CustomJsonConfig.safeParse(config);
    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({ path: ['url'], message: expect.stringContaining('https://') }),
    );
    // Without a key, plain http stays allowed.
    expect(CustomJsonConfig.safeParse({ ...config, apiKey: undefined }).success).toBe(true);
  });

  it.each([
    ['an unknown location', { in: 'body', name: 'key' }, 'apiKey.in'],
    ['a reserved header', { in: 'header', name: 'Host' }, 'apiKey.name'],
    ['a malformed header name', { in: 'header', name: 'X Key' }, 'apiKey.name'],
    ['a query name needing encoding', { in: 'query', name: 'api key' }, 'apiKey.name'],
    ['an empty name', { in: 'query', name: '' }, 'apiKey.name'],
    ['an extra field', { in: 'query', name: 'k', value: 'secret' }, 'apiKey'],
  ])('rejects %s', (_label, apiKey, path) => {
    expect(issuesFor({ ...VALID, apiKey })).toContain(path);
  });

  it('rejects a header placement that duplicates a configured header', () => {
    const config = {
      ...VALID,
      headers: [{ name: 'X-Client', value: 'dashboard' }],
      apiKey: { in: 'header', name: 'x-client' },
    };
    expect(issuesFor(config)).toContain('apiKey.name');
  });

  it.each([
    'https://api.example.com/v1?apikey=typed-in-secret',
    'https://api.example.com/v1?symbol=IBM&apikey=',
    'https://api.example.com/v1?a=1&api%6Bey=x',
  ])('rejects %s when the key goes in that query parameter', (url) => {
    expect(issuesFor({ ...VALID, url, apiKey: { in: 'query', name: 'apikey' } })).toContain('url');
  });
});
