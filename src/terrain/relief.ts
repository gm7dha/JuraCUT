/**
 * Island relief (pure): an island's heights carved into a board by the laser — not in layers, but as one greyscale depth
 * picture for Bambu's "Grayscale" engraving, where each pixel's grey sets the laser's power (near-white = the least, black
 * = the most). The highest ground is left at the board's surface; the lower the ground, the darker the grey and the
 * deeper the laser goes, down to `depth` mm at the coast. The coast is cut right through, so the island comes out in one
 * piece — or, with a puzzle pattern, in jigsaw pieces whose cuts stop at the coast. A frame round it (the sea) can be cut
 * too, with the island's name engraved on it, so the pieces drop back into their place.
 *
 * In: heights on the OS grid (elevation.ts) and the area chosen; out: millimetres on the bed, y up, (0, 0) the land's
 * bottom-left corner.
 */
import { pathPoints, pointInPolygon, type Pt, type Segment } from "../geometry/segments";
import { loopArea, simplifyLoop, smoothLoop, traceBitmap } from "../geometry/trace";
import { edgePolyline, makePuzzle, puzzleProblems, seeded, type P2 } from "../library/puzzle";
import { heightAt, type HeightGrid } from "./elevation";
import { fillEnclosed, keepLand, onlyCells, stretches, type IslandLand, type IslandOnly } from "./islandLand";
import type { GridPoint } from "./osGrid";

export type ReliefStyle = "smooth" | "terraced";
export type PuzzlePattern = "none" | "classic" | "small" | "wavy" | "straight";

export const PUZZLE_PATTERNS: { value: PuzzlePattern; label: string; hint: string }[] = [
  { value: "none", label: "One piece", hint: "The whole island comes out in one piece." },
  { value: "classic", label: "Classic jigsaw", hint: "Round tabs that lock the pieces together." },
  { value: "small", label: "Small tabs", hint: "Smaller tabs: neater on a busy relief, still locking." },
  { value: "wavy", label: "Wavy", hint: "Gently curving cuts with no tabs: easy for small hands." },
  { value: "straight", label: "Straight", hint: "Straight cuts in squares, like a tile puzzle." },
];

export interface ReliefArea {
  /** South-west corner and size (m) on the OS grid. */
  sw: GridPoint;
  width: number;
  height: number;
  only?: IslandOnly;
}

export interface ReliefSpec {
  /** The island's longer side on the bed (mm). */
  size: number;
  /** The board's thickness (mm). */
  thickness: number;
  /** How deep the lowest ground (the coast) is carved (mm); the highest stays at the surface. */
  depth: number;
  style: ReliefStyle;
  /**
   * How it's carved: "greys" — one engraving whose greys set the laser's power (Bambu Studio's Grayscale mode); "passes"
   * — terraced, one black-and-white engraving per step at the same power, each taking off an equal layer. Missing = greys.
   */
  carve?: "greys" | "passes";
  /** Terraced: how many steps from the coast to the top. */
  steps: number;
  /** Height curve: 1 = even; below 1 lifts the low ground (more of the island shows), above 1 sharpens the peaks. */
  curve: number;
  /** Ground no higher than this (m) is sea. */
  sea: number;
  land: IslandLand;
  /** Score a contour line every so many metres (0: none). */
  contours: number;
  puzzle: PuzzlePattern;
  /** Pieces across the island's longer side. */
  pieces: number;
  /** Which puzzle (any whole number: each gives other tabs). */
  seed: number;
  /** A frame round the island this wide (mm; 0: none). */
  frame: number;
  /** Words engraved on the frame's bottom edge (with a frame). */
  name: string;
  /** A scale bar on the frame's top edge (with a frame wide enough). Missing = yes. */
  scaleBar?: boolean;
}

export const RELIEF_DEFAULTS: ReliefSpec = {
  size: 250,
  thickness: 6,
  depth: 3,
  style: "smooth",
  steps: 8,
  curve: 0.8,
  sea: 0.5,
  land: "islands",
  contours: 0,
  puzzle: "none",
  pieces: 5,
  seed: 1,
  frame: 0,
  name: "",
};

/** Material left under the deepest carving, at the least (mm). */
export const LEAST_BASE = 1;
/** How many cells the land is worked out on along its longer side. */
export const GRID_CELLS = 900;
/** The depth picture's pixels per mm, at most (the picture is kept ≤ `MOST_PIXELS` a side). */
export const PICTURE_DPM = 10;
export const MOST_PIXELS = 1600;
/** Specks of land smaller than this (mm² on the bed) are left out: they'd be lost in the cut. */
export const LEAST_ISLET = 6;
/** Closed-in patches smaller than this (mm²) are filled in even at sea level (a pinhole of sea won't cut cleanly). */
export const SMALL_HOLE = 20;
/** Puzzle cuts carry on this far past the coast (mm), so they meet the coast's cut. */
export const CUT_OVERRUN = 0.4;
/** Pieces smaller than this share of a full piece are counted as small (they may snap or get lost). */
export const SMALL_PIECE_SHARE = 0.12;

export interface Relief {
  /** The land's box on the bed (mm). */
  width: number;
  height: number;
  /** The depth picture: greys row by row from the top (north), 255 = the surface, 0 = `depth` deep. */
  greys: Uint8Array;
  gw: number;
  gh: number;
  /** The coastline (closed loops), the jigsaw cuts (open runs), contour lines (closed loops), mm. */
  coast: Segment[][];
  cuts: Segment[][];
  contours: Segment[][];
  /** The frame's outside (mm; same origin) and where its name goes; null without a frame. */
  frame: {
    x: number;
    y: number;
    w: number;
    h: number;
    nameAt: Pt | null;
    nameSize: number;
    /** A scale bar along the frame's top edge (right-hand end at `at`, the bar's middle height), or null. */
    scale: { at: Pt; length: number; label: string; size: number } | null;
  } | null;
  /** The highest ground (m) and how much the heights are stretched compared with the map (×). */
  highest: number;
  exaggeration: number;
  /** Mm on the bed per metre of map. */
  scale: number;
  /** Jigsaw pieces (about), and how many of them are small. */
  pieces: number;
  smallPieces: number;
  warnings: string[];
}

/** Problems with the numbers given, before anything is worked out. */
/**
 * The engravings for carving in passes (terraced): one black-and-white picture per pass (0 = engraved, 255 = left),
 * from the first — everything below the top step — to the last — only the lowest step. `steps` − 1 passes, each taking
 * the ground down one step (depth / (steps − 1)). Same size and place as `relief.greys`.
 */
export function passMasks(relief: Pick<Relief, "greys">, steps: number): Uint8Array[] {
  const passes = Math.max(1, Math.round(steps) - 1);
  const out: Uint8Array[] = [];
  for (let k = 1; k <= passes; k++) {
    const below = (255 * (passes - k + 0.5)) / passes;
    const m = new Uint8Array(relief.greys.length);
    for (let i = 0; i < m.length; i++) m[i] = relief.greys[i] < below ? 0 : 255;
    out.push(m);
  }
  return out;
}

export function reliefProblems(s: ReliefSpec): string[] {
  const out: string[] = [];
  if (!(s.thickness > 0)) out.push("Give the board's thickness.");
  if (!(s.depth > 0)) out.push("The carving needs some depth.");
  else if (s.depth > s.thickness - LEAST_BASE) out.push(`Carving ${s.depth} mm into a ${s.thickness} mm board leaves less than ${LEAST_BASE} mm under the coast: carve less deep, or use a thicker board.`);
  if (!(s.size >= 30)) out.push("Make the island at least 30 mm across.");
  if (s.carve === "passes" && s.style !== "terraced") out.push("Carving in passes makes terraced steps: choose Terraced steps.");
  return out;
}

/** The depth (0 = surface … 1 = full depth) for a height, by the spec's curve and style. */
export function depthShare(h: number, highest: number, s: Pick<ReliefSpec, "curve" | "style" | "steps">): number {
  const f = Math.pow(Math.min(1, Math.max(0, highest > 0 ? h / highest : 0)), s.curve);
  if (s.style !== "terraced") return 1 - f;
  const steps = Math.max(2, Math.round(s.steps));
  const band = Math.min(steps - 1, Math.floor(f * steps));
  return 1 - band / (steps - 1);
}

type Ring = Pt[];

/** Every crossing of segment a→b with the rings (as shares along a→b), using a grid of the rings' edges. */
class RingIndex {
  private cell: number;
  private grid = new Map<string, [Pt, Pt][]>();
  constructor(
    readonly rings: Ring[],
    cell: number,
  ) {
    this.cell = cell;
    for (const r of rings)
      for (let i = 0; i < r.length; i++) {
        const a = r[i];
        const b = r[(i + 1) % r.length];
        const [x0, x1] = [Math.floor(Math.min(a[0], b[0]) / cell), Math.floor(Math.max(a[0], b[0]) / cell)];
        const [y0, y1] = [Math.floor(Math.min(a[1], b[1]) / cell), Math.floor(Math.max(a[1], b[1]) / cell)];
        for (let x = x0; x <= x1; x++)
          for (let y = y0; y <= y1; y++) {
            const k = `${x},${y}`;
            const l = this.grid.get(k);
            if (l) l.push([a, b]);
            else this.grid.set(k, [[a, b]]);
          }
      }
  }
  crossings(a: Pt, b: Pt): number[] {
    const c = this.cell;
    const [x0, x1] = [Math.floor(Math.min(a[0], b[0]) / c), Math.floor(Math.max(a[0], b[0]) / c)];
    const [y0, y1] = [Math.floor(Math.min(a[1], b[1]) / c), Math.floor(Math.max(a[1], b[1]) / c)];
    const seen = new Set<[Pt, Pt]>();
    const ts: number[] = [];
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (const e of this.grid.get(`${x},${y}`) ?? []) {
          if (seen.has(e)) continue;
          seen.add(e);
          const [p, q] = e;
          const d1x = b[0] - a[0];
          const d1y = b[1] - a[1];
          const d2x = q[0] - p[0];
          const d2y = q[1] - p[1];
          const den = d1x * d2y - d1y * d2x;
          if (Math.abs(den) < 1e-12) continue;
          const t = ((p[0] - a[0]) * d2y - (p[1] - a[1]) * d2x) / den;
          const u = ((p[0] - a[0]) * d1y - (p[1] - a[1]) * d1x) / den;
          if (t > 0 && t < 1 && u >= 0 && u < 1) ts.push(t);
        }
    return ts.sort((m, n) => m - n);
  }
  inside(p: Pt): boolean {
    let n = 0;
    for (const r of this.rings) if (pointInPolygon(p, r)) n++;
    return n % 2 === 1;
  }
}

/**
 * The parts of a polyline inside the rings, as runs; each run's ends that meet the coast are carried on `overrun` mm,
 * so the cut crosses the coast's own cut.
 */
export function clipToRings(line: Pt[], index: RingIndex, overrun = CUT_OVERRUN): Pt[][] {
  const runs: Pt[][] = [];
  let run: Pt[] | null = null;
  let startsAtCoast = false;
  const close = (endsAtCoast: boolean) => {
    if (!run || run.length < 2) {
      run = null;
      return;
    }
    const r = run;
    const push = (from: Pt, to: Pt) => {
      const l = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
      return [to[0] + ((to[0] - from[0]) / l) * overrun, to[1] + ((to[1] - from[1]) / l) * overrun] as Pt;
    };
    if (startsAtCoast) r[0] = push(r[1], r[0]);
    if (endsAtCoast) r[r.length - 1] = push(r[r.length - 2], r[r.length - 1]);
    let len = 0;
    for (let i = 1; i < r.length; i++) len += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
    if (len > 1) runs.push(r);
    run = null;
  };
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    const ts = [0, ...index.crossings(a, b), 1];
    for (let k = 0; k + 1 < ts.length; k++) {
      const p = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const mid = p((ts[k] + ts[k + 1]) / 2);
      const isIn = index.inside(mid);
      if (isIn) {
        if (!run) {
          run = [p(ts[k])];
          // Only the line's very first point isn't on the coast.
          startsAtCoast = !(i === 0 && k === 0);
        }
        run.push(p(ts[k + 1]));
      } else if (run) close(true);
    }
  }
  close(false);
  return runs;
}

/** The jigsaw's lines over a W × H board, before they're cut back to the coast. */
export function patternLines(pattern: PuzzlePattern, W: number, H: number, pieces: number, seed: number, minNeck = 2): { lines: Pt[][]; cols: number; rows: number; problems: string[] } {
  if (pattern === "none") return { lines: [], cols: 1, rows: 1, problems: [] };
  const P = Math.max(W, H) / Math.max(1, pieces);
  const cols = Math.max(1, Math.round(W / P));
  const rows = Math.max(1, Math.round(H / P));
  if (cols * rows < 2) return { lines: [], cols, rows, problems: [] };
  if (pattern === "classic" || pattern === "small") {
    const spec = { width: W, height: H, rows, columns: cols, tab: pattern === "classic" ? 0.25 : 0.17, seed, minNeck };
    const pz = makePuzzle(spec);
    // Each row's (and column's) edges joined end to end: one long cut across the board.
    const joined = (edges: (typeof pz.across)[number]) => edges.flatMap((e, i) => edgePolyline(e, 12).slice(i ? 1 : 0).map((p: P2): Pt => [p[0], p[1]]));
    const lines = [...pz.across.map(joined), ...pz.down.map(joined)];
    return { lines, cols, rows, problems: puzzleProblems(spec) };
  }
  const pw = W / cols;
  const ph = H / rows;
  const rand = seeded(seed);
  const lines: Pt[][] = [];
  const edge = (a: Pt, b: Pt) => {
    if (pattern === "straight") return [a, b];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n: Pt = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    const amp = 0.09 * L * (0.7 + 0.6 * rand()) * (rand() < 0.5 ? -1 : 1);
    const waves = rand() < 0.5 ? 1 : 2;
    const out: Pt[] = [];
    for (let k = 0; k <= 32; k++) {
      const t = k / 32;
      const w = amp * Math.sin(Math.PI * waves * t);
      out.push([a[0] + (b[0] - a[0]) * t + n[0] * w, a[1] + (b[1] - a[1]) * t + n[1] * w]);
    }
    return out;
  };
  for (let r = 1; r < rows; r++) lines.push(Array.from({ length: cols }, (_, c) => edge([c * pw, r * ph], [(c + 1) * pw, r * ph]).slice(c ? 1 : 0)).flat());
  for (let c = 1; c < cols; c++) lines.push(Array.from({ length: rows }, (_, r) => edge([c * pw, r * ph], [c * pw, (r + 1) * ph]).slice(r ? 1 : 0)).flat());
  return { lines, cols, rows, problems: [] };
}

const asLine = (pts: Pt[]): Segment[] => pts.slice(1).map((p, i): Segment => ({ kind: "line", from: pts[i], to: p }));

/** Loops traced round the 1-cells of a mask (cells `mm` across, row 0 = north), in mm, y up, smoothed. */
function traceMask(bits: Uint8Array, w: number, h: number, mm: number, leastArea: number): { loops: Segment[][]; specks: number } {
  const raw = traceBitmap({ width: w, height: h, bits });
  const loops: Segment[][] = [];
  let specks = 0;
  for (const loop of raw) {
    if (Math.abs(loopArea(loop)) * mm * mm < leastArea) {
      specks++;
      continue;
    }
    const simple = simplifyLoop(loop, 0.6);
    if (simple.length < 3) continue;
    loops.push(smoothLoop(simple.map(([x, y]): Pt => [x * mm, (h - y) * mm]), 50));
  }
  return { loops, specks };
}

/** The relief from heights covering `area`. Throws (a plain message) when there's no land. */
export function makeRelief(grid: HeightGrid, area: ReliefArea, s: ReliefSpec): Relief {
  const warnings: string[] = [];
  // The land on a grid of cells over the whole area.
  const cellM = Math.max(area.width, area.height) / GRID_CELLS;
  const nx = Math.max(2, Math.ceil(area.width / cellM));
  const ny = Math.max(2, Math.ceil(area.height / cellM));
  const N = nx * ny;
  const hs = new Float32Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) hs[j * nx + i] = heightAt(grid, area.sw.e + (i + 0.5) * cellM, area.sw.n + (j + 0.5) * cellM);
  const heightOf = (c: number) => hs[c];
  const isLand = new Uint8Array(N);
  for (let c = 0; c < N; c++) isLand[c] = hs[c] > s.sea ? 1 : 0;
  keepLand(isLand, nx, ny, s.land, warnings, area.only ? onlyCells(area.only, area.sw, cellM) : undefined, heightOf);
  // The land's box, and so the scale.
  let [i0, i1, j0, j1] = [nx, -1, ny, -1];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      if (isLand[j * nx + i]) {
        i0 = Math.min(i0, i);
        i1 = Math.max(i1, i);
        j0 = Math.min(j0, j);
        j1 = Math.max(j1, j);
      }
  if (i1 < 0) throw new Error("There's no land in this area — it's all sea.");
  const k = s.size / (Math.max(i1 - i0 + 1, j1 - j0 + 1) * cellM); // mm per m
  const cellMm = cellM * k;
  // Lochs and gaps closed in by the land: filled (carved as the deepest ground), unless big, at sea level and kept as sea.
  const seaPoints = new Set<number>();
  for (const p of area.only?.sea ?? []) {
    const [i, j] = [Math.floor((p.e - area.sw.e) / cellM), Math.floor((p.n - area.sw.n) / cellM)];
    if (i >= 0 && j >= 0 && i < nx && j < ny) seaPoints.add(j * nx + i);
  }
  fillEnclosed(isLand, nx, ny, heightOf, (cells, lowest) => !cells.some((c) => seaPoints.has(c)) && (lowest > s.sea || cells.length * cellMm * cellMm < SMALL_HOLE));
  // The land's own grid (with a cell of sea round it), row 0 = north.
  const [a0, b0] = [Math.max(0, i0 - 1), Math.max(0, j0 - 1)];
  const [a1, b1] = [Math.min(nx - 1, i1 + 1), Math.min(ny - 1, j1 + 1)];
  const w = a1 - a0 + 1;
  const h = b1 - b0 + 1;
  const bits = new Uint8Array(w * h);
  let highest = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = (b1 - y) * nx + (a0 + x);
      bits[y * w + x] = isLand[c];
      if (isLand[c]) highest = Math.max(highest, hs[c]);
    }
  const coastTrace = traceMask(bits, w, h, cellMm, LEAST_ISLET);
  if (!coastTrace.loops.length) throw new Error("The land here is too small to cut at this size — make it bigger.");
  if (coastTrace.specks) warnings.push(`${coastTrace.specks} tiny ${coastTrace.specks === 1 ? "islet is" : "islets are"} left out: too small to cut out at this size.`);
  const width = w * cellMm;
  const height = h * cellMm;
  // The depth picture, from the heights themselves (smooth between the grid's points).
  const ppm = Math.min(PICTURE_DPM, MOST_PIXELS / Math.max(width, height));
  const gw = Math.max(1, Math.round(width * ppm));
  const gh = Math.max(1, Math.round(height * ppm));
  const greys = new Uint8Array(gw * gh);
  const e0 = area.sw.e + a0 * cellM;
  const n1 = area.sw.n + (b1 + 1) * cellM;
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) {
      const e = e0 + ((x + 0.5) / gw) * w * cellM;
      const n = n1 - ((y + 0.5) / gh) * h * cellM;
      const ground = heightAt(grid, e, n);
      greys[y * gw + x] = Math.round(255 * (1 - depthShare(ground, highest, s)));
    }
  // Contour lines: the edge of the ground at or above each level.
  const contours: Segment[][] = [];
  if (s.contours > 0 && highest > s.contours) {
    const levels = Math.min(60, Math.floor(highest / s.contours));
    for (let l = 1; l <= levels; l++) {
      const level = l * s.contours;
      const m = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = bits[y * w + x] && hs[(b1 - y) * nx + (a0 + x)] >= level ? 1 : 0;
      contours.push(...traceMask(m, w, h, cellMm, 2).loops);
    }
  }
  // Jigsaw cuts, cut back to the coast.
  const rings = coastTrace.loops.map((l) => pathPoints(l, true, 0.02));
  const index = new RingIndex(rings, 4);
  const pattern = patternLines(s.puzzle, width, height, s.pieces, s.seed, Math.max(2, s.thickness * 0.6));
  for (const p of pattern.problems) warnings.push(p);
  const cuts: Segment[][] = [];
  // Each line carried on past the board's edge, so it starts and ends in the sea even where land reaches the edge.
  const stretched = (line: Pt[]): Pt[] => {
    if (line.length < 2) return line;
    const out = (a: Pt, b: Pt): Pt => {
      const l = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
      return [a[0] + ((a[0] - b[0]) / l) * 3, a[1] + ((a[1] - b[1]) / l) * 3];
    };
    return [out(line[0], line[1]), ...line, out(line[line.length - 1], line[line.length - 2])];
  };
  for (const line of pattern.lines) for (const run of clipToRings(stretched(line), index)) cuts.push(asLine(run));
  // Count the pieces by drawing the cuts onto the land's cells.
  let pieces = 1;
  let smallPieces = 0;
  if (cuts.length) {
    const wall = new Uint8Array(w * h);
    for (const c of cuts)
      for (const seg of c) {
        if (seg.kind !== "line") continue;
        const L = Math.hypot(seg.to[0] - seg.from[0], seg.to[1] - seg.from[1]);
        const n = Math.max(1, Math.ceil((L / cellMm) * 3));
        for (let t = 0; t <= n; t++) {
          const x = Math.floor((seg.from[0] + ((seg.to[0] - seg.from[0]) * t) / n) / cellMm);
          const y = h - 1 - Math.floor((seg.from[1] + ((seg.to[1] - seg.from[1]) * t) / n) / cellMm);
          if (x >= 0 && y >= 0 && x < w && y < h) wall[y * w + x] = 1;
        }
      }
    const parts = stretches(w, h, (c) => bits[c] === 1 && !wall[c]);
    const size = new Array<number>(parts.count).fill(0);
    for (let c = 0; c < w * h; c++) if (parts.id[c] >= 0) size[parts.id[c]]++;
    const full = (width / pattern.cols) * (height / pattern.rows);
    const leastCells = (2 * 2) / (cellMm * cellMm);
    const real = size.filter((n) => n >= leastCells);
    pieces = real.length;
    smallPieces = real.filter((n) => n * cellMm * cellMm < SMALL_PIECE_SHARE * full).length;
    if (smallPieces) warnings.push(`${smallPieces} small ${smallPieces === 1 ? "piece" : "pieces"} along the coast — try another pattern number, or fewer pieces, for chunkier ones.`);
  }
  // The frame: the sea round the island, which the pieces drop back into.
  let frame: Relief["frame"] = null;
  if (s.frame > 0) {
    const m = s.frame;
    const nameSize = Math.min(m * 0.5, 10);
    frame = { x: -m, y: -m, w: width + 2 * m, h: height + 2 * m, nameAt: s.name.trim() && nameSize >= 3 ? [width / 2, -m / 2 - nameSize / 2] : null, nameSize, scale: null };
    // The scale bar: a round distance no longer than a quarter of the island's width, at the top right.
    const size = Math.min(m * 0.3, 5);
    if (s.scaleBar !== false && size >= 2.5) {
      const most = width / 4;
      const km = [100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1].find((d) => d * 1000 * k <= most);
      if (km) frame.scale = { at: [width, height + m * 0.4], length: km * 1000 * k, label: km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`, size };
    }
    if (s.name.trim() && nameSize < 3) warnings.push("The frame is too narrow for the name: make it at least 6 mm wide.");
  }
  const vertical = s.depth / Math.max(highest, 1);
  return {
    width,
    height,
    greys,
    gw,
    gh,
    coast: coastTrace.loops,
    cuts,
    contours,
    frame,
    highest,
    exaggeration: vertical / k,
    scale: k,
    pieces,
    smallPieces,
    warnings,
  };
}

/**
 * A depth test strip's greys: `count` squares from no burn (white) to full depth (black), each `cell` pixels, in a row.
 * Engraved with the island's settings, the black square shows how deep full power goes.
 */
export function testStripGreys(count: number, cell: number): { greys: Uint8Array; w: number; h: number; levels: number[] } {
  const w = count * cell;
  const h = cell;
  const greys = new Uint8Array(w * h);
  const levels: number[] = [];
  for (let k = 0; k < count; k++) {
    const share = count === 1 ? 1 : k / (count - 1);
    levels.push(share);
    const g = Math.round(255 * (1 - share));
    for (let y = 0; y < h; y++) for (let x = k * cell; x < (k + 1) * cell; x++) greys[y * w + x] = g;
  }
  return { greys, w, h, levels };
}

export { asLine };
