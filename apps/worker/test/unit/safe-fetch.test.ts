// apps/worker/test/unit/safe-fetch.test.ts
//
// The SSRF gate's test suite. Eng §11.3 asks for exactly this ("a dedicated test
// suite that attempts to fetch known-bad URLs and verifies rejection"), and it
// feeds the EX-45 / Feature Spec §9.4 security audit deliverable.
//
// Two layers, deliberately:
//
//   `checkAddressAllowed` - a pure function, so every range in Feature Spec §6.3
//     can be asserted directly and exhaustively with no I/O at all. This is where
//     the coverage lives.
//   `safeFetch` - end to end, but only against LITERAL addresses. A literal
//     needs no DNS, so these cases are hermetic: they prove the gate refuses
//     before any socket is opened, and they cannot flake on a resolver.
//
// What is deliberately not here: a case that resolves a real hostname to a
// private address. That needs either a controlled DNS zone or a live network,
// and a security test that silently turns into a no-op when CI has no egress is
// worse than no test. It belongs in an integration suite with a stub resolver -
// TODO(F10.1).

import { describe, expect, it } from 'vitest';
import { checkAddressAllowed, safeFetch } from '../../src/lib/safe-fetch.js';

describe('checkAddressAllowed - Feature Spec §6.3 IPv4 ranges', () => {
  // One or more representatives per blocked range, including each range's
  // boundaries where they are the interesting part.
  const blocked: Array<[string, string]> = [
    ['0.0.0.0', 'unspecified / "this network"'],
    ['0.255.255.255', 'top of 0.0.0.0/8'],
    ['10.0.0.0', 'bottom of RFC1918 10/8'],
    ['10.255.255.255', 'top of RFC1918 10/8'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'top of loopback /8'],
    ['169.254.169.254', 'cloud metadata endpoint - the headline case'],
    ['169.254.0.1', 'link-local'],
    ['172.16.0.0', 'bottom of RFC1918 172.16/12'],
    ['172.31.255.255', 'top of RFC1918 172.16/12'],
    ['192.168.0.1', 'RFC1918 192.168/16'],
    ['192.168.255.255', 'top of RFC1918 192.168/16'],
  ];

  it.each(blocked)('rejects %s (%s)', (address) => {
    expect(checkAddressAllowed(address).allowed).toBe(false);
  });

  // The ranges immediately outside each blocked block. These are the cases a
  // wrong prefix length silently breaks: 172.15/16 and 172.32/16 both sit just
  // outside 172.16.0.0/12, and a mask off by one bit swallows one of them.
  const allowed = ['1.1.1.1', '8.8.8.8', '172.15.255.255', '172.32.0.0', '93.184.216.34'];

  it.each(allowed)('allows public address %s', (address) => {
    expect(checkAddressAllowed(address).allowed).toBe(true);
  });
});

describe('checkAddressAllowed - Feature Spec §6.3 IPv6 ranges', () => {
  const blocked = [
    '::1', // loopback
    'fc00::1', // unique local, bottom of fc00::/7
    'fdff:ffff::1', // unique local, top half of fc00::/7
    'fe80::1', // link-local
    '::', // unspecified
    'ff02::1', // multicast
  ];

  it.each(blocked)('rejects %s', (address) => {
    expect(checkAddressAllowed(address).allowed).toBe(false);
  });

  it('allows a public IPv6 address', () => {
    expect(checkAddressAllowed('2606:4700:4700::1111').allowed).toBe(true);
  });
});

describe('checkAddressAllowed - bypass vectors', () => {
  // The classic one: an IPv4-mapped IPv6 address is in no IPv6 blocklist range,
  // and an IPv4-only check never sees it because it parses as v6.
  it.each(['::ffff:127.0.0.1', '::ffff:169.254.169.254', '::ffff:10.0.0.1', '::ffff:192.168.1.1'])(
    'rejects IPv4-mapped %s by unwrapping it',
    (address) => {
      const verdict = checkAddressAllowed(address);
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toContain('IPv4-mapped');
    },
  );

  it('still allows an IPv4-mapped public address', () => {
    expect(checkAddressAllowed('::ffff:8.8.8.8').allowed).toBe(true);
  });

  // Caught by the `range() !== 'unicast'` half rather than by the §6.3
  // enumeration, which does not list any of these.
  it.each([
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
    ['240.0.0.1', 'reserved'],
    ['100.64.0.1', 'carrier-grade NAT'],
  ])('rejects %s (%s) even though §6.3 does not enumerate it', (address) => {
    expect(checkAddressAllowed(address).allowed).toBe(false);
  });

  it('rejects anything that does not parse as an address', () => {
    expect(checkAddressAllowed('not-an-address').allowed).toBe(false);
    expect(checkAddressAllowed('').allowed).toBe(false);
  });
});

describe('safeFetch - scheme gate (§11.3 step 1)', () => {
  it.each([
    'file:///etc/passwd',
    'gopher://example.com/',
    'ftp://example.com/',
    'data:text/plain,hello',
    'redis://localhost:6379',
  ])('refuses %s without opening a socket', async (url) => {
    const result = await safeFetch({ url, readBody: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('invalid_url');
  });

  it('refuses a string that is not a URL at all', async () => {
    const result = await safeFetch({ url: 'definitely not a url', readBody: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('invalid_url');
  });
});

describe('safeFetch - literal blocked destinations (§11.3 steps 2-4)', () => {
  // Eng §11.3's named test cases, minus the ones needing DNS. No socket is
  // opened for any of these: the literal is validated before connection.
  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1/',
    'http://127.0.0.1:5432/',
    'http://10.0.0.1/',
    'http://192.168.1.1/admin',
    'http://172.16.0.5/',
    'https://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://0.0.0.0/',
  ])('blocks %s', async (url) => {
    const result = await safeFetch({ url, readBody: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('blocked');
  });

  it('reports the matched rule in `detail` for the operator log', async () => {
    const result = await safeFetch({ url: 'http://10.1.2.3/', readBody: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toContain('10.1.2.3');
      // The reason string is what the worker logs. It must never be handed to
      // the user verbatim - see the `blocked` case in ../../src/fetchers/uptime.ts.
      expect(result.detail.length).toBeGreaterThan(0);
    }
  });

  it('blocks a non-default port on a private address just the same', async () => {
    // The gate is about the destination address, not the service behind it.
    // Postgres on 5432 and Redis on 6379 are the two that matter here, and
    // neither is special-cased - the address is what is refused.
    const result = await safeFetch({ url: 'http://10.0.0.1:6379/', readBody: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('blocked');
  });
});
