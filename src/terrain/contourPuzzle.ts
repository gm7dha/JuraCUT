/**
 * A mountain as a laser-cut layered puzzle (pure, mm, y up). Each sheet is one band of height: sheet 1 is the whole
 * area (the base), sheet n everything above the n-th contour. Every sheet is cut into jigsaw pieces with JuraCAD's
 * classic round tabs (puzzle.ts), and every other sheet's pattern is shifted half a piece, so joins never sit on top of
 * each other — the pieces above bridge the joins below, like brickwork.
 *
 * Rules that keep pieces sturdy:
 * - a tab is only cut where the whole tab lies inside the sheet, clear of its edge; otherwise that join is cut straight;
 * - a join that meets the sheet's edge at a slant shallower than `MIN_CROSSING` isn't cut (it would leave a sliver);
 * - pieces smaller than `smallPiece` are joined to a neighbour (found by drawing the sheet on a fine grid and filling
 *   each piece);
 * - a join that would stop in the middle of a piece is left out.
 *
 * On each sheet the next sheet's outline is scored, to show where it sits, and each piece's name is engraved where the
 * sheet above will hide it if there's room.
 */
import { edgePolyline, makePuzzle, MIN_NECK, NECK, SIZE_SPREAD, TAB_RISE, type P2 } from "../library/puzzle";
import { heightAt, type HeightGrid } from "./elevation";

export interface ContourSpec {
  /** The finished puzzle's width (mm); its depth follows the area. */
  width: number;
  /** Sheet thickness, mm. */
  thickness: number;
  /** How many sheets, the base included. */
  layers: number;
  /** Jigsaw piece size, mm. */
  piece: number;
  /** Pattern number: which way the tabs point. */
  seed: number;
  /** Shift every other sheet's pieces by half a piece. */
  stagger: boolean;
  /** Score the next sheet's outline on each sheet. */
  guides: boolean;
  /** Engrave each piece's name. */
  labels: boolean;
}

export const CONTOUR_DEFAULTS: ContourSpec = { width: 250, thickness: 3, layers: 12, piece: 40, seed: 1, stagger: true, guides: true, labels: true };

/** A tab's height as a share of the piece (as the laser jigsaw). */
export const TAB = 0.25;
/** Joins meeting the sheet's edge at less than this (degrees) aren't cut. */
export const MIN_CROSSING = 30;
/** Islands (mm²) smaller than this are left off; holes smaller than `SMALL_HOLE` are filled. */
export const SMALL_ISLAND = 30;
export const SMALL_HOLE = 12;
/** Label size (capital height, mm). */
export const LABEL_SIZE = 3;

/** The narrowest tab neck for a piece size (mm). */
export const neckOf = (piece: number) => 2 * NECK * ((TAB * piece) / TAB_RISE) * (1 - SIZE_SPREAD);
/** The narrowest a neck may be for this sheet: thinner snaps (the laser jigsaw's own rule). */
export const neckNeeded = (thickness: number) => Math.max(MIN_NECK, thickness);
/** The smallest piece (whole mm) whose necks are strong enough. */
export const smallestPiece = (thickness: number) => Math.ceil(neckNeeded(thickness) / neckOf(1));
/** Pieces smaller than this (mm²) are joined to a neighbour. */
export const smallPiece = (piece: number) => Math.max(0.25 * piece * piece, 150);

/** What's wrong (plain English): `problems` stop it, `warnings` don't. */
export function contourChecks(spec: ContourSpec): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!(spec.thickness >= 1 && spec.thickness <= 12)) problems.push("The sheet should be 1 to 12 mm thick.");
  if (!(spec.width >= 60 && spec.width <= 1000)) problems.push("The puzzle should be 60 to 1000 mm wide.");
  if (!(spec.layers >= 2 && spec.layers <= 60)) problems.push("Use 2 to 60 sheets.");
  if (!problems.length) {
    const least = smallestPiece(spec.thickness);
    if (spec.piece < least)
      problems.push(`Pieces of ${spec.piece} mm are too small for ${spec.thickness} mm sheet: the tabs' necks would snap. Use at least ${least} mm.`);
    else if (spec.piece > spec.width / 1.5) warnings.push("The pieces are nearly as big as the puzzle: there'll be very few of them.");
  }
  return { problems, warnings };
}

export interface ContourLayer {
  /** 0 = the base. */
  index: number;
  /** Height (m) above which this sheet is solid (−∞ for the base). */
  level: number;
  /** The sheet's outline: anticlockwise outsides, clockwise holes. */
  loops: P2[][];
  /** Cuts between pieces, each an open run. */
  cuts: P2[][];
  /** The next sheet's outline, to score. */
  guide: P2[][];
  labels: { text: string; at: P2 }[];
  pieces: number;
  /** [x0, y0, x1, y1] of the sheet, mm. */
  box: [number, number, number, number];
}

export interface ContourPuzzle {
  spec: ContourSpec;
  /** Puzzle size, mm. */
  width: number;
  height: number;
  /** mm per metre of ground. */
  k: number;
  low: number;
  high: number;
  /** Metres of height per sheet, and how much that stretches heights. */
  metresPerLayer: number;
  stretch: number;
  layers: ContourLayer[];
  warnings: string[];
}

// ---------------------------------------------------------------------------------------------------------------
// Contours

const area = (p: P2[]) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [a, b] = [p[i], p[(i + 1) % p.length]];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
};

/** Heights sampled on a grid over the puzzle: node (i, j) at (i·sx, j·sy) mm. */
interface Samples {
  nx: number;
  ny: number;
  sx: number;
  sy: number;
  v: Float64Array;
}

/**
 * Loops round where the height is at least `level`: anticlockwise outsides, clockwise holes (marching squares; the
 * grid's edge counts as low ground, so loops close along it; saddles decided by the cell's middle).
 */
export function contourLoops(s: Samples, level: number): P2[][] {
  const { nx, ny, sx, sy, v } = s;
  const val = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= ny ? -Infinity : v[j * nx + i]);
  const up = (i: number, j: number) => val(i, j) >= level;
  const pos = (i: number, j: number): P2 => [Math.min(Math.max(i, 0), nx - 1) * sx, Math.min(Math.max(j, 0), ny - 1) * sy];
  const points = new Map<string, P2>();
  const next = new Map<string, string>();
  // Edge k of cell (i, j) runs from corner k to corner k + 1, anticlockwise: corners (i,j) (i+1,j) (i+1,j+1) (i,j+1).
  const corner = (i: number, j: number, k: number): [number, number] => [i + (k === 1 || k === 2 ? 1 : 0), j + (k >= 2 ? 1 : 0)];
  const edgeKey = (i: number, j: number, k: number) => {
    const a = corner(i, j, k);
    const b = corner(i, j, (k + 1) % 4);
    const [p, q] = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? [a, b] : [b, a];
    const key = `${p[0]},${p[1]},${q[0]},${q[1]}`;
    if (!points.has(key)) {
      const [va, vb] = [val(p[0], p[1]), val(q[0], q[1])];
      const [pa, pb] = [pos(p[0], p[1]), pos(q[0], q[1])];
      let t: number;
      if (!Number.isFinite(va)) t = 1;
      else if (!Number.isFinite(vb)) t = 0;
      else t = (level - va) / (vb - va);
      points.set(key, [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t]);
    }
    return key;
  };
  for (let j = -1; j < ny; j++)
    for (let i = -1; i < nx; i++) {
      const a = [0, 1, 2, 3].map((k) => up(...corner(i, j, k)));
      if (a.every((x) => x) || a.every((x) => !x)) continue;
      const exits = [0, 1, 2, 3].filter((k) => a[k] && !a[(k + 1) % 4]);
      const entries = [0, 1, 2, 3].filter((k) => !a[k] && a[(k + 1) % 4]);
      if (exits.length === 1) next.set(edgeKey(i, j, exits[0]), edgeKey(i, j, entries[0]));
      else {
        const vals = [0, 1, 2, 3].map((k) => val(...corner(i, j, k)));
        const centreUp = vals.every(Number.isFinite) && vals.reduce((x, y) => x + y, 0) / 4 >= level;
        for (const k of exits) next.set(edgeKey(i, j, k), edgeKey(i, j, centreUp ? (k + 1) % 4 : (k + 3) % 4));
      }
    }
  const loops: P2[][] = [];
  const seen = new Set<string>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: P2[] = [];
    for (let key: string | undefined = start; key && !seen.has(key); key = next.get(key)) {
      seen.add(key);
      const p = points.get(key)!;
      const last = loop[loop.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-9) loop.push(p);
    }
    if (loop.length > 2 && Math.hypot(loop[0][0] - loop[loop.length - 1][0], loop[0][1] - loop[loop.length - 1][1]) < 1e-9) loop.pop();
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Fewer corners, staying within `tol` mm of the loop (Douglas–Peucker, split at the two points furthest apart). */
export function simplifyLoop(loop: P2[], tol: number): P2[] {
  const n = loop.length;
  if (n < 5) return loop;
  let far = 0;
  let best = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]);
    if (d > best) [best, far] = [d, i];
  }
  const keep = new Uint8Array(n);
  keep[0] = keep[far] = 1;
  const stack: [number, number][] = [
    [0, far],
    [far, n],
  ];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = loop[a];
    const B = loop[b % n];
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = pointSegment(loop[i], A, B);
      if (d > worst) [worst, at] = [d, i];
    }
    if (worst > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return loop.filter((_, i) => keep[i]);
}

function pointSegment(p: P2, a: P2, b: P2): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// ---------------------------------------------------------------------------------------------------------------
// A sheet's region: inside tests, distance to its edge, crossings — through a grid of buckets.

class Region {
  segs: [P2, P2][] = [];
  private buckets = new Map<number, number[]>();
  private readonly G = 3;
  constructor(public loops: P2[][]) {
    for (const l of loops) for (let i = 0; i < l.length; i++) this.add([l[i], l[(i + 1) % l.length]]);
  }
  private add(s: [P2, P2]) {
    const id = this.segs.push(s) - 1;
    const [x0, x1] = [Math.min(s[0][0], s[1][0]), Math.max(s[0][0], s[1][0])];
    const [y0, y1] = [Math.min(s[0][1], s[1][1]), Math.max(s[0][1], s[1][1])];
    for (let gy = Math.floor(y0 / this.G); gy <= Math.floor(y1 / this.G); gy++)
      for (let gx = Math.floor(x0 / this.G); gx <= Math.floor(x1 / this.G); gx++) {
        const key = gy * 100003 + gx;
        const list = this.buckets.get(key);
        if (list) list.push(id);
        else this.buckets.set(key, [id]);
      }
  }
  /** Segment ids near a box. */
  near(x0: number, y0: number, x1: number, y1: number): Set<number> {
    const out = new Set<number>();
    for (let gy = Math.floor(y0 / this.G); gy <= Math.floor(y1 / this.G); gy++)
      for (let gx = Math.floor(x0 / this.G); gx <= Math.floor(x1 / this.G); gx++) for (const id of this.buckets.get(gy * 100003 + gx) ?? []) out.add(id);
    return out;
  }
  /** Inside (even–odd): a ray to the right, through the buckets along it. */
  inside(p: P2): boolean {
    let c = false;
    const gy = Math.floor(p[1] / this.G);
    const seen = new Set<number>();
    const gx0 = Math.floor(p[0] / this.G);
    const maxGx = gx0 + 100000;
    for (let gx = gx0; gx < maxGx; gx++) {
      const list = this.buckets.get(gy * 100003 + gx);
      if (list)
        for (const id of list) {
          if (seen.has(id)) continue;
          seen.add(id);
          const [[xi, yi], [xj, yj]] = this.segs[id];
          if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
        }
      if (gx * this.G > this.maxX) break;
    }
    return c;
  }
  get maxX(): number {
    return (this._maxX ??= Math.max(0, ...this.segs.map((s) => Math.max(s[0][0], s[1][0]))));
  }
  private _maxX?: number;
  /** Distance to the edge (stops looking past `reach`). */
  distance(p: P2, reach: number): number {
    let best = Infinity;
    for (const id of this.near(p[0] - reach, p[1] - reach, p[0] + reach, p[1] + reach)) best = Math.min(best, pointSegment(p, ...this.segs[id]));
    return best;
  }
}

/** The parts of a polyline inside a region, and the sines of the angles where it crosses the edge. */
function clipToRegion(poly: P2[], r: Region): { parts: P2[][]; sines: number[] } {
  const parts: P2[][] = [];
  const sines: number[] = [];
  let inside = r.inside(poly[0]);
  let cur: P2[] | null = inside ? [poly[0]] : null;
  for (let i = 0; i + 1 < poly.length; i++) {
    const [a, b] = [poly[i], poly[i + 1]];
    const hits: { t: number; p: P2; sin: number }[] = [];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    for (const id of r.near(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]))) {
      const [c, d] = r.segs[id];
      const [ex, ey] = [d[0] - c[0], d[1] - c[1]];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-15) continue;
      const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / den;
      const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / den;
      if (t < 0 || t >= 1 || u < 0 || u >= 1) continue;
      hits.push({ t, p: [a[0] + dx * t, a[1] + dy * t], sin: Math.abs(den) / (Math.hypot(dx, dy) * Math.hypot(ex, ey)) });
    }
    hits.sort((x, y) => x.t - y.t);
    for (const h of hits) {
      sines.push(h.sin);
      if (inside) {
        cur!.push(h.p);
        parts.push(cur!);
        cur = null;
      } else cur = [h.p];
      inside = !inside;
    }
    if (inside) cur!.push(b);
  }
  if (inside && cur && cur.length > 1) parts.push(cur);
  return { parts: parts.filter((p) => p.length > 1), sines };
}

// ---------------------------------------------------------------------------------------------------------------
// One sheet's cuts

interface Join {
  /** The kept parts of the cut. */
  parts: P2[][];
  /** Its grid corners that lie inside the sheet (where other joins must meet it, or it stops in mid-piece). */
  inner: P2[];
}

const cornerKey = (p: P2) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;

/** The puzzle's joins inside a sheet, by the rules above. */
function sheetJoins(region: Region, W: number, H: number, spec: ContourSpec, shifted: boolean, seed: number): Join[] {
  const cols = Math.max(1, Math.round(W / spec.piece));
  const rows = Math.max(1, Math.round(H / spec.piece));
  const [pw, ph] = [W / cols, H / rows];
  // Shifted: one more piece each way, the whole pattern half a piece down and left.
  const [c2, r2, ox, oy] = shifted ? [cols + 1, rows + 1, -pw / 2, -ph / 2] : [cols, rows, 0, 0];
  const p = makePuzzle({ width: c2 * pw, height: r2 * ph, rows: r2, columns: c2, tab: TAB, seed, minNeck: neckNeeded(spec.thickness) });
  const margin = Math.max(2, 1.5 * spec.thickness);
  const minSin = Math.sin((MIN_CROSSING * Math.PI) / 180);
  const joins: Join[] = [];
  for (const e of [...p.across.flat(), ...p.down.flat()]) {
    const line = (edgePolyline(e, 8) as P2[]).map(([x, y]) => [x + ox, y + oy] as P2);
    // Ends on the puzzle's border are carried a little past it, so the cut crosses the sheet's edge cleanly.
    const onBorder = (q: P2) => q[0] < 1e-6 || q[1] < 1e-6 || q[0] > W - 1e-6 || q[1] > H - 1e-6;
    const stretch = (q: P2, from: P2): P2 => {
      const [dx, dy] = [q[0] - from[0], q[1] - from[1]];
      const l = Math.hypot(dx, dy) || 1;
      return [q[0] + (dx / l) * 0.5, q[1] + (dy / l) * 0.5];
    };
    const first = line[0];
    const last = line[line.length - 1];
    if (onBorder(first)) line[0] = stretch(first, line[1]);
    if (onBorder(last)) line[line.length - 1] = stretch(last, line[line.length - 2]);
    // Where the tab wouldn't fit wholly inside the sheet, the join is cut straight (those two pieces don't lock,
    // but each still locks to its other neighbours).
    const tabFits = line.slice(1, -1).every((q) => region.inside(q) && region.distance(q, margin) >= margin);
    const cut = tabFits ? line : [line[0], line[line.length - 1]];
    const { parts, sines } = clipToRegion(cut, region);
    if (!parts.length) continue;
    if (sines.some((s) => s < minSin)) continue;
    const inner = [first, last].filter((q) => !onBorder(q) && region.inside(q) && region.distance(q, 0.05) > 0.01);
    joins.push({ parts, inner });
  }
  return joins;
}

/** Leave out joins that stop in the middle of a piece (an end inside the sheet that no other join meets). */
function withoutDeadEnds(joins: Join[]): Join[] {
  let list = joins;
  for (;;) {
    const count = new Map<string, number>();
    for (const j of list) for (const q of j.inner) count.set(cornerKey(q), (count.get(cornerKey(q)) ?? 0) + 1);
    const kept = list.filter((j) => j.inner.every((q) => (count.get(cornerKey(q)) ?? 0) >= 2));
    if (kept.length === list.length) return list;
    list = kept;
  }
}

/** The sheet drawn on a grid: which cells are inside, which are cut by which join, and the pieces. */
interface Raster {
  gx: number;
  gy: number;
  r: number;
  inside: Uint8Array;
  piece: Int32Array;
  areas: number[];
}

function raster(region: Region, W: number, H: number, r: number, inside?: Uint8Array): { inside: Uint8Array; gx: number; gy: number } {
  const gx = Math.ceil(W / r);
  const gy = Math.ceil(H / r);
  if (inside) return { inside, gx, gy };
  // Row by row: where the sheet's edges cross the row's middle, filled between pairs (even–odd).
  const out = new Uint8Array(gx * gy);
  const rows: number[][] = Array.from({ length: gy }, () => []);
  for (const [a, b] of region.segs) {
    const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    for (let y = Math.max(0, Math.ceil(y0 / r - 0.5)); y < gy && (y + 0.5) * r < y1; y++) {
      const yc = (y + 0.5) * r;
      if (yc < y0) continue;
      if (a[1] > yc !== b[1] > yc) rows[y].push(a[0] + ((yc - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
  }
  rows.forEach((xs, y) => {
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2)
      for (let x = Math.max(0, Math.ceil(xs[i] / r - 0.5)); x < gx && (x + 0.5) * r < xs[i + 1]; x++) out[y * gx + x] = 1;
  });
  return { inside: out, gx, gy };
}

function pieces(base: { inside: Uint8Array; gx: number; gy: number }, r: number, joins: Join[]): Raster & { walls: Int32Array } {
  const { inside, gx, gy } = base;
  const walls = new Int32Array(gx * gy).fill(-1);
  joins.forEach((j, id) => {
    for (const part of j.parts)
      for (let i = 0; i + 1 < part.length; i++) {
        const [a, b] = [part[i], part[i + 1]];
        const steps = Math.max(1, Math.ceil((Math.hypot(b[0] - a[0], b[1] - a[1]) / r) * 3));
        for (let s = 0; s <= steps; s++) {
          const x = Math.floor((a[0] + ((b[0] - a[0]) * s) / steps) / r);
          const y = Math.floor((a[1] + ((b[1] - a[1]) * s) / steps) / r);
          if (x >= 0 && y >= 0 && x < gx && y < gy) walls[y * gx + x] = id;
        }
      }
  });
  const piece = new Int32Array(gx * gy).fill(-1);
  const areas: number[] = [];
  const queue = new Int32Array(gx * gy);
  const free = (n: number) => inside[n] === 1 && walls[n] < 0 && piece[n] < 0;
  for (let c = 0; c < gx * gy; c++) {
    if (!free(c)) continue;
    const id = areas.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = c;
    piece[c] = id;
    while (head < tail) {
      const at = queue[head++];
      const x = at % gx;
      if (x + 1 < gx && free(at + 1)) (piece[at + 1] = id), (queue[tail++] = at + 1);
      if (x > 0 && free(at - 1)) (piece[at - 1] = id), (queue[tail++] = at - 1);
      if (at + gx < gx * gy && free(at + gx)) (piece[at + gx] = id), (queue[tail++] = at + gx);
      if (at >= gx && free(at - gx)) (piece[at - gx] = id), (queue[tail++] = at - gx);
    }
    areas.push(tail * r * r);
  }
  return { gx, gy, r, inside, piece, areas, walls };
}

/** Join small pieces to a neighbour by leaving out the cut they share most of; then no dead ends. */
function mergeSmall(region: Region, W: number, H: number, r: number, joins: Join[], least: number): { joins: Join[]; grid: Raster } {
  const base = raster(region, W, H, r);
  let list = withoutDeadEnds(joins);
  for (let round = 0; round < 200; round++) {
    const g = pieces(base, r, list);
    // For every small piece, the cut it shares most of with its neighbours.
    const touch = new Map<number, Map<number, number>>();
    const small = (id: number) => id >= 0 && g.areas[id] < least;
    const n = g.gx * g.gy;
    for (let c = 0; c < n; c++) {
      const id = g.piece[c];
      if (!small(id)) continue;
      const x = c % g.gx;
      for (const m of [x + 1 < g.gx ? c + 1 : -1, x > 0 ? c - 1 : -1, c + g.gx < n ? c + g.gx : -1, c >= g.gx ? c - g.gx : -1]) {
        const w = m < 0 ? -1 : g.walls[m];
        if (w < 0) continue;
        const t = touch.get(id) ?? new Map<number, number>();
        t.set(w, (t.get(w) ?? 0) + 1);
        touch.set(id, t);
      }
    }
    const drop = new Set<number>();
    for (const t of touch.values()) drop.add([...t.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    if (!drop.size) return { joins: list, grid: g };
    list = withoutDeadEnds(list.filter((_, i) => !drop.has(i)));
  }
  return { joins: list, grid: pieces(base, r, list) };
}

/** Distance (in cells) from each cell where `mask` is set to the nearest cell where it isn't (chamfer, two passes). */
function chamfer(mask: (c: number) => boolean, gx: number, gy: number): Float32Array {
  const d = new Float32Array(gx * gy);
  for (let c = 0; c < d.length; c++) d[c] = mask(c) ? 1e9 : 0;
  const at = (x: number, y: number, c: number) => (x < 0 || y < 0 || x >= gx || y >= gy ? c : d[y * gx + x] + c);
  for (let y = 0; y < gy; y++)
    for (let x = 0; x < gx; x++) {
      const c = y * gx + x;
      if (d[c]) d[c] = Math.min(d[c], at(x - 1, y, 1), at(x, y - 1, 1), at(x - 1, y - 1, 1.414), at(x + 1, y - 1, 1.414));
    }
  for (let y = gy - 1; y >= 0; y--)
    for (let x = gx - 1; x >= 0; x--) {
      const c = y * gx + x;
      if (d[c]) d[c] = Math.min(d[c], at(x + 1, y, 1), at(x, y + 1, 1), at(x + 1, y + 1, 1.414), at(x - 1, y + 1, 1.414));
    }
  return d;
}

/** Where to engrave each piece's name: hidden under the next sheet if there's room there, else the roomiest spot. */
function labelPlaces(g: Raster, next: Uint8Array | null, need: number): (P2 | null)[] {
  const { gx, gy, r, piece } = g;
  const room = chamfer((c) => piece[c] >= 0, gx, gy);
  const under = next ? chamfer((c) => next[c] === 1, gx, gy) : null;
  const best: { score: number; c: number }[] = g.areas.map(() => ({ score: -1, c: -1 }));
  for (let c = 0; c < room.length; c++) {
    const id = piece[c];
    if (id < 0 || room[c] * r < need) continue;
    // Hidden spots win; then the roomiest — but no more than needed, so a name sits near the middle of the hidden part.
    const hidden = !!under && under[c] * r >= need;
    const score = (hidden ? 1e6 : 0) + Math.min(room[c] * r, need * 3);
    if (score > best[id].score) best[id] = { score, c };
  }
  return best.map((b) => (b.c < 0 ? null : ([((b.c % gx) + 0.5) * r, (Math.floor(b.c / gx) + 0.5) * r] as P2)));
}

// ---------------------------------------------------------------------------------------------------------------

/** The whole puzzle from the heights of an area `areaWidth` × `areaHeight` m (south-west corner at the grid's). */
export function makeContourPuzzle(grid: HeightGrid, areaWidth: number, areaHeight: number, spec: ContourSpec, sw = { e: grid.e0, n: grid.n0 }): ContourPuzzle {
  const checks = contourChecks(spec);
  if (checks.problems.length) throw new Error(checks.problems[0]);
  const W = spec.width;
  const k = W / areaWidth;
  const H = areaHeight * k;
  // Heights on a grid about 0.7 mm apart (finer than the laser needs, coarse enough to be quick).
  const step = Math.min(1.2, Math.max(0.4, W / 360));
  const nx = Math.ceil(W / step) + 1;
  const ny = Math.ceil(H / step) + 1;
  const sx = W / (nx - 1);
  const sy = H / (ny - 1);
  const v = new Float64Array(nx * ny);
  let low = Infinity;
  let high = -Infinity;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const h = heightAt(grid, sw.e + (i * sx) / k, sw.n + (j * sy) / k);
      v[j * nx + i] = h;
      low = Math.min(low, h);
      high = Math.max(high, h);
    }
  const samples: Samples = { nx, ny, sx, sy, v };
  const band = (high - low) / spec.layers;
  const tidy = (loops: P2[][]) =>
    loops
      .map((l) => simplifyLoop(l, 0.05))
      .filter((l) => {
        const a = area(l);
        return a > 0 ? a >= SMALL_ISLAND : -a >= SMALL_HOLE;
      });
  // The outline of every sheet first (each sheet scores the next one's).
  const outlines: P2[][][] = [];
  for (let L = 0; L < spec.layers; L++)
    outlines.push(
      L === 0
        ? [
            [
              [0, 0],
              [W, 0],
              [W, H],
              [0, H],
            ],
          ]
        : tidy(contourLoops(samples, low + L * band)),
    );
  const r = Math.min(0.8, Math.max(0.35, spec.piece / 50));
  const least = smallPiece(spec.piece);
  const layers: ContourLayer[] = [];
  const warnings = [...checks.warnings];
  let empty = 0;
  let unnamed = 0;
  for (let L = 0; L < spec.layers; L++) {
    const loops = outlines[L];
    if (!loops.some((l) => area(l) > 0)) {
      empty++;
      continue;
    }
    const region = new Region(loops);
    const joins = sheetJoins(region, W, H, spec, spec.stagger && L % 2 === 1, spec.seed * 31 + L * 977);
    const { joins: kept, grid: g } = mergeSmall(region, W, H, r, joins, least);
    const nextLoops = L + 1 < spec.layers ? outlines[L + 1] : [];
    const next = nextLoops.length ? raster(new Region(nextLoops), W, H, r).inside : null;
    // Pieces numbered from the back left, row by row.
    const sums = g.areas.map(() => [0, 0, 0]);
    for (let c = 0; c < g.piece.length; c++) {
      const id = g.piece[c];
      if (id < 0) continue;
      sums[id][0] += c % g.gx;
      sums[id][1] += Math.floor(c / g.gx);
      sums[id][2]++;
    }
    const order = sums
      .map(([x, y, n], id) => ({ id, x: (x / n) * g.r, y: (y / n) * g.r }))
      .sort((a, b) => Math.round((b.y - a.y) / spec.piece) * 1e6 + (a.x - b.x) || b.y - a.y);
    const labels: { text: string; at: P2 }[] = [];
    if (spec.labels) {
      const widest = `${spec.layers}-${order.length}`.length * LABEL_SIZE * 0.68;
      const places = labelPlaces(g, next, widest / 2 + 0.8);
      order.forEach((o, i) => {
        const at = places[o.id];
        if (at) labels.push({ text: `${L + 1}-${i + 1}`, at });
      });
      unnamed += order.length - labels.length;
    }
    const xs = loops.flat().map((p) => p[0]);
    const ys = loops.flat().map((p) => p[1]);
    layers.push({
      index: L,
      level: L === 0 ? -Infinity : low + L * band,
      loops,
      cuts: kept.flatMap((j) => j.parts),
      guide: spec.guides ? nextLoops : [],
      labels,
      pieces: g.areas.length,
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    });
  }
  if (unnamed) warnings.push(`${unnamed} small ${unnamed === 1 ? "piece has" : "pieces have"} no room for a name.`);
  if (empty) warnings.push(`${empty} top ${empty === 1 ? "sheet has" : "sheets have"} nothing on ${empty === 1 ? "it" : "them"} — use fewer sheets.`);
  return { spec, width: W, height: H, k, low, high, metresPerLayer: band, stretch: spec.thickness / (band * k), layers, warnings };
}
