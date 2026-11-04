/**
 * Packing pieces tightly on the bed by their real shapes, not their boxes.
 *
 * The bed is a grid of small cells (1 mm by default). Each piece is drawn
 * onto the grid (`rasterize`: every cell its outline passes through, and
 * every cell inside it — big holes stay free, so a small piece can sit in a
 * big one's hole) and grown by the gap. Biggest first, each piece is tried in
 * each allowed turn at every place on the grid from the front-left corner,
 * and goes where it reaches least far back (then furthest left). Fast because
 * each row of the bed keeps, for every cell, where the last used cell before
 * it is — a clash jumps straight past the cells in the way.
 *
 * Pure. Pieces that can't fit anywhere are listed, for putting beside the bed.
 */
import { pathPoints, type Pt, type Segment } from "./segments";

export interface PackPiece {
  id: string;
  /** The piece's closed loops (any order; holes included) and open lines, in mm. */
  outlines: { segments: Segment[]; closed: boolean }[];
}

export interface PackPlace {
  id: string;
  /** Quarter turns anticlockwise (0–3) about the piece's middle. */
  turns: number;
  /** Where the turned piece's box bottom-left corner goes (mm). */
  x: number;
  y: number;
}

export interface PackOptions {
  /** Space between pieces (mm). */
  gap?: number;
  /** Grid cell size (mm): smaller packs a little tighter but takes longer. */
  cell?: number;
  /** Allow quarter turns (else pieces keep their angle). */
  turns?: boolean;
  /** Space kept clear round the bed's edges (mm). */
  margin?: number;
}

export interface PackResult {
  places: PackPlace[];
  /** Pieces that don't fit on the bed. */
  left: string[];
}

interface Mask {
  w: number;
  h: number;
  /** Per row of the mask, the filled runs [x0, x1] (inclusive). */
  rows: [number, number][][];
  /** The piece's box before rasterizing (mm), after turning. */
  box: [number, number, number, number];
}

const turnPt = (p: Pt, turns: number, c: Pt): Pt => {
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  switch (turns & 3) {
    case 1:
      return [c[0] - dy, c[1] + dx];
    case 2:
      return [c[0] - dx, c[1] - dy];
    case 3:
      return [c[0] + dy, c[1] - dx];
    default:
      return p;
  }
};

/** The piece's loops and lines as point lists, turned about its middle. */
function piecePolys(piece: PackPiece, turns: number): { polys: Pt[][]; lines: Pt[][]; box: [number, number, number, number] } {
  const raw = piece.outlines.map((o) => ({ pts: pathPoints(o.segments, o.closed, 0.05), closed: o.closed }));
  const all = raw.flatMap((r) => r.pts);
  const x0 = Math.min(...all.map((p) => p[0]));
  const y0 = Math.min(...all.map((p) => p[1]));
  const x1 = Math.max(...all.map((p) => p[0]));
  const y1 = Math.max(...all.map((p) => p[1]));
  const c: Pt = [(x0 + x1) / 2, (y0 + y1) / 2];
  const turned = raw.map((r) => ({ pts: r.pts.map((p) => turnPt(p, turns, c)), closed: r.closed }));
  const tAll = turned.flatMap((r) => r.pts);
  const box: [number, number, number, number] = [Math.min(...tAll.map((p) => p[0])), Math.min(...tAll.map((p) => p[1])), Math.max(...tAll.map((p) => p[0])), Math.max(...tAll.map((p) => p[1]))];
  return { polys: turned.filter((r) => r.closed).map((r) => r.pts), lines: turned.filter((r) => !r.closed).map((r) => r.pts), box };
}

/** The piece drawn on a grid of `cell` mm, grown by `grow` cells all round. */
export function rasterize(piece: PackPiece, turns: number, cell: number, grow: number): Mask {
  const { polys, lines, box } = piecePolys(piece, turns);
  const w0 = Math.max(1, Math.ceil((box[2] - box[0]) / cell - 1e-9));
  const h0 = Math.max(1, Math.ceil((box[3] - box[1]) / cell - 1e-9));
  const w = w0 + 2 * grow;
  const h = h0 + 2 * grow;
  const grid = new Uint8Array(w * h);
  const toCell = (p: Pt): [number, number] => [(p[0] - box[0]) / cell + grow, (p[1] - box[1]) / cell + grow];
  const mark = (cx: number, cy: number) => {
    const x = Math.min(w - 1, Math.max(0, Math.floor(cx)));
    const y = Math.min(h - 1, Math.max(0, Math.floor(cy)));
    grid[y * w + x] = 1;
  };
  // Every cell an outline passes through.
  for (const pts of [...polys.map((p) => [...p, p[0]]), ...lines]) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = toCell(pts[i]);
      const b = toCell(pts[i + 1]);
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2));
      for (let s = 0; s <= steps; s++) mark(a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps);
    }
  }
  // Every cell whose middle is inside (even–odd over the loops).
  const cellPolys = polys.map((p) => p.map(toCell));
  for (let y = 0; y < h; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (const poly of cellPolys) {
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        if (p[1] > yc !== q[1] > yc) xs.push(p[0] + ((yc - p[1]) * (q[0] - p[0])) / (q[1] - p[1]));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(w - 1, Math.floor(xs[k + 1] - 0.5)); x++) grid[y * w + x] = 1;
    }
  }
  // Grown by the gap: square growth, `grow` cells each way.
  let filled = grid;
  if (grow > 0) {
    const across = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!grid[y * w + x]) continue;
        for (let d = -grow; d <= grow; d++) {
          const xx = x + d;
          if (xx >= 0 && xx < w) across[y * w + xx] = 1;
        }
      }
    filled = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!across[y * w + x]) continue;
        for (let d = -grow; d <= grow; d++) {
          const yy = y + d;
          if (yy >= 0 && yy < h) filled[yy * w + x] = 1;
        }
      }
  }
  const rows: [number, number][][] = [];
  for (let y = 0; y < h; y++) {
    const runs: [number, number][] = [];
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && filled[y * w + x] === 1;
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        runs.push([start, x - 1]);
        start = -1;
      }
    }
    rows.push(runs);
  }
  return { w, h, rows, box };
}

/** The bed's grid: which cells are taken, and for each cell the last taken cell at or before it in its row. */
class Bed {
  readonly cols: number;
  readonly rows: number;
  private taken: Uint8Array;
  private lastTaken: Int32Array;
  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.taken = new Uint8Array(cols * rows);
    this.lastTaken = new Int32Array(cols * rows).fill(-1);
  }
  /** -1 when the mask fits with its bottom-left cell at (gx, gy), else the next gx worth trying. */
  clash(m: Mask, gx: number, gy: number): number {
    let next = -1;
    for (let r = 0; r < m.h; r++) {
      const y = gy + r;
      for (const [a, b] of m.rows[r]) {
        const last = this.lastTaken[y * this.cols + gx + b];
        if (last >= gx + a) next = Math.max(next, last - a + 1);
      }
    }
    return next;
  }
  place(m: Mask, gx: number, gy: number) {
    for (let r = 0; r < m.h; r++) {
      const runs = m.rows[r];
      if (!runs.length) continue;
      const row = (gy + r) * this.cols;
      for (const [a, b] of runs) for (let x = gx + a; x <= gx + b; x++) this.taken[row + x] = 1;
      // "Last taken" changes only from the first newly taken cell onwards.
      const from = gx + runs[0][0];
      let last = from > 0 ? this.lastTaken[row + from - 1] : -1;
      for (let x = from; x < this.cols; x++) {
        if (this.taken[row + x]) last = x;
        this.lastTaken[row + x] = last;
      }
    }
  }
}

/** Pack the pieces onto a bed `bed` mm in size. */
export function packPieces(pieces: PackPiece[], bed: [number, number], opts: PackOptions = {}): PackResult {
  const cell = Math.max(0.25, opts.cell ?? 1);
  const gap = Math.max(0, opts.gap ?? 5);
  const margin = Math.max(0, opts.margin ?? 0);
  // Each piece grows by half the gap (rounded up), so two neighbours are at least the gap apart.
  const grow = Math.ceil(gap / 2 / cell);
  const cols = Math.floor((bed[0] - 2 * margin) / cell) + 2 * grow;
  const rows = Math.floor((bed[1] - 2 * margin) / cell) + 2 * grow;
  const grid = new Bed(Math.max(1, cols), Math.max(1, rows));
  // Biggest box first.
  const sized = pieces
    .map((p) => ({ p, masks: [0, 1, 2, 3].slice(0, opts.turns === false ? 1 : 4).map((t) => rasterize(p, t, cell, grow)) }))
    .sort((a, b) => b.masks[0].w * b.masks[0].h - a.masks[0].w * a.masks[0].h);
  const places: PackPlace[] = [];
  const left: string[] = [];
  for (const { p, masks } of sized) {
    let best: { t: number; gx: number; gy: number; top: number } | null = null;
    masks.forEach((m, t) => {
      if (m.w > grid.cols || m.h > grid.rows) return;
      for (let gy = 0; gy + m.h <= grid.rows; gy++) {
        if (best && gy + m.h > best.top) break;
        for (let gx = 0; gx + m.w <= grid.cols; ) {
          const next = grid.clash(m, gx, gy);
          if (next < 0) {
            const top = gy + m.h;
            if (!best || top < best.top || (top === best.top && gx < best.gx)) best = { t, gx, gy, top };
            break;
          }
          gx = Math.max(gx + 1, next);
        }
      }
    });
    if (!best) {
      left.push(p.id);
      continue;
    }
    const { t, gx, gy } = best as { t: number; gx: number; gy: number; top: number };
    grid.place(masks[t], gx, gy);
    // The mask's (0, 0) is the box's corner less the growth; the bed grid's (0, 0) is the margin less the growth.
    places.push({ id: p.id, turns: t, x: margin + gx * cell, y: margin + gy * cell });
  }
  return { places, left };
}
