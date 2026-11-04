/**
 * Three more flat-pack designs: a finger-joint box whose lid slides in grooves, an open tray with slotted dividers
 * and a three-piece bookend. JuraCAD's src/library/designs/boxes3.ts with numbers instead of variables and flat shapes
 * instead of sketches: keep the two in step (same maths, inputs and words). As with the finger-joint box, there's no
 * kerf allowance here — Export for laser's "Allow for the kerf" moves outlines out and slots in by half the kerf.
 *
 * The sliding lid. A laser can't cut a groove part-way into a sheet, so the grooves are made from an extra layer:
 * inside each long wall (front and back) sits a "rail" panel of the same sheet with a long slot cut right through it,
 * open at the right-hand end. Laid against the wall, the slot is a groove as deep as the sheet is thick. The lid's long
 * edges run in the two grooves; the right-hand end wall is lower — its top is level with the grooves' floor — so the lid
 * slides in over it, and the end of each slot (a bridge of rail at the left) stops it.
 *
 * Layout (outside sizes): W along x (the way the lid slides), D along y, H up. Sheet t thick, lid clearance c.
 *  - grooves: from z = g0 = H − 3t − 2c to g1 = g0 + t + 2c; a strip 2t tall above them; the rails' slots stop 2t
 *    short of the left end wall;
 *  - the right end wall is g0 tall; the front and back walls' fingers on that end stop there too (`upTo`);
 *  - the lid: from 2t + c in from the left wall's outside to the box's right-hand face, c clear of the long walls.
 */
import { fraction, lit, minus, over, plus, times, type Ex } from "./ex";
import { boxProblems, fingerCount, fingerCounts, FINGER_MARGIN, nominalOutline, panelOutlines, tidyOutline, type BoxSizes, type PanelSpec, type Pt, type SideSpec } from "./fingers";
import { inRows, loopOf, mm, placed, take, type LibraryDesign } from "./kit";
import { makeCircle, makeShape } from "../model/shapes";
import type { Item, Material } from "../model/types";

type P2 = [number, number];
type V = Record<string, unknown>;

const flat = (p: Pt[]): P2[] => p.map(([x, y]) => [x.v, y.v]);
const num = (v: V, k: string) => Number(v[k]) || 0;

const thicknessInput = (m: Material) => ({ key: "thickness", label: "Material thickness", kind: "number" as const, unit: "mm", default: m.thickness || 3, min: 0.5, max: 25, help: "Measure your sheet: 3 mm plywood is often 2.8–3.2 mm." });
const fingerInput = { key: "finger", label: "Finger width", kind: "number" as const, unit: "mm", default: 10, min: 2, max: 500, help: "Roughly — each edge gets an odd number of equal fingers that fit exactly." };
const KERF_NOTE = "Tick “Allow for the kerf” when you export, so the joints fit snugly.";

/** A piece: one outline (plus any holes), its name. */
const piece = (ids: Set<string>, name: string, loops: P2[][], group?: string): Item => ({ ...makeShape(take(ids), name, loops.map(loopOf)), ...(group ? { group } : {}) });

// ---------------------------------------------------------------------------
// Sliding-lid box

export interface SlidingBox {
  b: BoxSizes;
  c: Ex;
  /** Grooves' floor and roof (z), the closed end's bridge (x from the left wall's inside). */
  g0: Ex;
  g1: Ex;
  bridge: Ex;
  /** Lid: x from lidX0 to W, y from t + c to D − t − c. */
  lidX0: Ex;
  /** Finger counts: along W, along D (inner), up the full walls, up the low end. */
  counts: { width: number; depth: number; height: number; low: number };
}

export function slidingBox(v: V): SlidingBox {
  const [W, D, H, t, c] = ["width", "depth", "height", "thickness", "clearance"].map((k) => lit(num(v, k)));
  const kerf = lit(0);
  const b: BoxSizes = { W, D, H, t, kerf, lid: false, finger: num(v, "finger") };
  const g0 = minus(H, plus(times(t, 3), times(c, 2)));
  const g1 = plus(g0, t, times(c, 2));
  const counts = fingerCounts(b);
  const low = fingerCount(g0.v, b.finger, t.v + FINGER_MARGIN);
  const bridge = times(t, 2);
  return { b, c, g0, g1, bridge, lidX0: plus(t, bridge, c), counts: { ...counts, low } };
}

/** The flat outlines of the box's pieces: bottom, front (back the same), left end, right (low) end, rail, lid. */
export function slidingOutlines(s: SlidingBox) {
  const { W, D, H, t } = s.b;
  const n = s.counts;
  const alongW = (ownsEnds: boolean): SideSpec => ({ kind: "full", length: W, count: n.width, ownsEnds });
  const alongD = (ownsEnds: boolean): SideSpec => ({ kind: "inner", length: D, t, count: n.depth, ownsEnds });
  const plain: SideSpec = { kind: "plain" };
  const specs: Record<"bottom" | "front" | "left" | "right", PanelSpec> = {
    bottom: { U: W, V: D, south: alongW(false), north: alongW(false), west: alongD(true), east: alongD(true) },
    front: { U: W, V: H, south: alongW(true), north: plain, west: { kind: "full", length: H, count: n.height, ownsEnds: true }, east: { kind: "full", length: H, count: n.low, ownsEnds: true, upTo: s.g0 } },
    left: { U: D, V: H, south: alongD(false), north: plain, west: { kind: "full", length: H, count: n.height, ownsEnds: false }, east: { kind: "full", length: H, count: n.height, ownsEnds: false } },
    right: { U: D, V: s.g0, south: alongD(false), north: plain, west: { kind: "full", length: s.g0, count: n.low, ownsEnds: false }, east: { kind: "full", length: s.g0, count: n.low, ownsEnds: false } },
  };
  const x0 = t;
  const x1 = minus(W, t);
  const slotFrom = plus(t, s.bridge);
  // The rail, seen from the front (x along, z up), where it sits in the box: a C open to the right.
  const rail: Pt[] = [
    [x0, t],
    [x1, t],
    [x1, s.g0],
    [slotFrom, s.g0],
    [slotFrom, s.g1],
    [x1, s.g1],
    [x1, H],
    [x0, H],
  ];
  const lidY0 = plus(t, s.c);
  const lidY1 = minus(D, plus(t, s.c));
  const lid: Pt[] = [
    [s.lidX0, lidY0],
    [W, lidY0],
    [W, lidY1],
    [s.lidX0, lidY1],
  ];
  return {
    bottom: nominalOutline(specs.bottom, t),
    front: nominalOutline(specs.front, t),
    left: nominalOutline(specs.left, t),
    right: nominalOutline(specs.right, t),
    rail: tidyOutline(rail),
    lid,
  };
}

/** The finger hole in the lid (centre x, y and diameter), or null when it's off. */
export function lidHole(v: V, s: SlidingBox): { x: number; y: number; d: number } | null {
  if (v.hole === false) return null;
  const d = 16;
  // Clear of the low end wall under the lid's end (whatever the sheet's thickness), so a finger reaches in.
  return { x: s.b.W.v - (s.b.t.v + d / 2 + 4), y: s.b.D.v / 2, d };
}

function slidingProblems(v: V): string[] {
  const s = slidingBox(v);
  const out = boxProblems(s.b);
  if (out.length) return out;
  const [t, c] = [s.b.t.v, s.c.v];
  if (c < 0) out.push("The lid clearance can't be less than 0.");
  if (c > t) out.push(`A lid clearance of ${mm(c)} is a lot: 0.2–0.4 mm lets the lid slide without rattling.`);
  if (s.g0.v < 4 * t + 2) out.push(`The box is too low for its sliding lid: make it at least ${mm(7 * t + 2 * c + 2)} tall.`);
  const lidWidth = s.b.D.v - 2 * t - 2 * c;
  if (lidWidth < 10) out.push("The box is too narrow for a sliding lid: make it deeper.");
  if (s.b.W.v - s.lidX0.v < 4 * t + 10) out.push("The box is too short for a sliding lid: make it wider.");
  const hole = lidHole(v, s);
  if (!out.length && hole && (lidWidth < hole.d + 6 || hole.x - hole.d / 2 < s.lidX0.v + 4)) out.push("The lid is too small for a finger hole: turn the finger hole off, or make the box bigger.");
  return out;
}

const slidingLidBox: LibraryDesign = {
  id: "sliding-lid-box",
  name: "Sliding-lid box",
  group: "Boxes and stands",
  description:
    "A finger-joint box whose lid slides in and out along grooves. A laser can't cut a groove part-way into a sheet, so each groove is made from a rail: an extra panel with a long slot cut right through it, glued inside each long wall. The right-hand end wall is lower, so the lid slides in over it. 8 flat pieces.",
  icon: '<path d="M6 20 24 12l18 8v16l-18 8-18-8z"/><path d="M6 20l18 8 18-8M24 28v16"/><path d="M10 17 28 9l12 5" opacity=".6"/><path d="M33 8l6 3-2 1" />',
  inputs: (m) => [
    { key: "width", label: "Length", kind: "number", unit: "mm", default: 160, min: 30, max: 580, help: "Outside, the way the lid slides." },
    { key: "depth", label: "Width", kind: "number", unit: "mm", default: 100, min: 30, max: 580, help: "Outside, across the lid." },
    { key: "height", label: "Height", kind: "number", unit: "mm", default: 60, min: 20, max: 580, help: "Outside, lid included." },
    thicknessInput(m),
    fingerInput,
    { key: "clearance", label: "Lid clearance", kind: "number", unit: "mm", default: 0.2, min: 0, max: 2, help: "Room round the lid in its grooves, each side: 0.2–0.4 mm slides nicely." },
    { key: "hole", label: "Finger hole in the lid", kind: "toggle", default: true },
  ],
  problems: slidingProblems,
  make: (v, ids) => {
    const s = slidingBox(v);
    const o = slidingOutlines(s);
    const hole = lidHole(v, s);
    const lidGroup = `slidebox-lid-${take(ids)}`;
    const lid: Item[] = [piece(ids, "Sliding box: lid", [flat(o.lid)], hole ? lidGroup : undefined)];
    if (hole) lid.push({ ...makeCircle(take(ids), hole.x, hole.y, hole.d / 2), name: "Sliding box: finger hole", group: lidGroup });
    const pieces: Item[][] = [
      [piece(ids, "Sliding box: bottom", [flat(o.bottom)])],
      lid,
      [piece(ids, "Sliding box: front", [flat(o.front)])],
      [piece(ids, "Sliding box: back", [flat(o.front)])],
      [piece(ids, "Sliding box: front rail", [flat(o.rail)])],
      [piece(ids, "Sliding box: back rail", [flat(o.rail)])],
      [piece(ids, "Sliding box: left end", [flat(o.left)])],
      [piece(ids, "Sliding box: right end (low)", [flat(o.right)])],
    ];
    return {
      items: placed(inRows(pieces)),
      notes: [
        `8 pieces: bottom, 4 walls, 2 rails and the lid (${mm(s.b.W.v - s.lidX0.v)} × ${mm(s.b.D.v - 2 * s.b.t.v - 2 * s.c.v)}).`,
        "Glue a rail inside each long wall, slot open towards the low end, so the slots line up as grooves.",
        KERF_NOTE,
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Tray with dividers

/** Dividers are this much shorter than the inside of the tray (half at each end), so they drop in. */
export const DIVIDER_ROOM = 0.5;

export interface DividerTray {
  b: BoxSizes;
  rows: number;
  columns: number;
  /** Middles of the dividers that run along x (one per row boundary: y) and along y (x). */
  rowAt: Ex[];
  columnAt: Ex[];
  /** The dividers' halving slots meet at this height. */
  mid: Ex;
}

export function dividerTray(v: V): DividerTray {
  const [W, D, H, t] = ["width", "depth", "height", "thickness"].map((k) => lit(num(v, k)));
  const rows = num(v, "rows");
  const columns = num(v, "columns");
  // Compartments of equal size: n of them and n − 1 dividers across the inside, size − 2t.
  const centres = (size: Ex, n: number) => Array.from({ length: n - 1 }, (_, i) => plus(fraction(minus(size, times(t, n + 1)), i + 1, n), times(t, i + 1.5)));
  return { b: { W, D, H, t, kerf: lit(0), lid: false, finger: num(v, "finger") }, rows, columns, rowAt: centres(D, rows), columnAt: centres(W, columns), mid: over(plus(H, t), 2) };
}

/**
 * The two kinds of divider, drawn where they sit (seen from the front for the ones along x, from the side for the ones
 * along y): those along x have slots down from the top where the others cross, those along y slots up from the
 * bottom, each to half the dividers' height — so they slide together and come out flush.
 */
export function dividerOutlines(d: DividerTray): { alongX: Pt[]; alongY: Pt[] } {
  const { W, D, H, t } = d.b;
  const half = over(t, 2);
  const room = lit(DIVIDER_ROOM / 2);
  const [x0, x1] = [plus(t, room), minus(W, plus(t, room))];
  const [y0, y1] = [plus(t, room), minus(D, plus(t, room))];
  const alongX: Pt[] = [[x0, t], [x1, t], [x1, H]];
  for (const c of [...d.columnAt].reverse()) alongX.push([plus(c, half), H], [plus(c, half), d.mid], [minus(c, half), d.mid], [minus(c, half), H]);
  alongX.push([x0, H]);
  const alongY: Pt[] = [[y0, t]];
  for (const r of d.rowAt) alongY.push([minus(r, half), t], [minus(r, half), d.mid], [plus(r, half), d.mid], [plus(r, half), t]);
  alongY.push([y1, t], [y1, H], [y0, H]);
  return { alongX: tidyOutline(alongX), alongY: tidyOutline(alongY) };
}

function trayProblems(v: V): string[] {
  const d = dividerTray(v);
  const out = boxProblems(d.b);
  if (out.length) return out;
  const t = d.b.t.v;
  for (const [count, size, what] of [[d.columns, d.b.W.v, "columns"], [d.rows, d.b.D.v, "rows"]] as const) {
    const cell = (size - (count + 1) * t) / count;
    if (cell < 10) out.push(`The compartments would be only ${mm(cell)} across: use fewer ${what} or a bigger tray.`);
  }
  if (d.b.H.v - t < 6) out.push("The tray is too low for dividers: make it taller.");
  return out;
}

const dividerTrayDesign: LibraryDesign = {
  id: "divider-tray",
  name: "Tray with dividers",
  group: "Boxes and stands",
  description:
    "An open finger-joint tray with dividers that slot into each other (halving joints) to make rows × columns of compartments — for screws, beads, cutlery or tea bags. The dividers just drop in, so they can be taken out.",
  icon: '<path d="M6 16h36v22H6z"/><path d="M18 16v22M30 16v22M6 27h36" opacity=".7"/><path d="M6 16l6-6h36l-6 6M42 38l6-6V10" opacity=".5"/>',
  inputs: (m) => [
    { key: "width", label: "Width", kind: "number", unit: "mm", default: 200, min: 30, max: 580, help: "Outside." },
    { key: "depth", label: "Depth", kind: "number", unit: "mm", default: 150, min: 30, max: 580, help: "Outside." },
    { key: "height", label: "Height", kind: "number", unit: "mm", default: 50, min: 15, max: 300, help: "Outside; the dividers come up level with the walls." },
    { key: "columns", label: "Columns", kind: "count", default: 3, min: 1, max: 12, help: "Compartments left to right." },
    { key: "rows", label: "Rows", kind: "count", default: 2, min: 1, max: 12, help: "Compartments front to back." },
    thicknessInput(m),
    fingerInput,
  ],
  problems: trayProblems,
  make: (v, ids) => {
    const d = dividerTray(v);
    const panels = new Map(panelOutlines(d.b).map((p) => [p.name, flat(p.nominal)]));
    const o = dividerOutlines(d);
    const pieces: Item[][] = [
      [piece(ids, "Tray: bottom", [panels.get("bottom")!])],
      [piece(ids, "Tray: front", [panels.get("front")!])],
      [piece(ids, "Tray: back", [panels.get("front")!])],
      [piece(ids, "Tray: left side", [panels.get("left")!])],
      [piece(ids, "Tray: right side", [panels.get("left")!])],
      ...d.rowAt.map((_, i) => [piece(ids, `Tray: divider across ${i + 1}`, [flat(o.alongX)])]),
      ...d.columnAt.map((_, i) => [piece(ids, `Tray: divider front to back ${i + 1}`, [flat(o.alongY)])]),
    ];
    const dividers = d.rows - 1 + d.columns - 1;
    return {
      items: placed(inRows(pieces)),
      notes: [`${d.rows * d.columns} compartments: 5 tray pieces and ${dividers} divider${dividers === 1 ? "" : "s"}.`, KERF_NOTE],
    };
  },
};

// ---------------------------------------------------------------------------
// Bookend

/**
 * A bookend of three slotted pieces, no glue: an upright, a base the books stand on (their weight holds it down) and a
 * triangular brace behind the upright. The upright's two tabs go down through slots in the base; the brace's tabs go
 * into a slot in the base and a slot in the upright.
 *
 * Seen from the side (x towards the books, z up, y across, centred): the base runs from just behind the brace to
 * x = L; the upright stands at x = a…a + t (a = t + 5); the brace is a right-angled triangle G = H/2 on its straight
 * sides, against the upright's back (x = a − G…a), its tabs reaching into the upright and the base.
 */
export interface Bookend {
  W: Ex;
  H: Ex;
  L: Ex;
  t: Ex;
  /** The upright's front face (x), the brace's size (G: its two straight sides). */
  ux: Ex;
  G: Ex;
}

export function bookend(v: V): Bookend {
  const [W, H, depth, t] = ["width", "height", "depth", "thickness"].map((k) => lit(num(v, k)));
  const ux = plus(t, lit(5));
  const G = over(H, 2);
  // The base runs from 5 mm behind the brace (x = ux − G − 5) to L, `depth` long in all.
  return { W, H, L: minus(plus(depth, ux), plus(G, lit(5))), t, ux, G };
}

const ZERO_ = lit(0);

/**
 * The pieces' outlines, each anticlockwise, where they sit: the upright (y, z) at x = ux…ux + t, the brace (x, z)
 * behind it at x = ux − G…ux, the base (x, y) from x = ux − G − 5 to L with three slots.
 */
export function bookendOutlines(b: Bookend) {
  const { W, H, L, t, ux, G } = b;
  const hw = over(W, 2);
  const ny = (e: Ex) => minus(lit(0), e);
  const back = minus(ux, plus(G, lit(5)));
  const fr = (k: number) => times(W, k);
  // Upright, seen from the side (y across, z up): two tabs down through the base.
  const upright: Pt[] = [
    [ny(hw), t],
    [ny(fr(0.4)), t],
    [ny(fr(0.4)), ZERO_],
    [ny(fr(0.2)), ZERO_],
    [ny(fr(0.2)), t],
    [fr(0.2), t],
    [fr(0.2), ZERO_],
    [fr(0.4), ZERO_],
    [fr(0.4), t],
    [hw, t],
    [hw, H],
    [ny(hw), H],
  ];
  const half = over(t, 2);
  const z1 = plus(t, times(G, 0.25));
  const z2 = plus(t, times(G, 0.75));
  // The brace's slot in the upright (y, z).
  const uprightSlot: Pt[] = [[ny(half), z1], [half, z1], [half, z2], [ny(half), z2]];
  // The brace, seen from the front (x, z): a right-angled triangle against the upright's back, a tab into the
  // upright and one down into the base.
  const bx = (k: number) => minus(ux, times(G, k));
  const brace: Pt[] = [
    [minus(ux, G), t],
    [bx(0.6), t],
    [bx(0.6), ZERO_],
    [bx(0.2), ZERO_],
    [bx(0.2), t],
    [ux, t],
    [ux, z1],
    [plus(ux, t), z1],
    [plus(ux, t), z2],
    [ux, z2],
    [ux, plus(t, G)],
  ];
  const base: Pt[] = [[back, ny(hw)], [L, ny(hw)], [L, hw], [back, hw]];
  const baseSlots: Pt[][] = [
    [[ux, ny(fr(0.4))], [plus(ux, t), ny(fr(0.4))], [plus(ux, t), ny(fr(0.2))], [ux, ny(fr(0.2))]],
    [[ux, fr(0.2)], [plus(ux, t), fr(0.2)], [plus(ux, t), fr(0.4)], [ux, fr(0.4)]],
    [[bx(0.6), ny(half)], [bx(0.2), ny(half)], [bx(0.2), half], [bx(0.6), half]],
  ];
  return { upright, uprightSlot, brace, base, baseSlots };
}

function bookendProblems(v: V): string[] {
  const b = bookend(v);
  const [W, H, L, t] = [b.W.v, b.H.v, b.L.v, b.t.v];
  const out: string[] = [];
  if (0.2 * W < 2 * t + 2) out.push(`The bookend is too narrow for its slots: make it at least ${mm(Math.ceil(10 * t + 10))} wide.`);
  if (0.5 * 0.5 * H < t + 4) out.push("The bookend is too low: make it taller.");
  if (L < b.ux.v + t + 30) out.push(`The base is too short for the books to stand on: make it at least ${mm(b.G.v + 5 + t + 30)} deep.`);
  return out;
}

const bookendDesign: LibraryDesign = {
  id: "bookend",
  name: "Bookend",
  group: "Boxes and stands",
  description:
    "A flat-pack bookend of three slotted pieces, no glue: an upright, a base the books stand on (their weight holds it) and a brace behind. The upright's tabs go through slots in the base, and the brace slots into both. Make two for a shelf.",
  icon: '<path d="M10 40h30M18 40V10h4v30" /><path d="M18 22l-8 18" opacity=".6"/><path d="M26 14h5v26h-5zM32 18h5v22h-5z" opacity=".5"/>',
  inputs: (m) => [
    { key: "width", label: "Width", kind: "number", unit: "mm", default: 120, min: 40, max: 400, help: "Across the shelf." },
    { key: "height", label: "Height", kind: "number", unit: "mm", default: 150, min: 40, max: 290 },
    { key: "depth", label: "Base depth", kind: "number", unit: "mm", default: 160, min: 60, max: 400, help: "The base's whole length, front to back: half the height goes behind the upright, under the brace; the rest is under the books." },
    thicknessInput(m),
  ],
  problems: bookendProblems,
  make: (v, ids) => {
    const o = bookendOutlines(bookend(v));
    const pieces: Item[][] = [
      [piece(ids, "Bookend: base", [flat(o.base), ...o.baseSlots.map(flat)])],
      [piece(ids, "Bookend: upright", [flat(o.upright), flat(o.uprightSlot)])],
      [piece(ids, "Bookend: brace", [flat(o.brace)])],
    ];
    return { items: placed(inRows(pieces)), notes: ["3 pieces: an upright, a base and a brace.", KERF_NOTE] };
  },
};

export const BOXES_3: LibraryDesign[] = [slidingLidBox, dividerTrayDesign, bookendDesign];
