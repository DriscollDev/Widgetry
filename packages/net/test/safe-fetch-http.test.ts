// packages/net/test/safe-fetch-http.test.ts
//
// EX-29 (redirect status detection) and EX-Size-Timeout: `requestOnce`'s HTTP
// mechanics, verified against a real local server. Previously implemented but
// entirely unverified - safe-fetch.test.ts deliberately only covers literal
// blocked addresses, which never reach `requestOnce` at all.
//
// Why a real server rather than a mock of node:http: the behavior under test
// IS the wiring to node:http (the timeout timer racing the response, the byte
// counter racing incoming chunks, `res.destroy()` actually stopping a transfer)
// - mocking that module would just reassert what the source already claims.
//
// Why this tests `requestOnce` directly rather than `safeFetch`: `safeFetch`
// runs every hop through `resolveAndValidate` first, and 127.0.0.1 - the only
// address a test server in this environment can bind to - is unconditionally
// blocked (§11.3, correctly). There is no address this sandbox can both
// control and have the gate accept, so a full-pipeline test would need either
// live internet egress (explicitly rejected elsewhere in this suite) or
// weakening the blocklist for a test, which defeats the point of testing it.
// `requestOnce` has no address policy of its own - that is entirely
// `resolveAndValidate`'s job, already covered in safe-fetch.test.ts and
// safe-fetch-dns-rebinding.test.ts - so testing it against loopback raises no
// SSRF question. What is NOT covered by any test, and is called out explicitly
// in apps/worker/test/README.md rather than left implicit: `safeFetch`'s own
// redirect LOOP - re-running `resolveAndValidate` on each hop's Location,
// counting redirects across hops - is verified by code review only, for the
// structural reason above.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requestOnce } from '../src/index.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let server: Server;
let origin: string;

const routes: Record<string, Handler> = {
  '/ok': (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  },
  '/redirect-302': (_req, res) => {
    res.writeHead(302, { location: '/ok' });
    res.end();
  },
  '/redirect-308': (_req, res) => {
    res.writeHead(308, { location: '/ok' });
    res.end();
  },
  '/redirect-no-location': (_req, res) => {
    // A 302 with no Location header is not a followable redirect - requestOnce
    // must report it as a plain response, not a redirect target.
    res.writeHead(302);
    res.end('moved, but where');
  },
  '/slow': (_req, res) => {
    setTimeout(() => {
      res.writeHead(200);
      res.end('too late');
    }, 400);
  },
  '/big': (_req, res) => {
    // No content-length: Node sends this chunked, so the cap can only be
    // enforced by counting bytes as they arrive - exactly the "lying or
    // absent header is the normal case for a hostile server" scenario the
    // cap's own comment in safe-fetch.ts names. (A content-length that
    // UNDERSELLS the real body was tried here too, but isn't a real bypass:
    // Node's client parses strictly by the declared length and treats the
    // leftover bytes as a malformed pipelined response - a parse error, not
    // a cap question. Omitting the header, as any chunked or
    // connection-close-terminated response does, is the actual threat.)
    res.writeHead(200);
    res.end('x'.repeat(1000));
  },
  '/exact-100': (_req, res) => {
    res.writeHead(200);
    res.end('x'.repeat(100));
  },
  '/huge': (_req, res) => {
    // For the readBody:false case: large enough that downloading it fully
    // would take measurably longer than destroying the socket immediately.
    res.writeHead(200);
    res.end('x'.repeat(500_000));
  },
};

beforeAll(async () => {
  server = createServer((req, res) => {
    const handler = routes[req.url ?? ''];
    if (!handler) {
      res.writeHead(404);
      res.end();
      return;
    }
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind');
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

const DEFAULTS = { timeoutMs: 5_000, maxBytes: 256 * 1024, headers: {} };

describe('requestOnce - success and body handling', () => {
  it('returns the status and body for a plain 200', async () => {
    const result = await requestOnce(new URL(`${origin}/ok`), { ...DEFAULTS, readBody: true });
    expect(result).toEqual({ kind: 'response', status: 200, body: Buffer.from('{"ok":true}') });
  });

  it('destroys the response without reading the body when readBody is false', async () => {
    const started = Date.now();
    const result = await requestOnce(new URL(`${origin}/huge`), { ...DEFAULTS, readBody: false });
    const elapsed = Date.now() - started;

    expect(result).toEqual({ kind: 'response', status: 200, body: null });
    // A destroyed response settles on the headers, not after 500 KB crosses
    // the wire - if this took as long as a full download, destroy() isn't
    // actually cutting the transfer short.
    expect(elapsed).toBeLessThan(200);
  });
});

describe('requestOnce - redirect detection (EX-29)', () => {
  it.each([302, 308])(
    'reports a %d with a Location as a redirect, not a response',
    async (status) => {
      const path = status === 302 ? '/redirect-302' : '/redirect-308';
      const result = await requestOnce(new URL(`${origin}${path}`), {
        ...DEFAULTS,
        readBody: true,
      });
      expect(result).toEqual({ kind: 'redirect', status, location: '/ok' });
    },
  );

  it('treats a redirect status with no Location header as an ordinary response', async () => {
    const result = await requestOnce(new URL(`${origin}/redirect-no-location`), {
      ...DEFAULTS,
      readBody: true,
    });
    expect(result).toEqual({
      kind: 'response',
      status: 302,
      body: Buffer.from('moved, but where'),
    });
  });
});

describe('requestOnce - timeout (EX-Size-Timeout)', () => {
  it('rejects once the deadline passes, without waiting for the slow response', async () => {
    const started = Date.now();
    await expect(
      requestOnce(new URL(`${origin}/slow`), { ...DEFAULTS, timeoutMs: 50, readBody: true }),
    ).rejects.toMatchObject({ safeFetch: 'timeout' });
    // The server answers at 400ms; settling near the 50ms deadline instead
    // proves the timer fired the request rather than the response finishing.
    expect(Date.now() - started).toBeLessThan(300);
  });
});

describe('requestOnce - byte cap (EX-Size-Timeout)', () => {
  it('rejects a response over the cap sent with no Content-Length (the realistic hostile case)', async () => {
    await expect(
      requestOnce(new URL(`${origin}/big`), { ...DEFAULTS, maxBytes: 100, readBody: true }),
    ).rejects.toMatchObject({ safeFetch: 'too_large' });
  });

  it('accepts a response at exactly the cap', async () => {
    const result = await requestOnce(new URL(`${origin}/exact-100`), {
      ...DEFAULTS,
      maxBytes: 100,
      readBody: true,
    });
    expect(result).toEqual({ kind: 'response', status: 200, body: Buffer.from('x'.repeat(100)) });
  });

  it('rejects one byte over the cap', async () => {
    await expect(
      requestOnce(new URL(`${origin}/exact-100`), { ...DEFAULTS, maxBytes: 99, readBody: true }),
    ).rejects.toMatchObject({ safeFetch: 'too_large' });
  });
});
