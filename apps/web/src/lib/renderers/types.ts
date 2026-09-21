// apps/web/src/lib/renderers/types.ts
//
// What a renderer is given for one widget on the board (Story #223, EX-22/EX-23).
//
// The presentational components in $lib/widgets take fixture-shaped props: a
// title plus a value or a series. A renderer is the adapter between a board
// widget and those props, so replacing a fixture with live data is a change
// here and never in the components themselves.

export type RenderableWidget = {
  id: string;
  /**
   * A registry key. A plain string, not the WidgetType enum, because that is how
   * the board payload types it (BoardWidgetSummary.widgetType).
   */
  widgetType: string;
  /** The saved config. Not on the board payload yet (Story #225). */
  config?: Record<string, unknown> | null;
  /** The latest snapshot value of a server-polled widget. Not on the payload yet (Story #225). */
  latest?: unknown;
};
