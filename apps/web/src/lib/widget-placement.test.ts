import { describe, expect, it } from 'vitest';
import { findFreeSlot, NEW_WIDGET_HEIGHT, NEW_WIDGET_WIDTH, type Rect } from './widget-placement';

const size = { width: NEW_WIDGET_WIDTH, height: NEW_WIDGET_HEIGHT };
const box = (col: number, row: number, width = 2, height = 2): Rect => ({
  col,
  row,
  width,
  height,
});

const overlap = (a: Rect, b: Rect) =>
  a.col < b.col + b.width &&
  a.col + a.width > b.col &&
  a.row < b.row + b.height &&
  a.row + a.height > b.row;

describe('findFreeSlot (Task #219, US-W1)', () => {
  it('starts in the top-left corner of an empty board', () => {
    expect(findFreeSlot([], size)).toEqual({ col: 0, row: 0 });
  });

  it('goes to the right of a widget in the corner', () => {
    expect(findFreeSlot([box(0, 0)], size)).toEqual({ col: 2, row: 0 });
  });

  it('starts a new row once the first row is full', () => {
    const fullRow = [0, 2, 4, 6, 8, 10].map((col) => box(col, 0));
    expect(findFreeSlot(fullRow, size)).toEqual({ col: 0, row: 2 });
  });

  it('fills a gap between two widgets', () => {
    expect(findFreeSlot([box(0, 0), box(4, 0)], size)).toEqual({ col: 2, row: 0 });
  });

  it('skips a gap that is too narrow', () => {
    expect(findFreeSlot([box(0, 0), box(3, 0)], size)).toEqual({ col: 5, row: 0 });
  });

  it('goes around a tall widget', () => {
    expect(findFreeSlot([box(0, 0, 2, 6)], size)).toEqual({ col: 2, row: 0 });
  });

  it('skips past a neighbour when the new widget is wide', () => {
    expect(findFreeSlot([box(4, 0)], { width: 6, height: 2 })).toEqual({ col: 6, row: 0 });
  });

  it('places twenty widgets one after another without overlap', () => {
    const placed: Rect[] = [];
    for (let i = 0; i < 20; i++) {
      placed.push({ ...findFreeSlot(placed, size), ...size });
    }

    expect(placed[6]).toMatchObject({ col: 0, row: 2 });
    expect(placed[18]).toMatchObject({ col: 0, row: 6 });
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlap(placed[i]!, placed[j]!), `widgets ${i} and ${j}`).toBe(false);
      }
    }
  });
});
