/**
 * Kerf compensation: a closed loop moved outwards (or inwards) by a distance,
 * so a piece cut along the moved line comes out the size that was drawn — the
 * beam takes away a strip as wide as the kerf, half of it each side of the line.
 *
 * A whole circle stays a circle (its radius changes). Any other loop is walked
 * as straight pieces: corners that open up get a round join (an exact arc
 * about the original corner), corners that close up meet where the moved
 * sides cross. Features narrower than twice the distance can fold over
 * themselves; that's left as it is (a laser can't cut them anyway).
 */
import { pathPoints, pointInPolygon, type Pt, type Segment } from "./segments";

const EPS = 1e-9;

function signedArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Drop repeated points and points lying on the straight line between their neighbours. */
function tidy(poly: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-7) out.push(p);
  }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1e-7) out.pop();
  const kept: Pt[] = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[(i + out.length - 1) % out.length];
    const b = out[i];
    const c = out[(i + 1) % out.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (Math.abs(cross) > 1e-9 * Math.max(1, len)) kept.push(b);
  }
  return kept.length >= 3 ? kept : out;
}

/**
 * The loop moved `d` mm outwards (d < 0: inwards). Returns the new loop's
 * pieces, or null when the loop is too small to move that far inwards.
 */
export function offsetLoop(loop: Segment[], d: number, tol = 0.005): Segment[] | null {
  if (Math.abs(d) < EPS) return loop;
  // A circle stays a circle.
  if (loop.length === 1 && loop[0].kind === "circle") {
    const r = loop[0].radius + d;
    return r > EPS ? [{ kind: "circle", center: loop[0].center, radius: r }] : null;
  }
  let poly = tidy(pathPoints(loop, true, tol));
  if (poly.length < 3) return null;
  // Walk anticlockwise, so "outwards" is to the right of each side.
  if (signedArea(poly) < 0) poly = [...poly].reverse();
  const n = poly.length;
  const edges = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return { dir: [(q[0] - p[0]) / len, (q[1] - p[1]) / len] as Pt, normal: [(q[1] - p[1]) / len, -(q[0] - p[0]) / len] as Pt };
  });
  const out: Segment[] = [];
  let at: Pt | null = null;
  let first: Pt | null = null;
  // Where each moved side starts and ends (to spot sides that turned round: the loop went inside out).
  const starts: Pt[] = [];
  const ends: Pt[] = [];
  const lineTo = (p: Pt) => {
    if (at && Math.hypot(p[0] - at[0], p[1] - at[1]) > EPS) out.push({ kind: "line", from: at, to: p });
    at = p;
    if (!first) first = p;
  };
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const prev = edges[(i + n - 1) % n];
    const next = edges[i];
    // The moved sides' ends at this corner.
    const a: Pt = [p[0] + prev.normal[0] * d, p[1] + prev.normal[1] * d];
    const b: Pt = [p[0] + next.normal[0] * d, p[1] + next.normal[1] * d];
    const cross = prev.dir[0] * next.dir[1] - prev.dir[1] * next.dir[0];
    if (Math.abs(cross) < 1e-9) {
      lineTo(a);
      ends[(i + n - 1) % n] = a;
      starts[i] = a;
      continue;
    }
    // A left turn moved outwards (or a right turn moved inwards) opens a gap: a round join about the corner.
    if (cross * d > 0) {
      lineTo(a);
      const r = Math.abs(d);
      const a0 = Math.atan2(a[1] - p[1], a[0] - p[0]);
      let a1 = Math.atan2(b[1] - p[1], b[0] - p[0]);
      // The short way round, in the direction the corner turns.
      if (d > 0) while (a1 <= a0) a1 += 2 * Math.PI;
      else while (a1 >= a0) a1 -= 2 * Math.PI;
      const m = (a0 + a1) / 2;
      out.push({ kind: "arc", from: a, mid: [p[0] + r * Math.cos(m), p[1] + r * Math.sin(m)], to: b });
      at = b;
      ends[(i + n - 1) % n] = a;
      starts[i] = b;
    } else {
      // The moved sides cross: meet them there.
      const t = ((b[0] - a[0]) * next.dir[1] - (b[1] - a[1]) * next.dir[0]) / cross;
      const meet: Pt = [a[0] + prev.dir[0] * t, a[1] + prev.dir[1] * t];
      lineTo(meet);
      ends[(i + n - 1) % n] = meet;
      starts[i] = meet;
    }
  }
  // A side that now runs backwards means the loop was moved in past its own middle: it's gone.
  for (let i = 0; i < n; i++) {
    const v: Pt = [ends[i][0] - starts[i][0], ends[i][1] - starts[i][1]];
    if (v[0] * edges[i].dir[0] + v[1] * edges[i].dir[1] <= EPS) return null;
  }
  if (!at || !first) return null;
  const end: Pt = at;
  const start: Pt = first;
  if (Math.hypot(end[0] - start[0], end[1] - start[1]) > EPS) out.push({ kind: "line", from: end, to: start });
  return out.length >= 2 ? out : null;
}

/** How many of the other loops each loop lies inside (0 = an outside; odd = a hole; even = an island). */
export function nestingDepths(loops: Segment[][]): number[] {
  const polys = loops.map((l) => pathPoints(l, true, 0.01));
  const areas = polys.map((p) => Math.abs(signedArea(p)));
  return polys.map((poly, i) => {
    if (poly.length < 2) return 0;
    const p0 = poly[0];
    const p1 = poly[1 % poly.length];
    const probe: Pt = [p0[0] + (p1[0] - p0[0]) * 0.37, p0[1] + (p1[1] - p0[1]) * 0.37];
    return polys.filter((q, j) => j !== i && areas[j] > areas[i] && pointInPolygon(probe, q)).length;
  });
}
