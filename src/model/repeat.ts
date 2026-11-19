/**
 * Step and repeat (pure): copies of the selection in a grid, `cols` across and `rows` up, each a gap apart (the
 * selection's own box plus the gap). The originals stay where they are as the first copy, bottom left; copies of a
 * group make groups of their own. Also copies round a circle, and along a path.
 */
import { copiesOf } from "./clipboard";
import { boxCentre, itemBox, movedItem, rotatedItemAbout } from "./shapes";
import { pathPoints } from "../geometry/segments";
import type { Item, Outline } from "./types";

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

/** Where along a path (mm from its start) copy k of `count` goes: spread over a closed path, end to end on an open one. */
export function pathSpots(length: number, closed: boolean, count: number): number[] {
  if (count < 1) return [];
  if (closed) return Array.from({ length: count }, (_, k) => (length * k) / count);
  if (count === 1) return [length / 2];
  return Array.from({ length: count }, (_, k) => (length * k) / (count - 1));
}

/** The point and direction (degrees) `d` mm along a run of points. */
function walk(pts: [number, number][], along: number[], d: number): { at: [number, number]; deg: number } {
  let i = 1;
  while (i < pts.length - 1 && along[i] < d) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const len = along[i] - along[i - 1] || 1e-9;
  const t = Math.min(1, Math.max(0, (d - along[i - 1]) / len));
  return { at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], deg: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI };
}

/**
 * Copy along a path (LightBurn's Copy Along Path): `count` copies of the selection with their middles on the path's
 * outline, evenly spaced (round a closed path, end to end along an open one). With `turn`, each copy turns to follow the
 * path (as drawn, a copy faces along the path where it runs left to right). The originals stay where they are.
 */
export function alongPathItems(existing: readonly Item[], picked: readonly Item[], path: Outline, count: number, turn: boolean): Item[] {
  const box = boxOfItems(picked);
  count = Math.floor(count);
  if (!box || count < 1 || count > MOST_COPIES) return [];
  const raw = pathPoints(path.segments, path.closed, 0.02);
  const pts: [number, number][] = path.closed && raw.length ? [...raw, raw[0]] : raw;
  if (pts.length < 2) return [];
  const along = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const length = along[along.length - 1];
  if (!(length > 0)) return [];
  const mid = boxCentre(box);
  let all: Item[] = [...existing];
  const made: Item[] = [];
  for (const d of pathSpots(length, path.closed, count)) {
    const { at, deg } = walk(pts, along, d);
    let copies = copiesOf(all, picked, at[0] - mid[0], at[1] - mid[1]);
    if (turn && Math.abs(deg) > 1e-9) copies = copies.map((it) => rotatedItemAbout(it, deg, at));
    all = [...all, ...copies];
    made.push(...copies);
  }
  return made;
}
