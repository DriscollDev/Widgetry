// apps/worker/test/unit/custom-json-config.test.ts
//
// E6: the Custom JSON config schema. It is what the api validates widget
// writes against (EX-19), so every rejection here is a 400 the user sees
// instead of a broken widget.

import { describe, expect, it } from 'vitest';
import {
  CUSTOM_JSON_MAX_HEADERS,
  CustomJsonConfig,
  kindForSlot,
  parseWidgetConfig,
} from '@widgetry/shared';

const SLOT = {
  primitive: 'number' as const,
  label: 'Price',
  jsonPath: 'data.items[0].price',
};

const VALID = {
  url: 'https://api.example.com/v1/stats',
  layoutId: 'single' as const,
  slots: [SLOT],
};

function issuesFor(config: unknown): string[] {
  const result = CustomJsonConfig.safeParse(config);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
}

function withHeader(name: string, value = 'x') {
  return { ...VALID, headers: [{ name, value }] };
}

describe('CustomJsonConfig - accepted', () => {
  it('fills in the GET method, an empty header list, a blank title and the default accent', () => {
    expect(CustomJsonConfig.parse(VALID)).toEqual({
      ...VALID,
      method: 'GET',
      headers: [],
      title: '',
      accent: 'primary',
    });
  });

  it('is the registry schema for custom_json', () => {
    expect(parseWidgetConfig('custom_json', VALID).success).toBe(true);
    expect(parseWidgetConfig('custom_json', {}).success).toBe(false);
  });

  // Each layout's arity and the primitive menu its positions offer.
  it.each([
    ['single', [{ ...SLOT, primitive: 'ring' as const }]],
    [
      'split',
      [
        { ...SLOT, primitive: 'ring' as const },
        { ...SLOT, primitive: 'line' as const },
      ],
    ],
    [
      'hero-strip',
      [
        { ...SLOT, primitive: 'gauge' as const },
        { ...SLOT, primitive: 'bar' as const },
        { ...SLOT, primitive: 'badge' as const },
      ],
    ],
    [
      'trio',
      [
        { ...SLOT, primitive: 'number' as const },
        { ...SLOT, primitive: 'bar' as const },
        { ...SLOT, primitive: 'badge' as const },
      ],
    ],
  ])('accepts the %s layout filled with primitives its slots offer', (layoutId, slots) => {
    expect(CustomJsonConfig.safeParse({ ...VALID, layoutId, slots }).success).toBe(true);
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

describe('CustomJsonConfig - the US-C4 revision', () => {
  it('accepts any primitive in any slot', () => {
    // The slot class used to restrict this, which left four of the seven
    // primitives unreachable from a single-slot widget. It only orders the
    // menu now.
    for (const primitive of ['ring', 'number', 'gauge', 'bar', 'badge', 'line', 'uptime-strip']) {
      const result = CustomJsonConfig.safeParse({
        ...VALID,
        slots: [{ ...SLOT, primitive }],
      });
      expect(result.success, `${primitive} was rejected`).toBe(true);
    }
  });

  it('accepts a config with no layout, arranged by slot count', () => {
    const { layoutId: _layoutId, ...rest } = VALID;
    expect(CustomJsonConfig.safeParse(rest).success).toBe(true);
  });

  it('round-trips the bound field type, so an edited widget reopens on it', () => {
    // The kind used to be UI-only and re-derived from the primitive on edit,
    // which always returned the FIRST kind that primitive accepts. A field set
    // to Text and shown as a big number therefore came back as Number every
    // single time, with no way to make the choice stick.
    const parsed = CustomJsonConfig.parse({
      ...VALID,
      slots: [{ ...SLOT, kind: 'string' }],
    });
    expect(parsed.slots[0]!.kind).toBe('string');
  });

  it.each(['number', 'string', 'series', 'status', 'status-series'])(
    'accepts the field type %s',
    (kind) => {
      expect(CustomJsonConfig.safeParse({ ...VALID, slots: [{ ...SLOT, kind }] }).success).toBe(
        true,
      );
    },
  );

  it('rejects a field type that is not one of them', () => {
    expect(issuesFor({ ...VALID, slots: [{ ...SLOT, kind: 'blob' }] })).toContain('slots.0.kind');
  });

  it('backfills a slot saved before the field type was persisted', () => {
    // Optional, so every pre-revision config still parses; kindForSlot is the
    // one place that guesses, and it guesses a pairing the menu will offer.
    expect(CustomJsonConfig.safeParse(VALID).success).toBe(true);
    expect(kindForSlot({ primitive: 'number' })).toBe('number');
    expect(kindForSlot({ primitive: 'badge' })).toBe('status');
    expect(kindForSlot({ primitive: 'number', kind: 'string' })).toBe('string');
  });

  it("still holds a config that NAMES a layout to that layout's slot count", () => {
    // Pre-revision widgets carry a layoutId, and it still pins the arrangement.
    const result = CustomJsonConfig.safeParse({ ...VALID, slots: [SLOT, SLOT] });
    expect(result.success).toBe(false);
  });
});

describe('CustomJsonConfig - rejected', () => {
  it.each([
    ['a missing URL', { ...VALID, url: undefined }, 'url'],
    ['a relative URL', { ...VALID, url: '/v1/stats' }, 'url'],
    ['a non-http scheme', { ...VALID, url: 'file:///etc/passwd' }, 'url'],
    ['credentials in the URL', { ...VALID, url: 'https://u:p@api.example.com/' }, 'url'],
    ['a non-GET method', { ...VALID, method: 'POST' }, 'method'],
    [
      'an unparseable path',
      { ...VALID, slots: [{ ...SLOT, jsonPath: 'data..x' }] },
      'slots.0.jsonPath',
    ],
    ['an empty path', { ...VALID, slots: [{ ...SLOT, jsonPath: '' }] }, 'slots.0.jsonPath'],
    ['an unknown layout', { ...VALID, layoutId: 'mosaic' }, 'layoutId'],
    [
      'an unknown primitive',
      { ...VALID, slots: [{ ...SLOT, primitive: 'sparkline' }] },
      'slots.0.primitive',
    ],
    ['no slots at all', { ...VALID, slots: [] }, 'slots'],
    // A single-slot layout given two slots: arity is checked, not just shape.
    ['too many slots for the layout', { ...VALID, slots: [SLOT, SLOT] }, 'slots'],
    ['a slot with no label', { ...VALID, slots: [{ ...SLOT, label: '' }] }, 'slots.0.label'],
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
