/**
 * Round corners (pure), like LightBurn's corner fillet: every sharp corner where two straight lines meet is replaced by
 * an arc of the given radius touching both. Where the lines are too short for the whole radius, the corner gets the
 * biggest that fits (each line shares itself between the corners at its two ends). Corners on curves are left alone.
 */
import { segmentEnds, type Pt, type Segment } from "../geometry/segments";
import type { Outline } from "./types";

/** Corners turning less than this (degrees) are left alone: they're nearly straight. */
const LEAST_TURN = 1;

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const unit = (a: Pt): Pt => {
  const l = len(a);
  return l > 0 ? [a[0] / l, a[1] / l] : [0, 0];
};

type Line = Extract<Segment, { kind: "line" }>;

/** The arc rounding the corner at `p` between a line arriving along `u` and one leaving along `v`, `d` back each way. */
function cornerArc(p: Pt, u: Pt, v: Pt, r: number): { from: Pt; mid: Pt; to: Pt; d: number } | null {
  const cos = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]));
  const turn = Math.acos(cos);
  if (turn < (LEAST_TURN * Math.PI) / 180 || turn > Math.PI - 1e-6) return null;
  const d = r * Math.tan(turn / 2);
  const bis = unit(sub(v, u));
  const out = r / Math.cos(turn / 2) - r;
  return { from: [p[0] - u[0] * d, p[1] - u[1] * d], mid: [p[0] + bis[0] * out, p[1] + bis[1] * out], to: [p[0] + v[0] * d, p[1] + v[1] * d], d };
}

/** One outline with its straight corners rounded. Returns how many corners were rounded too. */
export function roundOutline(o: Outline, r: number): { outline: Outline; corners: number } {
  const segs = o.segments;
  const n = segs.length;
  if (r <= 0 || n < 2) return { outline: o, corners: 0 };
  // Corner k is where piece k ends and piece k+1 starts (the last one, for a closed outline, joins back to the first).
  const count = o.closed ? n : n - 1;
  const radius = new Array<number>(count).fill(0);
  const lengths = segs.map((s) => (s.kind === "line" ? len(sub(s.to, s.from)) : 0));
  const isLine = (s: Segment): s is Line => s.kind === "line" && len(sub(s.to, s.from)) > 1e-9;
  const turnAt = (k: number) => {
    const a = segs[k];
    const b = segs[(k + 1) % n];
    if (!isLine(a) || !isLine(b)) return null;
    const ea = segmentEnds(a)!;
    const eb = segmentEnds(b)!;
    if (len(sub(ea[1], eb[0])) > 1e-6) return null;
    const u = unit(sub(a.to, a.from));
    const v = unit(sub(b.to, b.from));
    const t = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])));
    return t < (LEAST_TURN * Math.PI) / 180 || t > Math.PI - 1e-6 ? null : t;
  };
  const turns = Array.from({ length: count }, (_, k) => turnAt(k));
  // How much of each line a corner may use: all of it if the other end has no rounding, else half.
  for (let k = 0; k < count; k++) {
    const t = turns[k];
    if (t === null) continue;
    const a = k;
    const b = (k + 1) % n;
    const prev = o.closed ? turns[(k - 1 + count) % count] : k > 0 ? turns[k - 1] : null;
    const next = o.closed ? turns[(k + 1) % count] : k + 1 < count ? turns[k + 1] : null;
    const prevRounded = prev !== null;
    const nextRounded = next !== null;
    const roomA = lengths[a] * (prevRounded ? 0.5 : 1);
    const roomB = lengths[b] * (nextRounded ? 0.5 : 1);
    radius[k] = Math.min(r, Math.min(roomA, roomB) / Math.tan(t / 2));
  }
  // Build: each line shortened at each rounded end, an arc at each rounded corner.
  const arcs = radius.map((rk, k) => {
    if (rk <= 1e-9) return null;
    const a = segs[k] as Line;
    const b = segs[(k + 1) % n] as Line;
    return cornerArc(a.to, unit(sub(a.to, a.from)), unit(sub(b.to, b.from)), rk);
  });
  const out: Segment[] = [];
  let corners = 0;
  for (let i = 0; i < n; i++) {
    const s = segs[i];
    const before = o.closed ? arcs[(i - 1 + n) % n] : i > 0 ? arcs[i - 1] : null;
    const after = i < count ? arcs[i] : null;
    if (s.kind === "line") {
      const from = before ? before.to : s.from;
      const to = after ? after.from : s.to;
      if (len(sub(to, from)) > 1e-6) out.push({ kind: "line", from, to });
    } else out.push(s);
    if (after) {
      out.push({ kind: "arc", from: after.from, mid: after.mid, to: after.to });
      corners++;
    }
  }
  return { outline: { segments: out, closed: o.closed }, corners };
}

/** Every outline's straight corners rounded. */
export function roundedOutlines(outlines: readonly Outline[], r: number): { outlines: Outline[]; corners: number } {
  let corners = 0;
  const result = outlines.map((o) => {
    const x = roundOutline(o, r);
    corners += x.corners;
    return x.outline;
  });
  return { outlines: result, corners };
}
