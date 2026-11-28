/**
 * Editing a shape's points (pure) — LightBurn's "Edit Nodes". A shape's outlines are made editable as straight lines
 * and Bézier curves only (`editable`: arcs, circles and ellipses become Bézier pieces, exact to within a hair), then:
 * - a point (where two pieces meet, or an open line's end) is moved, taking the curve handles next to it along, so
 *   curves keep their shape near it (`movedNode`);
 * - a curve's handle is moved (`movedHandle`);
 * - a point is added on a piece where it's clicked (`addedNode`: a line split in two, a curve split exactly by
 *   de Casteljau, so the outline doesn't change);
 * - a point is taken out (`removedNode`: the two pieces either side become one — a curve if either was);
 * - a piece is made straight or curved (`straightened`, `curved`).
 * Nodes are named by the outline they're in and the piece they start (`NodeRef`); an open outline's last point is
 * piece `segments.length` (the end of the last piece).
 */
import { asBeziers } from "./resize";
import type { Pt, Segment } from "../geometry/segments";
import type { Outline } from "./types";

export interface NodeRef {
  outline: number;
  /** The piece this point starts (or, = segments.length on an open outline, the end of the last piece). */
  index: number;
}

/** A curve handle: the piece it belongs to, and which of its two (c1 by its start, c2 by its end). */
export interface HandleRef {
  outline: number;
  index: number;
  which: "c1" | "c2";
}

type Edit = Extract<Segment, { kind: "line" | "bezier" }>;

/** Outlines as lines and Bézier pieces only. */
export function editable(outlines: Outline[]): Outline[] {
  return outlines.map((o) => ({ ...o, segments: o.segments.flatMap(asBeziers) }));
}

const ends = (s: Segment): [Pt, Pt] => [(s as Edit).from, (s as Edit).to];

/** Every point of the outlines, with where it is. */
export function nodesOf(outlines: Outline[]): { ref: NodeRef; at: Pt }[] {
  const out: { ref: NodeRef; at: Pt }[] = [];
  outlines.forEach((o, k) => {
    o.segments.forEach((s, i) => out.push({ ref: { outline: k, index: i }, at: ends(s)[0] }));
    if (!o.closed && o.segments.length) out.push({ ref: { outline: k, index: o.segments.length }, at: ends(o.segments[o.segments.length - 1])[1] });
  });
  return out;
}

/** The handles shown for a point: those of the pieces either side of it that are curves (handle, the point it hangs from). */
export function handlesOf(outlines: Outline[], node: NodeRef): { ref: HandleRef; at: Pt; from: Pt }[] {
  const o = outlines[node.outline];
  if (!o) return [];
  const out: { ref: HandleRef; at: Pt; from: Pt }[] = [];
  const n = o.segments.length;
  const after = node.index < n ? o.segments[node.index] : null;
  const beforeIndex = node.index > 0 ? node.index - 1 : o.closed ? n - 1 : -1;
  const before = beforeIndex >= 0 ? o.segments[beforeIndex] : null;
  if (after?.kind === "bezier") out.push({ ref: { outline: node.outline, index: node.index, which: "c1" }, at: after.c1, from: after.from });
  if (before?.kind === "bezier") out.push({ ref: { outline: node.outline, index: beforeIndex, which: "c2" }, at: before.c2, from: before.to });
  return out;
}

const add = (p: Pt, d: Pt): Pt => [p[0] + d[0], p[1] + d[1]];
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** The outlines with one point moved to `to` (its curve handles moved along with it). */
export function movedNode(outlines: Outline[], node: NodeRef, to: Pt): Outline[] {
  return outlines.map((o, k) => {
    if (k !== node.outline) return o;
    const n = o.segments.length;
    const segs = [...o.segments] as Edit[];
    const afterI = node.index < n ? node.index : -1;
    const beforeI = node.index > 0 ? node.index - 1 : o.closed ? n - 1 : -1;
    const was = afterI >= 0 ? segs[afterI].from : segs[beforeI].to;
    const d: Pt = [to[0] - was[0], to[1] - was[1]];
    if (afterI >= 0) {
      const s = segs[afterI];
      segs[afterI] = s.kind === "bezier" ? { ...s, from: to, c1: add(s.c1, d) } : { ...s, from: to };
    }
    if (beforeI >= 0) {
      const s = segs[beforeI];
      segs[beforeI] = s.kind === "bezier" ? { ...s, to, c2: add(s.c2, d) } : { ...s, to };
    }
    return { ...o, segments: segs };
  });
}

/** The outlines with a curve handle moved to `to`. */
export function movedHandle(outlines: Outline[], h: HandleRef, to: Pt): Outline[] {
  return outlines.map((o, k) => {
    if (k !== h.outline) return o;
    const segs = [...o.segments];
    const s = segs[h.index];
    if (s?.kind === "bezier") segs[h.index] = { ...s, [h.which]: to };
    return { ...o, segments: segs };
  });
}

/** Where on a piece a point is nearest: the share along it (0…1) and how far away (mm). */
export function nearestOn(s: Segment, p: Pt): { t: number; at: Pt; distance: number } {
  const e = s as Edit;
  if (e.kind === "line") {
    const v: Pt = [e.to[0] - e.from[0], e.to[1] - e.from[1]];
    const l2 = v[0] * v[0] + v[1] * v[1] || 1e-12;
    const t = Math.max(0, Math.min(1, ((p[0] - e.from[0]) * v[0] + (p[1] - e.from[1]) * v[1]) / l2));
    const at = lerp(e.from, e.to, t);
    return { t, at, distance: Math.hypot(at[0] - p[0], at[1] - p[1]) };
  }
  // Only lines and Bézier curves have points to edit: anything else is never "near".
  if (e.kind !== "bezier") return { t: 0, at: p, distance: Infinity };
  // A curve: sampled, then the best sample refined.
  let best = { t: 0, at: e.from, distance: Infinity };
  const point = (t: number) => bezierAt(e as Extract<Segment, { kind: "bezier" }>, t);
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const at = point(i / N);
    const d = Math.hypot(at[0] - p[0], at[1] - p[1]);
    if (d < best.distance) best = { t: i / N, at, distance: d };
  }
  let step = 1 / N;
  for (let k = 0; k < 20; k++) {
    step /= 2;
    for (const t of [best.t - step, best.t + step]) {
      if (t < 0 || t > 1) continue;
      const at = point(t);
      const d = Math.hypot(at[0] - p[0], at[1] - p[1]);
      if (d < best.distance) best = { t, at, distance: d };
    }
  }
  return best;
}

export function bezierAt(s: Extract<Segment, { kind: "bezier" }>, t: number): Pt {
  const a = lerp(s.from, s.c1, t), b = lerp(s.c1, s.c2, t), c = lerp(s.c2, s.to, t);
  const d = lerp(a, b, t), e = lerp(b, c, t);
  return lerp(d, e, t);
}

/** The outlines with a point added on piece `index` of outline `outline`, at share `t` along it (the shape unchanged). */
export function addedNode(outlines: Outline[], outline: number, index: number, t: number): Outline[] {
  return outlines.map((o, k) => {
    if (k !== outline) return o;
    const s = o.segments[index] as Edit;
    if (!s) return o;
    let parts: Edit[];
    if (s.kind === "line") {
      const m = lerp(s.from, s.to, t);
      parts = [
        { kind: "line", from: s.from, to: m },
        { kind: "line", from: m, to: s.to },
      ];
    } else {
      const a = lerp(s.from, s.c1, t), b = lerp(s.c1, s.c2, t), c = lerp(s.c2, s.to, t);
      const d = lerp(a, b, t), e = lerp(b, c, t);
      const m = lerp(d, e, t);
      parts = [
        { kind: "bezier", from: s.from, c1: a, c2: d, to: m },
        { kind: "bezier", from: m, c1: e, c2: c, to: s.to },
      ];
    }
    const segs = [...o.segments];
    segs.splice(index, 1, ...parts);
    return { ...o, segments: segs };
  });
}

/**
 * The outlines with a point taken out: the pieces either side become one (a curve, keeping the outer handles, if
 * either was). An open line's end point takes its piece with it. Null when it would leave too little (a closed
 * outline needs at least two pieces, an open one one).
 */
export function removedNode(outlines: Outline[], node: NodeRef): Outline[] | null {
  const o = outlines[node.outline];
  if (!o) return null;
  const n = o.segments.length;
  const segs = [...o.segments] as Edit[];
  if (!o.closed) {
    if (n < 2) return null;
    if (node.index === 0) segs.splice(0, 1);
    else if (node.index >= n) segs.splice(n - 1, 1);
    else segs.splice(node.index - 1, 2, joined(segs[node.index - 1], segs[node.index]));
  } else {
    if (n < 3) return null;
    const before = (node.index - 1 + n) % n;
    const j = joined(segs[before], segs[node.index]);
    if (node.index === 0) {
      segs.splice(n - 1, 1);
      segs.splice(0, 1, j);
    } else segs.splice(before, 2, j);
  }
  return outlines.map((x, k) => (k === node.outline ? { ...x, segments: segs } : x));
}

function joined(a: Edit, b: Edit): Edit {
  if (a.kind === "line" && b.kind === "line") return { kind: "line", from: a.from, to: b.to };
  const c1 = a.kind === "bezier" ? a.c1 : lerp(a.from, a.to, 1 / 3);
  const c2 = b.kind === "bezier" ? b.c2 : lerp(b.from, b.to, 2 / 3);
  return { kind: "bezier", from: a.from, c1, c2, to: b.to };
}

/** A piece made straight. */
export function straightened(outlines: Outline[], outline: number, index: number): Outline[] {
  return outlines.map((o, k) => {
    if (k !== outline || !o.segments[index]) return o;
    const segs = [...o.segments];
    const [from, to] = ends(segs[index]);
    segs[index] = { kind: "line", from, to };
    return { ...o, segments: segs };
  });
}

/** A straight piece made a curve (handles a third of the way along, so it looks the same until they're moved). */
export function curved(outlines: Outline[], outline: number, index: number): Outline[] {
  return outlines.map((o, k) => {
    if (k !== outline || o.segments[index]?.kind !== "line") return o;
    const segs = [...o.segments];
    const [from, to] = ends(segs[index]);
    segs[index] = { kind: "bezier", from, c1: lerp(from, to, 1 / 3), c2: lerp(from, to, 2 / 3), to };
    return { ...o, segments: segs };
  });
}

/** The piece nearest a point (within `reach` mm), if any. */
export function pieceAt(outlines: Outline[], p: Pt, reach: number): { outline: number; index: number; t: number; at: Pt } | null {
  let best: { outline: number; index: number; t: number; at: Pt; distance: number } | null = null;
  outlines.forEach((o, k) =>
    o.segments.forEach((s, i) => {
      const n = nearestOn(s, p);
      if (n.distance <= reach && (!best || n.distance < best.distance)) best = { outline: k, index: i, t: n.t, at: n.at, distance: n.distance };
    }),
  );
  return best ? { outline: (best as { outline: number }).outline, index: (best as { index: number }).index, t: (best as { t: number }).t, at: (best as { at: Pt }).at } : null;
}
