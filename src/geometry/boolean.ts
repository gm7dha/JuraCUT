/**
 * Joining, cutting and overlapping shapes (pure): Boolean operations on areas. Each side is a set of closed loops filled
 * even–odd (a loop inside another is a hole, inside that an island), as the laser sees them. Curves are walked as
 * straight pieces (within `tol`), so the result is made of straight lines.
 *
 * How: every edge of both sides is split where it crosses (or runs along) another; each piece is kept when the area is
 * wanted on one side of it and not the other, turned so the wanted area is on its left, and the kept pieces are chained
 * into loops. Edges the two sides share count once.
 */
import { pathPoints, type Pt, type Segment } from "./segments";

export type BooleanOp = "union" | "difference" | "intersection" | "xor";

/** Points closer than this (mm) are the same point. */
const SNAP = 1e-6;
const key = (p: Pt) => `${Math.round(p[0] / SNAP)},${Math.round(p[1] / SNAP)}`;

export function signedArea(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Loops of segments as point rings (closing point not repeated, tiny rings dropped). */
export function loopsToRings(loops: Segment[][], tol = 0.01): Pt[][] {
  const rings: Pt[][] = [];
  for (const l of loops) {
    const pts = pathPoints(l, true, tol);
    const ring: Pt[] = [];
    for (const p of pts) {
      const last = ring[ring.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-7) ring.push(p);
    }
    while (ring.length > 1 && Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) <= 1e-7) ring.pop();
    if (ring.length >= 3 && Math.abs(signedArea(ring)) > 1e-9) rings.push(ring);
  }
  return rings;
}

/** Rings as loops of straight lines. */
export function ringsToLoops(rings: Pt[][]): Segment[][] {
  return rings.map((r) => r.map((p, i): Segment => ({ kind: "line", from: p, to: r[(i + 1) % r.length] })));
}

interface Ring {
  pts: Pt[];
  box: [number, number, number, number];
}
const ringOf = (pts: Pt[]): Ring => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { pts, box: [x0, y0, x1, y1] };
};

/** Inside an even–odd set of rings? */
function inside(p: Pt, rings: Ring[]): boolean {
  let c = false;
  for (const r of rings) {
    if (p[0] < r.box[0] || p[0] > r.box[2] || p[1] < r.box[1] || p[1] > r.box[3]) continue;
    const poly = r.pts;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
    }
  }
  return c;
}

const wanted = (op: BooleanOp, a: boolean, b: boolean) => (op === "union" ? a || b : op === "difference" ? a && !b : op === "intersection" ? a && b : a !== b);

interface Edge {
  a: Pt;
  b: Pt;
}

/** Every edge split where another crosses it or ends on it. */
function splitEdges(edges: Edge[]): Edge[] {
  const n = edges.length;
  const cuts: number[][] = edges.map(() => []);
  // Buckets of a grid, so only nearby edges are compared.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of edges) {
    x0 = Math.min(x0, e.a[0], e.b[0]);
    y0 = Math.min(y0, e.a[1], e.b[1]);
    x1 = Math.max(x1, e.a[0], e.b[0]);
    y1 = Math.max(y1, e.a[1], e.b[1]);
  }
  const side = Math.max(1, Math.ceil(Math.sqrt(n)));
  const cw = Math.max((x1 - x0) / side, 1e-6);
  const ch = Math.max((y1 - y0) / side, 1e-6);
  const cells = new Map<number, number[]>();
  const span = (e: Edge) => {
    const i0 = Math.floor((Math.min(e.a[0], e.b[0]) - x0) / cw);
    const i1 = Math.floor((Math.max(e.a[0], e.b[0]) - x0) / cw);
    const j0 = Math.floor((Math.min(e.a[1], e.b[1]) - y0) / ch);
    const j1 = Math.floor((Math.max(e.a[1], e.b[1]) - y0) / ch);
    return [i0, i1, j0, j1];
  };
  edges.forEach((e, k) => {
    const [i0, i1, j0, j1] = span(e);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const c = i * 100003 + j;
      const list = cells.get(c);
      if (list) list.push(k);
      else cells.set(c, [k]);
    }
  });
  const seen = new Set<number>();
  for (const list of cells.values()) {
    for (let u = 0; u < list.length; u++)
      for (let v = u + 1; v < list.length; v++) {
        const p = Math.min(list[u], list[v]);
        const q = Math.max(list[u], list[v]);
        const pair = p * n + q;
        if (seen.has(pair)) continue;
        seen.add(pair);
        crossing(edges[p], edges[q], cuts[p], cuts[q]);
      }
  }
  const out: Edge[] = [];
  edges.forEach((e, k) => {
    const ts = [...new Set(cuts[k].filter((t) => t > 1e-9 && t < 1 - 1e-9))].sort((a, b) => a - b);
    let from = e.a;
    for (const t of ts) {
      const p: Pt = [e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t];
      out.push({ a: from, b: p });
      from = p;
    }
    out.push({ a: from, b: e.b });
  });
  return out;
}

/** Where two edges meet, as shares along each (added to `ta`, `tb`). Edges lying along each other cut at each other's ends. */
function crossing(e: Edge, f: Edge, ta: number[], tb: number[]) {
  const r: Pt = [e.b[0] - e.a[0], e.b[1] - e.a[1]];
  const s: Pt = [f.b[0] - f.a[0], f.b[1] - f.a[1]];
  const d: Pt = [f.a[0] - e.a[0], f.a[1] - e.a[1]];
  const rxs = r[0] * s[1] - r[1] * s[0];
  const lr = Math.hypot(r[0], r[1]);
  const ls = Math.hypot(s[0], s[1]);
  if (!lr || !ls) return;
  if (Math.abs(rxs) <= 1e-12 * lr * ls) {
    // Parallel: along each other only if on the same line.
    if (Math.abs(d[0] * r[1] - d[1] * r[0]) > 1e-9 * lr) return;
    const along = (p: Pt, o: Pt, v: Pt, l2: number) => ((p[0] - o[0]) * v[0] + (p[1] - o[1]) * v[1]) / l2;
    ta.push(along(f.a, e.a, r, lr * lr), along(f.b, e.a, r, lr * lr));
    tb.push(along(e.a, f.a, s, ls * ls), along(e.b, f.a, s, ls * ls));
    return;
  }
  const t = (d[0] * s[1] - d[1] * s[0]) / rxs;
  const u = (d[0] * r[1] - d[1] * r[0]) / rxs;
  const eps = 1e-9;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return;
  ta.push(t);
  tb.push(u);
}

/**
 * A Boolean operation on two even–odd sets of rings. Returns the result's rings: outsides anticlockwise, holes
 * clockwise.
 */
export function booleanRings(a: Pt[][], b: Pt[][], op: BooleanOp): Pt[][] {
  return combineSets([a, b], (ins) => wanted(op, ins(0), ins(1)));
}

/** Many even–odd sets of rings (letters, say) joined into one area: inside any of them is inside. */
export function unionOfSets(sets: Pt[][][]): Pt[][] {
  return combineSets(
    sets.filter((s) => s.length),
    (ins, n) => {
      for (let i = 0; i < n; i++) if (ins(i)) return true;
      return false;
    },
  );
}

/**
 * The general Boolean: every edge of every set split where it meets another, each piece kept when `want` (asked
 * whether a point is inside set i) differs on its two sides, turned with the wanted side on its left, chained.
 */
function combineSets(sets: Pt[][][], want: (inside: (i: number) => boolean, n: number) => boolean): Pt[][] {
  const S = sets.map((rings) => {
    const rs = rings.map(ringOf);
    let box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of rs) box = [Math.min(box[0], r.box[0]), Math.min(box[1], r.box[1]), Math.max(box[2], r.box[2]), Math.max(box[3], r.box[3])];
    return { rs, box };
  });
  const edges: Edge[] = [];
  for (const set of sets) for (const r of set) for (let i = 0; i < r.length; i++) edges.push({ a: r[i], b: r[(i + 1) % r.length] });
  // Pieces, each once (snapped ends).
  const pieces = new Map<string, Edge>();
  for (const e of splitEdges(edges)) {
    const ka = key(e.a);
    const kb = key(e.b);
    if (ka === kb) continue;
    const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    if (!pieces.has(k)) pieces.set(k, e);
  }
  const insideAt = (p: Pt) => (i: number) => {
    const s = S[i];
    if (p[0] < s.box[0] || p[0] > s.box[2] || p[1] < s.box[1] || p[1] > s.box[3]) return false;
    return inside(p, s.rs);
  };
  // Keep a piece when the wanted area is on one side of it only; turn it so that side is its left.
  const kept: Edge[] = [];
  for (const e of pieces.values()) {
    const dx = e.b[0] - e.a[0];
    const dy = e.b[1] - e.a[1];
    const l = Math.hypot(dx, dy);
    const m: Pt = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
    const h = Math.min(1e-4, l / 4);
    const left: Pt = [m[0] - (dy / l) * h, m[1] + (dx / l) * h];
    const right: Pt = [m[0] + (dy / l) * h, m[1] - (dx / l) * h];
    const wl = want(insideAt(left), S.length);
    const wr = want(insideAt(right), S.length);
    if (wl === wr) continue;
    kept.push(wl ? e : { a: e.b, b: e.a });
  }
  return chainRings(kept);
}

/** Directed edges chained into rings; where several leave a point, the one turning most to the left is taken (so shapes touching at a corner stay apart). */
function chainRings(edges: Edge[]): Pt[][] {
  const out = new Map<string, number[]>();
  edges.forEach((e, i) => {
    const k = key(e.a);
    const list = out.get(k);
    if (list) list.push(i);
    else out.set(k, [i]);
  });
  const used = new Uint8Array(edges.length);
  const rings: Pt[][] = [];
  for (let s = 0; s < edges.length; s++) {
    if (used[s]) continue;
    const ring: Pt[] = [];
    let i = s;
    let guard = 0;
    while (!used[i] && guard++ <= edges.length) {
      used[i] = 1;
      const e = edges[i];
      ring.push(e.a);
      const next = (out.get(key(e.b)) ?? []).filter((j) => !used[j] || j === s);
      if (!next.length) break;
      const din = Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
      let best = -1;
      let bestTurn = -Infinity;
      for (const j of next) {
        const f = edges[j];
        let turn = Math.atan2(f.b[1] - f.a[1], f.b[0] - f.a[0]) - din;
        while (turn <= -Math.PI) turn += 2 * Math.PI;
        while (turn > Math.PI) turn -= 2 * Math.PI;
        if (turn > bestTurn) {
          bestTurn = turn;
          best = j;
        }
      }
      if (best < 0 || best === s) break;
      i = best;
    }
    const tidy = straightened(ring);
    if (tidy.length >= 3 && Math.abs(signedArea(tidy)) > 1e-8) rings.push(tidy);
  }
  return rings;
}

/** Points lying on a straight line between their neighbours taken out. */
function straightened(ring: Pt[]): Pt[] {
  let pts = ring;
  for (let pass = 0; pass < 2; pass++) {
    const kept: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = kept.length ? kept[kept.length - 1] : pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (Math.abs(cross) > 1e-9 * Math.max(1, len)) kept.push(b);
    }
    pts = kept;
  }
  return pts;
}

/** Of a set of rings, only the outsides (those inside no other): holes filled. */
export function outsidesOnly(rings: Pt[][]): Pt[][] {
  const R = rings.map(ringOf);
  return rings.filter((r, i) => {
    const probe: Pt = [(r[0][0] + r[1][0]) / 2, (r[0][1] + r[1][1]) / 2];
    return !R.some((q, j) => j !== i && inside(probe, [q]));
  });
}
