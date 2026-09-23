// apps/web/src/lib/board-widgets.ts
//
// Maps BoardWidgetPlacement (camelCase, from the api) to BoardWidgetSummary
// (snake_case grid_*, a holdover from #141) for BoardView.
//
// Story #225 / Task #236: config and latest ride along, both null when absent.

import type { BoardWidgetPlacement } from '@widgetry/shared';
import type { BoardWidgetSummary } from '$lib/components/board-view/fixtures.js';

export function toBoardWidgetSummary(widget: BoardWidgetPlacement): BoardWidgetSummary {
  return {
    id: widget.id,
    widgetType: widget.widgetType,
    grid_col: widget.gridCol,
    grid_row: widget.gridRow,
    grid_width: widget.gridWidth,
    grid_height: widget.gridHeight,
    config: widget.config ?? null,
    latest: widget.latest ?? null,
  };
}
