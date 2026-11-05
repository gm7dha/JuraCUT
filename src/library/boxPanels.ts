/**
 * A finger-jointed box (fingers.ts) as separate panels, each with its own holes, and the box standing any of three
 * ways round: as usual (open at the top), upside down (open at the bottom — a tissue box cover), or on its back (open
 * at the front — a box of drawers' case). Pure.
 *
 * JuraCAD's src/library/boxPanels.ts with the same maths (keep the two in step): JuraCUT lays each panel out flat as it
 * is drawn in JuraCAD's sketch (`panelPlace`'s map) instead of building it in 3D, and — as with its other boxes — draws
 * every outline and hole at its true size, leaving the kerf to Export for laser.
 *
 * The finger box's own coordinates: x across (0…W), y front to back (0…D), z up (0…H). Panels: bottom/lid (W × D),
 * front/back (W × H), left/right (D × H); each panel's outline is in its own across/up (U, V) — bottom (x, y),
 * front (x, z), left (y, z). Holes are given in those same panel coordinates.
 */
import type { Segment } from "../geometry/segments";
import { makeShape } from "../model/shapes";
import type { Item, Outline } from "../model/types";
import { panelOutlines, type BoxSizes } from "./fingers";
import { loopOf, take } from "./kit";
import { anticlockwise, r6, tidyPolygon, type P2 } from "./outlines";
import type { Hole } from "./patterns";

export type BoxPanel = "bottom" | "lid" | "front" | "back" | "left" | "right";
export const BOX_PANELS: readonly BoxPanel[] = ["bottom", "lid", "front", "back", "left", "right"];

/** Which way the box stands: "upright" (as made), "upsideDown" (z → H − z), "onBack" (its top facing the front: x stays, y → z, z → H − y). */
export type BoxStance = "upright" | "upsideDown" | "onBack";

export interface PanelShape {
  /** As drawn (with JuraCAD's kerf allowance in; JuraCUT's boxes have none, so the same as `nominal`). */
  outline: P2[];
  /** True shape. */
  nominal: P2[];
}

/** The three panel shapes (lid = bottom, back = front, right = left) as plain numbers. */
export function panelShapes(b: BoxSizes): Record<"bottom" | "front" | "left", PanelShape> {
  const out = {} as Record<"bottom" | "front" | "left", PanelShape>;
  for (const p of panelOutlines(b)) out[p.name] = { outline: p.outline.map(([x, y]) => [r6(x.v), r6(y.v)]), nominal: p.nominal.map(([x, y]) => [r6(x.v), r6(y.v)]) };
  return out;
}

export const shapeOf = (s: Record<"bottom" | "front" | "left", PanelShape>, p: BoxPanel): PanelShape => s[p === "lid" ? "bottom" : p === "back" ? "front" : p === "right" ? "left" : p];

type PlaneName = "Top" | "Front" | "Right";
export interface PanelPlace {
  /** JuraCAD's sketch plane for it. */
  plane: PlaneName;
  /** Panel coordinates → the sketch's (how JuraCUT lays it out flat). */
  map: (p: P2) => P2;
  flip: boolean;
  move: { dx?: number; dy?: number; dz?: number };
}

/** Where a panel goes for the box standing `stance`: its sketch plane, how its outline maps onto it, and the move after. */
export function panelPlace(panel: BoxPanel, stance: BoxStance, b: { W: number; D: number; H: number; t: number }): PanelPlace {
  const { W, D, H, t } = b;
  const id = (p: P2): P2 => p;
  const down = ([u, v]: P2): P2 => [u, r6(H - v)];
  if (stance === "onBack") {
    // Finger-box (x, y, z) → (x, H − z, y): the bottom becomes the back, the front/back the floor/top, the open top the front.
    switch (panel) {
      case "bottom":
        return { plane: "Front", map: id, flip: true, move: { dy: r6(H - t) } };
      case "lid":
        return { plane: "Front", map: id, flip: true, move: {} };
      case "front":
        return { plane: "Top", map: down, flip: false, move: {} };
      case "back":
        return { plane: "Top", map: down, flip: false, move: { dz: r6(D - t) } };
      case "left":
        return { plane: "Right", map: ([u, v]) => [r6(H - v), u], flip: false, move: {} };
      case "right":
        return { plane: "Right", map: ([u, v]) => [r6(H - v), u], flip: false, move: { dx: r6(W - t) } };
    }
  }
  const m = stance === "upsideDown" ? down : id;
  switch (panel) {
    case "bottom":
      return { plane: "Top", map: id, flip: false, move: stance === "upsideDown" ? { dz: r6(H - t) } : {} };
    case "lid":
      return { plane: "Top", map: id, flip: false, move: stance === "upsideDown" ? {} : { dz: r6(H - t) } };
    case "front":
      return { plane: "Front", map: m, flip: true, move: {} };
    case "back":
      return { plane: "Front", map: m, flip: true, move: { dy: r6(D - t) } };
    case "left":
      return { plane: "Right", map: m, flip: false, move: {} };
    case "right":
      return { plane: "Right", map: m, flip: false, move: { dx: r6(W - t) } };
  }
}

/** A hole in a plate: a circle, a polygon, or a slot (two round ends, `w` wide, centres a and b — a drawer pull, a tissue slot). */
export type PlateHole = Hole | { kind: "slot"; a: P2; b: P2; w: number };

/** A hole moved by a map (a circle's centre; a polygon's corners). */
export function mapHole(h: PlateHole, map: (p: P2) => P2): PlateHole {
  if (h.kind === "slot") return { ...h, a: map(h.a), b: map(h.b) };
  return h.kind === "circle" ? { ...h, c: map(h.c) } : { kind: "poly", points: anticlockwise(h.points.map(map)) };
}

/** A hole's outline for the bed: a true circle, the polygon, or a slot of two half circles joined by straight sides. */
export function holeOutline(h: PlateHole): Outline {
  if (h.kind === "circle") return { segments: [{ kind: "circle", center: [r6(h.c[0]), r6(h.c[1])], radius: r6(h.d / 2) }], closed: true };
  if (h.kind === "poly") return loopOf(tidyPolygon(h.points));
  const len = Math.hypot(h.b[0] - h.a[0], h.b[1] - h.a[1]);
  const r = h.w / 2;
  if (len < 1e-9) return holeOutline({ kind: "circle", c: h.a, d: h.w });
  const u: P2 = [(h.b[0] - h.a[0]) / len, (h.b[1] - h.a[1]) / len];
  const nrm: P2 = [-u[1], u[0]];
  const at = (c: P2, du: number, dn: number): P2 => [r6(c[0] + u[0] * du + nrm[0] * dn), r6(c[1] + u[1] * du + nrm[1] * dn)];
  const [p1, p2, p3, p4] = [at(h.a, 0, -r), at(h.b, 0, -r), at(h.b, 0, r), at(h.a, 0, r)];
  const segments: Segment[] = [
    { kind: "line", from: p1, to: p2 },
    { kind: "arc", from: p2, mid: at(h.b, r, 0), to: p3 },
    { kind: "line", from: p3, to: p4 },
    { kind: "arc", from: p4, mid: at(h.a, -r, 0), to: p1 },
  ];
  return { segments, closed: true };
}

/** A plate (a closed outline) with its holes, as one cut shape, so the holes travel with it. */
export const plateItem = (ids: Set<string>, name: string, outline: P2[], holes: PlateHole[] = []): Item => makeShape(take(ids), name, [loopOf(tidyPolygon(outline)), ...holes.map(holeOutline)]);

export interface BoxBuild {
  b: BoxSizes;
  stance: BoxStance;
  /** The panels to make, and their names. */
  panels: Partial<Record<BoxPanel, string>>;
  /** Holes per panel (true size, panel coordinates). */
  holes?: Partial<Record<BoxPanel, PlateHole[]>>;
  /** Open lines per panel (panel coordinates): scored, not cut — a bird box's climbing grooves. */
  lines?: Partial<Record<BoxPanel, [P2, P2][]>>;
  /** Holes per panel given in its sketch's own coordinates instead (true size). */
  sketchHoles?: Partial<Record<BoxPanel, PlateHole[]>>;
}

/**
 * A box's panels laid flat, one piece each (in BOX_PANELS order): the panel as JuraCAD's sketch draws it, holes in
 * it; any score lines are a second shape grouped with it. Names "<name>: <panel name, lower case>".
 */
export function boxItems(box: BoxBuild, name: string, ids: Set<string>): Item[][] {
  const { b, stance } = box;
  const [W, D, H, t] = [b.W.v, b.D.v, b.H.v, b.t.v];
  const shapes = panelShapes(b);
  const out: Item[][] = [];
  for (const panel of BOX_PANELS) {
    const label = box.panels[panel];
    if (!label) continue;
    const at = panelPlace(panel, stance, { W, D, H, t });
    const holes = [...(box.holes?.[panel] ?? []).map((h) => mapHole(h, at.map)), ...(box.sketchHoles?.[panel] ?? [])];
    const plate = plateItem(ids, `${name}: ${label.toLowerCase()}`, shapeOf(shapes, panel).nominal.map(at.map), holes);
    const lines = box.lines?.[panel] ?? [];
    if (!lines.length) {
      out.push([plate]);
      continue;
    }
    const group = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}-${take(ids)}`;
    const score: Item = {
      ...makeShape(take(ids), `${name}: ${label.toLowerCase()} score lines`, lines.map(([p, q]) => ({ segments: [{ kind: "line" as const, from: at.map(p), to: at.map(q) }], closed: false }))),
      op: "score",
      group,
    };
    out.push([{ ...plate, group }, score]);
  }
  return out;
}

/** Area of a hole (mm²). */
export const holeArea = (h: PlateHole) =>
  h.kind === "circle" ? (Math.PI * h.d * h.d) / 4 : h.kind === "slot" ? h.w * Math.hypot(h.b[0] - h.a[0], h.b[1] - h.a[1]) + (Math.PI * h.w * h.w) / 4 : Math.abs(polySigned(h.points));
function polySigned(p: P2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) a += p[i][0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * p[i][1];
  return a / 2;
}

/** For tests: each panel's area as cut (outline less its holes), mm². */
export function panelAreas(b: BoxSizes, holes: Partial<Record<BoxPanel, PlateHole[]>> = {}): Record<BoxPanel, number> {
  const s = panelShapes(b);
  return Object.fromEntries(BOX_PANELS.map((p) => [p, Math.abs(polySigned(shapeOf(s, p).nominal)) - (holes[p] ?? []).reduce((n, h) => n + holeArea(h), 0)])) as Record<BoxPanel, number>;
}

/** The panels' outlines as cut, each a single piece of sheet: do they fit the laser's bed? */
export function panelsFit(b: BoxSizes, fits: (w: number, h: number) => boolean): boolean {
  const s = panelShapes(b);
  return (["bottom", "front", "left"] as const).every((p) => {
    const xs = s[p].outline.map((q) => q[0]);
    const ys = s[p].outline.map((q) => q[1]);
    return fits(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  });
}
