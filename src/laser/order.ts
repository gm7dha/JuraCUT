/**
 * The order the lines are in the file (pure): what Export's "Cut order" plays back. JuraCUT writes engraving first,
 * then scoring, open cut lines, then holes before the outlines round them (deepest first), so a piece never drops out
 * before its holes are cut. Each step says what it is, how long it is, and how far the head travels to it.
 */
import { pathPoints, type LaserPath, type Pt } from "../geometry/segments";
import { pathLength } from "../model/measure";

export interface OrderStep {
  path: LaserPath;
  /** What it is, in words: "engraving", "a score line", "a cut line", "a hole", "an outline". */
  what: string;
  length: number;
  start: Pt;
  end: Pt;
  /** How far the head moves (laser off) from the last step's end to this one's start. */
  travel: number;
}

export function orderSteps(paths: readonly LaserPath[]): OrderStep[] {
  const out: OrderStep[] = [];
  let at: Pt | null = null;
  for (const p of paths) {
    const pts = pathPoints(p.segments, p.closed, 0.05);
    if (!pts.length) continue;
    const start = pts[0];
    const end = p.closed ? pts[0] : pts[pts.length - 1];
    const what = p.layer === "engrave" ? "engraving" : p.layer === "score" ? "a score line" : p.layer === "outer" ? (p.closed ? "an outline" : "part of an outline") : p.closed ? "a hole" : "a cut line";
    out.push({ path: p, what, length: pathLength(p.segments, p.closed), start, end, travel: at ? Math.hypot(start[0] - at[0], start[1] - at[1]) : 0 });
    at = end;
  }
  return out;
}

/** Totals: line length (laser on) and travel (laser off), in mm. */
export function orderTotals(steps: readonly OrderStep[]): { length: number; travel: number } {
  return steps.reduce((t, s) => ({ length: t.length + s.length, travel: t.travel + s.travel }), { length: 0, travel: 0 });
}
