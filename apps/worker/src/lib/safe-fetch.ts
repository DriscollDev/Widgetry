// apps/worker/src/lib/safe-fetch.ts
//
// The SSRF gate. Authority: Eng §11.3, blocklist enumerated in Feature Spec
// §6.3. Every outbound request the worker makes on behalf of a user-supplied URL
// goes through here - there is no second path, and adding one is a
// review-blocking defect.
//
// The threat is plain: the worker runs inside Railway's network with a database,
// a Redis instance and a cloud metadata endpoint reachable from it, and users
// hand us arbitrary URLs to fetch. Without this gate, "monitor this URL" is a
// request-forgery primitive pointed at our own infrastructure.
//
// The pipeline, in the order §11.3 specifies:
//
//   1. Parse the URL; reject any scheme that is not http: or https:.
//   2. Resolve the hostname to every A and AAAA record.
//   3. Reject if ANY resolved address falls in the blocklist.
//   4. Pin the connection to the validated address (see `guardedLookup`).
//   5. Enforce a 5s timeout and a 256 KB response cap.
//   6. Follow at most 3 redirects, re-running steps 1-5 on each hop.
//
// ---------------------------------------------------------------------------
// WHY THE PINNING WORKS THE WAY IT DOES
// ---------------------------------------------------------------------------
// The obvious implementation of "pin the resolved IP" - resolve, then rewrite
// the URL to https://<ip>/ and set a Host header - is wrong, and quietly so: it
// makes the TLS handshake present the IP as the server name, so certificate
// validation either fails on every HTTPS target or has to be disabled, which
// trades an SSRF hole for a man-in-the-middle hole.
//
// Instead we keep the hostname in the URL and inject a custom `lookup` into the
// socket connection. Node calls it in place of `dns.lookup`, so the address it
// returns is the address the socket actually connects to - there is no window
// between our check and the kernel's connect() for DNS to change under us, which
// is precisely the rebinding attack §11.3 step 4 is about. TLS still sees the
// real hostname, so certificates validate normally.
//
// The two remaining ways to slip past a `lookup` guard are both closed below:
// connection reuse (a keep-alive socket skips DNS entirely, so every request
// gets a fresh non-keep-alive agent) and redirects (handled here rather than by
// the http client, so each hop re-enters the whole pipeline).

import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { promises as dns } from 'node:dns';
import ipaddr from 'ipaddr.js';
import {
  OUTBOUND_MAX_BYTES,
  OUTBOUND_MAX_REDIRECTS,
  OUTBOUND_TIMEOUT_MS,
  OUTBOUND_USER_AGENT,
} from '../config.js';

// ---------------------------------------------------------------------------
// Blocklist
// ---------------------------------------------------------------------------

/**
 * Feature Spec §6.3's IPv4 ranges, verbatim and in the order the document lists
 * them, so this array can be diffed against the spec by eye. Do not "tidy" it
 * into something more compact - being auditable against the requirement is the
 * point, and this list is a capstone deliverable (EX-45 / Feature Spec §9.4).
 */
const BLOCKED_IPV4_CIDRS: ReadonlyArray<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC1918 private
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, includes the 169.254.169.254 metadata endpoint
  ['172.16.0.0', 12], // RFC1918 private
  ['192.168.0.0', 16], // RFC1918 private
];

/** Feature Spec §6.3's IPv6 ranges, same rules as above. */
const BLOCKED_IPV6_CIDRS: ReadonlyArray<[string, number]> = [
  ['::1', 128], // loopback
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
];

/**
 * Why an address was refused. Never reaches the user - see the note on
 * `SnapshotError.message` - but it is exactly what the operator needs in the
 * worker log to answer "why won't my widget fetch".
 */
export type BlockReason = string;

/**
 * True if `address` may be connected to.
 *
 * Two independent checks, and an address must pass both:
 *
 *   - The §6.3 enumeration above. Traceable to the requirement, and the thing an
 *     auditor will check line by line.
 *   - ipaddr.js's own range classification, rejecting anything it does not call
 *     `unicast`. This is the wider net, and it catches what an enumeration
 *     written against one threat model misses: multicast, broadcast, the
 *     240.0.0.0/4 reserved space, 100.64.0.0/10 carrier-grade NAT, and the
 *     IPv6 transition ranges (6to4, Teredo, rfc6052) that can each be used to
 *     smuggle an inner IPv4 address past a naive IPv4-only list.
 *
 * Keeping both is deliberate belt-and-braces. If they ever disagree the wider
 * one wins, which is the safe direction.
 */
export function checkAddressAllowed(address: string): { allowed: boolean; reason?: BlockReason } {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    return { allowed: false, reason: `unparseable address ${address}` };
  }

  // An IPv4-mapped IPv6 address (::ffff:127.0.0.1) is a classic bypass: it is
  // not in any IPv6 blocklist range, and an IPv4 list never sees it because it
  // parses as v6. Unwrap and judge it as what it actually routes to.
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      const inner = v6.toIPv4Address();
      const innerVerdict = checkAddressAllowed(inner.toString());
      return innerVerdict.allowed
        ? innerVerdict
        : { allowed: false, reason: `IPv4-mapped ${address}: ${innerVerdict.reason}` };
    }
  }

  const range = parsed.range();
  if (range !== 'unicast') {
    return { allowed: false, reason: `${address} is ${range}, not public unicast` };
  }

  const cidrs = parsed.kind() === 'ipv4' ? BLOCKED_IPV4_CIDRS : BLOCKED_IPV6_CIDRS;
  for (const [network, bits] of cidrs) {
    // `ipaddr.parse` on the network literal cannot throw - the constants above
    // are fixed and valid - so the cast is safe and keeps the hot path clean.
    const range = [ipaddr.parse(network), bits] as [ipaddr.IPv4 | ipaddr.IPv6, number];
    if (parsed.match(range)) {
      return { allowed: false, reason: `${address} is inside blocked range ${network}/${bits}` };
    }
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// DNS resolution with validation
// ---------------------------------------------------------------------------

interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

/**
 * Thrown when the gate refuses a destination. Distinguished from a network
 * failure because the two mean different things to the user: `blocked` is our
 * refusal and needs a config change, a network failure is the upstream's problem
 * and may fix itself.
 */
export class BlockedDestinationError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'BlockedDestinationError';
  }
}

/**
 * Resolve every A and AAAA record for `hostname` and validate all of them.
 *
 * §11.3 step 2 says "if multiple A/AAAA records, check each", and step 3 says
 * reject if ANY is in the blocklist - so this is all-or-nothing rather than
 * filter-to-the-good-ones. That is the strict reading and the correct one: a
 * host that answers with both a public and a private address is either
 * misconfigured or attacking us, and there is no third possibility worth serving.
 *
 * `dns.resolve*` rather than `dns.lookup`, per §11.3. The difference matters:
 * `lookup` consults the OS resolver, which honours /etc/hosts and NSS modules,
 * so a name could be mapped to a loopback address by host configuration that
 * never appears in DNS. `resolve*` talks to the configured nameservers and sees
 * only what DNS actually says.
 */
export async function resolveAndValidate(hostname: string): Promise<ResolvedAddress[]> {
  // A URL may carry a literal address, in which case there is nothing to
  // resolve - and `dns.resolve4('127.0.0.1')` would fail rather than validate.
  const literal = isIP(hostname);
  if (literal !== 0) {
    const verdict = checkAddressAllowed(hostname);
    if (!verdict.allowed) {
      throw new BlockedDestinationError(verdict.reason ?? `${hostname} is not permitted`);
    }
    return [{ address: hostname, family: literal === 6 ? 6 : 4 }];
  }

  const [v4, v6] = await Promise.all([
    dns.resolve4(hostname).catch(() => [] as string[]),
    dns.resolve6(hostname).catch(() => [] as string[]),
  ]);

  const resolved: ResolvedAddress[] = [
    ...v4.map((address) => ({ address, family: 4 as const })),
    ...v6.map((address) => ({ address, family: 6 as const })),
  ];

  if (resolved.length === 0) {
    // Not a block - the name simply does not resolve. Surfaced as a network
    // failure so an uptime widget pointed at a dead domain reads as "down"
    // rather than as "you configured something forbidden".
    throw Object.assign(new Error(`${hostname} did not resolve to any address`), {
      code: 'ENOTFOUND',
    });
  }

  for (const { address } of resolved) {
    const verdict = checkAddressAllowed(address);
    if (!verdict.allowed) {
      throw new BlockedDestinationError(verdict.reason ?? `${address} is not permitted`);
    }
  }

  return resolved;
}

/**
 * A `dns.lookup`-shaped function that resolves through `resolveAndValidate`.
 * Handed to the socket so the address the kernel connects to is an address this
 * module has already approved (§11.3 step 4).
 *
 * Node calls `lookup` in two shapes depending on `options.all`, and which one it
 * uses is not ours to choose: Node 20 enables `autoSelectFamily` by default,
 * which asks for `all: true` and an array. Handling only the single-address form
 * would make this silently unreachable on exactly the Node version we target,
 * and an unreachable guard is worse than no guard because it looks like one.
 */
/**
 * `family` is not always a number. Node's own `LookupOptions` types it as
 * `number | 'IPv4' | 'IPv6'`, and both spellings reach a custom lookup depending
 * on how the socket was configured - so normalise before comparing, rather than
 * silently failing to filter when the string form arrives.
 */
function requestedFamily(family: number | string | undefined): 4 | 6 | undefined {
  if (family === 4 || family === 'IPv4') return 4;
  if (family === 6 || family === 'IPv6') return 6;
  return undefined;
}

export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  resolveAndValidate(hostname).then(
    (addresses) => {
      const family = requestedFamily(options.family);
      const wanted = family ? addresses.filter((a) => a.family === family) : addresses;
      // Falling back to the full set when the requested family has no record is
      // safe: every address in `addresses` has already been validated, so the
      // worst case is a connection attempt that fails at the socket layer rather
      // than one that reaches somewhere it should not.
      const usable = wanted.length > 0 ? wanted : addresses;

      if (options.all) {
        callback(null, usable);
        return;
      }
      const first = usable[0]!;
      callback(null, first.address, first.family);
    },
    // Node ignores the address argument entirely when the error is set, but its
    // LookupFunction type requires one to be passed - hence the empty string.
    (err: NodeJS.ErrnoException) => callback(err, ''),
  );
};

// ---------------------------------------------------------------------------
// The fetch itself
// ---------------------------------------------------------------------------

export type SafeFetchFailure =
  | 'invalid_url'
  | 'blocked'
  | 'timeout'
  | 'network'
  | 'too_large'
  | 'too_many_redirects';

export type SafeFetchResult =
  | {
      ok: true;
      status: number;
      /** Null when `readBody` was false. */
      body: Buffer | null;
      /** The URL of the final hop, after any redirects. */
      finalUrl: string;
      redirects: number;
      /** Milliseconds from the first request starting to the final response's headers. */
      elapsedMs: number;
    }
  | {
      ok: false;
      failure: SafeFetchFailure;
      /** Operator-facing detail. Log it; do not put it in a snapshot verbatim. */
      detail: string;
      elapsedMs: number;
    };

export interface SafeFetchOptions {
  url: string;
  /**
   * Whether to read the response body. False for a liveness ping, which needs
   * only the status line - and skipping the body means a monitored host serving
   * a 300 MB file is not a 300 MB download every hour.
   */
  readBody: boolean;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

/** Statuses we follow. 303 included; it changes the method to GET, which is all we send anyway. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * The bare host, without the brackets the WHATWG URL parser keeps around an
 * IPv6 literal (`new URL('https://[::1]/').hostname` is `'[::1]'`, brackets
 * included). Both `isIP` and `dns.resolve*` want it unbracketed, and so does the
 * `hostname` option on an http request.
 */
function hostOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '');
}

function parseHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedDestinationError(`not a valid absolute URL`);
  }
  // §11.3 step 1. Everything that is not http(s) is refused here - file:,
  // gopher:, ftp:, and the redirect-only tricks like data: - rather than left to
  // fail later in a way that depends on what the http client happens to support.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedDestinationError(`scheme ${url.protocol} is not permitted`);
  }
  return url;
}

/**
 * One hop. Returns either the response (headers read, body optionally consumed)
 * or a redirect target for the caller to re-validate.
 */
function requestOnce(
  url: URL,
  options: Required<Pick<SafeFetchOptions, 'readBody' | 'timeoutMs' | 'maxBytes'>> & {
    headers: Record<string, string>;
  },
): Promise<
  | { kind: 'response'; status: number; body: Buffer | null }
  | { kind: 'redirect'; status: number; location: string }
> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const send = isHttps ? httpsRequest : httpRequest;

    // A fresh agent per hop, with keep-alive off. Node's global agent pools
    // sockets, and a pooled socket is reused without going through `lookup` at
    // all - so a host that resolved publicly an hour ago could be reached again
    // today without revalidation. Short-lived agents cost a TCP handshake on a
    // request we make at most once an hour, and close that hole completely.
    const agent = isHttps
      ? new HttpsAgent({ keepAlive: false, maxSockets: 1 })
      : new HttpAgent({ keepAlive: false, maxSockets: 1 });

    // One mutable holder rather than several `let`s, because `finish` and the
    // timeout callback each need to see what the other has done and the request
    // does not exist yet when `finish` is defined.
    const state: { settled: boolean; timer?: NodeJS.Timeout; req?: ClientRequest } = {
      settled: false,
    };

    const finish = (fn: () => void): void => {
      if (state.settled) return;
      state.settled = true;
      if (state.timer) clearTimeout(state.timer);
      agent.destroy();
      fn();
    };

    // A single wall-clock deadline covering DNS, connect, TLS, headers and body.
    // `request.setTimeout` only measures socket inactivity, so a server dribbling
    // one byte every four seconds would never trip it - this does.
    state.timer = setTimeout(() => {
      finish(() => {
        state.req?.destroy();
        reject(Object.assign(new Error('request exceeded timeout'), { safeFetch: 'timeout' }));
      });
    }, options.timeoutMs);

    const req = send(
      {
        protocol: url.protocol,
        hostname: hostOf(url),
        port: url.port ? Number(url.port) : isHttps ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: options.headers,
        agent,
        // §11.3 step 4. This is the pin.
        lookup: guardedLookup,
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0;

        if (REDIRECT_STATUSES.has(status) && res.headers.location) {
          const location = res.headers.location;
          res.resume(); // drain, so the socket can close cleanly
          finish(() => resolve({ kind: 'redirect', status, location }));
          return;
        }

        if (!options.readBody) {
          // We have the status line, which is the whole answer for a ping.
          // Destroying rather than draining means a large body is never
          // transferred at all.
          res.destroy();
          finish(() => resolve({ kind: 'response', status, body: null }));
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;

        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          // §11.3 step 5. Enforced as bytes arrive, not by trusting
          // Content-Length - a lying or absent header is the normal case for a
          // hostile server, and by the time you could check it you have already
          // buffered the body.
          if (received > options.maxBytes) {
            finish(() => {
              res.destroy();
              req.destroy();
              reject(
                Object.assign(new Error(`response exceeded ${options.maxBytes} bytes`), {
                  safeFetch: 'too_large',
                }),
              );
            });
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () =>
          finish(() => resolve({ kind: 'response', status, body: Buffer.concat(chunks) })),
        );
        res.on('error', (err) => finish(() => reject(err)));
      },
    );

    state.req = req;
    req.on('error', (err) => finish(() => reject(err)));
    req.end();
  });
}

/**
 * Fetch a user-supplied URL through the full §11.3 pipeline.
 *
 * Never throws for an expected failure - every outcome is a value, because every
 * caller has to turn the outcome into either a snapshot value or a snapshot
 * error and neither is exceptional. An exception escaping this function is a bug
 * in it.
 */
export async function safeFetch(options: SafeFetchOptions): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? OUTBOUND_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? OUTBOUND_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? OUTBOUND_MAX_REDIRECTS;
  const startedAt = Date.now();
  const elapsed = (): number => Date.now() - startedAt;

  const headers: Record<string, string> = {
    'user-agent': OUTBOUND_USER_AGENT,
    accept: '*/*',
    // Identity encoding: the §11.3 byte cap has to mean bytes of content, and a
    // compressed stream lets a server send 256 KB that decompresses to
    // gigabytes. Refusing compression makes the cap honest.
    'accept-encoding': 'identity',
    ...options.headers,
  };

  let currentUrl: URL;
  try {
    currentUrl = parseHttpUrl(options.url);
  } catch (err) {
    return {
      ok: false,
      failure: 'invalid_url',
      detail: err instanceof Error ? err.message : String(err),
      elapsedMs: elapsed(),
    };
  }

  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    // -----------------------------------------------------------------------
    // §11.3 steps 2-3, run EXPLICITLY before the request rather than relying on
    // the `lookup` guard alone.
    // -----------------------------------------------------------------------
    // This is not belt-and-braces; without it the gate has a hole. Node's
    // `net.connect` calls `lookup` only when it has a NAME to resolve - when the
    // host is already an IP literal it skips the lookup entirely and connects
    // straight to it. So `http://169.254.169.254/` would never reach
    // `guardedLookup` at all, and the single most important URL in the whole
    // threat model would sail through a gate that looks like it covers it.
    //
    // Validating here covers the literal case; `guardedLookup` still runs for
    // named hosts, where it remains necessary for a different reason - it closes
    // the DNS-rebinding window between this check and the socket's own
    // resolution (§11.3 step 4). Neither check subsumes the other.
    try {
      await resolveAndValidate(hostOf(currentUrl));
    } catch (err) {
      if (err instanceof BlockedDestinationError) {
        return { ok: false, failure: 'blocked', detail: err.message, elapsedMs: elapsed() };
      }
      // A name that does not resolve is the upstream's problem, not our refusal.
      return {
        ok: false,
        failure: 'network',
        detail: err instanceof Error ? err.message : String(err),
        elapsedMs: elapsed(),
      };
    }

    let hop;
    try {
      hop = await requestOnce(currentUrl, {
        readBody: options.readBody,
        timeoutMs,
        maxBytes,
        headers,
      });
    } catch (err) {
      if (err instanceof BlockedDestinationError) {
        return { ok: false, failure: 'blocked', detail: err.message, elapsedMs: elapsed() };
      }
      const tag = (err as { safeFetch?: string }).safeFetch;
      if (tag === 'timeout' || tag === 'too_large') {
        return { ok: false, failure: tag, detail: (err as Error).message, elapsedMs: elapsed() };
      }
      // A guarded lookup rejection surfaces here wrapped by Node's socket layer,
      // which discards the prototype but keeps the message - so recover the
      // distinction rather than reporting a block as a generic network error.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('blocked range') || message.includes('not public unicast')) {
        return { ok: false, failure: 'blocked', detail: message, elapsedMs: elapsed() };
      }
      return { ok: false, failure: 'network', detail: message, elapsedMs: elapsed() };
    }

    if (hop.kind === 'response') {
      return {
        ok: true,
        status: hop.status,
        body: hop.body,
        finalUrl: currentUrl.toString(),
        redirects,
        elapsedMs: elapsed(),
      };
    }

    if (redirects === maxRedirects) {
      return {
        ok: false,
        failure: 'too_many_redirects',
        detail: `exceeded ${maxRedirects} redirects`,
        elapsedMs: elapsed(),
      };
    }

    // §11.3 step 6: the next hop re-enters the pipeline from the top. Resolving
    // the Location against the current URL handles relative redirects; parsing
    // it re-applies the scheme gate, and the next `requestOnce` re-resolves and
    // re-validates the new host. A redirect to http://169.254.169.254/ is
    // refused exactly as if the user had typed it.
    try {
      currentUrl = parseHttpUrl(new URL(hop.location, currentUrl).toString());
    } catch (err) {
      return {
        ok: false,
        failure: 'blocked',
        detail: `redirect to ${hop.location}: ${err instanceof Error ? err.message : String(err)}`,
        elapsedMs: elapsed(),
      };
    }
  }

  /* c8 ignore next -- the loop always returns; this satisfies the type checker. */
  return { ok: false, failure: 'network', detail: 'unreachable', elapsedMs: elapsed() };
}
