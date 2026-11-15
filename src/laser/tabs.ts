/**
 * Holding tabs (pure): small gaps left uncut in a closed cut line, so a piece stays held in the sheet (and can't fall
 * through the honeycomb or tip up into the head) until it's snapped out. Tabs are spaced evenly round the loop, the
 * first half a spacing from its start, and kept off corners where they can be (a tab on a sharp corner snaps badly):
 * each is slid along up to a third of a spacing to the straightest place near it.
 */
import { pathPoints, type Pt, type Segment } from "../geometry/segments";

/** Where the tabs go: each [from, to] along the loop (mm from its start), and the loop's points and running lengths. */
export function tabPlaces(segments: Segment[], count: number, width: number): { points: Pt[]; along: number[]; gaps: [number, number][] } {
  const pts = pathPoints(segments, true, 0.01);
  if (pts.length > 1) pts.push(pts[0]);
  const along: number[] = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = along[along.length - 1] ?? 0;
  count = Math.max(0, Math.floor(count));
  // No tabs on a loop too short for them (they'd take more than a third of it).
  if (!count || !(width > 0) || count * width > total / 3) return { points: pts, along, gaps: [] };
  const step = total / count;
  // Corners: how sharply the line turns at each point.
  const turnAt = (i: number) => {
    const a = pts[(i - 1 + pts.length - 1) % (pts.length - 1)];
    const b = pts[i % (pts.length - 1)];
    const c = pts[(i + 1) % (pts.length - 1)];
    const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const t2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let d = Math.abs(t2 - t1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d;
  };
  const corners = pts.slice(0, -1).map((_, i) => ({ at: along[i], sharp: turnAt(i) > 0.35 }));
  const sharp = corners.filter((c) => c.sharp).map((c) => c.at);
  const clear = (m: number) => sharp.every((c) => Math.min(Math.abs(c - m), total - Math.abs(c - m)) > width);
  const gaps: [number, number][] = [];
  for (let k = 0; k < count; k++) {
    const ideal = step * (k + 0.5);
    let mid = ideal;
    if (!clear(mid)) {
      // Slide along to the nearest place clear of corners.
      for (let d = width / 2; d <= step / 3; d += width / 2) {
        if (clear(ideal + d)) {
          mid = ideal + d;
          break;
        }
        if (clear(ideal - d)) {
          mid = ideal - d;
          break;
        }
      }
    }
    mid = Math.min(total - width / 2, Math.max(width / 2, mid));
    gaps.push([mid - width / 2, mid + width / 2]);
  }
  return { points: pts, along, gaps };
}

/** The point `s` mm along a polyline with running lengths `along`. */
function pointAlong(points: Pt[], along: number[], s: number): Pt {
  let i = 1;
  while (i < along.length - 1 && along[i] < s) i++;
  const t = (s - along[i - 1]) / Math.max(along[i] - along[i - 1], 1e-12);
  return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t];
}

/** A polyline's stretch from `a` to `b` mm along it (a < b, within it). */
function stretch(points: Pt[], along: number[], a: number, b: number): Pt[] {
  const out: Pt[] = [pointAlong(points, along, a)];
  for (let i = 0; i < points.length; i++) if (along[i] > a && along[i] < b) out.push(points[i]);
  out.push(pointAlong(points, along, b));
  return out;
}

/** A closed cut loop with its tabs left out: the open runs between them (the loop itself when there are none). */
export function withTabs(segments: Segment[], count: number, width: number): Segment[][] | null {
  const { points, along, gaps } = tabPlaces(segments, count, width);
  if (!gaps.length) return null;
  const total = along[along.length - 1];
  const runs: Segment[][] = [];
  // Each run goes from the end of one tab to the start of the next, round past the loop's start for the last.
  for (let k = 0; k < gaps.length; k++) {
    const a = gaps[k][1];
    const b = k + 1 < gaps.length ? gaps[k + 1][0] : gaps[0][0] + total;
    const pts = b <= total ? stretch(points, along, a, b) : [...stretch(points, along, a, total), ...stretch(points, along, 0, b - total).slice(1)];
    const run: Segment[] = [];
    for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) > 1e-9) run.push({ kind: "line", from: pts[i - 1], to: pts[i] });
    if (run.length) runs.push(run);
  }
  return runs;
}
