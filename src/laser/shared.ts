/**
 * Lines on top of each other cut once (pure) — LightBurn's "Remove overlapping lines". Pieces butted together share
 * an edge; cut twice it burns and wastes time. Going through the cut lines in order, any stretch lying along a line
 * already cut (within `tol`, running either way) is left out of the later one, which is then cut as the open runs
 * left. Paths with nothing shared stay exactly as they were (curves and all).
 */
import { pathPoints, type LaserPath, type Pt, type Segment } from "../geometry/segments";

const TOL = 0.01;

interface Seg {
  a: Pt;
  b: Pt;
}

/** A grid of the stretches already cut, so only nearby ones are compared. */
class Done {
  private cells = new Map<string, Seg[]>();
  constructor(private size: number) {}
  private keys(s: Seg): string[] {
    const k = this.size;
    const x0 = Math.floor((Math.min(s.a[0], s.b[0]) - TOL) / k), x1 = Math.floor((Math.max(s.a[0], s.b[0]) + TOL) / k);
    const y0 = Math.floor((Math.min(s.a[1], s.b[1]) - TOL) / k), y1 = Math.floor((Math.max(s.a[1], s.b[1]) + TOL) / k);
    const out: string[] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(`${x},${y}`);
    return out;
  }
  add(s: Seg) {
    for (const k of this.keys(s)) {
      const l = this.cells.get(k);
      if (l) l.push(s);
      else this.cells.set(k, [s]);
    }
  }
  near(s: Seg): Seg[] {
    const seen = new Set<Seg>();
    for (const k of this.keys(s)) for (const t of this.cells.get(k) ?? []) seen.add(t);
    return [...seen];
  }
}

/** The shares (0…1) of a–b covered by c–d lying along it. */
function covered(a: Pt, b: Pt, c: Pt, d: Pt): [number, number] | null {
  const v: Pt = [b[0] - a[0], b[1] - a[1]];
  const L = Math.hypot(v[0], v[1]);
  if (L < 1e-9) return null;
  const n: Pt = [-v[1] / L, v[0] / L];
  // c and d must both lie on a–b's line.
  const off = (p: Pt) => Math.abs((p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1]);
  if (off(c) > TOL || off(d) > TOL) return null;
  const t = (p: Pt) => ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]) / (L * L);
  const lo = Math.max(0, Math.min(t(c), t(d)));
  const hi = Math.min(1, Math.max(t(c), t(d)));
  return hi - lo > TOL / L ? [lo, hi] : null;
}

/** The cut lines, with stretches already cut by an earlier line left out of later ones. */
export function withoutShared(paths: readonly LaserPath[]): LaserPath[] {
  const done = new Done(5);
  const out: LaserPath[] = [];
  for (const p of paths) {
    if (p.layer !== "inner" && p.layer !== "outer") {
      out.push(p);
      continue;
    }
    const raw = pathPoints(p.segments, p.closed, TOL);
    const pts = p.closed && raw.length ? [...raw, raw[0]] : raw;
    const runs: Pt[][] = [];
    let run: Pt[] = [];
    let changed = false;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      // What's left of this piece once the stretches already cut are taken off.
      let gaps: [number, number][] = [];
      for (const s of done.near({ a, b })) {
        const c = covered(a, b, s.a, s.b);
        if (c) gaps.push(c);
      }
      gaps = gaps.sort((x, y) => x[0] - y[0]);
      let at = 0;
      const keep: [number, number][] = [];
      for (const [lo, hi] of gaps) {
        if (lo > at) keep.push([at, lo]);
        at = Math.max(at, hi);
      }
      if (at < 1) keep.push([at, 1]);
      const P = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (keep.length === 1 && keep[0][0] === 0 && keep[0][1] === 1) {
        if (!run.length) run.push(a);
        run.push(b);
      } else {
        changed = true;
        for (const [lo, hi] of keep) {
          if (lo > 0 || !run.length) {
            if (run.length > 1) runs.push(run);
            run = [P(lo)];
          }
          run.push(P(hi));
          if (hi < 1) {
            runs.push(run);
            run = [];
          }
        }
        if (!keep.length || keep[keep.length - 1][1] < 1) {
          if (run.length > 1) runs.push(run);
          run = [];
        }
      }
    }
    if (run.length > 1) runs.push(run);
    for (let i = 0; i + 1 < pts.length; i++) done.add({ a: pts[i], b: pts[i + 1] });
    if (!changed) {
      out.push(p);
      continue;
    }
    // A closed loop broken somewhere: join its last run onto its first if they meet at the start.
    if (p.closed && runs.length > 1) {
      const first = runs[0];
      const last = runs[runs.length - 1];
      const e = last[last.length - 1];
      if (Math.hypot(e[0] - first[0][0], e[1] - first[0][1]) < 1e-9) {
        runs[0] = [...last, ...first.slice(1)];
        runs.pop();
      }
    }
    for (const r of runs) {
      const segs: Segment[] = [];
      for (let i = 1; i < r.length; i++) if (Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]) > 1e-7) segs.push({ kind: "line", from: r[i - 1], to: r[i] });
      if (segs.length) out.push({ layer: p.layer, segments: segs, closed: false });
    }
  }
  return out;
}
