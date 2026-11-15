/**
 * Step and repeat (pure): copies of the selection in a grid, `cols` across and `rows` up, each a gap apart (the
 * selection's own box plus the gap). The originals stay where they are as the first copy, bottom left; copies of a
 * group make groups of their own.
 */
import { copiesOf } from "./clipboard";
import { itemBox } from "./shapes";
import type { Item } from "./types";

/** The most copies made at once. */
export const MOST_COPIES = 500;

export function boxOfItems(items: readonly Item[]): [number, number, number, number] | null {
  let b: [number, number, number, number] | null = null;
  for (const it of items) {
    const ib = itemBox(it);
    if (!ib) continue;
    b = b ? [Math.min(b[0], ib[0]), Math.min(b[1], ib[1]), Math.max(b[2], ib[2]), Math.max(b[3], ib[3])] : ib;
  }
  return b;
}

/** The new copies (not the originals), or [] if there's nothing to copy or too many would be made. */
export function repeatedItems(existing: readonly Item[], picked: readonly Item[], cols: number, rows: number, gapX: number, gapY: number): Item[] {
  const box = boxOfItems(picked);
  cols = Math.max(1, Math.floor(cols));
  rows = Math.max(1, Math.floor(rows));
  if (!box || cols * rows <= 1 || cols * rows > MOST_COPIES) return [];
  const stepX = box[2] - box[0] + gapX;
  const stepY = box[3] - box[1] + gapY;
  let all: Item[] = [...existing];
  const made: Item[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (!r && !c) continue;
      const copies = copiesOf(all, picked, c * stepX, r * stepY);
      all = [...all, ...copies];
      made.push(...copies);
    }
  return made;
}
