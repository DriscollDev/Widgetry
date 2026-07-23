import { describe, expect, it } from 'vitest';
import { API_BASE, apiUrl } from './api.js';

describe('apiUrl', () => {
  it('prefixes bare paths with the api base', () => {
    expect(apiUrl('boards')).toBe('/v1/boards');
  });

  it('tolerates a leading slash without doubling it', () => {
    expect(apiUrl('/boards')).toBe('/v1/boards');
  });

  it('preserves nested paths and query strings', () => {
    expect(apiUrl('boards/123?full=1')).toBe('/v1/boards/123?full=1');
  });

  it('exposes the same-origin base', () => {
    expect(API_BASE).toBe('/v1');
  });
});
