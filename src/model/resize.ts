/**
 * Resizing shapes (dragging the selection's handles): every shape scaled `sx` across and `sy` up about a point. Pure.
 *
 * Shapes keep their settings where they can: a rectangle stays a rectangle when it's square to the bed (or when it's
 * scaled evenly), circles, words and photos when scaled evenly. Stretched one way, a circle or words become outlines
 * (curves made into Bézier pieces first, as a stretched arc is no longer an arc). `canStretch` says whether a selection can be
 * stretched one way at all and stay what it is.
 */
import { arcInfo, ellipseArcBeziers, type Pt, type Segment } from "../geometry/segments";
import { baseOf, itemBox, itemOutlines } from "./shapes";
import type { Item, Outline } from "./types";

/** The smallest a shape may be scaled to (mm across). */
export const MIN_SIZE = 0.5;

const even = (sx: number, sy: number) => Math.abs(sx - sy) < 1e-9;
const quarter = (angle: number) => Math.abs(((angle % 90) + 90) % 90) < 1e-9 || Math.abs((((angle % 90) + 90) % 90) - 90) < 1e-9;
const sideways = (angle: number) => Math.abs(((((angle % 180) + 180) % 180) - 90)) < 1e-9;

/** A curve as straight lines and Bézier pieces only (so any stretch keeps it exact). */
export function asBeziers(s: Segment): Segment[] {
  switch (s.kind) {
    case "line":
    case "bezier":
      return [s];
    case "arc": {
      const a = arcInfo(s);
      if (!a) return [{ kind: "line", from: s.from, to: s.to }];
      return ellipseArcBeziers({ kind: "ellipseArc", center: a.centre, rx: a.r, ry: a.r, angle: 0, t0: Math.min(a.a0, a.a0 + a.turn), t1: Math.max(a.a0, a.a0 + a.turn), from: s.from, to: s.to });
    }
    case "circle": {
      const p: Pt = [s.center[0] + s.radius, s.center[1]];
      return ellipseArcBeziers({ kind: "ellipseArc", center: s.center, rx: s.radius, ry: s.radius, angle: 0, t0: 0, t1: 2 * Math.PI, from: p, to: p });
    }
    case "ellipse": {
      const p: Pt = [s.center[0] + s.rx * Math.cos(s.angle), s.center[1] + s.rx * Math.sin(s.angle)];
      return ellipseArcBeziers({ kind: "ellipseArc", center: s.center, rx: s.rx, ry: s.ry, angle: s.angle, t0: 0, t1: 2 * Math.PI, from: p, to: p });
    }
    case "ellipseArc":
      return ellipseArcBeziers(s);
  }
}

/** Outlines scaled about a point: evenly, every curve keeps its kind; one way, curves become Bézier pieces. */
export function scaledOutlines(outlines: Outline[], sx: number, sy: number, about: Pt): Outline[] {
  const P = (p: Pt): Pt => [about[0] + (p[0] - about[0]) * sx, about[1] + (p[1] - about[1]) * sy];
  if (even(sx, sy)) {
    const k = sx;
    const one = (s: Segment): Segment => {
      switch (s.kind) {
        case "line":
          return { kind: "line", from: P(s.from), to: P(s.to) };
        case "arc":
          return { kind: "arc", from: P(s.from), mid: P(s.mid), to: P(s.to) };
        case "bezier":
          return { kind: "bezier", from: P(s.from), c1: P(s.c1), c2: P(s.c2), to: P(s.to) };
        case "circle":
          return { kind: "circle", center: P(s.center), radius: s.radius * k };
        case "ellipse":
          return { ...s, center: P(s.center), rx: s.rx * k, ry: s.ry * k };
        case "ellipseArc":
          return { ...s, center: P(s.center), rx: s.rx * k, ry: s.ry * k, from: P(s.from), to: P(s.to) };
      }
    };
    return outlines.map((o) => ({ ...o, segments: o.segments.map(one) }));
  }
  return outlines.map((o) => ({
    ...o,
    segments: o.segments.flatMap(asBeziers).map((s): Segment => (s.kind === "line" ? { kind: "line", from: P(s.from), to: P(s.to) } : s.kind === "bezier" ? { kind: "bezier", from: P(s.from), c1: P(s.c1), c2: P(s.c2), to: P(s.to) } : s)),
  }));
}

/** Can this shape be stretched one way and stay what it is (not become an outline)? */
export function keepsKindStretched(item: Item): boolean {
  switch (item.kind) {
    case "rect":
      return quarter(item.angle);
    case "line":
    case "shape":
      return true;
    case "picture":
      return true;
    default:
      return false;
  }
}

/** Can the selection be stretched one way? Not when it's all circles and words, which only grow or shrink evenly. */
export function canStretch(items: readonly Item[]): boolean {
  return items.some((it) => it.kind !== "circle" && it.kind !== "text");
}

/** One shape scaled `sx` across and `sy` up about `about` (both more than 0). */
export function scaledItem(item: Item, sx: number, sy: number, about: Pt): Item {
  const P = (p: Pt): Pt => [about[0] + (p[0] - about[0]) * sx, about[1] + (p[1] - about[1]) * sy];
  const uniform = even(sx, sy);
  switch (item.kind) {
    case "rect": {
      if (!uniform && !quarter(item.angle)) break;
      const c = P([item.x + item.w / 2, item.y + item.h / 2]);
      const [kw, kh] = sideways(item.angle) ? [sy, sx] : [sx, sy];
      const w = Math.max(MIN_SIZE, item.w * kw);
      const h = Math.max(MIN_SIZE, item.h * kh);
      return { ...item, x: c[0] - w / 2, y: c[1] - h / 2, w, h, radius: Math.min(item.radius * Math.min(kw, kh), w / 2, h / 2) };
    }
    case "circle": {
      if (!uniform) break;
      const c = P([item.cx, item.cy]);
      return { ...item, cx: c[0], cy: c[1], r: Math.max(MIN_SIZE / 2, item.r * sx) };
    }
    case "polygon": {
      if (!uniform) break;
      const c = P([item.cx, item.cy]);
      return { ...item, cx: c[0], cy: c[1], r: Math.max(MIN_SIZE / 2, item.r * sx) };
    }
    case "line": {
      const a = P([item.x1, item.y1]);
      const b = P([item.x2, item.y2]);
      return { ...item, x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
    }
    case "text": {
      if (!uniform) break;
      const a = P([item.x, item.y]);
      return { ...item, x: a[0], y: a[1], size: Math.max(MIN_SIZE, item.size * sx), ...(item.curve ? { curve: item.curve * sx } : {}) };
    }
    case "picture": {
      const c = P([item.cx, item.cy]);
      const [kw, kh] = item.turns % 2 ? [sy, sx] : [sx, sy];
      return { ...item, cx: c[0], cy: c[1], w: Math.max(MIN_SIZE, item.w * kw), h: Math.max(MIN_SIZE, item.h * kh) };
    }
    case "shape":
      return { ...item, outlines: scaledOutlines(item.outlines, sx, sy, about) };
  }
  // Can't stay what it is: its outline, stretched.
  return { ...baseOf(item), kind: "shape", outlines: scaledOutlines(itemOutlines(item), sx, sy, about) };
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type Box = [number, number, number, number];

/** The point a handle stands at on a box (x0, y0, x1, y1; y up: "n" is the top). */
export function handlePoint(box: Box, h: Handle): Pt {
  const x = h.includes("w") ? box[0] : h.includes("e") ? box[2] : (box[0] + box[2]) / 2;
  const y = h.startsWith("s") ? box[1] : h.startsWith("n") ? box[3] : (box[1] + box[3]) / 2;
  return [x, y];
}

/** The point that stays put while a handle is dragged: the opposite corner or edge. */
export function anchorOf(box: Box, h: Handle): Pt {
  const opposite: Record<Handle, Handle> = { nw: "se", n: "s", ne: "sw", e: "w", se: "nw", s: "n", sw: "ne", w: "e" };
  return handlePoint(box, opposite[h]);
}

/**
 * How much to scale when a handle is dragged to `to`: each way from the anchor. Corner handles scale both ways (evenly
 * with `keep`, by the bigger of the two); edge handles one way (or evenly, with `keep`). Never below `MIN_SIZE`.
 */
export function dragScale(box: Box, h: Handle, to: Pt, keep: boolean): [number, number] {
  const a = anchorOf(box, h);
  const p = handlePoint(box, h);
  const w = Math.max(1e-9, box[2] - box[0]);
  const ht = Math.max(1e-9, box[3] - box[1]);
  const across = h.includes("e") || h.includes("w");
  const up = h.startsWith("n") || h.startsWith("s");
  const min = (size: number) => MIN_SIZE / size;
  let sx = across ? Math.max(min(w), (to[0] - a[0]) / (p[0] - a[0])) : 1;
  let sy = up ? Math.max(min(ht), (to[1] - a[1]) / (p[1] - a[1])) : 1;
  if (keep) {
    const k = across && up ? Math.max(sx, sy) : across ? sx : sy;
    sx = sy = Math.max(k, min(Math.min(w, ht)));
  }
  return [sx, sy];
}

/** The selection scaled about the anchor of a handle. */
export function resizedItems(items: readonly Item[], ids: readonly string[], sx: number, sy: number, about: Pt): Item[] {
  return items.map((it) => (ids.includes(it.id) && itemBox(it) ? scaledItem(it, sx, sy, about) : it));
}
