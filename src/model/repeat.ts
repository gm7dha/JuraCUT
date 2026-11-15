/**
 * Step and repeat (pure): copies of the selection in a grid, `cols` across and `rows` up, each a gap apart (the
 * selection's own box plus the gap). The originals stay where they are as the first copy, bottom left; copies of a
 * group make groups of their own.
 */
import { copiesOf } from "./clipboard";
import { boxCentre, itemBox, movedItem, rotatedItemAbout } from "./shapes";
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

/**
 * Copies round a circle: `count` in all (the originals the first, at the top), evenly spaced clockwise round a circle
 * `radius` mm from the selection's middle to the circle's middle (straight below it). With `turn` each copy turns
 * with the circle (like numbers on a clock face made from one at the top); without, it keeps facing the same way.
 */
export function roundItems(existing: readonly Item[], picked: readonly Item[], count: number, radius: number, turn: boolean): Item[] {
  const box = boxOfItems(picked);
  count = Math.floor(count);
  if (!box || count < 2 || count > MOST_COPIES || !(radius > 0)) return [];
  const mid = boxCentre(box);
  const centre: [number, number] = [mid[0], mid[1] - radius];
  let all: Item[] = [...existing];
  const made: Item[] = [];
  for (let k = 1; k < count; k++) {
    const deg = (-360 * k) / count;
    const a = (deg * Math.PI) / 180;
    let copies = copiesOf(all, picked, 0, 0);
    if (turn) copies = copies.map((it) => rotatedItemAbout(it, deg, centre));
    else {
      const to: [number, number] = [centre[0] - radius * Math.sin(a), centre[1] + radius * Math.cos(a)];
      copies = copies.map((it) => movedItem(it, to[0] - mid[0], to[1] - mid[1]));
    }
    all = [...all, ...copies];
    made.push(...copies);
  }
  return made;
}
