/**
 * Tidy a drawing (pure): what drawings from other programs often need before they cut well.
 *
 * - Pieces drawn twice (the same line on top of itself) are kept once, so the laser doesn't go round twice.
 * - Pieces of no length are left out.
 * - Pieces that meet are joined into runs; then open ends that nearly meet (within `gap`) are joined, nearest first —
 *   so an outline with a hairline gap becomes a closed shape that can be cut as an outside or a hole, or engraved.
 *   Two straight ends are moved to meet halfway; otherwise a short straight piece bridges the gap.
 */
import { chainEdges, JOIN_TOLERANCE, reverseSegment, segmentEnds, withoutDoubles, type Pt, type Segment } from "../geometry/segments";
import type { Item, Outline, ShapeItem } from "./types";

export interface TidyReport {
  /** Pieces drawn twice, left out. */
  doubles: number;
  /** Pieces of no length, left out. */
  tiny: number;
  /** Gaps closed up. */
  joins: number;
  /** Closed shapes before and after. */
  closedBefore: number;
  closedAfter: number;
  /** Open lines left after. */
  openAfter: number;
}

export const TIDY_GAPS = [0.05, 0.2, 0.5, 1] as const;
export const DEFAULT_TIDY_GAP = 0.2;

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const startOf = (run: Segment[]) => segmentEnds(run[0])![0];
const endOf = (run: Segment[]) => segmentEnds(run[run.length - 1])![1];

const reversed = (run: Segment[]): Segment[] => run.slice().reverse().map(reverseSegment);

/** Join `next` on after `run` (its start near the run's end). Returns how many gaps were closed (0 or 1). */
function joinOnto(run: Segment[], next: Segment[]): number {
  const a = endOf(run);
  const b = startOf(next);
  const d = dist(a, b);
  if (d <= 1e-9) {
    run.push(...next);
    return 0;
  }
  const last = run[run.length - 1];
  const first = next[0];
  if (last.kind === "line" && first.kind === "line") {
    const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    run[run.length - 1] = { kind: "line", from: last.from, to: m };
    run.push({ kind: "line", from: m, to: first.to }, ...next.slice(1));
  } else run.push({ kind: "line", from: a, to: b }, ...next);
  return d > JOIN_TOLERANCE ? 1 : 0;
}

/** Close a run up on itself (its end near its start). */
function closeUp(run: Segment[]): number {
  const a = endOf(run);
  const b = startOf(run);
  const d = dist(a, b);
  if (d <= 1e-9) return 0;
  const last = run[run.length - 1];
  const first = run[0];
  if (last.kind === "line" && first.kind === "line" && run.length > 2) {
    const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    run[run.length - 1] = { kind: "line", from: last.from, to: m };
    run[0] = { kind: "line", from: m, to: first.to };
  } else run.push({ kind: "line", from: a, to: b });
  return d > JOIN_TOLERANCE ? 1 : 0;
}

/** How long a run is end to end, roughly (to tell a real shape from a single short dash). */
const spanOf = (run: Segment[]) => run.reduce((sum, s) => {
  const e = segmentEnds(s);
  return sum + (e ? dist(e[0], e[1]) : 0);
}, 0);

/** Outlines tidied; `gap` = how far apart open ends may be and still be joined (mm). */
export function tidyOutlines(outlines: readonly Outline[], gap: number): { outlines: Outline[]; report: TidyReport } {
  const all = outlines.flatMap((o) => o.segments);
  const kept = withoutDoubles(all);
  const doubles = all.length - kept.length;
  const pieces = kept.filter((s) => {
    const e = segmentEnds(s);
    return !e || s.kind !== "line" || dist(e[0], e[1]) > JOIN_TOLERANCE;
  });
  const tiny = kept.length - pieces.length;
  const { loops, open } = chainEdges(pieces);

  // Open ends that nearly meet: every pair within the gap, nearest first.
  type End = { run: number; atEnd: boolean; p: Pt };
  const ends: End[] = open.flatMap((run, i) => [
    { run: i, atEnd: false, p: startOf(run) },
    { run: i, atEnd: true, p: endOf(run) },
  ]);
  const cell = Math.max(gap, 1e-6);
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number) => `${x},${y}`;
  ends.forEach((e, i) => {
    const k = key(Math.floor(e.p[0] / cell), Math.floor(e.p[1] / cell));
    grid.set(k, [...(grid.get(k) ?? []), i]);
  });
  const pairs: { i: number; j: number; d: number }[] = [];
  ends.forEach((e, i) => {
    const cx = Math.floor(e.p[0] / cell);
    const cy = Math.floor(e.p[1] / cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const j of grid.get(key(cx + dx, cy + dy)) ?? []) {
          if (j <= i) continue;
          const d = dist(e.p, ends[j].p);
          if (d > gap) continue;
          // A run's own two ends: only worth closing if it's more than a dash.
          if (ends[j].run === e.run && spanOf(open[e.run]) <= 3 * gap) continue;
          pairs.push({ i, j, d });
        }
  });
  pairs.sort((a, b) => a.d - b.d);

  // Partner of each end, chains kept apart with a union–find so no run is joined into a chain twice.
  const partner = new Array<number>(ends.length).fill(-1);
  const parent = open.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const { i, j } of pairs) {
    if (partner[i] >= 0 || partner[j] >= 0) continue;
    const ri = find(ends[i].run);
    const rj = find(ends[j].run);
    // Both the free ends of one chain: that closes it. Otherwise two chains become one.
    if (ri !== rj) parent[ri] = rj;
    partner[i] = j;
    partner[j] = i;
  }

  // Walk the chains: from a free end where there is one, else (a closed ring) anywhere.
  const visited = new Array<boolean>(open.length).fill(false);
  const runs: { segments: Segment[]; closed: boolean }[] = [];
  let joins = 0;
  const walk = (startRun: number, enterAtEnd: boolean) => {
    let run = startRun;
    let atEnd = enterAtEnd;
    const out: Segment[] = [];
    for (;;) {
      visited[run] = true;
      const piece = atEnd ? reversed(open[run]) : open[run].map((s) => s);
      if (!out.length) out.push(...piece);
      else joins += joinOnto(out, piece);
      // The end we leave by.
      const leave = run * 2 + (atEnd ? 0 : 1);
      const next = partner[leave];
      if (next < 0) return { segments: out, closed: false };
      const nr = ends[next].run;
      if (visited[nr]) {
        joins += closeUp(out);
        return { segments: out, closed: true };
      }
      run = nr;
      atEnd = ends[next].atEnd;
    }
  };
  for (let i = 0; i < open.length; i++) {
    if (visited[i]) continue;
    if (partner[i * 2] < 0) runs.push(walk(i, false));
    else if (partner[i * 2 + 1] < 0) runs.push(walk(i, true));
  }
  for (let i = 0; i < open.length; i++) if (!visited[i]) runs.push(walk(i, false));

  const result: Outline[] = [...loops.map((segments) => ({ segments, closed: true })), ...runs];
  return {
    outlines: result,
    report: {
      doubles,
      tiny,
      joins,
      closedBefore: outlines.filter((o) => o.closed).length,
      closedAfter: result.filter((o) => o.closed).length,
      openAfter: result.filter((o) => !o.closed).length,
    },
  };
}

/** Open ends of a shape's outlines that come within `gap` of another open end (what tidying would join). */
export function nearlyMeeting(outlines: readonly Outline[], gap: number): number {
  const r = tidyOutlines(outlines, gap).report;
  return r.joins;
}

/** Can this be tidied? Free shapes only (rectangles, circles and words are already exact). */
export const canTidy = (it: Item): it is ShapeItem => it.kind === "shape" && it.outlines.length > 0;

/** The report in a sentence. */
export function tidyText(r: TidyReport): string {
  const parts: string[] = [];
  if (r.joins) parts.push(`closed ${r.joins} gap${r.joins === 1 ? "" : "s"}`);
  if (r.doubles) parts.push(`took out ${r.doubles} piece${r.doubles === 1 ? "" : "s"} drawn twice`);
  if (r.tiny) parts.push(`took out ${r.tiny} piece${r.tiny === 1 ? "" : "s"} of no length`);
  if (!parts.length) return "Nothing needed tidying.";
  const s = parts.join(", ");
  const closed = r.closedAfter - r.closedBefore;
  const shapes = closed > 0 ? ` — ${closed} more closed shape${closed === 1 ? "" : "s"}` : "";
  const left = r.openAfter ? ` ${r.openAfter} open line${r.openAfter === 1 ? "" : "s"} left.` : "";
  return `${s[0].toUpperCase()}${s.slice(1)}${shapes}.${left}`;
}
