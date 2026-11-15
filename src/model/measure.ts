/** Measuring (pure): how long a shape's lines are (what the laser travels) and how much area it covers. */
import { signedArea } from "../geometry/boolean";
import { pathPoints, type LaserPath, type Pt } from "../geometry/segments";
import { nestingDepths } from "../geometry/offset";
import { itemOutlines } from "./shapes";
import type { Item } from "./types";

/** Length of a path (mm), curves followed closely. */
export function pathLength(segments: LaserPath["segments"], closed: boolean): number {
  const pts = pathPoints(segments, closed, 0.005);
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  // A closed path's points don't repeat the first at the end.
  if (closed && pts.length > 1) l += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return l;
}

/** Total length of every line of a shape (mm). */
export function itemLength(item: Item): number {
  return itemOutlines(item).reduce((sum, o) => sum + pathLength(o.segments, o.closed), 0);
}

/** The area a shape covers (mm²): outsides less holes (even–odd). Lines cover none. */
export function itemArea(item: Item): number {
  const loops = itemOutlines(item)
    .filter((o) => o.closed)
    .map((o) => o.segments);
  const depths = nestingDepths(loops);
  return loops.reduce((sum, l, i) => {
    const a = Math.abs(signedArea(pathPoints(l, true, 0.005) as Pt[]));
    return sum + (depths[i] % 2 ? -a : a);
  }, 0);
}

/** "123.4 mm", "1.23 m" */
export function lengthText(mm: number): string {
  return mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${Math.round(mm * 10) / 10} mm`;
}

/** "45 mm²", "12.3 cm²" */
export function areaText(mm2: number): string {
  return mm2 >= 100 ? `${Math.round(mm2 / 10) / 10} cm²` : `${Math.round(mm2 * 10) / 10} mm²`;
}
