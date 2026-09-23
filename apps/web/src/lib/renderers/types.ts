// apps/web/src/lib/renderers/types.ts
//
// What a renderer is given for one widget on the board (Story #223, EX-22/EX-23).
//
// The presentational components in $lib/widgets take fixture-shaped props: a
// title plus a value or a series. A renderer is the adapter between a board
// widget and those props, so replacing a fixture with live data is a change
// here and never in the components themselves.

import type { LatestSnapshot } from '@widgetry/shared';

export type RenderableWidget = {
  id: string;
  /**
   * A registry key. A plain string, not the WidgetType enum, because that is how
   * the board payload types it (BoardWidgetSummary.widgetType).
   */
  widgetType: string;
  /** The allowlisted display config the api sends (Story #225). Null when there is none. */
  config?: Record<string, unknown> | null;
  /**
   * The widget's newest snapshot: `{ capturedAt, value, error }`, exactly one of
   * value and error set. Null for a widget never polled and for local widgets.
   */
  latest?: LatestSnapshot | null;
};
