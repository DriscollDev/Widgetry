// apps/worker/test/unit/safe-fetch-http.test.ts
//
// EX-29 (redirect detection) and EX-Size-Timeout: requestOnce's HTTP
// mechanics, verified against a real local server rather than a mock of
// node:http, since the behavior under test IS the wiring to it.
//
// Tests requestOnce directly, not safeFetch: 127.0.0.1 is unconditionally
// blocked by the SSRF gate (correctly), so a full-pipeline test against a
// local server isn't possible. requestOnce has no address policy of its own
// - that's resolveAndValidate's job, covered elsewhere - so loopback here
// raises no SSRF question. safeFetch's own redirect loop is verified by code
// review only, per apps/worker/test/README.md.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requestOnce } from '../../src/lib/safe-fetch.js';

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
    // No content-length - sent chunked, so the byte cap can only be enforced
    // by counting as it arrives. That's the realistic hostile case; a
    // Content-Length that underselling the real body isn't a real bypass,
    // since Node's client just rejects the leftover bytes as malformed.
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
