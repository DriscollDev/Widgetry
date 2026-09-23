// apps/web/src/lib/renderers/registry.ts
//
// Which component draws which widget type (Story #223, EX-22/EX-23).
//
// A Map, not a plain object: a widget type comes from the database, and an
// object lookup would resolve "constructor" or "__proto__" to something that is
// not a renderer.

import type { Component } from 'svelte';
import type { WidgetType } from '@widgetry/shared';
import ClockRenderer from './ClockRenderer.svelte';
import CurrencyRenderer from './CurrencyRenderer.svelte';
import CustomJsonRenderer from './CustomJsonRenderer.svelte';
import UptimeRenderer from './UptimeRenderer.svelte';
import FallbackRenderer from './FallbackRenderer.svelte';
import type { RenderableWidget } from './types';

export type WidgetRenderer = Component<{ widget: RenderableWidget }>;

// Types with a real renderer. Clock is client-local and needs no data; the
// Weather, Currency and Stock components register here as their adapters land.
//
// `datetime` maps to ClockRenderer on purpose: F5.1 and F5.2 merged into one
// type whose `display` field chooses between them, and the old id is retired
// rather than deleted (see WidgetTypeDef.hiddenFromCatalog), so its existing
// rows must keep drawing something real instead of falling to the fallback.
const RENDERERS = new Map<WidgetType, WidgetRenderer>([
  ['clock', ClockRenderer],
  ['datetime', ClockRenderer],
  ['currency', CurrencyRenderer],
  ['custom_json', CustomJsonRenderer],
  ['uptime', UptimeRenderer],
]);

/** The renderer for a widget type, or the fallback when there is none yet. */
export function rendererFor(widgetType: string): WidgetRenderer {
  return RENDERERS.get(widgetType as WidgetType) ?? FallbackRenderer;
}

/** Every type with a real renderer. Exposed so a test can hold it to the catalog. */
export function registeredWidgetTypes(): string[] {
  return [...RENDERERS.keys()];
}
