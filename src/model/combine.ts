/**
 * Outline and combine (pure): a border round shapes, and shapes joined, cut out of one another or overlapped.
 *
 * - `outlineOf`: every shape's outside moved out by a distance (lines grow into strips with round ends), all joined
 *   into one shape — a border round words, or a backing piece to glue them to. Gaps closed in (between letters, say)
 *   are filled unless asked not to.
 * - `combined`: "join" (everything together), "cutOut" (the biggest shape with the others cut out of it), "overlap"
 *   (only where they all overlap).
 * Results are free shapes of straight lines (geometry/boolean.ts).
 */
import { booleanRings, loopsToRings, outsidesOnly, ringsToLoops, signedArea, type BooleanOp } from "../geometry/boolean";
import { nestingDepths, offsetLoop } from "../geometry/offset";
import { pathPoints, type Pt, type Segment } from "../geometry/segments";
import { itemOutlines } from "./shapes";
import type { Item, Op, Outline, ShapeItem } from "./types";

export type CombineHow = "join" | "cutOut" | "overlap";

/** Curves are walked as straight pieces this close to the curve (mm). */
const TOL = 0.01;

/** A shape's area as even–odd rings (open lines left out). */
export function itemRings(item: Item): Pt[][] {
  const loops = itemOutlines(item)
    .filter((o) => o.closed)
    .map((o) => o.segments);
  return loopsToRings(loops, TOL);
}

/** Many separate rings sets made one area (each set even–odd, the sets joined). */
function unionAll(sets: Pt[][][]): Pt[][] {
  let out: Pt[][] = [];
  for (const s of sets) {
    if (!s.length) continue;
    out = out.length ? booleanRings(out, s, "union") : booleanRings(s, [], "union");
  }
  return out;
}

const ringArea = (rings: Pt[][]) => rings.reduce((a, r) => a + signedArea(r), 0);

/** A strip `d` either side of an open line, with round ends. */
function stripRings(segments: Segment[], d: number): Pt[][] {
  const pts = pathPoints(segments, false, TOL);
  const rings: Pt[][] = [];
  const steps = Math.max(8, Math.min(48, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - TOL / Math.max(d, TOL))))));
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-9) continue;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const ring: Pt[] = [];
    // Round end at b, then round end at a (anticlockwise).
    for (let k = 0; k <= steps; k++) {
      const t = ang - Math.PI / 2 + (Math.PI * k) / steps;
      ring.push([b[0] + d * Math.cos(t), b[1] + d * Math.sin(t)]);
    }
    for (let k = 0; k <= steps; k++) {
      const t = ang + Math.PI / 2 + (Math.PI * k) / steps;
      ring.push([a[0] + d * Math.cos(t), a[1] + d * Math.sin(t)]);
    }
    rings.push(ring);
  }
  return rings;
}

/** The area `d` mm round the shapes (d > 0), as rings. `fillGaps`: closed-in gaps filled too. */
export function outlineRings(items: readonly Item[], d: number, fillGaps = true): Pt[][] {
  const sets: Pt[][][] = [];
  for (const it of items) {
    const outlines = itemOutlines(it);
    const loops = outlines.filter((o) => o.closed).map((o) => o.segments);
    const depths = nestingDepths(loops);
    loops.forEach((l, i) => {
      if (depths[i] !== 0) return;
      const moved = offsetLoop(l, d, TOL);
      if (moved) sets.push(loopsToRings([moved], TOL));
    });
    for (const o of outlines) if (!o.closed) for (const r of stripRings(o.segments, d)) sets.push([r]);
  }
  const all = unionAll(sets);
  return fillGaps ? outsidesOnly(all) : all;
}

/**
 * The area `d` mm inside the shapes (d > 0): every outside moved in, every hole moved out, as rings. Parts narrower
 * than 2·d go. Lines have no inside, so they're left out.
 */
export function insetRings(items: readonly Item[], d: number): Pt[][] {
  const pieces: Pt[][][] = [];
  for (const it of items) {
    if (it.kind === "picture") continue;
    const loops = itemOutlines(it)
      .filter((o) => o.closed)
      .map((o) => o.segments);
    if (!loops.length) continue;
    const depths = nestingDepths(loops);
    const outs: Pt[][][] = [];
    const holes: Pt[][][] = [];
    loops.forEach((l, i) => {
      const moved = offsetLoop(l, depths[i] % 2 === 0 ? -d : d, TOL);
      if (!moved) return;
      const rings = loopsToRings([moved], TOL);
      if (rings.length) (depths[i] % 2 === 0 ? outs : holes).push(rings);
    });
    if (!outs.length) continue;
    let area = unionAll(outs);
    if (holes.length) area = booleanRings(area, unionAll(holes), "difference");
    // Never outside the shape itself.
    area = booleanRings(area, loopsToRings(loops, TOL), "intersection");
    if (area.length) pieces.push(area);
  }
  return unionAll(pieces);
}

/** What `combined` does with a set of shapes, as rings (null: nothing left). */
export function combinedRings(items: readonly Item[], how: CombineHow): Pt[][] | null {
  const sets = items.map(itemRings).filter((r) => r.length);
  if (sets.length < 2) return null;
  let out: Pt[][];
  if (how === "join") out = unionAll(sets);
  else if (how === "overlap") {
    out = sets[0];
    for (const s of sets.slice(1)) out = booleanRings(out, s, "intersection" satisfies BooleanOp);
  } else {
    // The biggest keeps its area; the rest are cut out of it.
    let big = 0;
    sets.forEach((s, i) => {
      if (Math.abs(ringArea(s)) > Math.abs(ringArea(sets[big]))) big = i;
    });
    const others = unionAll(sets.filter((_, i) => i !== big));
    out = booleanRings(sets[big], others, "difference");
  }
  return out.length ? out : null;
}

/** Rings as a free shape. */
export function ringsShape(id: string, name: string, op: Op, rings: Pt[][]): ShapeItem {
  const outlines: Outline[] = ringsToLoops(rings).map((segments) => ({ segments, closed: true }));
  return { id, name, op, kind: "shape", outlines };
}

/** Can these be combined? At least two shapes with an area (not lines or photos). */
export function canCombine(items: readonly Item[]): boolean {
  return items.filter((it) => it.kind !== "picture" && itemOutlines(it).some((o) => o.closed)).length >= 2;
}
