import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { parseSetCookie, relaySetCookies } from './cookies.js';

// A Set-Cookie shaped like the one Better-Auth actually emits in production:
// prefixed name, signed value containing base64 padding and a dot separator.
const SESSION_COOKIE =
  '__Secure-better-auth.session_token=abc123.hZ9%2Bx%2FQ%3D%3D; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax; Secure';

describe('parseSetCookie', () => {
  it('splits name and value at the first "=" only', () => {
    const parsed = parseSetCookie(SESSION_COOKIE);
    expect(parsed?.name).toBe('__Secure-better-auth.session_token');
    expect(parsed?.value).toBe('abc123.hZ9%2Bx%2FQ%3D%3D');
  });

  it('carries the security attributes across', () => {
    const parsed = parseSetCookie(SESSION_COOKIE);
    expect(parsed?.options).toMatchObject({
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 2592000,
    });
  });

  it('defaults path to "/" when the header omits it', () => {
    expect(parseSetCookie('session=x; HttpOnly')?.options.path).toBe('/');
  });

  it('parses the Max-Age=0 form Better-Auth signs out with', () => {
    const parsed = parseSetCookie('better-auth.session_token=; Max-Age=0; Path=/');
    expect(parsed?.value).toBe('');
    expect(parsed?.options.maxAge).toBe(0);
  });

  it('parses Expires despite the comma inside the date', () => {
    const parsed = parseSetCookie(
      'session=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly',
    );
    expect(parsed?.options.expires).toEqual(new Date(0));
    expect(parsed?.options.httpOnly).toBe(true);
  });

  it('keeps the cookie when it carries an attribute we do not model', () => {
    const parsed = parseSetCookie('session=x; Path=/; Priority=High; SomethingNew=1');
    expect(parsed?.name).toBe('session');
    expect(parsed?.options.path).toBe('/');
  });

  it('rejects a header with no name', () => {
    expect(parseSetCookie('')).toBeNull();
    expect(parseSetCookie('=value')).toBeNull();
    expect(parseSetCookie('novalue')).toBeNull();
  });
});

describe('relaySetCookies', () => {
  function fakeCookies() {
    return { set: vi.fn() } as unknown as Cookies & { set: ReturnType<typeof vi.fn> };
  }

  it('relays every Set-Cookie, not just the last', () => {
    const headers = new Headers();
    headers.append('set-cookie', 'a=1; Path=/');
    headers.append('set-cookie', 'b=2; Path=/');
    const cookies = fakeCookies();

    relaySetCookies(cookies, new Response(null, { headers }));

    expect(cookies.set).toHaveBeenCalledTimes(2);
    expect(cookies.set.mock.calls.map((call) => call[0])).toEqual(['a', 'b']);
  });

  it('relays the value verbatim - double-encoding would break the signature', () => {
    const headers = new Headers();
    headers.append('set-cookie', SESSION_COOKIE);
    const cookies = fakeCookies();

    relaySetCookies(cookies, new Response(null, { headers }));

    const [, value, options] = cookies.set.mock.calls[0]!;
    expect(value).toBe('abc123.hZ9%2Bx%2FQ%3D%3D');
    // The identity encoder is the load-bearing part: SvelteKit's default would
    // percent-encode the already-encoded value a second time.
    expect(options.encode(value)).toBe(value);
  });

  it('does nothing when the response set no cookies', () => {
    const cookies = fakeCookies();
    relaySetCookies(cookies, new Response(null));
    expect(cookies.set).not.toHaveBeenCalled();
  });
});
