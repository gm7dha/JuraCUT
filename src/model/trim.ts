/**
 * Trimming (pure) — LightBurn's "Trim Shapes": clicking a stretch of line between two places where it crosses other
 * lines (or itself) takes that stretch away. With nothing crossing it, the whole line goes. The trimmed outline is
 * followed as straight pieces (within 0.01 mm); a shape's other outlines keep their curves.
 */
import { pathPoints, type Pt, type Segment } from "../geometry/segments";
import { baseOf, itemOutlines } from "./shapes";
import type { Item, Outline } from "./types";

const TOL = 0.01;

interface Poly {
  pts: Pt[];
  closed: boolean;
  box: [number, number, number, number];
}

function polyOf(o: Outline): Poly {
  const raw = pathPoints(o.segments, o.closed, TOL);
  const pts = o.closed && raw.length ? [...raw, raw[0]] : raw;
  let box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of pts) box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
  return { pts, closed: o.closed, box };
}

const runLengths = (pts: Pt[]) => {
  const along = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return along;
};

/** Where segment a–b crosses c–d, as the share along a–b (strictly inside c–d's ends' tolerance), or null. */
function cross(a: Pt, b: Pt, c: Pt, d: Pt): number | null {
  const r: Pt = [b[0] - a[0], b[1] - a[1]];
  const s: Pt = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const q: Pt = [c[0] - a[0], c[1] - a[1]];
  const t = (q[0] * s[1] - q[1] * s[0]) / den;
  const u = (q[0] * r[1] - q[1] * r[0]) / den;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? Math.min(1, Math.max(0, t)) : null;
}

/** Distances along a polyline where other lines (or its own far parts) cross it. */
function crossings(p: Poly, others: Poly[]): number[] {
  const along = runLengths(p.pts);
  const out: number[] = [];
  const n = p.pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = p.pts[i];
    const b = p.pts[i + 1];
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    const len = along[i + 1] - along[i];
    for (const o of others) {
      if (o.box[0] > x1 || o.box[2] < x0 || o.box[1] > y1 || o.box[3] < y0) continue;
      for (let j = 0; j + 1 < o.pts.length; j++) {
        const c = o.pts[j];
        const d = o.pts[j + 1];
        if (Math.max(c[0], d[0]) < x0 || Math.min(c[0], d[0]) > x1 || Math.max(c[1], d[1]) < y0 || Math.min(c[1], d[1]) > y1) continue;
        const t = cross(a, b, c, d);
        if (t !== null) out.push(along[i] + t * len);
      }
    }
    // The line crossing itself (not at neighbouring pieces).
    for (let j = i + 2; j < n; j++) {
      if (p.closed && i === 0 && j === n - 1) continue;
      const t = cross(a, b, p.pts[j], p.pts[j + 1]);
      if (t !== null) {
        out.push(along[i] + t * len);
        const u = cross(p.pts[j], p.pts[j + 1], a, b);
        if (u !== null) out.push(along[j] + u * (along[j + 1] - along[j]));
      }
    }
  }
  return out.sort((x, y) => x - y);
}

/** The stretch of a polyline from `a` to `b` mm along it, as points. */
function stretch(pts: Pt[], along: number[], a: number, b: number): Pt[] {
  const at = (s: number): Pt => {
    let i = 1;
    while (i < along.length - 1 && along[i] < s) i++;
    const t = (s - along[i - 1]) / Math.max(along[i] - along[i - 1], 1e-12);
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
  };
  const out: Pt[] = [at(a)];
  for (let i = 0; i < pts.length; i++) if (along[i] > a + 1e-9 && along[i] < b - 1e-9) out.push(pts[i]);
  out.push(at(b));
  return out;
}

const asLines = (pts: Pt[]): Segment[] => {
  const segs: Segment[] = [];
  for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) > 1e-7) segs.push({ kind: "line", from: pts[i - 1], to: pts[i] });
  return segs;
};

/** The nearest distance along a polyline to a point, and how far the point is from it. */
function nearestAlong(p: Poly, q: Pt): { s: number; d: number } {
  const along = runLengths(p.pts);
  let best = { s: 0, d: Infinity };
  for (let i = 0; i + 1 < p.pts.length; i++) {
    const a = p.pts[i], b = p.pts[i + 1];
    const v: Pt = [b[0] - a[0], b[1] - a[1]];
    const l2 = v[0] * v[0] + v[1] * v[1] || 1e-12;
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * v[0] + (q[1] - a[1]) * v[1]) / l2));
    const d = Math.hypot(a[0] + v[0] * t - q[0], a[1] + v[1] * t - q[1]);
    if (d < best.d) best = { s: along[i] + t * (along[i + 1] - along[i]), d };
  }
  return best;
}

/** Which of a shape's outlines is nearest a point (within `reach` mm). */
export function outlineNear(item: Item, q: Pt, reach: number): number | null {
  let best: { i: number; d: number } | null = null;
  itemOutlines(item).forEach((o, i) => {
    const { d } = nearestAlong(polyOf(o), q);
    if (d <= reach && (!best || d < best.d)) best = { i, d };
  });
  return best ? (best as { i: number }).i : null;
}

/**
 * The shape with the stretch of outline `index` around point `q` taken out, between the nearest crossings either side
 * (the crossings come from `others` — every other shape — and its own outlines). Null when nothing of it is left;
 * the same shape when there was nothing to trim (a closed outline crossed fewer than twice is left alone).
 */
export function trimmed(item: Item, index: number, q: Pt, others: readonly Item[]): Item | null {
  const outlines = itemOutlines(item);
  const o = outlines[index];
  if (!o) return item;
  const p = polyOf(o);
  const cutters = [...others.flatMap((it) => itemOutlines(it)), ...outlines.filter((_, i) => i !== index)].map(polyOf);
  const along = runLengths(p.pts);
  const total = along[along.length - 1];
  // Crossings too close together (where three lines meet) count once.
  const xs = crossings(p, cutters).filter((v, i, a) => i === 0 || v - a[i - 1] > 1e-6);
  const s0 = nearestAlong(p, q).s;
  let kept: Pt[][] = [];
  if (p.closed) {
    if (xs.length < 2) return item;
    // The crossings either side of the click, going round.
    const after = xs.find((v) => v > s0) ?? xs[0] + total;
    const before = [...xs].reverse().find((v) => v < s0) ?? xs[xs.length - 1] - total;
    // What's left runs from `after` round to `before` (plus a lap).
    const from = after;
    const to = before + total;
    const pts = from <= total && to <= total ? stretch(p.pts, along, from, to) : from >= total ? stretch(p.pts, along, from - total, to - total) : [...stretch(p.pts, along, from, total), ...stretch(p.pts, along, 0, to - total).slice(1)];
    kept = [pts];
  } else {
    const before = [...xs].reverse().find((v) => v < s0 - 1e-9);
    const after = xs.find((v) => v > s0 + 1e-9);
    if (before !== undefined && before > 1e-6) kept.push(stretch(p.pts, along, 0, before));
    if (after !== undefined && after < total - 1e-6) kept.push(stretch(p.pts, along, after, total));
  }
  const left: Outline[] = [...outlines.slice(0, index), ...kept.map((pts) => ({ closed: false, segments: asLines(pts) })).filter((x) => x.segments.length), ...outlines.slice(index + 1)];
  if (!left.length) return null;
  return { ...baseOf(item), kind: "shape", outlines: left };
}
