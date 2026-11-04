/**
 * Snapping to other shapes: while drawing or moving, a point or a box's
 * edges and middle line up with the edges and middles of the other shapes on
 * the bed (and the bed itself) when they come within reach. Pure.
 */
import { itemBox } from "./shapes";
import type { Item } from "./types";

export interface SnapLines {
  xs: number[];
  ys: number[];
}

/** The x and y lines other shapes (and the bed) offer: their edges and middles. */
export function snapLines(items: readonly Item[], exclude: readonly string[], bed: [number, number]): SnapLines {
  const xs = new Set<number>([0, bed[0] / 2, bed[0]]);
  const ys = new Set<number>([0, bed[1] / 2, bed[1]]);
  for (const it of items) {
    if (it.hidden || exclude.includes(it.id)) continue;
    const b = itemBox(it);
    if (!b) continue;
    xs.add(b[0]).add((b[0] + b[2]) / 2).add(b[2]);
    ys.add(b[1]).add((b[1] + b[3]) / 2).add(b[3]);
  }
  return { xs: [...xs], ys: [...ys] };
}

/** The nearest line within reach of `v`, or null. */
export function nearestLine(v: number, lines: readonly number[], reach: number): number | null {
  let best: number | null = null;
  let bestD = reach;
  for (const l of lines) {
    const d = Math.abs(l - v);
    if (d <= bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}

export interface SnappedPoint {
  p: [number, number];
  /** The lines snapped to, for drawing guides. */
  guideX: number | null;
  guideY: number | null;
}

/** A drawn point pulled onto the nearest lines within reach. */
export function snapPoint(p: [number, number], lines: SnapLines, reach: number): SnappedPoint {
  const x = nearestLine(p[0], lines.xs, reach);
  const y = nearestLine(p[1], lines.ys, reach);
  return { p: [x ?? p[0], y ?? p[1]], guideX: x, guideY: y };
}

export interface SnappedMove {
  dx: number;
  dy: number;
  guideX: number | null;
  guideY: number | null;
}

/**
 * A move of a box by (dx, dy), adjusted so one of the box's edges or its
 * middle lands on a line when within reach (the nearest wins).
 */
export function snapBoxMove(box: [number, number, number, number], dx: number, dy: number, lines: SnapLines, reach: number): SnappedMove {
  const along = (edges: number[], d: number, cands: readonly number[]): [number, number | null] => {
    let best: [number, number | null] = [d, null];
    let bestD = reach;
    for (const e of edges) {
      for (const l of cands) {
        const gap = Math.abs(e + d - l);
        if (gap <= bestD) {
          bestD = gap;
          best = [l - e, l];
        }
      }
    }
    return best;
  };
  const [ndx, guideX] = along([box[0], (box[0] + box[2]) / 2, box[2]], dx, lines.xs);
  const [ndy, guideY] = along([box[1], (box[1] + box[3]) / 2, box[3]], dy, lines.ys);
  return { dx: ndx, dy: ndy, guideX, guideY };
}

/** Tick spacing for a ruler: a round number of millimetres at least `minPx` apart on screen. */
export function rulerStep(scale: number, minPx = 60): number {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  for (const s of steps) if (s * scale >= minPx) return s;
  return 1000;
}
