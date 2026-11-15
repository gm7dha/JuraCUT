/**
 * Snapping to other shapes: while drawing or moving, a point or a box's
 * edges and middle line up with the edges and middles of the other shapes on
 * the bed (and the bed itself) when they come within reach. Pure.
 */
import { itemBox, itemOutlines } from "./shapes";
import type { Item } from "./types";

export interface SnapLines {
  xs: number[];
  ys: number[];
  /** Points to snap to (corners, ends, middles, centres of other shapes); they win over lines. */
  points?: [number, number][];
}

/** The most points offered (big imported drawings have thousands of corners; the first ones are enough). */
export const MOST_SNAP_POINTS = 4000;

/** A shape's points worth snapping to: corners and ends, middles of straight pieces, centres of round ones. */
export function shapePoints(item: Item): [number, number][] {
  if (item.kind === "text" || item.kind === "qr") return [];
  if (item.kind === "circle") {
    const { cx, cy, r } = item;
    return [[cx, cy], [cx + r, cy], [cx, cy + r], [cx - r, cy], [cx, cy - r]];
  }
  const out: [number, number][] = [];
  for (const o of itemOutlines(item)) {
    for (const s of o.segments) {
      if (s.kind === "line") out.push(s.from, s.to, [(s.from[0] + s.to[0]) / 2, (s.from[1] + s.to[1]) / 2]);
      else if (s.kind === "circle" || s.kind === "ellipse") out.push(s.center);
      else if (s.kind === "arc" || s.kind === "bezier" || s.kind === "ellipseArc") out.push(s.from, s.to);
    }
  }
  if (item.kind === "polygon") out.push([item.cx, item.cy]);
  return out;
}

/** The x and y lines other shapes (and the bed) offer: their edges and middles. */
export function snapLines(items: readonly Item[], exclude: readonly string[], bed: [number, number]): SnapLines {
  const xs = new Set<number>([0, bed[0] / 2, bed[0]]);
  const ys = new Set<number>([0, bed[1] / 2, bed[1]]);
  const points: [number, number][] = [];
  for (const it of items) {
    if (it.hidden || exclude.includes(it.id)) continue;
    const b = itemBox(it);
    if (!b) continue;
    xs.add(b[0]).add((b[0] + b[2]) / 2).add(b[2]);
    ys.add(b[1]).add((b[1] + b[3]) / 2).add(b[3]);
    if (points.length < MOST_SNAP_POINTS) points.push(...shapePoints(it).slice(0, MOST_SNAP_POINTS - points.length));
  }
  return { xs: [...xs], ys: [...ys], points };
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
  /** The shape's point snapped to, if one was. */
  point?: [number, number];
}

/**
 * A move by (dx, dy) adjusted so one of the moving shapes' points lands on another shape's point, when one comes
 * within reach (the nearest pair wins). Null when none does.
 */
export function snapPointsMove(own: readonly [number, number][], dx: number, dy: number, targets: readonly [number, number][], reach: number): { dx: number; dy: number; point: [number, number] } | null {
  let best: { dx: number; dy: number; point: [number, number] } | null = null;
  let bestD = reach;
  for (const p of own) {
    const x = p[0] + dx;
    const y = p[1] + dy;
    for (const q of targets) {
      const ex = Math.abs(q[0] - x);
      if (ex > bestD) continue;
      const d = Math.hypot(ex, q[1] - y);
      if (d <= bestD) {
        bestD = d;
        best = { dx: q[0] - p[0], dy: q[1] - p[1], point: q };
      }
    }
  }
  return best;
}

/** A drawn point pulled onto another shape's point within reach (they win), else the nearest lines within reach. */
export function snapPoint(p: [number, number], lines: SnapLines, reach: number): SnappedPoint {
  let best: [number, number] | null = null;
  let bestD = reach;
  for (const q of lines.points ?? []) {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d <= bestD) {
      bestD = d;
      best = q;
    }
  }
  if (best) return { p: best, guideX: null, guideY: null, point: best };
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
