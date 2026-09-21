// apps/web/src/lib/renderers/registry.ts
//
// Which component draws which widget type (Story #223, EX-22/EX-23).
//
// A Map, not a plain object: a widget type comes from the database, and an
// object lookup would resolve "constructor" or "__proto__" to something that is
// not a renderer.

import type { Component } from 'svelte';
import type { WidgetType } from '@widgetry/shared';
import FallbackRenderer from './FallbackRenderer.svelte';
import type { RenderableWidget } from './types';

export type WidgetRenderer = Component<{ widget: RenderableWidget }>;

// Types with a real renderer. Empty until the Clock and Date/Time Task adds
// 'clock' and 'datetime'; the Weather, Uptime and Stock components from
// $lib/widgets register here as their adapters land.
const RENDERERS = new Map<WidgetType, WidgetRenderer>();

/** The renderer for a widget type, or the fallback when there is none yet. */
export function rendererFor(widgetType: string): WidgetRenderer {
  return RENDERERS.get(widgetType as WidgetType) ?? FallbackRenderer;
}

/** Every type with a real renderer. Exposed so a test can hold it to the catalog. */
export function registeredWidgetTypes(): string[] {
  return [...RENDERERS.keys()];
}
