/**
 * Map features on a layered mountain's sheets (pure, mm, y up). A sheet shows where the ground's height is between its
 * own contour and the next one's, so each thing goes on the sheet whose band it lies in: paths, tracks, roads, rivers
 * and streams are split where they cross a contour and each stretch is scored on its own sheet; lochs and buildings are
 * engraved on the sheet of their lowest shore; names are engraved, at their place (or as near as is clear of water and
 * of each other), on every sheet whose visible band they cross.
 */
import { insideRing, type MapFeatures } from "./osm";

type P2 = [number, number];

/** Map names' capital height (mm). */
export const NAME_SIZE = 3.5;
/** How far a name may move from its place to find room (mm). */
export const NAME_REACH = 20;
/** Buildings are engraved at least this big across (mm). */
export const BUILDING_LEAST = 1;

export interface SheetMarks {
  /** Lines to score. */
  lines: P2[][];
  /** Closed loops to engrave (even–odd: islands stay unengraved). */
  fills: P2[][];
  names: { text: string; at: P2 }[];
}

/** The box a map name takes (mm), for keeping piece names off it. */
export function nameBox(n: { text: string; at: P2 }): [number, number, number, number] {
  const w = nameWidth(n.text) / 2 + 0.6;
  const h = NAME_SIZE / 2 + 0.6;
  return [n.at[0] - w, n.at[1] - h, n.at[0] + w, n.at[1] + h];
}

export interface MarksResult {
  /** One per sheet (index = sheet number from 0). */
  sheets: SheetMarks[];
  /** Names with no room anywhere near their place. */
  unplaced: number;
}

/** Text width estimate for a name of capital height `size` (as the piece names). */
export const nameWidth = (text: string, size = NAME_SIZE) => text.length * size * 0.68;

/**
 * `height(x, y)`: the ground's height (m) at a puzzle point; sheet L (from 0) is solid where it is at least
 * `low + L·band`. Features are on the OS grid; the puzzle's (0, 0) is grid point `sw`, at `k` mm per metre.
 */
export function sheetMarks(
  f: MapFeatures,
  sw: { e: number; n: number },
  k: number,
  W: number,
  H: number,
  height: (x: number, y: number) => number,
  low: number,
  band: number,
  layers: number,
): MarksResult {
  const sheets: SheetMarks[] = Array.from({ length: layers }, () => ({ lines: [], fills: [], names: [] }));
  const at = ([e, n]: P2): P2 => [(e - sw.e) * k, (n - sw.n) * k];
  const layerAt = (x: number, y: number) => Math.max(0, Math.min(layers - 1, Math.floor((height(x, y) - low) / band)));
  const step = 0.4;

  for (const line of f.lines) {
    const pts = line.pts.map(at);
    let run: P2[] = [];
    let runLayer = -1;
    const finish = () => {
      if (run.length >= 2 && runLayer >= 0) sheets[runLayer].lines.push(run);
      run = [];
      runLayer = -1;
    };
    for (let s = 0; s + 1 < pts.length; s++) {
      const piece = clipSegment(pts[s], pts[s + 1], W, H);
      if (!piece) {
        finish();
        continue;
      }
      const [a, b] = piece;
      if (run.length && Math.hypot(run[run.length - 1][0] - a[0], run[run.length - 1][1] - a[1]) > 1e-6) finish();
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let i = run.length ? 1 : 0; i <= n; i++) {
        const p: P2 = [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n];
        const L = layerAt(p[0], p[1]);
        if (runLayer >= 0 && L !== runLayer) {
          // Split halfway between the last point and this one, so the stretches meet.
          const last = run[run.length - 1];
          const mid: P2 = [(last[0] + p[0]) / 2, (last[1] + p[1]) / 2];
          run.push(mid);
          finish();
          run = [mid];
        }
        runLayer = L;
        run.push(p);
      }
    }
    finish();
  }
  // Straight stretches only need their ends: thin the samples back out.
  for (const s of sheets) s.lines = s.lines.map(thinStraight).filter((r) => length(r) >= 0.5);

  // Water and buildings, on the sheet of their lowest shore.
  const water: { layer: number; rings: P2[][] }[] = [];
  for (const shape of f.shapes) {
    const outer = clipRing(shape.rings[0].map(at), W, H);
    if (outer.length < 3) continue;
    let rings = [outer, ...shape.rings.slice(1).map((r) => clipRing(r.map(at), W, H)).filter((r) => r.length >= 3)];
    if (shape.kind === "building") {
      const xs = rings[0].map((p) => p[0]);
      const ys = rings[0].map((p) => p[1]);
      if (Math.max(...xs) - Math.min(...xs) < BUILDING_LEAST && Math.max(...ys) - Math.min(...ys) < BUILDING_LEAST) {
        const [cx, cy, h] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, BUILDING_LEAST / 2];
        rings = [
          [
            [cx - h, cy - h],
            [cx + h, cy - h],
            [cx + h, cy + h],
            [cx - h, cy + h],
          ],
        ];
      }
    }
    const L = Math.min(...rings[0].map(([x, y]) => layerAt(x, y)));
    sheets[L].fills.push(...rings);
    if (shape.kind === "water") water.push({ layer: L, rings });
  }

  // Names: at their place (or the nearest spot clear of water and other names), engraved on every sheet they're seen
  // on — on a slope each sheet shows only a strip, so the name steps down the hill a sheet at a time and reads whole
  // from above; where the sheet above covers it, it's hidden.
  const placed: [number, number, number, number][] = [];
  let unplaced = 0;
  const overlaps = (b: [number, number, number, number]) => placed.some((q) => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]);
  for (const name of f.names) {
    const [x0, y0] = at(name.at);
    if (x0 < 0 || y0 < 0 || x0 > W || y0 > H) continue;
    const w = nameWidth(name.text) / 2 + 0.6;
    const h = NAME_SIZE / 2 + 0.6;
    let done = false;
    for (let r = 0; r <= NAME_REACH && !done; r += 1.5) {
      const turns = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / 1.5);
      for (let t = 0; t < turns && !done; t++) {
        // Below the place first (a name usually sits under its peak), then round.
        const ang = -Math.PI / 2 + (2 * Math.PI * t) / turns;
        const [cx, cy] = [x0 + r * Math.cos(ang), y0 + r * Math.sin(ang)];
        const box: [number, number, number, number] = [cx - w, cy - h, cx + w, cy + h];
        if (box[0] < 1 || box[1] < 1 || box[2] > W - 1 || box[3] > H - 1 || overlaps(box)) continue;
        const seen = new Set<number>();
        let wet = false;
        const nx = Math.ceil((box[2] - box[0]) / 0.5);
        const ny = Math.ceil((box[3] - box[1]) / 0.5);
        for (let j = 0; j <= ny && !wet; j++)
          for (let i = 0; i <= nx && !wet; i++) {
            const p: P2 = [box[0] + ((box[2] - box[0]) * i) / nx, box[1] + ((box[3] - box[1]) * j) / ny];
            const L = layerAt(p[0], p[1]);
            seen.add(L);
            if (water.some((wt) => wt.layer === L && inRings(p, wt.rings))) wet = true;
          }
        if (wet) continue;
        for (const L of seen) sheets[L].names.push({ text: name.text, at: [cx, cy] });
        placed.push(box);
        done = true;
      }
    }
    if (!done) unplaced++;
  }
  return { sheets, unplaced };
}

function inRings(p: P2, rings: P2[][]): boolean {
  let n = 0;
  for (const r of rings) if (insideRing(p, r)) n++;
  return n % 2 === 1;
}

const length = (r: P2[]) => r.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - r[i - 1][0], p[1] - r[i - 1][1]) : 0), 0);

/** Drop points that lie on the straight line between their neighbours (within 0.02 mm). */
function thinStraight(r: P2[]): P2[] {
  if (r.length <= 2) return r;
  const out: P2[] = [r[0]];
  for (let i = 1; i + 1 < r.length; i++) {
    const [a, p, b] = [out[out.length - 1], r[i], r[i + 1]];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const L = Math.hypot(dx, dy);
    const off = L > 0 ? Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L : Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (off > 0.02) out.push(p);
  }
  out.push(r[r.length - 1]);
  return out;
}

/** The part of a segment inside [0, W] × [0, H] (Liang–Barsky), or null. */
function clipSegment(a: P2, b: P2, W: number, H: number): [P2, P2] | null {
  let [t0, t1] = [0, 1];
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  for (const [p, q] of [
    [-dx, a[0]],
    [dx, W - a[0]],
    [-dy, a[1]],
    [dy, H - a[1]],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

/** A closed ring cut to [0, W] × [0, H] (Sutherland–Hodgman). */
function clipRing(ring: P2[], W: number, H: number): P2[] {
  let out = ring;
  const edges: [(p: P2) => boolean, (a: P2, b: P2) => P2][] = [
    [(p) => p[0] >= 0, (a, b) => [0, a[1] + ((b[1] - a[1]) * (0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= W, (a, b) => [W, a[1] + ((b[1] - a[1]) * (W - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= 0, (a, b) => [a[0] + ((b[0] - a[0]) * (0 - a[1])) / (b[1] - a[1]), 0]],
    [(p) => p[1] <= H, (a, b) => [a[0] + ((b[0] - a[0]) * (H - a[1])) / (b[1] - a[1]), H]],
  ];
  for (const [inside, cross] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const [p, q] = [src[i], src[(i + 1) % src.length]];
      if (inside(p)) out.push(p);
      if (inside(p) !== inside(q)) out.push(cross(p, q));
    }
    if (!out.length) break;
  }
  return out;
}
