// apps/web/src/lib/widget-placement.ts
//
// Where a newly added widget goes (Task #219, US-W1).
//
// The API rejects an overlapping widget (FR-3.3), so this picks a free spot
// itself by scanning the board top-left, row by row.

import { GRID_COLUMNS } from '@widgetry/shared';

/** The size every new widget starts at. The config modal sends these too. */
export const NEW_WIDGET_WIDTH = 2;
export const NEW_WIDGET_HEIGHT = 2;

export type Rect = { col: number; row: number; width: number; height: number };

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.col < b.col + b.width &&
    a.col + a.width > b.col &&
    a.row < b.row + b.height &&
    a.row + a.height > b.row
  );
}

/** First free spot, left-to-right/top-to-bottom, where `size` fits without
 *  overlapping `occupied`. Rows have no upper bound (FR-3.1), so one always exists. */
export function findFreeSlot(
  occupied: readonly Rect[],
  size: { width: number; height: number },
  columns: number = GRID_COLUMNS,
): { col: number; row: number } {
  const lowestEdge = occupied.reduce((max, rect) => Math.max(max, rect.row + rect.height), 0);

  for (let row = 0; row <= lowestEdge; row++) {
    for (let col = 0; col + size.width <= columns; col++) {
      const candidate: Rect = { col, row, width: size.width, height: size.height };
      if (!occupied.some((rect) => overlaps(candidate, rect))) return { col, row };
    }
  }

  // Unreachable: at row === lowestEdge nothing can overlap. Kept so the return
  // type holds without a cast.
  return { col: 0, row: lowestEdge };
}
