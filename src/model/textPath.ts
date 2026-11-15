/**
 * Putting words on a path (pure): words picked with another shape run along that shape's outline (its longest), centred
 * on its top (closed shapes) or its middle (open lines), turned so they read left to right there.
 */
import { pathPoints, type Pt } from "../geometry/segments";
import { itemOutlines } from "./shapes";
import type { Item, Outline, TextItem } from "./types";

const lengths = (pts: Pt[]) => {
  const along = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return along;
};

/** The words on the path: where along it, and which way round. */
export function placedOnPath(t: TextItem, path: Outline): TextItem {
  const raw = pathPoints(path.segments, path.closed, 0.02);
  const pts = path.closed && raw.length ? [...raw, raw[0]] : raw;
  const along = lengths(pts);
  const total = along[along.length - 1] ?? 0;
  // Where to centre them: a closed shape's top, an open line's middle.
  let at = total / 2;
  if (path.closed) {
    let top = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i][1] > pts[top][1]) top = i;
    at = along[top];
  }
  // Which way the path runs there; read left to right.
  let i = 1;
  while (i < pts.length - 1 && along[i] < at) i++;
  const dx = pts[i][0] - pts[i - 1][0];
  const flip = dx < 0;
  const next: TextItem = { ...t, path, pathAt: at, align: "centre" };
  delete next.curve;
  if (flip) next.pathFlip = true;
  else delete next.pathFlip;
  return next;
}

/** The path a shape offers words: its longest outline (null for words, QR codes and photos). */
export function pathOf(item: Item): Outline | null {
  if (item.kind === "text" || item.kind === "qr" || item.kind === "picture") return null;
  let best: Outline | null = null;
  let bestLen = 0;
  for (const o of itemOutlines(item)) {
    const pts = pathPoints(o.segments, o.closed, 0.05);
    const l = lengths(o.closed && pts.length ? [...pts, pts[0]] : pts).pop() ?? 0;
    if (l > bestLen) {
      bestLen = l;
      best = o;
    }
  }
  return best;
}

/** Words back on a straight line, where they were before (their anchor kept). */
export function offPath(t: TextItem): TextItem {
  const next = { ...t };
  delete next.path;
  delete next.pathAt;
  delete next.pathFlip;
  return next;
}
