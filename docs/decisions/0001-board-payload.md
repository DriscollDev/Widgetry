# 0001 - What widget data goes on the board payload

Status: Accepted. Task #233, Story #225.

## Context

GET /v1/boards/:id returns each widget's placement only. Renderers (Story #223)
and widget states (Story #224) need each widget's config and its latest snapshot.
Eng section 12 says the board response carries each widget's latest value.

## Decision

1. Config goes out through an allowlist, per widget type. A field is private
   until someone adds it to the list, so a new config field cannot leak by
   default.
   - uptime: url.
   - custom_json: url, method, display format, json path. Never headers.
   - clock, datetime: nothing (their schema is empty).
   - other types: nothing until their schema exists and is reviewed.
   The credential is a separate table and never appears in any response
   (FR-6.2).
2. Each widget carries latest: the most recent snapshot as
   { capturedAt, value, error }, exactly one of value or error set, or null when
   the widget has no snapshot (local widgets, brand-new server-polled ones).
3. The latest snapshots for a whole board come from one query, not one per
   widget: DISTINCT ON (widget_id) ordered by captured_at DESC, using the
   widget_id + captured_at index, joined through boards and filtered by the
   owner (Eng 11.7, EX-18).

## Why

- An allowlist fails safe. A denylist of "headers" fails open the day someone adds
  a secret field.
- 20 widgets per board and a 2 second load budget (FR-2.4) rule out 20 queries.
- Scoping through boards keeps the isolation rule in one place.

## Size budget

Value and error are jsonb of unbounded size. A widget's value stays small by
design (a status, a number, a short list). If a custom_json value could exceed
a few KB, truncate it when the snapshot is written, not on read. Revisit if the
board response for 20 widgets passes about 100 KB.

## Consequences

- #234 adds config and latest to the shared schema.
- #235 implements the query and the allowlist in the board detail route.
- #236 maps both onto the renderers.
- Any new widget type adds its allowlist entry with its schema, with a test.
