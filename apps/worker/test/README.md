# Worker tests

`test/unit/` runs on every PR and is pure - no Redis, no Postgres, no network.

There is **no `test/integration/` directory yet**, which is why the package's
`test:integration` script is an `echo` stub matching the other packages that
have none. Do not point it at `vitest run --dir test/integration` before the
directory exists: vitest exits 1 when it finds no files, which fails CI without
anything being wrong.

## Integration tests this service owes

Three gaps are known and were deliberately left rather than faked. Each needs
infrastructure the unit suite does not have.

### 1. SSRF gate against a hostname that resolves to a private address

Eng §11.3's test plan names four cases. Three are covered in
`test/unit/safe-fetch.test.ts` (bad scheme, and literal private addresses, which
need no DNS and are therefore hermetic). The fourth - a real hostname whose A
record points somewhere private - needs a stub resolver or a controlled DNS
zone.

It must not be written as a live-network test. A security test that quietly
turns into a no-op when CI has no egress is worse than no test, because it
reports green.

### 2. Scheduler claim-on-sweep, against a real Postgres

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

### 3. Retention purge

`runPurge` deletes by `ctid` in batches against a live table. Worth proving that
it respects per-widget `retention_hours` rather than a single global cutoff, and
that the batch loop terminates on a backlog larger than one batch.

## When adding the directory

Copy the `_ci_test` guard from `apps/api/test/integration/` - the same rule
applies here, and for the same reason: these tests write to a database, and
Postgres is remote and shared (locked decision 9). Then change the
`test:integration` script to `vitest run --dir test/integration`.
