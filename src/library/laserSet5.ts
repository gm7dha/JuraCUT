/**
 * JuraCAD's fifth batch of laser designs: bird box, earring stand, box with drawers, honeycomb desk pot, sunburst
 * mirror frame, tablet or book stand, coaster holder and tissue box cover. The maths is JuraCAD's
 * (src/library/designs/birdBox.ts, earringStand.ts, drawerBox.ts, penHolder.ts, sunburstMirror.ts, bookStand.ts,
 * coasterHolder.ts, tissueBox.ts, over boxPanels.ts), with numbers instead of variables and the pieces laid out flat
 * for the bed instead of built in 3D: keep the two in step.
 *
 * Kerf: as with JuraCUT's other boxes there's no allowance here (JuraCAD's "Kerf allowance" input is left out, as if
 * 0) — every piece and hole is drawn its true size, and Export for laser's "Allow for the kerf" moves outlines out
 * and holes and slots in by half the kerf, which is what JuraCAD's allowance does.
 */
import { itemBox, makeRect, makeShape } from "../model/shapes";
import type { Item, Material } from "../model/types";
import { lit } from "./ex";
import { boxProblems, fingerCounts, type BoxSizes } from "./fingers";
import { inRows, mm, n, placed, take, type DesignInput, type LibraryDesign, type Values } from "./kit";
import { boxItems, holeOutline, panelsFit, plateItem, type PlateHole } from "./boxPanels";
import { LID_ROOM } from "./laserSet4";
import { convexHull, crossesItself, fitsBed, insideGap, offsetPolygon, r6, round6, type Box, type P2 } from "./outlines";
import { holePoints, patternGap, patternHoles, patternIslands, type Hole, type PatternKind } from "./patterns";
import { assemblyItems, assemblyProblems, evenTabs, sectionOf, type CrossPiece, type SideAssembly } from "./sidePanels";

const KERF_NOTE = "Tick “Allow for the kerf” when you export, so the joints fit snugly.";
const thicknessInput = (m: Material, def = m.thickness || 3, min = 1.5, help = "Measure your sheet: 3 mm plywood is often 2.8–3.2 mm."): DesignInput => ({ key: "thickness", label: "Material thickness", kind: "number", unit: "mm", default: def, min, max: 10, help });
const fingerInput = (def: number, min = 2): DesignInput => ({ key: "finger", label: "Finger width", kind: "number", unit: "mm", default: def, min, max: 100, help: "Roughly — each edge gets an odd number of equal fingers that fit exactly." });
const rad = (d: number) => (d * Math.PI) / 180;

/** A note when the pieces, laid out in rows, reach past the R1's 300 mm bed depth. */
function bedNote(items: Item[]): string[] {
  const boxes = items.map(itemBox).filter((b): b is [number, number, number, number] => !!b);
  const tall = Math.max(...boxes.map((b) => b[3])) - Math.min(...boxes.map((b) => b[1]));
  return tall > 280 ? ["The pieces don't all fit on the bed at once: cut them in a few goes (Arrange › Pack tightly helps)."] : [];
}

// ---------------------------------------------------------------------------
// Bird box
//
// Sizes follow the RSPB's and BTO's advice for small-hole boxes, where a laser can (see JuraCAD's birdBox.ts for the
// sources): the entrance hole for the bird; its bottom at least 125 mm above the floor (cats can't reach in); the inside
// at least 100 mm square (the BTO says 150, the default); drainage holes; a roof that lifts off for cleaning; score lines
// inside the front so the young can climb out. Walls: both advise 15 mm timber — a laser can't cut that, so at least
// 6 mm, and hang it out of full sun, facing north to east.

/** Entrance hole for each bird (mm across): RSPB Wildlife Explorers / BTO. */
export const BIRD_HOLES: Record<string, { hole: number; label: string }> = {
  "blue-tit": { hole: 25, label: "Blue tit (also coal and marsh tits) — 25 mm hole" },
  "great-tit": { hole: 28, label: "Great tit (also tree sparrow) — 28 mm hole" },
  "house-sparrow": { hole: 32, label: "House sparrow (also nuthatch) — 32 mm hole" },
};
/** The bottom of the hole at least this far above the floor (RSPB: 125 mm). */
export const MIN_HOLE_HEIGHT = 125;
/** The floor at least this big inside, each way (RSPB: 100 mm square). */
export const MIN_FLOOR = 100;
/** Room above the top of the hole, inside, before the roof (mm). */
export const ABOVE_HOLE = 30;
/** Drainage holes in the floor: this big across, this far in from the inside of the walls. */
export const DRAIN = { d: 6, inset: 15 };
/** Screw holes in the back (mm across): for No. 8 / 4 mm screws. */
export const SCREW_HOLE = 4.5;
/** The thinnest sheet allowed (mm): the RSPB and BTO advise 15 mm timber; thinner boxes get too hot or cold. */
export const MIN_SHEET = 6;
/** Climbing lines inside the front: this far apart, starting this far above the floor and stopping this far below the hole (mm). */
export const CLIMB = { pitch: 8, from: 10, below: 10, side: 5 };
/** How far the roof reaches past the sides (each), mm. */
export const ROOF_SIDE = 10;

export interface BirdBox {
  b: BoxSizes;
  /** Entrance hole: across, and its centre in the front panel's own coordinates (x across, z up). */
  hole: number;
  holeAt: P2;
  /** The bottom of the hole above the floor (the floor's top, z = t). */
  holeHeight: number;
  drains: P2[];
  screws: P2[];
  /** Score lines across the inside of the front (the front panel's own x, z): each from x0 to x1 at z. */
  climb: { x0: number; x1: number; z: number }[];
  /** Roof plate (x0, y0, x1, y1) on top of the walls, and the plate under it, true size. */
  roof: [number, number, number, number];
  under: [number, number, number, number];
}

export function birdBox(v: Values): BirdBox {
  const [fw, fd, hh, over, t] = ["floorWidth", "floorDepth", "holeHeight", "overhang", "thickness"].map((k) => n(v, k));
  const hole = (BIRD_HOLES[String(v.bird)] ?? BIRD_HOLES["blue-tit"]).hole;
  const W = r6(fw + 2 * t);
  const D = r6(fd + 2 * t);
  const H = r6(t + hh + hole + ABOVE_HOLE);
  const b: BoxSizes = { W: lit(W), D: lit(D), H: lit(H), t: lit(t), kerf: lit(0), lid: false, finger: n(v, "finger") };
  const i = t + DRAIN.inset;
  const drains: P2[] = [
    [i, i],
    [W - i, i],
    [W - i, D - i],
    [i, D - i],
  ].map(([x, y]) => [r6(x), r6(y)]);
  const screws: P2[] = [
    [r6(W / 2), r6(t + 0.25 * (H - t))],
    [r6(W / 2), r6(t + 0.75 * (H - t))],
  ];
  const room = t + LID_ROOM;
  // Clear of the side fingers (which reach t in from each edge) by CLIMB.side; from the floor's top + CLIMB.from up to
  // CLIMB.below under the hole.
  const climb: { x0: number; x1: number; z: number }[] = [];
  for (let z = t + CLIMB.from; z <= t + hh - CLIMB.below + 1e-9; z += CLIMB.pitch) climb.push({ x0: r6(t + CLIMB.side), x1: r6(W - t - CLIMB.side), z: r6(z) });
  return {
    climb,
    b,
    hole,
    holeAt: [r6(W / 2), r6(t + hh + hole / 2)],
    holeHeight: hh,
    drains,
    screws,
    roof: [-ROOF_SIDE, r6(-over), r6(W + ROOF_SIDE), D],
    under: [r6(room), r6(room), r6(W - room), r6(D - room)],
  };
}

/** The holes in each panel (true size, the panel's own coordinates). */
export function birdHoles(bb: BirdBox): { front: PlateHole[]; back: PlateHole[]; bottom: PlateHole[] } {
  return {
    front: [{ kind: "circle", c: bb.holeAt, d: bb.hole }],
    back: bb.screws.map((c): PlateHole => ({ kind: "circle", c, d: SCREW_HOLE })),
    bottom: bb.drains.map((c): PlateHole => ({ kind: "circle", c, d: DRAIN.d })),
  };
}

export function birdProblems(v: Values): string[] {
  const bb = birdBox(v);
  const out = boxProblems(bb.b);
  if (out.length) return out;
  const [rx0, ry0, rx1, ry1] = bb.roof;
  if (!panelsFit(bb.b, fitsBed) || !fitsBed(rx1 - rx0, ry1 - ry0)) out.push("The box is too big for the laser's 600 × 300 mm bed.");
  return out;
}

const birdBoxDesign: LibraryDesign = {
  id: "bird-box",
  name: "Bird box",
  group: "Garden",
  description:
    "A nest box for blue tits, great tits or house sparrows, following the RSPB's and BTO's advice where a laser can: the right entrance hole for the bird, its bottom at least 125 mm above the floor, a floor 150 mm across inside, drainage holes, and score lines inside the front so the young can climb out — put the scored side inward. The RSPB and BTO advise 15 mm timber walls; laser plywood is thinner, which is a compromise — use at least 6 mm exterior plywood and hang the box out of full sun, facing north to east. The walls are finger-jointed; glue the under-plate to the roof, and the roof then lifts off for cleaning in autumn without sliding. Keep it on with a small hook and eye — don't nail it down.",
  icon: '<path d="M10 16h28v28H10z"/><path d="M6 16h36" stroke-width="3"/><circle cx="24" cy="26" r="4"/><path d="M14 40h20" opacity=".4"/>',
  inputs: (m) => [
    {
      key: "bird",
      label: "For which bird",
      kind: "choice",
      default: "blue-tit",
      choices: Object.entries(BIRD_HOLES).map(([value, b]) => ({ value, label: b.label })),
      help: "The entrance hole's size decides who moves in: bigger birds can't get through a small hole.",
    },
    { key: "floorWidth", label: "Floor width inside", kind: "number", unit: "mm", default: 150, min: MIN_FLOOR, max: 250, help: "The RSPB says at least 100 mm; the BTO at least 150 mm." },
    { key: "floorDepth", label: "Floor depth inside", kind: "number", unit: "mm", default: 150, min: MIN_FLOOR, max: 250 },
    { key: "holeHeight", label: "Hole height", kind: "number", unit: "mm", default: 130, min: MIN_HOLE_HEIGHT, max: 230, help: "From the floor to the bottom of the hole: the RSPB says at least 125 mm, so cats can't reach in." },
    { key: "overhang", label: "Roof overhang", kind: "number", unit: "mm", default: 30, min: 0, max: 80, help: "How far the roof reaches out over the front, to keep rain off the hole." },
    thicknessInput(m, Math.max(MIN_SHEET, m.thickness || MIN_SHEET), MIN_SHEET, "The RSPB and BTO advise 15 mm timber; thin sheet gets hot in the sun. Use the thickest exterior plywood your laser cuts (at least 6 mm), and hang the box facing north to east."),
    fingerInput(15, 4),
  ],
  problems: birdProblems,
  make: (v, ids) => {
    const bb = birdBox(v);
    const pieces = boxItems(
      {
        b: bb.b,
        stance: "upright",
        panels: { bottom: "Floor", front: "Front", back: "Back", left: "Left side", right: "Right side" },
        holes: birdHoles(bb),
        lines: { front: bb.climb.map((l): [P2, P2] => [[l.x0, l.z], [l.x1, l.z]]) },
      },
      "Bird box",
      ids,
    );
    const plate = (name: string, r: [number, number, number, number]): Item[] => [{ ...makeRect(take(ids), r[0], r[1], r[2] - r[0], r[3] - r[1]), name: `Bird box: ${name}` }];
    pieces.push(plate("roof", bb.roof), plate("roof under-plate", bb.under));
    const fc = fingerCounts(bb.b);
    const items = placed(inRows(pieces));
    return {
      items,
      notes: [
        `7 pieces; a ${mm(bb.hole)} hole, its bottom ${mm(bb.holeHeight)} above the floor; ${mm(bb.b.W.v)} × ${mm(bb.b.D.v)} × ${mm(bb.b.H.v)} outside; ${fc.height} fingers up each corner.`,
        "The front's score lines go on the inside, so the young can climb out. Glue the under-plate to the roof.",
        ...bedNote(items),
        KERF_NOTE,
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Earring stand: two plates that slot together into a cross (a halving joint), each with a grid of holes.

/** Sheet to leave between holes, and between a hole and an edge or the slot (mm). */
export const HOLE_WEB = 2;
/** The hole grid keeps this far from the plate's sides and top (mm). */
export const GRID_EDGE = 8;
/** The lowest row of holes is this share of the height up (below it the plates are its feet). */
export const GRID_FROM = 0.4;

export interface EarringStand {
  w: number;
  h: number;
  t: number;
  /** Corner cut off the top (each way). */
  chamfer: number;
  /** The plates' true outlines: the first slotted from the top, the second from the bottom. */
  plates: [P2[], P2[]];
  /** Hole centres (the same on both plates). */
  holes: P2[];
  hole: number;
}

export function earringStand(v: Values): EarringStand {
  const [w, h, rows, cols, hole, t] = ["width", "height", "rows", "columns", "hole", "thickness"].map((k) => n(v, k));
  const c = r6(Math.min(w, h) * 0.15);
  const [x0, x1] = [-w / 2, w / 2];
  const s = t / 2;
  const top = (slotFromTop: boolean): P2[] =>
    slotFromTop
      ? [
          [x0, 0],
          [x1, 0],
          [x1, h - c],
          [x1 - c, h],
          [s, h],
          [s, h / 2],
          [-s, h / 2],
          [-s, h],
          [x0 + c, h],
          [x0, h - c],
        ]
      : [
          [x0, 0],
          [-s, 0],
          [-s, h / 2],
          [s, h / 2],
          [s, 0],
          [x1, 0],
          [x1, h - c],
          [x1 - c, h],
          [x0 + c, h],
          [x0, h - c],
        ];
  const r = (p: P2[]) => p.map(([x, y]): P2 => [r6(x), r6(y)]);
  // The grid: `cols` columns each side of the slot, `rows` rows from GRID_FROM of the height to near the top.
  const xa = s + GRID_EDGE;
  const xb = w / 2 - GRID_EDGE;
  const za = h * GRID_FROM;
  const zb = h - GRID_EDGE;
  const holes: P2[] = [];
  for (let j = 0; j < rows; j++) {
    const z = rows === 1 ? (za + zb) / 2 : za + ((zb - za) * j) / (rows - 1);
    for (let i = 0; i < cols; i++) {
      const x = cols === 1 ? (xa + xb) / 2 : xa + ((xb - xa) * i) / (cols - 1);
      holes.push([r6(x), r6(z)], [r6(-x), r6(z)]);
    }
  }
  // Holes the cut-off top corners would come too near are left out.
  const plates: [P2[], P2[]] = [r(top(true)), r(top(false))];
  const clear = (p: P2) => plates.every((pl) => insideGap(holePoints({ kind: "circle", c: p, d: hole }, 48), pl) >= GRID_EDGE / 2);
  return { w, h, t, chamfer: c, plates, holes: holes.filter(clear), hole };
}

/** The narrowest sheet between two holes, and between a hole and the plate's edge (either plate). */
export function standGaps(e: EarringStand): { between: number; edge: number } {
  let between = Infinity;
  for (let i = 0; i < e.holes.length; i++)
    for (let j = i + 1; j < e.holes.length; j++) between = Math.min(between, Math.hypot(e.holes[i][0] - e.holes[j][0], e.holes[i][1] - e.holes[j][1]) - e.hole);
  let edge = Infinity;
  for (const plate of e.plates) for (const c of e.holes) edge = Math.min(edge, insideGap(holePoints({ kind: "circle", c, d: e.hole }, 48), plate));
  return { between, edge };
}

export function earringProblems(v: Values): string[] {
  const e = earringStand(v);
  if (e.w / 2 - e.t / 2 - 2 * GRID_EDGE < e.hole) return ["The plates are too narrow for the holes: make them wider."];
  if (e.hole < 0.8) return ["The holes are too small to cut: make them at least 1 mm."];
  const g = standGaps(e);
  if (g.between < HOLE_WEB) return [`The holes come closer than ${mm(HOLE_WEB)} to each other: fewer rows or columns, or smaller holes.`];
  if (!e.holes.length) return ["There's no room for any holes: make the plates bigger."];
  if (g.edge < HOLE_WEB) return ["Some holes are too near the edge: fewer rows or columns."];
  if (!fitsBed(e.w, e.h)) return ["The plates are too big for the laser's 600 × 300 mm bed."];
  return [];
}

const earringStandDesign: LibraryDesign = {
  id: "earring-stand",
  name: "Earring stand",
  group: "Home",
  description:
    "A jewellery stand of two plates that slot together into a cross, each with a grid of small holes to hang earrings from. It stands on its four arms; drape necklaces over the top. With the kerf allowed for when you export, the slots come out exactly the sheet's thickness, so it holds together without glue.",
  icon: '<path d="M6 44h36M24 44V6M12 44V18l6-6h12l6 6v26" /><circle cx="16" cy="22" r="1.5"/><circle cx="16" cy="30" r="1.5"/><circle cx="32" cy="22" r="1.5"/><circle cx="32" cy="30" r="1.5"/><circle cx="16" cy="38" r="1.5"/><circle cx="32" cy="38" r="1.5"/>',
  inputs: (m) => [
    { key: "width", label: "Width", kind: "number", unit: "mm", default: 150, min: 60, max: 290, help: "Each plate, side to side (so the cross is this wide each way)." },
    { key: "height", label: "Height", kind: "number", unit: "mm", default: 180, min: 60, max: 290 },
    { key: "rows", label: "Rows of holes", kind: "count", default: 5, min: 1, max: 30 },
    { key: "columns", label: "Holes each side", kind: "count", default: 3, min: 1, max: 20, help: "Columns of holes on each side of the slot." },
    { key: "hole", label: "Hole size", kind: "number", unit: "mm", default: 2, min: 1, max: 10, help: "Earring hooks need about 1.5–2 mm." },
    thicknessInput(m, m.thickness || 3, 1.5, "Measure your sheet: 3 mm plywood or acrylic is often 2.8–3.2 mm."),
  ],
  problems: earringProblems,
  make: (v, ids) => {
    const e = earringStand(v);
    const holes = e.holes.map((c): PlateHole => ({ kind: "circle", c, d: e.hole }));
    const items = placed(inRows([[plateItem(ids, "Earring stand: front plate", e.plates[0], holes)], [plateItem(ids, "Earring stand: side plate", e.plates[1], holes)]], 8));
    return { items, notes: [`2 plates, ${mm(e.w)} × ${mm(e.h)}; ${2 * e.holes.length} holes in all. The front plate's slot comes down from the top, the side plate's up from the bottom.`, KERF_NOTE] };
  },
};

// ---------------------------------------------------------------------------
// Box with drawers: a finger-jointed case made on its back (open at the front), shelves between the drawers held by tabs
// through slots in the sides, and N drawers — open-topped finger boxes with a pull slot — that slide in with `clearance`
// all round. Case: x across (0…W), y from the front (0, open) to the back (D), z up (0…H). Each drawer's space is
// s = (H − 2t − (N − 1)t) / N high; shelf i (1…N − 1) lies at z = t + i·s + (i − 1)·t.

/** The pull slot: this tall (finger room), its top this far below the drawer front's top edge (mm). */
export const PULL = { height: 14, below: 6 };
/** A drawer must be at least this high (mm), so its pull slot fits. */
export const MIN_DRAWER = 35;
/** Shelf tabs: across the middle 40% of the depth. */
export const SHELF_TAB = [0.3, 0.7] as const;

export interface DrawerBox {
  /** The case as a finger box made on its back: W across, D = the case's height, H = the case's depth. */
  caseBox: BoxSizes;
  W: number;
  D: number;
  H: number;
  t: number;
  c: number;
  n: number;
  /** Each drawer's space, floor to shelf. */
  space: number;
  /** The shelves' undersides (z). */
  shelves: number[];
  /** Where the shelf tabs run (y). */
  tab: [number, number];
  /** Each drawer: a finger box, and where its corner goes. */
  drawer: BoxSizes;
  drawerAt: { dx: number; dy: number; dz: number }[];
  /** The pull slot in each drawer's front (its own x, z): centres of the round ends, and how tall. */
  pull: { a: P2; b: P2; w: number };
}

export function drawerBox(v: Values): DrawerBox {
  const [W, D, H, count, c, pullW, t, finger] = ["width", "depth", "height", "drawers", "clearance", "pull", "thickness", "finger"].map((k) => n(v, k));
  const caseBox: BoxSizes = { W: lit(W), D: lit(H), H: lit(D), t: lit(t), kerf: lit(0), lid: false, finger };
  const space = (H - 2 * t - (count - 1) * t) / count;
  const shelves = Array.from({ length: count - 1 }, (_, i) => r6(t + (i + 1) * space + i * t));
  const dw = r6(W - 2 * t - 2 * c);
  const dd = r6(D - t - c);
  const dh = r6(space - c);
  const drawer: BoxSizes = { W: lit(dw), D: lit(dd), H: lit(dh), t: lit(t), kerf: lit(0), lid: false, finger };
  const drawerAt = Array.from({ length: count }, (_, i) => ({ dx: r6(t + c), dy: 0, dz: r6(t + i * (space + t)) }));
  const zc = r6(dh - PULL.below - PULL.height / 2);
  const half = Math.max(0, Math.min(pullW, dw - 2 * t - 20) - PULL.height) / 2;
  const inside = D - t;
  return {
    caseBox,
    W,
    D,
    H,
    t,
    c,
    n: count,
    space: r6(space),
    shelves,
    tab: [r6(inside * SHELF_TAB[0]), r6(inside * SHELF_TAB[1])],
    drawer,
    drawerAt,
    pull: { a: [r6(dw / 2 - half), zc], b: [r6(dw / 2 + half), zc], w: PULL.height },
  };
}

/** A shelf seen from above, true size: the inside width with a tab out through each side. */
export function shelfOutline(d: DrawerBox): P2[] {
  const { W, D, t } = d;
  const [ya, yb] = d.tab;
  const back = r6(D - t);
  return [
    [t, 0],
    [W - t, 0],
    [W - t, ya],
    [W, ya],
    [W, yb],
    [W - t, yb],
    [W - t, back],
    [t, back],
    [t, yb],
    [0, yb],
    [0, ya],
    [t, ya],
  ].map(([x, y]): P2 => [r6(x), r6(y)]);
}

/** The slots in a side for the shelves' tabs, true size, as the side is laid out (JuraCAD's Right-plane sketch: y, z). */
export function sideSlots(d: DrawerBox): PlateHole[] {
  const [ya, yb] = d.tab;
  return d.shelves.map((z): PlateHole => ({
    kind: "poly",
    points: [
      [ya, z],
      [yb, z],
      [yb, r6(z + d.t)],
      [ya, r6(z + d.t)],
    ],
  }));
}

/** The pull: a slot, or a round finger hole when the pull is no wider than the slot is tall. */
export const pullHole = (d: DrawerBox): PlateHole[] => (d.pull.b[0] - d.pull.a[0] > 1e-6 ? [{ kind: "slot", ...d.pull }] : [{ kind: "circle", c: d.pull.a, d: d.pull.w }]);

export function drawerProblems(v: Values): string[] {
  const d = drawerBox(v);
  const out = boxProblems(d.caseBox);
  if (out.length) return out;
  if (d.space - d.c < MIN_DRAWER) return [`The drawers would be only ${mm(d.space - d.c)} high: make the box taller, or have fewer drawers (each needs at least ${mm(MIN_DRAWER)}).`];
  const inner = boxProblems(d.drawer);
  if (inner.length) return inner.map((p) => `The drawers: ${p.charAt(0).toLowerCase()}${p.slice(1)}`);
  if (d.c * 2 >= d.t) out.push(`A clearance of ${mm(d.c)} is a lot: the drawers would rattle about. About 0.5 mm is plenty.`);
  if (!panelsFit(d.caseBox, fitsBed)) out.push("The box is too big for the laser's 600 × 300 mm bed.");
  return out;
}

const drawerBoxDesign: LibraryDesign = {
  id: "drawer-box",
  name: "Box with drawers",
  group: "Boxes and stands",
  description:
    "A little chest of drawers for a desk or workbench: a finger-jointed case with shelves between the drawers, and drawers that are finger-jointed trays with a pull slot in the front. They slide in with a small clearance all round, so they run smoothly but don't wobble.",
  icon: '<path d="M8 8h32v34H8z"/><path d="M11 12h26v8H11zM11 24h26v8H11z" opacity=".7"/><path d="M21 16h6M21 28h6M21 38h6" />',
  inputs: (m) => [
    { key: "width", label: "Width", kind: "number", unit: "mm", default: 200, min: 60, max: 400, help: "Outside sizes of the case." },
    { key: "depth", label: "Depth", kind: "number", unit: "mm", default: 150, min: 50, max: 290 },
    { key: "height", label: "Height", kind: "number", unit: "mm", default: 150, min: 50, max: 290 },
    { key: "drawers", label: "Drawers", kind: "count", default: 3, min: 1, max: 6, help: "Stacked one above the other." },
    { key: "clearance", label: "Room round the drawers", kind: "number", unit: "mm", default: 0.5, min: 0.1, max: 3, help: "Each side, above and behind, so they slide easily." },
    { key: "pull", label: "Pull slot width", kind: "number", unit: "mm", default: 40, min: 14, max: 150, help: "The finger slot in each drawer front." },
    thicknessInput(m),
    fingerInput(10),
  ],
  problems: drawerProblems,
  make: (v, ids) => {
    const d = drawerBox(v);
    const slots = sideSlots(d);
    const pieces = boxItems(
      { b: d.caseBox, stance: "onBack", panels: { bottom: "Back", front: "Floor", back: "Top", left: "Left side", right: "Right side" }, sketchHoles: { left: slots, right: slots } },
      "Box with drawers",
      ids,
    );
    d.shelves.forEach((_, i) => pieces.push([plateItem(ids, `Box with drawers: ${d.shelves.length > 1 ? `shelf ${i + 1}` : "shelf"}`, shelfOutline(d))]));
    d.drawerAt.forEach((_, i) => {
      const name = d.n > 1 ? `Drawer ${i + 1}` : "Drawer";
      pieces.push(...boxItems({ b: d.drawer, stance: "upright", panels: { bottom: `${name} bottom`, front: `${name} front`, back: `${name} back`, left: `${name} left side`, right: `${name} right side` }, holes: { front: pullHole(d) } }, "Box with drawers", ids));
    });
    const fc = fingerCounts(d.drawer);
    const items = placed(inRows(pieces));
    return {
      items,
      notes: [
        `${5 + (d.n - 1) + 5 * d.n} pieces: the case, ${d.n - 1} shel${d.n - 1 === 1 ? "f" : "ves"} and ${d.n} drawer${d.n === 1 ? "" : "s"} ${mm(d.drawer.W.v)} × ${mm(d.drawer.D.v)} × ${mm(d.drawer.H.v)} (${fc.width} fingers across).`,
        ...bedNote(items),
        KERF_NOTE,
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Honeycomb desk pot: an open-topped, square finger-joint box whose walls are cut with a pattern inside a plain border,
// and — if chosen — a cross of two dividers that slot together and stand loose on the floor.

/** The dividers are this much shorter than the inside, each way (mm, in all). */
export const DIVIDER_ROOM = 0.5;
/** The dividers' tops are this far under the walls' (mm). */
export const DIVIDER_BELOW = 15;
/** More shapes than this on one wall is too slow to cut. */
export const MAX_SHAPES = 300;

export function penBox(v: Values): BoxSizes {
  const [s, h, t] = ["size", "height", "thickness"].map((k) => n(v, k));
  return { W: lit(s), D: lit(s), H: lit(h), t: lit(t), kerf: lit(0), lid: false, finger: n(v, "finger") };
}

/** Where a wall's pattern goes (its own across and up): clear of the fingers by the border; the top edge is plain. */
export function penWindow(v: Values): Box {
  const [s, h, t, m] = ["size", "height", "thickness", "margin"].map((k) => n(v, k));
  return [t + m, t + m, s - t - m, h - m];
}

export const penHoles = (v: Values): Hole[] => patternHoles(String(v.pattern) as PatternKind, penWindow(v), n(v, "shape"), n(v, "bridge"));

export interface Dividers {
  /** Each divider's true outline in its own (across, up): [across x — slotted from the top, across y — from the bottom]. */
  plates: [P2[], P2[]];
  length: number;
  height: number;
}

/** The two dividers: each L = inside − DIVIDER_ROOM long, (H − t − DIVIDER_BELOW) tall, with a halving slot t wide at its middle. */
export function penDividers(v: Values): Dividers {
  const [s, h, t] = ["size", "height", "thickness"].map((k) => n(v, k));
  const L = r6(s - 2 * t - DIVIDER_ROOM);
  const H = r6(h - t - DIVIDER_BELOW);
  const [m0, m1] = [r6(L / 2 - t / 2), r6(L / 2 + t / 2)];
  const half = r6(H / 2);
  const fromTop: P2[] = [
    [0, 0],
    [L, 0],
    [L, H],
    [m1, H],
    [m1, half],
    [m0, half],
    [m0, H],
    [0, H],
  ];
  const fromBottom: P2[] = [
    [0, 0],
    [m0, 0],
    [m0, half],
    [m1, half],
    [m1, 0],
    [L, 0],
    [L, H],
    [0, H],
  ];
  return { plates: [fromTop, fromBottom], length: L, height: H };
}

export function penProblems(v: Values): string[] {
  const out = boxProblems(penBox(v));
  if (out.length) return out;
  const [shape, bridge, t] = ["shape", "bridge", "thickness"].map((k) => n(v, k));
  if (bridge < t / 2) return [`Make the bridges at least ${mm(t / 2)} wide for ${mm(t)} sheet, so they don't snap.`];
  if (shape < 4) return ["Make the shapes at least 4 mm across, or they'll char rather than cut cleanly."];
  const holes = penHoles(v);
  if (holes.length > MAX_SHAPES) return [`That's over ${MAX_SHAPES} shapes on each wall: make them bigger.`];
  if (holes.length && patternIslands(holes).nested) return ["Some shapes would sit inside others."];
  if (holes.length && patternGap(holes, bridge - 1e-6) < bridge - 1e-6) return [`Some shapes come closer than ${mm(bridge)} to each other.`];
  if (v.dividers !== false && penDividers(v).height < 3 * t) return ["The pot is too short for dividers: make it taller, or turn them off."];
  return out;
}

const penHolderDesign: LibraryDesign = {
  id: "pen-holder",
  name: "Honeycomb desk pot",
  group: "Desk",
  description:
    "A square pen and tool pot for your desk, with a honeycomb (or circles, diamonds or stars) cut into its four finger-jointed walls. Two dividers that slot together into a cross split it into four compartments — leave them out for one big pot. Every shape is its own hole with sheet all round it, so nothing falls out.",
  icon: '<path d="M10 14h28v30H10z"/><path d="M17 20l3 2v3l-3 2-3-2v-3zM31 20l3 2v3l-3 2-3-2v-3zM24 30l3 2v3l-3 2-3-2v-3z"/><path d="M18 14l4-10M28 14l-2-9" opacity=".5"/>',
  inputs: (m) => [
    { key: "size", label: "Width", kind: "number", unit: "mm", default: 90, min: 40, max: 280, help: "Outside, each way: the pot is square." },
    { key: "height", label: "Height", kind: "number", unit: "mm", default: 110, min: 40, max: 280 },
    {
      key: "pattern",
      label: "Pattern",
      kind: "choice",
      default: "hexagons",
      choices: [
        { value: "hexagons", label: "Honeycomb" },
        { value: "circles", label: "Circles" },
        { value: "diamonds", label: "Diamonds" },
        { value: "stars", label: "Stars" },
      ],
    },
    { key: "shape", label: "Shape size", kind: "number", unit: "mm", default: 9, min: 4, max: 60, help: "How big each shape is across (flat to flat for the honeycomb). Keep it smaller than your pens." },
    { key: "bridge", label: "Bridge width", kind: "number", unit: "mm", default: 3, min: 1, max: 30, help: "The sheet left between shapes. Wider is stronger." },
    { key: "margin", label: "Plain border", kind: "number", unit: "mm", default: 8, min: 2, max: 60, help: "Uncut sheet round the pattern on each wall." },
    { key: "dividers", label: "Dividers", kind: "toggle", default: true, help: "Two pieces that slot together into a cross, making four compartments." },
    thicknessInput(m, m.thickness || 3, 1),
    fingerInput(10),
  ],
  problems: penProblems,
  make: (v, ids) => {
    const holes = penHoles(v) as PlateHole[];
    const pieces = boxItems({ b: penBox(v), stance: "upright", panels: { bottom: "Base", front: "Front", back: "Back", left: "Left side", right: "Right side" }, holes: { front: holes, back: holes, left: holes, right: holes } }, "Desk pot", ids);
    const dividers = v.dividers !== false;
    if (dividers) {
      const d = penDividers(v);
      pieces.push([plateItem(ids, "Desk pot: divider across", d.plates[0])], [plateItem(ids, "Desk pot: divider along", d.plates[1])]);
    }
    return {
      items: placed(inRows(pieces)),
      notes: [`${dividers ? 7 : 5} pieces: a base and 4 walls with ${holes.length} shapes each${dividers ? ", and 2 dividers" : ""}.`, KERF_NOTE],
    };
  },
};

// ---------------------------------------------------------------------------
// Sunburst mirror frame, for a round craft mirror: a front cut as a sun round a window a little smaller than the mirror,
// as many spacer rings as the mirror is thick (each with a hole just bigger than the mirror), and a back disc with a
// keyhole hanger whose pocket runs through every ring, hidden behind the sun. All centred on (0, 0) before laying out.

/** Room round the mirror in the rings' hole (each side, mm). */
export const MIRROR_ROOM = 0.5;
/** The rings and back are this much smaller (radius) than the sun's body, so they're hidden behind it. */
export const RING_IN = 2;
/**
 * The keyhole hanger: a round opening `head` across for the screw head, a slot `shank` wide rising `travel` above its
 * centre (to the centre of the slot's round top), and in the rings a pocket `pocket` wide over the same travel; `web` of
 * sheet round the pocket.
 */
export const HANG = { head: 8, shank: 4, travel: 7, pocket: 9, web: 3 };
/** How far the pocket reaches from the keyhole's centre, down and up (mm). */
const POCKET_DOWN = HANG.pocket / 2;
const POCKET_UP = HANG.travel + HANG.pocket / 2;

/** The keyhole's outline (true size) with the head's centre at c: the head's circle, the slot up from it, its round top. */
export function keyholeOutline(c: P2): P2[] {
  const [R, r] = [HANG.head / 2, HANG.shank / 2];
  const join = Math.acos(r / R); // where the slot's sides meet the head's circle, from +x
  const pts: P2[] = [];
  // Round the head from the slot's left side, down past the bottom, to its right side (anticlockwise).
  const a0 = Math.PI - join;
  const a1 = 2 * Math.PI + join;
  for (let i = 0; i <= 30; i++) {
    const a = a0 + ((a1 - a0) * i) / 30;
    pts.push([r6(c[0] + R * Math.cos(a)), r6(c[1] + R * Math.sin(a))]);
  }
  // Up the right side, round the top, down the left side (it closes back at the first point).
  const top = c[1] + HANG.travel;
  for (let i = 0; i <= 8; i++) {
    const a = (Math.PI * i) / 8;
    pts.push([r6(c[0] + r * Math.cos(a)), r6(top + r * Math.sin(a))]);
  }
  return pts;
}

/** The pocket behind the keyhole, in every ring: a slot over the head's whole travel. */
export const pocketSlot = (c: P2): PlateHole => ({ kind: "slot", a: c, b: [c[0], r6(c[1] + HANG.travel)], w: HANG.pocket });
/** The short rays reach this share of the way out from the body to the long rays' tips. */
export const SHORT_RAY = 0.6;
/** Rays sharper than this (degrees at the tip) char and snap. */
export const MIN_TIP = 15;

export interface Sunburst {
  mirror: number;
  t: number;
  /** The front's outline (true size) and its window. */
  sun: P2[];
  window: number;
  /** Radius of the corners between the rays. */
  body: number;
  /** The rings' and back's diameter, the rings' hole, how many rings. */
  disc: number;
  ringHole: number;
  rings: number;
  /** The keyhole's head centre (in the back; the pocket in the rings goes up from it). */
  hang: P2;
  /** The sharpest ray tip (degrees). */
  tip: number;
}

export function sunburst(v: Values): Sunburst {
  const [mirror, mt, overlap, count, size, band, t] = ["mirror", "mirrorThickness", "overlap", "rays", "size", "band", "thickness"].map((k) => n(v, k));
  const alternate = v.alternate !== false;
  const R = size / 2;
  const body = mirror / 2 + band;
  const sun: P2[] = [];
  for (let k = 0; k < count; k++) {
    const a = rad(90 + (360 * k) / count);
    const r = alternate && k % 2 === 1 ? body + SHORT_RAY * (R - body) : R;
    const b = a + rad(180 / count);
    sun.push([r6(r * Math.cos(a)), r6(r * Math.sin(a))], [r6(body * Math.cos(b)), r6(body * Math.sin(b))]);
  }
  // The sharpest tip: the angle between a tip's two sides.
  let tip = 180;
  for (let i = 0; i < sun.length; i += 2) {
    const [p, q, s] = [sun[(i + sun.length - 1) % sun.length], sun[i], sun[i + 1]];
    const u = [p[0] - q[0], p[1] - q[1]];
    const w = [s[0] - q[0], s[1] - q[1]];
    tip = Math.min(tip, (Math.acos((u[0] * w[0] + u[1] * w[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1]))) * 180) / Math.PI);
  }
  const disc = r6(2 * (body - RING_IN));
  const ringHole = r6(mirror + 2 * MIRROR_ROOM);
  const rings = Math.max(1, Math.ceil(mt / t - 1e-9));
  // The pocket centred in the band of ring between the mirror's hole and the ring's edge.
  const hangR = (ringHole / 2 + disc / 2) / 2 - (POCKET_UP - POCKET_DOWN) / 2;
  return { mirror, t, sun, window: r6(mirror - 2 * overlap), body, disc, ringHole, rings, hang: [0, r6(hangR)], tip };
}

export function sunburstProblems(v: Values): string[] {
  const s = sunburst(v);
  const [overlap, count, size] = ["overlap", "rays", "size"].map((k) => n(v, k));
  if (v.alternate !== false && count % 2 === 1) return ["Use an even number of rays to alternate long and short ones."];
  if (s.window < 20 || overlap < 2) return ["The front must overlap the mirror by at least 2 mm, and leave a window at least 20 mm across."];
  if (size / 2 < s.body + 10) return [`The frame is too small for the rays: make it at least ${mm(Math.ceil(2 * (s.body + 10)))} across, or the band narrower.`];
  if ((s.disc - s.ringHole) / 2 < POCKET_DOWN + POCKET_UP + 2 * HANG.web) return [`Make the band wider: the rings need room for the keyhole's pocket (at least ${mm(POCKET_DOWN + POCKET_UP + 2 * HANG.web + RING_IN + MIRROR_ROOM)}).`];
  if (s.tip < MIN_TIP) return [`The rays are too sharp (${Math.round(s.tip)}° at the tip): use fewer rays, or make them shorter.`];
  if (crossesItself(s.sun)) return ["The rays cross each other: use fewer."];
  if (!fitsBed(size, size)) return ["The frame is too big for the laser's 600 × 300 mm bed: at most 290 mm across."];
  return [];
}

const sunburstMirrorDesign: LibraryDesign = {
  id: "sunburst-mirror",
  name: "Sunburst mirror frame",
  group: "Home",
  description:
    "A sunburst frame for a round craft mirror: a sun of long and short rays round a window a little smaller than the mirror, spacer rings as thick as the mirror, and a back with a keyhole hanger, its pocket hidden behind the sun. Drop the mirror in, glue the layers together, and hang it on a screw: in through the round part of the keyhole, then down.",
  icon: '<circle cx="24" cy="24" r="9"/><path d="M24 4v8M24 36v8M4 24h8M36 24h8M10 10l6 6M32 32l6 6M38 10l-6 6M16 32l-6 6"/>',
  inputs: (m) => [
    { key: "mirror", label: "Mirror diameter", kind: "number", unit: "mm", default: 150, min: 50, max: 240, help: "Round craft mirrors are often 100, 150 or 200 mm." },
    { key: "mirrorThickness", label: "Mirror thickness", kind: "number", unit: "mm", default: 3, min: 1, max: 10, help: "The spacer rings add up to at least this." },
    { key: "overlap", label: "Overlap", kind: "number", unit: "mm", default: 5, min: 2, max: 30, help: "How far the front covers the mirror's edge." },
    { key: "size", label: "Frame size", kind: "number", unit: "mm", default: 280, min: 80, max: 290, help: "Across the long rays' tips." },
    { key: "rays", label: "Rays", kind: "count", default: 16, min: 6, max: 60 },
    { key: "alternate", label: "Long and short rays", kind: "toggle", default: true, help: "Every other ray shorter. Off: all the same." },
    { key: "band", label: "Band width", kind: "number", unit: "mm", default: 26, min: 10, max: 80, help: "The plain ring round the mirror, before the rays start." },
    thicknessInput(m),
  ],
  problems: sunburstProblems,
  make: (v, ids) => {
    const s = sunburst(v);
    // The back and rings are true circles, so they cut smoothly.
    const disc = (name: string, holes: PlateHole[]): Item[] => [makeShape(take(ids), name, [{ kind: "circle", c: [0, 0], d: s.disc } as PlateHole, ...holes].map(holeOutline))];
    const pieces: Item[][] = [[plateItem(ids, "Sunburst: sun front", s.sun, [{ kind: "circle", c: [0, 0], d: s.window }])]];
    for (let i = 0; i < s.rings; i++) pieces.push(disc(`Sunburst: ${s.rings > 1 ? `spacer ring ${i + 1}` : "spacer ring"}`, [{ kind: "circle", c: [0, 0], d: s.ringHole }, pocketSlot(s.hang)]));
    pieces.push(disc("Sunburst: back", [{ kind: "poly", points: keyholeOutline(s.hang) }]));
    const items = placed(inRows(pieces, 8));
    return {
      items,
      notes: [
        `${s.rings + 2} pieces: the sun front (${mm(s.window)} window), ${s.rings} spacer ring${s.rings === 1 ? "" : "s"} and the back; ${mm(n(v, "size"))} across.`,
        "Glue the layers with the back's keyhole and the rings' pockets lined up, at the top.",
        ...bedNote(items),
        KERF_NOTE,
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Tablet or book stand: the book or tablet stands on a ledge behind a low lip, leaning back against a sloping back rest.
// Two sides hold the base, lip and back rest by tabs through slots (sidePanels.ts); the base runs back under the top of
// the back rest so the stand can't tip over backwards. Side-on: x from the front to the back, z up.

export interface BookStand {
  a: SideAssembly;
  /** The back rest's front face, where the book leans: its foot (x, z) and direction up it. */
  restFoot: P2;
  restDir: P2;
}

export function bookStand(v: Values): BookStand {
  const [width, lean, backLen, ledge, lip, t] = ["width", "lean", "back", "ledge", "lip", "thickness"].map((k) => n(v, k));
  const m = Math.max(5, t);
  const zb = m + t;
  const angle = 90 - lean;
  const d: P2 = [Math.cos(rad(angle)), Math.sin(rad(angle))];
  const nrm: P2 = [-Math.sin(rad(angle)), Math.cos(rad(angle))];
  // The back rest's lowest corner (its back one) rests on the base; its front face starts `ledge` behind the lip.
  const lowBack: P2 = [m + t + ledge + t * Math.sin(rad(angle)), zb];
  const centre: P2 = [r6(lowBack[0] + (backLen / 2) * d[0] + (t / 2) * nrm[0]), r6(lowBack[1] + (backLen / 2) * d[1] + (t / 2) * nrm[1])];
  const rest: CrossPiece = { role: "back", label: "Back rest", centre, angle, length: r6(backLen), tabs: evenTabs(backLen) };
  // The base reaches back under the top of the back rest (so it can't tip), and at least under its foot.
  const sec = sectionOf(rest, t);
  const baseEnd = Math.max(...sec.map((p) => p[0])) + 4;
  const baseLen = r6(baseEnd - m);
  const base: CrossPiece = { role: "base", label: "Base", centre: [r6(m + baseLen / 2), r6(m + t / 2)], angle: 0, length: baseLen, tabs: evenTabs(baseLen) };
  const lipPiece: CrossPiece = { role: "lip", label: "Lip", centre: [r6(m + t / 2), r6(zb + lip / 2)], angle: 90, length: lip, tabs: evenTabs(lip, 1) };
  const pieces = [base, lipPiece, rest];
  const hull = convexHull(pieces.flatMap((p) => sectionOf(p, t)));
  const side = round6(offsetPolygon(hull, m, 1.5));
  // The rest's front face starts at its lower front corner: the back corner moved across it by t.
  const foot: P2 = [r6(lowBack[0] + t * nrm[0]), r6(lowBack[1] + t * nrm[1])];
  return { a: { side, pieces, width, t, kerf: 0 }, restFoot: foot, restDir: [r6(d[0]), r6(d[1])] };
}

export function bookStandProblems(v: Values): string[] {
  const [t, lip] = ["thickness", "lip"].map((k) => n(v, k));
  if (lip < 3 * t + 3) return [`Make the lip at least ${mm(3 * t + 3)} tall, so its tabs hold.`];
  return assemblyProblems(bookStand(v).a, { back: "back rest" });
}

const bookStandDesign: LibraryDesign = {
  id: "book-stand",
  name: "Tablet or book stand",
  group: "Desk",
  description:
    "A slot-together stand for a tablet, a cookbook or sheet music: it stands on a ledge behind a low lip and leans back against a sloping back rest at the angle you choose. Two sides hold the pieces with tabs through slots, and the base runs back under the rest so it won't tip over.",
  icon: '<path d="M6 42h36M10 42V34M36 42 28 8"/><path d="M12 34l18-24" opacity=".6"/><path d="M8 42l2-10h4l24-24 4 34" opacity=".4"/>',
  inputs: (m) => [
    { key: "width", label: "Width", kind: "number", unit: "mm", default: 140, min: 40, max: 280, help: "Between the sides. It can be narrower than the tablet or book: they overhang." },
    { key: "lean", label: "Lean back", kind: "count", default: 20, min: 5, max: 45, help: "Degrees from upright: 15–25° suits reading and watching." },
    { key: "back", label: "Back rest height", kind: "number", unit: "mm", default: 150, min: 40, max: 280, help: "Along its slope." },
    { key: "ledge", label: "Ledge depth", kind: "number", unit: "mm", default: 20, min: 5, max: 80, help: "Room for the tablet's or book's thickness, between the lip and the back rest." },
    { key: "lip", label: "Lip height", kind: "number", unit: "mm", default: 18, min: 8, max: 60 },
    thicknessInput(m),
  ],
  problems: bookStandProblems,
  make: (v, ids) => ({
    items: placed(assemblyItems(bookStand(v).a, "Book stand", ids)),
    notes: [`5 pieces: 2 sides, a base, a lip and a back rest leaning ${n(v, "lean")}° from upright; ${mm(n(v, "width") + 2 * n(v, "thickness"))} wide.`, KERF_NOTE],
  }),
};

// ---------------------------------------------------------------------------
// Coaster holder, for the library's own Coasters (the same shapes and sizes): the coasters stand on edge in a row
// between two end plates, on a base, with a low wall each side. The end plates hold the base and walls by tabs through
// slots and have a notch in the top to pinch a coaster out. End-on: x across, z up.

/**
 * The walls are this share of a coaster's height — half for six-sided ones, which stand on a flat and are widest (at their
 * side corners) halfway up, so the walls reach those corners; the end plates this share above the base.
 */
export const WALL_SHARE = 0.4;
export const HEX_WALL_SHARE = 0.5;
export const wallShare = (shape: string) => (shape === "hexagon" ? HEX_WALL_SHARE : WALL_SHARE);
export const END_SHARE = 0.6;
/** The finger notch in the end plates: this share of the coaster's width, down to this share of its height. */
export const NOTCH = { width: 0.5, down: 0.35 };

/** How wide and tall a coaster is standing on edge (on a flat side for a six-sided one): round and square ones are the size each way. */
export function coasterStanding(shape: string, size: number): { w: number; h: number } {
  return shape === "hexagon" ? { w: r6((2 * size) / Math.sqrt(3)), h: size } : { w: size, h: size };
}

export interface CoasterHolder {
  a: SideAssembly;
  /** A coaster standing: how wide and tall; where the coasters' row starts (x) and the base's top (z). */
  coaster: { w: number; h: number };
  x0: number;
  floor: number;
  /** The coasters' row along y: from −half to half. */
  half: number;
  stack: number;
}

export function coasterHolder(v: Values): CoasterHolder {
  const [size, count, ct, room, t] = ["size", "count", "coasterThickness", "room", "thickness"].map((k) => n(v, k));
  const c = coasterStanding(String(v.shape), size);
  const m = Math.max(5, t);
  const inside = c.w + 2 * room;
  const baseLen = r6(inside + 2 * t);
  const floor = r6(m + t);
  const wallH = r6(c.h * wallShare(String(v.shape)));
  const pieces: CrossPiece[] = [
    { role: "base", label: "Base", centre: [r6(m + baseLen / 2), r6(m + t / 2)], angle: 0, length: baseLen, tabs: evenTabs(baseLen) },
    { role: "wall-left", label: "Left wall", centre: [r6(m + t / 2), r6(floor + wallH / 2)], angle: 90, length: wallH, tabs: evenTabs(wallH, 1) },
    { role: "wall-right", label: "Right wall", centre: [r6(m + baseLen - t / 2), r6(floor + wallH / 2)], angle: 90, length: wallH, tabs: evenTabs(wallH, 1) },
  ];
  const X = r6(baseLen + 2 * m);
  const top = r6(floor + c.h * END_SHARE);
  const nw = (c.w * NOTCH.width) / 2;
  const nz = r6(floor + c.h * NOTCH.down);
  const cx = X / 2;
  const ch = Math.min(nw / 2, (top - nz) / 2);
  // The end plate: a rectangle with a notch down from the middle of its top edge; the notch's two top corners are cut off at 45°.
  const side: P2[] = [
    [0, 0],
    [X, 0],
    [X, top],
    [cx + nw + ch, top],
    [cx + nw, top - ch],
    [cx + nw, nz],
    [cx - nw, nz],
    [cx - nw, top - ch],
    [cx - nw - ch, top],
    [0, top],
  ].map(([x, z]): P2 => [r6(x), r6(z)]);
  const stack = r6(count * ct);
  return { a: { side, pieces, width: r6(stack + 2 * room), t, kerf: 0 }, coaster: c, x0: r6(m + t + room), floor, half: r6(stack / 2), stack };
}

export function coasterHolderProblems(v: Values): string[] {
  const t = n(v, "thickness");
  const h = coasterHolder(v);
  const share = wallShare(String(v.shape));
  if (h.coaster.h * share < 3 * t + 3) return [`The coasters are too small for walls with tabs: at least ${mm(Math.ceil((3 * t + 3) / share))} across.`];
  return assemblyProblems(h.a, { "wall-left": "left wall", "wall-right": "right wall" });
}

const coasterHolderDesign: LibraryDesign = {
  id: "coaster-holder",
  name: "Coaster holder",
  group: "Home",
  description:
    "A holder for a set of coasters standing on edge — set the same shape, size and number as your coasters (the library's Coasters design is 95 mm round, 4 of them, by default). Two end plates hold the base and low side walls with tabs through slots, and a notch in each end lets you pinch a coaster out.",
  icon: '<path d="M6 40h36M8 40V22h4M40 40V22h-4"/><path d="M14 40V18a10 10 0 0 1 20 0v22" opacity=".5"/><path d="M18 40V16M24 40V14M30 40V16" opacity=".7"/>',
  inputs: (m) => [
    {
      key: "shape",
      label: "Coaster shape",
      kind: "choice",
      default: "round",
      choices: [
        { value: "round", label: "Round" },
        { value: "square", label: "Square" },
        { value: "hexagon", label: "Six-sided" },
      ],
    },
    { key: "size", label: "Coaster size", kind: "number", unit: "mm", default: 95, min: 30, max: 250, help: "Across (flat to flat for six-sided), as in the Coasters design." },
    { key: "count", label: "How many coasters", kind: "count", default: 4, min: 1, max: 24 },
    { key: "coasterThickness", label: "Coaster thickness", kind: "number", unit: "mm", default: 3, min: 1, max: 20, help: "Each one: cork-backed coasters are thicker." },
    { key: "room", label: "Room round them", kind: "number", unit: "mm", default: 1.5, min: 0.5, max: 10, help: "Each side and at each end, so they drop in easily." },
    thicknessInput(m),
  ],
  problems: coasterHolderProblems,
  make: (v, ids) => {
    const h = coasterHolder(v);
    return {
      items: placed(assemblyItems(h.a, "Coaster holder", ids)),
      notes: [`5 pieces for ${n(v, "count")} coasters ${mm(n(v, "size"))} across; ${mm(h.a.side[1][0])} × ${mm(h.a.width + 2 * h.a.t)} on the table. The two sides are the end plates.`, KERF_NOTE],
    };
  },
};

// ---------------------------------------------------------------------------
// Tissue box cover: a finger-jointed box with no bottom (an open-topped finger box turned over), dropped over a box of
// tissues, with a slot in the top. Sized from the tissue box, with `room` all round it.

export interface TissueCover {
  b: BoxSizes;
  /** The slot in the top (the top's own x, y): centres of its round ends, and how wide. */
  slot: { a: [number, number]; b: [number, number]; w: number };
}

export function tissueCover(v: Values): TissueCover {
  const [bw, bd, bh, room, sl, sw, t] = ["boxWidth", "boxDepth", "boxHeight", "room", "slotLength", "slotWidth", "thickness"].map((k) => n(v, k));
  const W = r6(bw + 2 * room + 2 * t);
  const D = r6(bd + 2 * room + 2 * t);
  const H = r6(bh + room + t);
  const b: BoxSizes = { W: lit(W), D: lit(D), H: lit(H), t: lit(t), kerf: lit(0), lid: false, finger: n(v, "finger") };
  // The long way of the slot along the longer side of the top.
  const along = W >= D;
  const half = Math.max(0, sl - sw) / 2;
  const [cx, cy] = [r6(W / 2), r6(D / 2)];
  const slot = along ? { a: [r6(cx - half), cy] as [number, number], b: [r6(cx + half), cy] as [number, number], w: sw } : { a: [cx, r6(cy - half)] as [number, number], b: [cx, r6(cy + half)] as [number, number], w: sw };
  return { b, slot };
}

export const tissueSlot = (c: TissueCover): PlateHole => ({ kind: "slot", ...c.slot });

export function tissueProblems(v: Values): string[] {
  const c = tissueCover(v);
  const out = boxProblems(c.b);
  if (out.length) return out;
  const [sl, sw] = ["slotLength", "slotWidth"].map((k) => n(v, k));
  const t = c.b.t.v;
  if (sw > sl) return ["The slot can't be wider than it is long."];
  const [W, D] = [c.b.W.v, c.b.D.v];
  const [long, short] = [Math.max(W, D), Math.min(W, D)];
  if (sl > long - 2 * t - 20 || sw > short - 2 * t - 20) return ["The slot is too big for the top: leave at least 10 mm all round it."];
  if (!panelsFit(c.b, fitsBed)) out.push("The cover is too big for the laser's 600 × 300 mm bed.");
  return out;
}

const tissueBoxDesign: LibraryDesign = {
  id: "tissue-box",
  name: "Tissue box cover",
  group: "Boxes and stands",
  description:
    "A finger-jointed cover that drops over a box of tissues, with a rounded slot in the top for them to come through. Measure your tissue box: a cube box is often about 115 × 115 × 125 mm, a flat one about 240 × 120 × 85 mm. The bottom is open, so you just lift it off to change the box.",
  icon: '<path d="M8 18h32v24H8z"/><path d="M16 18a8 3 0 0 0 16 0" /><path d="M20 18c0-6 4-10 4-12 0 2 4 6 4 12" opacity=".6"/>',
  inputs: (m) => [
    { key: "boxWidth", label: "Tissue box width", kind: "number", unit: "mm", default: 115, min: 40, max: 280 },
    { key: "boxDepth", label: "Tissue box depth", kind: "number", unit: "mm", default: 115, min: 40, max: 280 },
    { key: "boxHeight", label: "Tissue box height", kind: "number", unit: "mm", default: 125, min: 30, max: 280 },
    { key: "room", label: "Room round it", kind: "number", unit: "mm", default: 2, min: 0.5, max: 10, help: "Each side and above, so the cover drops on easily." },
    { key: "slotLength", label: "Slot length", kind: "number", unit: "mm", default: 80, min: 20, max: 250 },
    { key: "slotWidth", label: "Slot width", kind: "number", unit: "mm", default: 30, min: 10, max: 120 },
    thicknessInput(m),
    fingerInput(10),
  ],
  problems: tissueProblems,
  make: (v, ids) => {
    const c = tissueCover(v);
    const fc = fingerCounts(c.b);
    const items = placed(inRows(boxItems({ b: c.b, stance: "upsideDown", panels: { bottom: "Top", front: "Front", back: "Back", left: "Left side", right: "Right side" }, holes: { bottom: [tissueSlot(c)] } }, "Tissue box cover", ids)));
    return {
      items,
      notes: [`5 pieces, ${mm(c.b.W.v)} × ${mm(c.b.D.v)} × ${mm(c.b.H.v)} outside, open underneath; ${fc.height} fingers up the corners.`, ...bedNote(items), KERF_NOTE],
    };
  },
};

export const LASER_DESIGNS_5: LibraryDesign[] = [birdBoxDesign, earringStandDesign, drawerBoxDesign, penHolderDesign, sunburstMirrorDesign, bookStandDesign, coasterHolderDesign, tissueBoxDesign];
