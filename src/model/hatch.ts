/**
 * Hatch fill (pure): a closed shape filled with parallel straight lines, `spacing` mm apart at `angle` degrees —
 * LightBurn's "Fill" done as lines. Scored, it shades an area much faster than engraving it; with `cross` a second set
 * square to the first gives a cross-hatch. Lines run back and forth (one left to right, the next right to left) so the
 * laser travels as little as possible. Holes are left empty (even–odd, as everywhere else).
 */
import { pathPoints, type Pt } from "../geometry/segments";
import type { Outline } from "./types";

export interface HatchOptions {
  spacing: number;
  angle: number;
  cross: boolean;
}

export const DEFAULT_HATCH: HatchOptions = { spacing: 1, angle: 45, cross: false };
/** Lines closer than this would be too many to be useful (and slow): mm. */
export const LEAST_SPACING = 0.1;
/** More lines than this in one hatch are refused. */
export const MOST_HATCH_LINES = 20000;

/** The fill as open straight lines, or null if there would be more than `MOST_HATCH_LINES`. */
export function hatchLines(outlines: readonly Outline[], opts: HatchOptions): Outline[] | null {
  const rings = outlines.filter((o) => o.closed).map((o) => pathPoints(o.segments, true, 0.02));
  if (!rings.length || !(opts.spacing >= LEAST_SPACING)) return [];
  const sets: Outline[] = [];
  for (const angle of opts.cross ? [opts.angle, opts.angle + 90] : [opts.angle]) {
    const one = hatchAt(rings, opts.spacing, angle);
    if (!one) return null;
    sets.push(...one);
    if (sets.length > MOST_HATCH_LINES) return null;
  }
  return sets;
}

function hatchAt(rings: Pt[][], spacing: number, angleDeg: number): Outline[] | null {
  const a = (angleDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // Turn everything so the lines run along x.
  const toLocal = (p: Pt): Pt => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];
  const toBed = (p: Pt): Pt => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  const local = rings.map((r) => r.map(toLocal));
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of local)
    for (const p of r) {
      lo = Math.min(lo, p[1]);
      hi = Math.max(hi, p[1]);
    }
  if (!(hi > lo)) return [];
  // Lines on a fixed grid (multiples of the spacing, half a step in), so shapes side by side line up.
  const first = Math.ceil((lo - spacing / 2) / spacing) * spacing + spacing / 2;
  if ((hi - first) / spacing > MOST_HATCH_LINES) return null;
  const edges: [Pt, Pt][] = [];
  for (const r of local) for (let i = 0; i < r.length; i++) edges.push([r[i], r[(i + 1) % r.length]]);
  // Edges sorted by their lowest y, so each line looks only at the edges it could cross.
  edges.sort((e, f) => Math.min(e[0][1], e[1][1]) - Math.min(f[0][1], f[1][1]));
  const out: Outline[] = [];
  let active: [Pt, Pt][] = [];
  let next = 0;
  let row = 0;
  for (let y = first; y < hi; y += spacing) {
    while (next < edges.length && Math.min(edges[next][0][1], edges[next][1][1]) <= y) active.push(edges[next++]);
    active = active.filter((e) => Math.max(e[0][1], e[1][1]) > y);
    const xs: number[] = [];
    for (const [p, q] of active) {
      // Half-open in y, so a line through a corner counts it once.
      if (p[1] <= y !== q[1] <= y) xs.push(p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
    }
    xs.sort((m, n) => m - n);
    const pieces: [number, number][] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 1e-6) pieces.push([xs[i], xs[i + 1]]);
    if (row % 2 === 1) pieces.reverse();
    for (const [x0, x1] of pieces) {
      const [from, to] = row % 2 === 0 ? [x0, x1] : [x1, x0];
      out.push({ segments: [{ kind: "line", from: toBed([from, y]), to: toBed([to, y]) }], closed: false });
    }
    if (pieces.length) row++;
    if (out.length > MOST_HATCH_LINES) return null;
  }
  return out;
}
