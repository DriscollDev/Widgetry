// apps/web/src/lib/board-widgets.ts
//
// One widget from the board API (BoardWidgetPlacement, camelCase) as BoardView
// takes it (BoardWidgetSummary, snake_case grid_* - a holdover from #141).
//
// Story #225 / Task #236: config and latest ride along so the renderers can use
// them. Both are null when the api sent none, so a renderer sees one "nothing
// here" value and never has to tell absent from null.

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
