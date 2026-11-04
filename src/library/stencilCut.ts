/**
 * Cutting a stencil's letters with their bridges left in. Each bridge (an
 * upright box from bridges.ts) is a strip of sheet left uncut across a
 * letter's stroke. So the cut lines are the letter outlines with the parts
 * inside any bridge taken out, plus the bridge's two long sides where they
 * cross the stroke — the letter's open area minus the strips, exactly.
 * Pure; outlines are polygons (mm), results are straight cut pieces.
 */
import type { Bridge, Pt } from "./bridges";
import type { Segment } from "../geometry/segments";

type Box = [number, number, number, number];

const EPS = 1e-9;

const inBox = (p: Pt, b: Box) => p[0] > b[0] + EPS && p[0] < b[2] - EPS && p[1] > b[1] + EPS && p[1] < b[3] - EPS;

/** How many outlines a point lies inside (odd = in a letter's open area, even = sheet). */
function parity(p: Pt, contours: Pt[][]): number {
  let n = 0;
  for (const poly of contours) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) n++;
  }
  return n;
}

/** Where a straight piece a→b crosses the box's sides (as fractions 0…1 along it). */
function boxCrossings(a: Pt, b: Pt, box: Box): number[] {
  const out: number[] = [];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (const x of [box[0], box[2]]) if (Math.abs(dx) > EPS) out.push((x - a[0]) / dx);
  for (const y of [box[1], box[3]]) if (Math.abs(dy) > EPS) out.push((y - a[1]) / dy);
  return out.filter((t) => t > EPS && t < 1 - EPS);
}

/** Where a straight line (x = c, or y = c) between lo and hi crosses the outlines: the other coordinate, sorted. */
function lineCrossings(contours: Pt[][], vertical: boolean, c: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (const poly of contours) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const [pu, pv] = vertical ? [p[0], p[1]] : [p[1], p[0]];
      const [qu, qv] = vertical ? [q[0], q[1]] : [q[1], q[0]];
      if (pu > c === qu > c) continue;
      const v = pv + ((c - pu) * (qv - pv)) / (qu - pu);
      if (v > lo && v < hi) out.push(v);
    }
  }
  return out.sort((a, b) => a - b);
}

/** The stencil's cut pieces: letter outlines minus bridges, plus the bridges' sides across the strokes. */
export function stencilCuts(contours: Pt[][], bridges: Bridge[]): Segment[] {
  const boxes = bridges.map((b) => b.box as Box);
  const out: Segment[] = [];
  // The outlines, with what lies inside a bridge left out.
  for (const poly of contours) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ts = [0, ...boxes.flatMap((box) => boxCrossings(a, b, box)), 1].sort((x, y) => x - y);
      for (let k = 0; k + 1 < ts.length; k++) {
        const t0 = ts[k];
        const t1 = ts[k + 1];
        if (t1 - t0 < EPS) continue;
        const at = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const mid = at((t0 + t1) / 2);
        if (boxes.some((box) => inBox(mid, box))) continue;
        out.push({ kind: "line", from: at(t0), to: at(t1) });
      }
    }
  }
  // Each bridge's two long sides, where they run through a letter's open area.
  for (const br of bridges) {
    const [x0, y0, x1, y1] = br.box;
    const vertical = br.dir === "up" || br.dir === "down";
    const sides = vertical ? [x0, x1] : [y0, y1];
    const [lo, hi] = vertical ? [y0, y1] : [x0, x1];
    for (const c of sides) {
      const stops = [lo, ...lineCrossings(contours, vertical, c, lo, hi), hi];
      for (let k = 0; k + 1 < stops.length; k++) {
        const m = (stops[k] + stops[k + 1]) / 2;
        const mid: Pt = vertical ? [c, m] : [m, c];
        if (parity(mid, contours) % 2 !== 1) continue;
        const from: Pt = vertical ? [c, stops[k]] : [stops[k], c];
        const to: Pt = vertical ? [c, stops[k + 1]] : [stops[k + 1], c];
        out.push({ kind: "line", from, to });
      }
    }
  }
  return out;
}
