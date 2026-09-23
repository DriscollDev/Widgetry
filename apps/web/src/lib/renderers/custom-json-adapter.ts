// apps/web/src/lib/renderers/custom-json-adapter.ts
//
// Board widget -> CustomWidget props (Story #223, Task #236, E6).
//
// Kept as a pure function rather than living inside the renderer so the mapping
// is testable without mounting Svelte, and so the component stays a thin shell.
//
// WHAT IT BRIDGES. The api sends the allowlisted config (`title`, `layoutId`,
// `accent`, `slots`, `url`) plus `latest` - the newest snapshot, whose value for
// a custom widget is `{ slots: [...], slotCount }`. CustomWidget wants a config
// object and a positional `SlotData[]`. Everything below is that translation,
// plus the defensive reading a jsonb column deserves.
//
// SERIES PRIMITIVES. `line` and `uptime-strip` chart a value OVER TIME, and a
// board payload carries one snapshot, not a history. Until
// GET /v1/widgets/:id/snapshots exists (EX-Snapshots-Endpoint) they render their
// latest value with a note rather than an empty chart - decided with the E6 code
// owners, 2026-09-21. When the endpoint lands, this is where the series is
// filled in and nothing else changes.

import {
  getLayout,
  needsSeries,
  type CustomJsonSnapshotValue,
  type LatestSnapshot,
  type SlotConfig,
} from '@widgetry/shared';
import type { CustomWidgetConfig, SlotData } from '$lib/widgets/custom/types';
import { agoLabel, isRecord, readLatest } from './snapshot-read';
import type { RenderableWidget } from './types';

/** What the renderer needs, or a reason it cannot draw at all. */
export type CustomJsonView =
  | { ok: true; config: CustomWidgetConfig; slotData: SlotData[] }
  | { ok: false; reason: string };

/**
 * Narrow the allowlisted config into the shape CustomWidget takes.
 *
 * Returns null rather than throwing on anything unexpected: this reads a jsonb
 * column filtered by an allowlist, so a row written before a schema change can
 * legitimately arrive with fields missing. A widget that cannot be described is
 * an error state, never a crashed board.
 */
function readConfig(raw: unknown): CustomWidgetConfig | null {
  if (!isRecord(raw)) return null;

  const layoutId = raw.layoutId;
  const slots = raw.slots;
  if (typeof layoutId !== 'string' || !Array.isArray(slots) || slots.length === 0) return null;

  // getLayout falls back to 'single' for an unknown id, which would silently
  // draw the wrong arrangement. An id we do not know is a config we cannot honour.
  const layout = getLayout(layoutId as CustomWidgetConfig['layoutId']);
  if (layout.id !== layoutId) return null;

  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    layoutId: layout.id,
    accent: (typeof raw.accent === 'string'
      ? raw.accent
      : 'primary') as CustomWidgetConfig['accent'],
    // Not sent by the api and not read by the renderer; present because the
    // component's type carries them. See the allowlist in the api's config-view.
    endpointUrl: typeof raw.url === 'string' ? raw.url : '',
    authType: 'none',
    slots: slots as SlotConfig[],
  };
}

/** The snapshot's per-slot results, or null when the value is not one. */
function readSlotValues(latest: LatestSnapshot | null | undefined): CustomJsonSnapshotValue | null {
  if (!latest || latest.error || !isRecord(latest.value)) return null;
  const slots = latest.value.slots;
  if (!Array.isArray(slots)) return null;
  return latest.value as unknown as CustomJsonSnapshotValue;
}

/**
 * One slot's runtime state.
 *
 * A series primitive with no history yet is `stale`, not `error`: the value is
 * real and current, it is only the chart that is missing, and an error state
 * would misreport a working widget.
 */
function toSlotData(
  slot: SlotConfig,
  stored: CustomJsonSnapshotValue['slots'][number] | undefined,
  capturedAt: string,
): SlotData {
  if (!stored) {
    // The config gained a slot since this row was written (US-C6).
    return { state: 'loading' };
  }

  if (!stored.ok) {
    return { state: 'error', errorMessage: stored.reason };
  }

  const value = stored.value;
  if (value === null) {
    return { state: 'error', errorMessage: `${slot.label} resolved to null.` };
  }

  const scalar = typeof value === 'boolean' ? String(value) : value;

  if (needsSeries(slot.primitive)) {
    return {
      state: 'stale',
      value: scalar,
      updatedAtLabel: agoLabel(capturedAt) ?? 'History is not available yet',
    };
  }

  return { state: 'value', value: scalar, updatedAtLabel: agoLabel(capturedAt) };
}

/**
 * Map one board widget onto CustomWidget's props.
 *
 * Slot data is positional and padded to the CONFIG's slot count, so a stored row
 * that is shorter (config gained a slot) or longer (config lost one) renders the
 * current layout rather than the old one.
 */
export function toCustomJsonView(widget: RenderableWidget): CustomJsonView {
  const config = readConfig(widget.config);
  if (!config) {
    return { ok: false, reason: 'This widget’s configuration could not be read.' };
  }

  const latest = readLatest(widget.latest);

  if (latest?.error) {
    return { ok: false, reason: latest.error.message };
  }

  const snapshot = readSlotValues(latest);
  if (!snapshot || !latest) {
    // Never polled yet, or a local row with no snapshot: every slot is loading.
    return { ok: true, config, slotData: config.slots.map(() => ({ state: 'loading' })) };
  }

  const slotData = config.slots.map((slot, index) =>
    toSlotData(slot, snapshot.slots[index], latest.capturedAt),
  );

  return { ok: true, config, slotData };
}
