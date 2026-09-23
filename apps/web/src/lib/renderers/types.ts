// apps/web/src/lib/renderers/types.ts
//
// What a renderer is given for one widget on the board (Story #223, EX-22/EX-23).
// A renderer adapts this to the fixture-shaped props $lib/widgets components take.

import type { LatestSnapshot } from '@widgetry/shared';

export type RenderableWidget = {
  id: string;
  /** A registry key - a plain string, matching BoardWidgetSummary.widgetType. */
  widgetType: string;
  /** The allowlisted display config the api sends (Story #225). Null when absent. */
  config?: Record<string, unknown> | null;
  /** Newest snapshot, exactly one of value/error set. Null when never polled or local. */
  latest?: LatestSnapshot | null;
};
