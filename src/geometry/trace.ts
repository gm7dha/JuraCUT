/**
 * Tracing a picture into outlines: a logo, a drawing or a scan becomes closed
 * loops a laser can cut or engrave. Pure (the picture comes in as RGBA bytes,
 * so it runs in tests without a browser):
 *
 *  1. Each pixel becomes dark or light (`binarize`): its brightness against a
 *     threshold — Otsu's, picked from the picture itself, unless chosen —
 *     with see-through pixels counted as light.
 *  2. The edges between dark and light pixels are followed into closed loops
 *     (`traceBitmap`): a staircase round every dark patch and every light hole.
 *  3. Each staircase is straightened (`simplifyLoop`, Douglas–Peucker within a
 *     tolerance) and, if asked, smoothed into curves (`smoothLoop`): cubic
 *     Béziers through the corners of the straightened loop, except where it
 *     turns sharply — real corners stay corners.
 *  4. Specks smaller than a set area are left out.
 */
import type { Pt, Segment } from "./segments";

export interface Bitmap {
  width: number;
  height: number;
  /** 1 = dark (traced), 0 = light. Row by row from the top. */
  bits: Uint8Array;
}

/** Brightness 0–255 of each pixel (see-through pixels count as white). */
export function greyscale(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const a = rgba[4 * i + 3] / 255;
    const lum = 0.2126 * rgba[4 * i] + 0.7152 * rgba[4 * i + 1] + 0.0722 * rgba[4 * i + 2];
    out[i] = Math.round(lum * a + 255 * (1 - a));
  }
  return out;
}

/** Otsu's threshold: the brightness that best splits the picture into a dark part and a light part. */
export function otsuThreshold(grey: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const g of grey) hist[g]++;
  const total = grey.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 128;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  // Pixels at or below the threshold are dark: Otsu's t is the last of the dark class.
  return best;
}

/** Dark pixels (brightness ≤ threshold) become 1; `invert` traces the light parts instead. */
export function binarize(grey: Uint8Array, width: number, height: number, threshold: number, invert = false): Bitmap {
  const bits = new Uint8Array(width * height);
  for (let i = 0; i < bits.length; i++) bits[i] = (grey[i] <= threshold) !== invert ? 1 : 0;
  return { width, height, bits };
}

/**
 * The boundaries between dark and light pixels as closed loops, in pixel
 * corners (x right, y down). Each loop goes round with the dark side on its
 * right; where two dark pixels touch only at a corner, they're kept apart.
 */
export function traceBitmap(b: Bitmap): Pt[][] {
  const { width: W, height: H, bits } = b;
  const dark = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && bits[y * W + x] === 1;
  // Directed edges between pixel corners, keyed by their start corner; up to two leave a corner (at a saddle).
  const key = (x: number, y: number) => y * (W + 1) + x;
  const out = new Map<number, number[]>(); // start corner → list of end corners
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = key(x0, y0);
    const list = out.get(k);
    if (list) list.push(key(x1, y1));
    else out.set(k, [key(x1, y1)]);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!dark(x, y)) continue;
      // Clockwise round the dark pixel on screen: top, right, bottom, left — where the neighbour is light.
      if (!dark(x, y - 1)) add(x, y, x + 1, y);
      if (!dark(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!dark(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!dark(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  const loops: Pt[][] = [];
  const xy = (k: number): Pt => [k % (W + 1), Math.floor(k / (W + 1))];
  for (const [start, ends] of out) {
    while (ends.length) {
      const loop: Pt[] = [xy(start)];
      let prev = start;
      let at = ends.pop()!;
      let guard = 0;
      while (at !== start && guard++ < 4 * (W + 1) * (H + 1)) {
        const choices = out.get(at)!;
        let pick = 0;
        if (choices.length > 1) {
          // At a saddle, turn right (screen): keeps diagonal dark pixels as separate loops.
          const [px, py] = xy(prev);
          const [ax, ay] = xy(at);
          const din: Pt = [ax - px, ay - py];
          pick = choices.findIndex((c) => {
            const [cx, cy] = xy(c);
            const dout: Pt = [cx - ax, cy - ay];
            return din[0] * dout[1] - din[1] * dout[0] > 0;
          });
          if (pick < 0) pick = 0;
        }
        const next = choices.splice(pick, 1)[0];
        loop.push(xy(at));
        prev = at;
        at = next;
      }
      loops.push(loop);
    }
  }
  return loops;
}

/** Signed area of a loop (positive = anticlockwise in its own coordinates). */
export function loopArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** The corners of a staircase loop only (points where it changes direction). */
function cornersOnly(poly: Pt[]): Pt[] {
  const n = poly.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[(i + n - 1) % n];
    const b = poly[i];
    const c = poly[(i + 1) % n];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b);
  }
  return out.length >= 3 ? out : poly;
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function douglasPeucker(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let best = -1;
    let bestD = tol;
    for (let k = i + 1; k < j; k++) {
      const d = distToSegment(pts[k], pts[i], pts[j]);
      if (d > bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([i, best], [best, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

/**
 * A staircase loop straightened: points are dropped while the straight line
 * that replaces them stays within `tol` (pixels) of them. The loop is split at
 * its first point and the point furthest from it, and each half straightened.
 */
export function simplifyLoop(poly: Pt[], tol: number): Pt[] {
  const pts = cornersOnly(poly);
  if (pts.length <= 4 || tol <= 0) return pts;
  // Split at the point furthest from the first, and at the first.
  let far = 0;
  let farD = -1;
  for (let k = 1; k < pts.length; k++) {
    const d = Math.hypot(pts[k][0] - pts[0][0], pts[k][1] - pts[0][1]);
    if (d > farD) {
      farD = d;
      far = k;
    }
  }
  const a = douglasPeucker(pts.slice(0, far + 1), tol);
  const b = douglasPeucker([...pts.slice(far), pts[0]], tol);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 3 ? out : pts;
}

/**
 * A straightened loop as curves: a smooth cubic piece between each pair of
 * points (Catmull–Rom, so the curve passes through every point), but where
 * the loop turns more than `cornerAngle` degrees the curve keeps a sharp corner.
 */
export function smoothLoop(poly: Pt[], cornerAngle = 60): Segment[] {
  const n = poly.length;
  if (n < 3) return poly.map((p, i) => ({ kind: "line", from: p, to: poly[(i + 1) % n] }));
  const sharp = poly.map((b, i) => {
    const a = poly[(i + n - 1) % n];
    const c = poly[(i + 1) % n];
    const u: Pt = [b[0] - a[0], b[1] - a[1]];
    const v: Pt = [c[0] - b[0], c[1] - b[1]];
    const cos = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1);
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI > cornerAngle;
  });
  const out: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i + n - 1) % n];
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];
    const p3 = poly[(i + 2) % n];
    // Tangents (a sixth of the neighbours' span, the usual Catmull–Rom ↔ Bézier step); none at a corner.
    const t1: Pt = sharp[i] ? [0, 0] : [(p2[0] - p0[0]) / 6, (p2[1] - p0[1]) / 6];
    const t2: Pt = sharp[(i + 1) % n] ? [0, 0] : [(p3[0] - p1[0]) / 6, (p3[1] - p1[1]) / 6];
    if (!t1[0] && !t1[1] && !t2[0] && !t2[1]) out.push({ kind: "line", from: p1, to: p2 });
    else out.push({ kind: "bezier", from: p1, c1: [p1[0] + t1[0], p1[1] + t1[1]], c2: [p2[0] - t2[0], p2[1] - t2[1]], to: p2 });
  }
  return out;
}

export interface TraceOptions {
  /** Brightness 0–255 at or below which a pixel is dark (traced). Default: Otsu's. */
  threshold?: number;
  /** Trace the light parts instead of the dark ones. */
  invert?: boolean;
  /** Leave out patches smaller than this many pixels. */
  minArea?: number;
  /** How far (pixels) a straightened line may stray from the staircase. */
  tolerance?: number;
  /** Curves instead of straight lines. */
  smooth?: boolean;
  /** Millimetres per pixel. */
  scale?: number;
}

export interface TraceResult {
  /** Closed loops in millimetres, y up, bottom-left of the picture at (0, 0). */
  loops: Segment[][];
  threshold: number;
  /** Patches left out as specks. */
  specks: number;
}

/** Trace a picture (RGBA bytes) into closed loops of lines or curves. */
export function tracePicture(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, opts: TraceOptions = {}): TraceResult {
  const grey = greyscale(rgba, width, height);
  const threshold = opts.threshold ?? otsuThreshold(grey);
  const bitmap = binarize(grey, width, height, threshold, opts.invert);
  const raw = traceBitmap(bitmap);
  const minArea = opts.minArea ?? 4;
  const tol = opts.tolerance ?? 0.7;
  const k = opts.scale ?? 1;
  const loops: Segment[][] = [];
  let specks = 0;
  for (const loop of raw) {
    if (Math.abs(loopArea(loop)) < minArea) {
      specks++;
      continue;
    }
    const simple = simplifyLoop(loop, tol);
    if (simple.length < 3) continue;
    // To millimetres, y up.
    const mm = simple.map(([x, y]): Pt => [x * k, (height - y) * k]);
    loops.push(opts.smooth ? smoothLoop(mm) : mm.map((p, i): Segment => ({ kind: "line", from: p, to: mm[(i + 1) % mm.length] })));
  }
  return { loops, threshold, specks };
}
