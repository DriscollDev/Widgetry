// apps/web/src/lib/renderers/uptime-adapter.ts
//
// Board widget -> UptimeRenderer props (Story #223, US-W-Uptime, FR-4.4).
//
// A pure function rather than logic inside the renderer, for the same reason as
// custom-json-adapter.ts: the mapping is unit-tested without mounting Svelte,
// and the component stays a thin shell.
//
// WHAT IT BRIDGES. The api sends the allowlisted config (`url` - the only key
// uptime has, see the api's config-view.ts) plus `latest`, whose value for this
// type is `{ status, httpStatus, responseTimeMs }` (UptimeSnapshotValue in
// packages/shared).
//
// NO HISTORY CHART YET. Feature Spec §4.4 asks for "current status, latest
// response time, history chart". A board payload carries ONE snapshot, not a
// series, so the first two are answerable today and the third is not until
// GET /v1/widgets/:id/snapshots lands (EX-Snapshots-Endpoint). This follows the
// precedent the E6 code owners set on 2026-09-21 for the custom widget's series
// primitives: show the real current value rather than a chart drawn from a
// single point, which would read as "100% uptime over all of history" from one
// successful ping. When the endpoint lands, the series is filled in here and
// UptimeHistoryWidget.svelte renders the strip - no other file changes.
//
// ERROR AND LOADING ARE NOT HERE. `uptime` is in SERVER_POLLED_WIDGET_TYPES, so
// WidgetFrame (Task #246) decides loading/error from widgetState() before this
// renderer is ever mounted. `ok: false` below is the narrower case the frame
// cannot see: a snapshot that IS a value row but does not parse as an uptime
// payload, or a config with no url.

import type { WidgetStatus } from '$lib/widgets/status';
import { agoLabel, isRecord, readLatest } from './snapshot-read';
import type { RenderableWidget } from './types';

/** What the renderer needs, or a reason it cannot draw at all. */
export type UptimeView =
  | {
      ok: true;
      /** The polled URL, from config. Shown so the widget says what it is watching. */
      target: string;
      /**
       * 'up' or 'down' only. `WidgetStatus` also has 'degraded', which this type
       * never produces - uptimeStatusFor() in packages/shared is a two-way split
       * on `httpStatus < 400`. Typed as WidgetStatus anyway so STATUS_META keys
       * line up without a cast.
       */
      status: WidgetStatus;
      /** Null when no response was ever received (the network-failure 'down' case). */
      httpStatus: number | null;
      responseTimeMs: number;
      /** "2 min ago". Undefined when capturedAt is unreadable. */
      updatedAtLabel: string | undefined;
    }
  | { ok: false; reason: string };

/** The polled URL from the allowlisted config, or null when it is not there. */
function readTarget(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  return typeof raw.url === 'string' && raw.url.length > 0 ? raw.url : null;
}

/**
 * Narrow a snapshot value into an uptime reading.
 *
 * Checks each field rather than running UptimeSnapshotValue.safeParse: the
 * schema is the worker's write contract, and holding a stored row to it on the
 * read side turns a row written by an older worker into a broken widget. The
 * three fields below are what the renderer draws; a row carrying extra keys
 * renders fine.
 */
function readReading(
  value: unknown,
): { status: WidgetStatus; httpStatus: number | null; responseTimeMs: number } | null {
  if (!isRecord(value)) return null;

  const { status, httpStatus, responseTimeMs } = value;
  if (status !== 'up' && status !== 'down') return null;
  if (typeof responseTimeMs !== 'number' || !Number.isFinite(responseTimeMs)) return null;

  return {
    status,
    httpStatus: typeof httpStatus === 'number' && Number.isFinite(httpStatus) ? httpStatus : null,
    responseTimeMs,
  };
}

/** Map one board widget onto UptimeRenderer's props. */
export function toUptimeView(widget: RenderableWidget): UptimeView {
  const target = readTarget(widget.config);
  if (target === null) {
    return { ok: false, reason: 'This widget has no URL to monitor.' };
  }

  const latest = readLatest(widget.latest);

  // WidgetFrame already turned these into its own states; reaching them here
  // means the frame did not run (a renderer mounted directly, as in a test).
  if (latest?.error) return { ok: false, reason: latest.error.message };
  if (!latest) return { ok: false, reason: 'This widget has not been checked yet.' };

  const reading = readReading(latest.value);
  if (!reading) {
    return { ok: false, reason: 'The last check could not be read.' };
  }

  return {
    ok: true,
    target,
    status: reading.status,
    httpStatus: reading.httpStatus,
    responseTimeMs: reading.responseTimeMs,
    updatedAtLabel: agoLabel(latest.capturedAt),
  };
}
