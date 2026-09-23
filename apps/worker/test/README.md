# Worker tests

`test/unit/` runs on every PR and is pure - no Redis, no Postgres, no network.

There is **no `test/integration/` directory yet**, which is why the package's
`test:integration` script is an `echo` stub matching the other packages that
have none. Do not point it at `vitest run --dir test/integration` before the
directory exists: vitest exits 1 when it finds no files, which fails CI without
anything being wrong.

## Integration tests this service owes

Two gaps remain and are deliberately left rather than faked. Each needs
infrastructure the unit suite does not have.

~~SSRF gate against a hostname that resolves to a private address~~ - closed
(EX-28/EX-30, 2026-09-22). Eng §11.3's test plan names four cases; all four are
now covered in `test/unit/`. The fourth - a real hostname whose A record points
somewhere private - turned out not to need a stub DNS zone or a live network
after all: `test/unit/safe-fetch-dns-rebinding.test.ts` mocks `node:dns` itself
(`vi.mock('node:dns', ...)`), which is a stub resolver with zero infrastructure
cost, and exercises `resolveAndValidate`, `guardedLookup` (the actual
connect-time pin - previously untested anywhere, since every other case uses a
literal address that never reaches it) and `safeFetch` end to end against a
rebound answer.

The EX-30 half - "asserts both the error-code snapshot and `last_polled_at`
advanced" - similarly turned out to be provable without a real Postgres: it's
about the application-level mapping from a poll outcome to two specific writes,
which a DB mock that actually *captures* the `update().set()` argument (rather
than discarding it, as the mock here used to) can assert directly.
`test/unit/poll-widget.test.ts`'s "SSRF regression suite (EX-30)" block drives
a real `customJsonFetcher` against a real (unmocked) `safeFetch` and a literal
blocked address, and asserts the written snapshot's `error.kind` and the
`update`'s `lastPolledAt` together. The scheduler gap below is different in
kind - its correctness is genuinely about Postgres's own locking and ordering
semantics, which a mock cannot stand in for.

~~EX-29 (redirect re-validation) and EX-Size-Timeout~~ - the HTTP mechanics are
closed (2026-09-22): `test/unit/safe-fetch-http.test.ts` runs a real local
server and exercises `requestOnce` directly - redirect-status detection for
301/302/303/307/308, a redirect with no Location falling back to an ordinary
response, the timeout firing before a slow response completes, and the byte
cap enforced by counting bytes (not trusting `Content-Length`, including the
boundary at exactly the cap).

**One thing this does NOT cover, and there is no test server that can close
it**: `safeFetch`'s own redirect LOOP - re-running `resolveAndValidate` on each
hop's Location and counting redirects across hops (as opposed to `requestOnce`
correctly reporting a single hop as a redirect, which is now tested). Every
`safeFetch` test needs an address the SSRF gate accepts; the only address this
sandbox can bind a server to is loopback, which the gate correctly refuses
before `requestOnce` is ever called. Testing the loop for real would need
either live internet egress (rejected elsewhere in this suite for the same
reason a rebinding test was not written against a live network) or weakening
the blocklist for a test, which defeats the point of testing it. The loop
itself is short and has been read line by line; `resolveAndValidate` and
`requestOnce`'s redirect detection are each independently proven correct now.
This is a structural gap the SSRF gate's own strictness creates, not an
oversight - worth knowing if EX-29 is ever marked fully verified rather than
implemented-and-reviewed.

### 1. Scheduler claim-on-sweep, against a real Postgres

`runSchedulerTick` is the one piece whose correctness is entirely about database
semantics, so a unit test with a mocked client would assert nothing worth
knowing. What needs proving:

- a widget with a null `refresh_interval_seconds` is never claimed
- `last_polled_at` advances in the same statement that selects, so a second tick
  running before the job finishes does not re-enqueue (Eng §8.2, the retry-chain
  window)
- `FOR UPDATE SKIP LOCKED` gives two concurrent sweeps disjoint sets
- `ORDER BY last_polled_at ASC` drains a backlog larger than
  `SCHEDULER_BATCH_SIZE` fairly, rather than starving the same rows

### 2. Retention purge

`runPurge` deletes by `ctid` in batches against a live table. Worth proving that
it respects per-widget `retention_hours` rather than a single global cutoff, and
that the batch loop terminates on a backlog larger than one batch.

## When adding the directory

Copy the `_ci_test` guard from `apps/api/test/integration/` - the same rule
applies here, and for the same reason: these tests write to a database, and
Postgres is remote and shared (locked decision 9). Then change the
`test:integration` script to `vitest run --dir test/integration`.
