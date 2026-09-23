// packages/shared/test/image-url.test.ts
//
// `isDisplayableImageUrl` decides what is allowed to reach an `<img src>`.
// The value it judges came out of a THIRD PARTY's JSON, so this is a security
// control rather than input tidying - see the function's own comment. The
// scheme cases below are the ones that matter; the rest pin the contract the
// worker and the renderer both rely on.

import { describe, expect, it } from 'vitest';
import {
  IMAGE_URL_MAX_LENGTH,
  isDisplayableImageUrl,
  PRIMITIVE_ACCEPTS,
  SLOT_PRIMITIVES,
  DATA_KINDS,
  PRIMITIVE_LABELS,
  DATA_KIND_LABELS,
  slotWidthFor,
  kindForSlot,
} from '../src/index.js';

describe('isDisplayableImageUrl - what it allows', () => {
  it.each([
    'https://apod.nasa.gov/apod/image/2609/sombrero.jpg',
    'http://example.com/a.png',
    'https://example.com/path?size=large&v=2',
    'https://example.com:8443/a.webp',
    'https://example.com/%E2%98%85.png',
  ])('allows %s', (url) => {
    expect(isDisplayableImageUrl(url)).toBe(true);
  });
});

describe('isDisplayableImageUrl - schemes it refuses', () => {
  it('refuses a data URI', () => {
    // The one that actually bites: a data: URI can carry an SVG, an SVG can
    // carry a script, and it renders same-origin.
    expect(
      isDisplayableImageUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='),
    ).toBe(false);
  });

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['file:', 'file:///etc/passwd'],
    ['ftp:', 'ftp://example.com/a.png'],
    ['blob:', 'blob:https://example.com/1234'],
    ['a protocol-relative URL', '//example.com/a.png'],
  ])('refuses %s', (_label, url) => {
    expect(isDisplayableImageUrl(url)).toBe(false);
  });
});

describe('isDisplayableImageUrl - other rejections', () => {
  it.each([
    ['an empty string', ''],
    ['a relative path', '/apod/image/a.jpg'],
    ['a bare filename', 'a.jpg'],
    ['a scheme with no host at all', 'https://'],
    ['a URL with credentials', 'https://user:pw@example.com/a.png'],
    ['a URL with only a username', 'https://user@example.com/a.png'],
  ])('refuses %s', (_label, url) => {
    expect(isDisplayableImageUrl(url)).toBe(false);
  });

  it.each([
    ['a number', 42],
    ['null', null],
    ['undefined', undefined],
    ['a boolean', true],
    ['an object', { url: 'https://example.com/a.png' }],
    ['an array', ['https://example.com/a.png']],
  ])('refuses %s, which is what a mistyped path resolves to', (_label, value) => {
    expect(isDisplayableImageUrl(value)).toBe(false);
  });

  it('refuses a URL longer than the cap, and allows one exactly at it', () => {
    const prefix = 'https://example.com/';
    const atCap = prefix + 'a'.repeat(IMAGE_URL_MAX_LENGTH - prefix.length);
    expect(atCap).toHaveLength(IMAGE_URL_MAX_LENGTH);
    expect(isDisplayableImageUrl(atCap)).toBe(true);
    expect(isDisplayableImageUrl(atCap + 'a')).toBe(false);
  });
});

describe('the image primitive is wired into the vocabulary', () => {
  it('is a registered primitive with a label', () => {
    expect(SLOT_PRIMITIVES).toContain('image');
    expect(PRIMITIVE_LABELS.image).toBe('Image');
  });

  it('accepts only image-url, so a caption cannot be bound to it by accident', () => {
    expect(PRIMITIVE_ACCEPTS.image).toEqual(['image-url']);
    expect(DATA_KINDS).toContain('image-url');
    expect(DATA_KIND_LABELS['image-url']).toBe('Image URL');
  });

  it('defaults to wide, because a picture in a narrow column is the bad case', () => {
    expect(slotWidthFor({ primitive: 'image' })).toBe('wide');
    // Still overridable - the default is a default, not a rule.
    expect(slotWidthFor({ primitive: 'image', width: 'normal' })).toBe('normal');
  });

  it('back-fills its kind for a slot saved without one', () => {
    expect(kindForSlot({ primitive: 'image' })).toBe('image-url');
  });

  it('leaves every other primitive’s accepted kinds alone', () => {
    // Adding a kind to the enum must not widen what anything else accepts.
    expect(PRIMITIVE_ACCEPTS.number).toEqual(['number', 'string']);
    expect(PRIMITIVE_ACCEPTS.badge).toEqual(['status', 'string']);
    expect(PRIMITIVE_ACCEPTS.line).toEqual(['series']);
  });

  it('gives every primitive a label and at least one accepted kind', () => {
    for (const primitive of SLOT_PRIMITIVES) {
      expect(PRIMITIVE_LABELS[primitive], primitive).toBeTruthy();
      expect(PRIMITIVE_ACCEPTS[primitive].length, primitive).toBeGreaterThan(0);
    }
  });
});
