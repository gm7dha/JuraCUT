/**
 * JuraCAD's fourth batch of laser designs: living-hinge box, card deck box, business card holder, spice rack, tealight
 * lantern, key rack, dice tower and name puzzle. The maths is JuraCAD's (src/library/designs/hingeBox.ts, deckBox.ts,
 * cardStand.ts, spiceRack.ts, lantern.ts, keyRack.ts, diceTower.ts, namePuzzle.ts), with numbers instead of
 * variables and the pieces laid out flat for the bed instead of built in 3D: keep the two in step. As with the other
 * boxes, there's no kerf allowance here — Export for laser's "Allow for the kerf" moves outlines out and slots in.
 */
import { pathPoints, type Segment } from "../geometry/segments";
import { FONTS, textOutline } from "../geometry/text";
import { itemBox, makeCircle, makeRect, makeShape } from "../model/shapes";
import type { Item, Material, Outline } from "../model/types";
import { depths } from "./bridges";
import { lit } from "./ex";
import { boxProblems, fingerCount, fingerCounts, FINGER_MARGIN, panelOutlines, type BoxSizes, type Pt } from "./fingers";
import { font, fontChoice, inRows, loopOf, mm, n, placed, r6, str, take, wordsAt, type LibraryDesign, type Values } from "./kit";
import { boxOf, convexHull, crossesItself, fitsBed, offsetPolygon, outlineGap, round6, tidyPolygon, type Box, type P2 } from "./outlines";
import { patternGap, patternHoles, patternIslands, type Hole, type PatternKind } from "./patterns";
import { assemblyItems, assemblyProblems, evenTabs, sectionOf, type CrossPiece, type SideAssembly } from "./sidePanels";

const flat = (p: Pt[]): P2[] => p.map(([x, y]) => [x.v, y.v]);
const thicknessInput = (m: Material, min = 1.5, max = 10, help = "Measure your sheet: 3 mm plywood is often 2.8–3.2 mm.") => ({ key: "thickness", label: "Material thickness", kind: "number" as const, unit: "mm", default: m.thickness || 3, min, max, help });
const fingerInput = (def: number, min = 2) => ({ key: "finger", label: "Finger width", kind: "number" as const, unit: "mm", default: def, min, max: 100, help: "Roughly — each edge gets an odd number of equal fingers that fit exactly." });
const KERF_NOTE = "Tick “Allow for the kerf” when you export, so the joints fit snugly.";
const rad = (d: number) => (d * Math.PI) / 180;

/** A closed outline of corners as a cut shape. */
const shapeOf = (ids: Set<string>, name: string, loops: P2[][]): Item => makeShape(take(ids), name, loops.map(loopOf));

/**
 * An outline with some of its corners rounded: each listed corner (a right angle) becomes a quarter circle of radius r
 * touching both sides.
 */
function roundedLoop(pts: P2[], corners: Set<number>, r: number): Outline {
  const segs: Segment[] = [];
  const at: { from: P2; to: P2; arc?: Segment }[] = pts.map((c, i) => {
    if (!corners.has(i) || r <= 0) return { from: c, to: c };
    const unit = (q: P2): P2 => {
      const l = Math.hypot(q[0] - c[0], q[1] - c[1]);
      return [(q[0] - c[0]) / l, (q[1] - c[1]) / l];
    };
    const a = unit(pts[(i + pts.length - 1) % pts.length]);
    const b = unit(pts[(i + 1) % pts.length]);
    const t1: P2 = [r6(c[0] + a[0] * r), r6(c[1] + a[1] * r)];
    const t2: P2 = [r6(c[0] + b[0] * r), r6(c[1] + b[1] * r)];
    const centre: P2 = [c[0] + (a[0] + b[0]) * r, c[1] + (a[1] + b[1]) * r];
    const k = Math.SQRT1_2;
    const mid: P2 = [r6(centre[0] - (a[0] + b[0]) * r * k), r6(centre[1] - (a[1] + b[1]) * r * k)];
    return { from: t1, to: t2, arc: { kind: "arc", from: t1, mid, to: t2 } };
  });
  at.forEach((p, i) => {
    if (p.arc) segs.push(p.arc);
    const next = at[(i + 1) % at.length];
    segs.push({ kind: "line", from: p.to, to: next.from });
  });
  return { segments: segs, closed: true };
}

// ---------------------------------------------------------------------------
// Living-hinge box

/** Room round the lid's under-plate inside the walls (mm, each side). */
export const LID_ROOM = 0.25;
/** The corners' inside radius must be at least this many times the sheet's thickness. */
export const BEND_RATIO = 3;
/** Rows of hinge cuts each corner needs, at least. */
export const MIN_ROWS = 12;
export const MAX_CUTS = 3000;

export interface HingeBox {
  W: number;
  D: number;
  H: number;
  R: number;
  t: number;
  /** The wall's height (the lid sits on it). */
  wall: number;
  /** Fingers along the straight parts of the long (x) and short (y) sides. */
  nx: number;
  ny: number;
  /** Each corner's length round the middle of the sheet; the strip's whole length. */
  corner: number;
  length: number;
}

export function hingeBox(v: Values): HingeBox {
  const [W, D, H, R, t, finger] = ["width", "depth", "height", "radius", "thickness", "finger"].map((k) => n(v, k));
  const smallest = t + FINGER_MARGIN;
  const nx = fingerCount(W - 2 * R, finger, smallest);
  const ny = fingerCount(D - 2 * R, finger, smallest);
  const corner = (Math.PI / 2) * (R - t / 2);
  return { W, D, H, R, t, wall: H - t, nx, ny, corner, length: 2 * (W - 2 * R) + 2 * (D - 2 * R) + 4 * corner };
}

/** Breaks along a straight side `L` long (from its start) and whether each piece is the bottom's finger. */
const piecesAlong = (L: number, count: number) => Array.from({ length: count }, (_, i) => ({ from: (i * L) / count, to: ((i + 1) * L) / count, bottom: i % 2 === 1 }));

/** The bottom's outline, anticlockwise from the bottom-left inside corner: sharp where the corners will be rounded. */
export function bottomOutline(b: HingeBox): P2[] {
  const { W, D, R, t } = b;
  const [hx, hy] = [W / 2, D / 2];
  const pts: P2[] = [[-hx + t, -hy + t]];
  const [Lx, Ly] = [W - 2 * R, D - 2 * R];
  for (const p of piecesAlong(Lx, b.nx)) {
    const y = p.bottom ? -hy : -hy + t;
    pts.push([-Lx / 2 + p.from, y], [-Lx / 2 + p.to, y]);
  }
  pts.push([hx - t, -hy + t]);
  for (const p of piecesAlong(Ly, b.ny)) {
    const x = p.bottom ? hx : hx - t;
    pts.push([x, -Ly / 2 + p.from], [x, -Ly / 2 + p.to]);
  }
  pts.push([hx - t, hy - t]);
  for (const p of piecesAlong(Lx, b.nx)) {
    const y = p.bottom ? hy : hy - t;
    pts.push([Lx / 2 - p.from, y], [Lx / 2 - p.to, y]);
  }
  pts.push([-hx + t, hy - t]);
  for (const p of piecesAlong(Ly, b.ny)) {
    const x = p.bottom ? -hx : -hx + t;
    pts.push([x, Ly / 2 - p.from], [x, Ly / 2 - p.to]);
  }
  return round6(tidyPolygon(pts));
}

/** The flat strip (along, up), anticlockwise: its foot notched where the bottom's fingers go. */
export function stripOutline(b: HingeBox): { outline: P2[]; notches: [number, number][]; zones: [number, number][] } {
  const { W, D, R, t, corner: a, wall } = b;
  const [Lx, Ly] = [W - 2 * R, D - 2 * R];
  const notches: [number, number][] = [];
  const zones: [number, number][] = [];
  const add = (s0: number, s1: number) => s1 - s0 > 1e-9 && notches.push([r6(s0), r6(s1)]);
  for (const p of piecesAlong(Lx, b.nx)) if (p.bottom) add(Math.max(0, Lx / 2 - p.to), Math.max(0, Lx / 2 - p.from));
  let s = Lx / 2;
  const side = (L: number, count: number) => {
    zones.push([r6(s), r6(s + a)]);
    s += a;
    for (const p of piecesAlong(L, count)) if (p.bottom) add(s + p.from, s + p.to);
    s += L;
  };
  side(Ly, b.ny);
  side(Lx, b.nx);
  side(Ly, b.ny);
  zones.push([r6(s), r6(s + a)]);
  s += a;
  for (const p of piecesAlong(Lx, b.nx)) if (p.bottom) add(s + Math.min(Lx / 2, p.from), s + Math.min(Lx / 2, p.to));
  const total = b.length;
  notches.sort((x, y) => x[0] - y[0]);
  const foot: P2[] = [];
  let at = 0;
  for (const [n0, n1] of notches) {
    if (n0 > at + 1e-9) foot.push([at, 0], [n0, 0]);
    foot.push([n0, t], [n1, t]);
    at = n1;
  }
  if (at < total - 1e-9) foot.push([at, 0], [total, 0]);
  const pts = round6(tidyPolygon([...foot, [total, wall], [0, wall]]));
  return { outline: pts, notches, zones };
}

/** The living hinge's cuts in each corner zone: columns `spacing` apart, staggered, clear of the edges by `gap`. */
export function hingeColumns(b: HingeBox, v: Values): [P2, P2][] {
  const [cut, gap, spacing] = ["cut", "gap", "spacing"].map((k) => n(v, k));
  const { zones } = stripOutline(b);
  const [bottom, top] = [gap, b.wall - gap];
  const step = cut + gap;
  const out: [P2, P2][] = [];
  for (const [z0, z1] of zones) {
    const count = Math.floor((z1 - z0) / spacing + 1e-9);
    for (let j = 0; j < count; j++) {
      const x = r6((z0 + z1) / 2 + (j - (count - 1) / 2) * spacing);
      const shift = j % 2 ? step / 2 : 0;
      for (let y = bottom - shift; y < top; y += step) {
        const [y0, y1] = [Math.max(bottom, y), Math.min(top, y + cut)];
        if (y1 - y0 >= Math.min(2, cut / 3)) out.push([[x, r6(y0)], [x, r6(y1)]]);
      }
    }
  }
  return out;
}

export function hingeBoxProblems(v: Values): string[] {
  const b = hingeBox(v);
  const [cut, gap, spacing] = ["cut", "gap", "spacing"].map((k) => n(v, k));
  const { W, D, R, t } = b;
  const tightest = Math.max(BEND_RATIO * t + t, t + LID_ROOM + 3);
  if (R < tightest) return [`Round the corners at least ${mm(Math.ceil(tightest * 10) / 10)} (outside) for ${mm(t)} sheet, so the strip can bend without cracking.`];
  const least = 2 * R + 3 * (t + FINGER_MARGIN);
  if (Math.min(W, D) < least) return [`The sides are too short between the round corners for the fingers: make the box at least ${mm(Math.ceil(least))} each way, or round the corners less.`];
  if (b.nx < 3 || b.ny < 3) return ["The straight parts are too short for fingers: make the finger width smaller."];
  if (b.wall < 4 * t + 2 * gap) return ["The box is too low: make it taller."];
  if (cut > b.wall - 2 * gap) return [`The hinge cuts are longer than the wall allows: at most ${mm(b.wall - 2 * gap)}.`];
  if (Math.floor(b.corner / spacing + 1e-9) < MIN_ROWS) return [`Each corner needs at least ${MIN_ROWS} rows of hinge cuts to bend smoothly: bring the rows closer together (at most ${mm(Math.floor((b.corner / MIN_ROWS) * 100) / 100)} apart), or round the corners more.`];
  if (!fitsBed(b.length, b.wall)) return [`The wall strip would be ${mm(b.length)} long: too long to fit on the laser's 600 mm bed with room round it. Make the box smaller.`];
  if (!fitsBed(W, D)) return ["The bottom is too big for the laser's 600 × 300 mm bed."];
  if (hingeColumns(b, v).length > MAX_CUTS) return [`That's over ${MAX_CUTS} hinge cuts: space the rows further apart.`];
  return [];
}

const hingeBoxDesign: LibraryDesign = {
  id: "hinge-box",
  name: "Living-hinge box",
  group: "Boxes and stands",
  description:
    "A box with round corners: its four walls are one long strip that bends round the corners on living hinges, finger-jointed into the bottom along the flat sides. Its two ends meet in the middle of the back: glue them, with a scrap strip glued behind the joint. The lid lifts off. 3 mm plywood or MDF bends best.",
  icon: '<rect x="6" y="14" width="36" height="26" rx="8"/><path d="M6 14h36" opacity=".5"/><path d="M9 22v4M11 25v4M9 30v4M37 22v4M39 25v4M37 30v4" /><rect x="5" y="9" width="38" height="5" rx="2.5" opacity=".7"/>',
  inputs: (m) => [
    { key: "width", label: "Width", kind: "number", unit: "mm", default: 120, min: 40, max: 280, help: "Outside." },
    { key: "depth", label: "Depth", kind: "number", unit: "mm", default: 80, min: 40, max: 280, help: "Outside." },
    { key: "height", label: "Height", kind: "number", unit: "mm", default: 60, min: 25, max: 280, help: "Outside, lid included." },
    { key: "radius", label: "Corner rounding", kind: "number", unit: "mm", default: 20, min: 4, max: 100, help: "Outside. Bigger corners bend more gently." },
    thicknessInput(m, 1.5, 6),
    { ...fingerInput(10, 3), help: "Roughly — each straight side gets an odd number of equal fingers that fit exactly." },
    { key: "cut", label: "Hinge cut length", kind: "number", unit: "mm", default: 15, min: 3, max: 200 },
    { key: "gap", label: "Gap between cuts", kind: "number", unit: "mm", default: 3, min: 1, max: 20, help: "The uncut bits in each row; smaller bends more easily but is weaker." },
    { key: "spacing", label: "Row spacing", kind: "number", unit: "mm", default: 1.5, min: 0.5, max: 10, help: "Between rows of cuts: about half the sheet's thickness is a good start." },
  ],
  problems: hingeBoxProblems,
  make: (v, ids) => {
    const b = hingeBox(v);
    const { W, D, R, t } = b;
    const bottomPts = bottomOutline(b);
    // The four inside corners (where the round corners go) are rounded R − t.
    const [cx, cy] = [W / 2 - t, D / 2 - t];
    const corners = new Set(bottomPts.flatMap((p, i) => (Math.abs(Math.abs(p[0]) - cx) < 1e-6 && Math.abs(Math.abs(p[1]) - cy) < 1e-6 ? [i] : [])));
    const bottom = makeShape(take(ids), "Hinge box: bottom", [roundedLoop(bottomPts, corners, R - t)]);
    const strip = stripOutline(b);
    const cuts = hingeColumns(b, v);
    const stripGroup = `hingebox-strip-${take(ids)}`;
    const wall = { ...makeShape(take(ids), "Hinge box: wall strip", [loopOf(strip.outline)]), group: stripGroup };
    const hinge = { ...makeShape(take(ids), "Hinge box: hinge cuts", cuts.map(([p, q]) => ({ segments: [{ kind: "line" as const, from: p, to: q }], closed: false }))), group: stripGroup };
    const under = [W - 2 * t - 2 * LID_ROOM, D - 2 * t - 2 * LID_ROOM, R - t - LID_ROOM];
    const lid = { ...makeRect(take(ids), 0, 0, W, D), name: "Hinge box: lid", radius: R };
    const underPlate = { ...makeRect(take(ids), 0, 0, under[0], under[1]), name: "Hinge box: lid under-plate", radius: under[2] };
    return {
      items: placed(inRows([[wall, hinge], [bottom], [lid], [underPlate]], 8)),
      notes: [
        `4 pieces: the bottom, a wall strip ${mm(b.length)} long with ${cuts.length} hinge cuts, and the lid's two plates.`,
        "The strip's ends meet in the middle of the back: glue them, with a scrap strip glued behind the joint.",
        KERF_NOTE,
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Card deck box

/** Room round the deck box lid's under-plate inside the walls (mm, each side). */
export const DECK_LID_ROOM = 0.25;

export interface DeckBox {
  b: BoxSizes;
  notch: number;
  lid: boolean;
}

export function deckBox(v: Values): DeckBox {
  const [cw, ch, deck, c, t] = ["cardWidth", "cardHeight", "deck", "clearance", "thickness"].map((k) => n(v, k));
  const lid = v.lid !== false;
  return { b: { W: lit(cw + 2 * c + 2 * t), D: lit(deck + 2 * c + 2 * t), H: lit(ch + c + (lid ? 2 : 1) * t), t: lit(t), kerf: lit(0), lid: false, finger: n(v, "finger") }, notch: n(v, "notch"), lid };
}

function deckProblems(v: Values): string[] {
  const d = deckBox(v);
  const out = boxProblems(d.b);
  if (out.length) return out;
  const [W, H, t] = [d.b.W.v, d.b.H.v, d.b.t.v];
  const r = d.notch / 2;
  if (r > 0 && 2 * r > W - 4 * t - 4) out.push(`The thumb notch is too wide for the box: at most ${mm(Math.floor(W - 4 * t - 4))}.`);
  if (r > 0 && r > H / 2) out.push("The thumb notch is too deep for the box: make it smaller.");
  return out;
}

/** The front's outline with a round thumb notch bitten out of the middle of its plain top edge. */
export function notchedFront(front: P2[], W: number, H: number, notch: number): Outline {
  if (notch <= 0) return loopOf(front);
  const r = notch / 2;
  const segs: Segment[] = [];
  for (let i = 0; i < front.length; i++) {
    const [a, b] = [front[i], front[(i + 1) % front.length]];
    // The top edge runs right to left at y = H, past the middle.
    if (Math.abs(a[1] - H) < 1e-9 && Math.abs(b[1] - H) < 1e-9 && a[0] > W / 2 + r && b[0] < W / 2 - r) {
      const [p, q]: P2[] = [
        [r6(W / 2 + r), H],
        [r6(W / 2 - r), H],
      ];
      segs.push({ kind: "line", from: a, to: p }, { kind: "arc", from: p, mid: [r6(W / 2), r6(H - r)], to: q }, { kind: "line", from: q, to: b });
    } else segs.push({ kind: "line", from: a, to: b });
  }
  return { segments: segs, closed: true };
}

const deckBoxDesign: LibraryDesign = {
  id: "deck-box",
  name: "Card deck box",
  group: "Boxes and stands",
  description:
    "A finger-joint box for a deck of playing cards, tarot cards or a card game, sized from the cards and how thick the deck is. A thumb notch in the front and back lets you pinch the cards out, and the lift-off lid has a plate under it that drops inside the walls so it stays on.",
  icon: '<path d="M10 10h28v32H10z"/><path d="M19 10a5 5 0 0 0 10 0" /><path d="M14 16h20v22H14z" opacity=".5"/><path d="M8 6h32v4H8z" opacity=".7"/>',
  inputs: (m) => [
    { key: "cardWidth", label: "Card width", kind: "number", unit: "mm", default: 63, min: 20, max: 250, help: "Playing cards are 63 × 88 mm; bridge 57 × 89; tarot 70 × 120." },
    { key: "cardHeight", label: "Card height", kind: "number", unit: "mm", default: 88, min: 20, max: 250 },
    { key: "deck", label: "Deck thickness", kind: "number", unit: "mm", default: 18, min: 3, max: 200, help: "Measure the stack: a deck of 54 cards is about 17–19 mm (more in sleeves)." },
    { key: "clearance", label: "Room round the cards", kind: "number", unit: "mm", default: 1, min: 0, max: 5, help: "Each side, so the deck slides in and out." },
    { key: "notch", label: "Thumb notch", kind: "number", unit: "mm", default: 24, min: 0, max: 100, help: "How wide the round notch is at the top of the front and back; 0 for none." },
    { key: "lid", label: "Lid", kind: "toggle", default: true, help: "A lift-off lid. Off: an open box." },
    thicknessInput(m, 1, 10),
    fingerInput(8),
  ],
  problems: deckProblems,
  make: (v, ids) => {
    const d = deckBox(v);
    const [W, D, H, t] = [d.b.W.v, d.b.D.v, d.b.H.v, d.b.t.v];
    const panels = new Map(panelOutlines(d.b).map((p) => [p.name, flat(p.nominal)]));
    const front = (name: string) => [makeShape(take(ids), `Deck box: ${name}`, [notchedFront(panels.get("front")!, W, H, d.notch)])];
    const pieces: Item[][] = [
      front("front"),
      front("back"),
      [shapeOf(ids, "Deck box: left end", [panels.get("left")!])],
      [shapeOf(ids, "Deck box: right end", [panels.get("left")!])],
      [shapeOf(ids, "Deck box: bottom", [panels.get("bottom")!])],
    ];
    if (d.lid) {
      const room = t + DECK_LID_ROOM;
      pieces.push([{ ...makeRect(take(ids), 0, 0, W, D), name: "Deck box: lid" }], [{ ...makeRect(take(ids), 0, 0, W - 2 * room, D - 2 * room), name: "Deck box: lid under-plate" }]);
    }
    const counts = fingerCounts(d.b);
    return {
      items: placed(inRows(pieces)),
      notes: [`${d.lid ? 7 : 5} pieces, ${mm(W)} × ${mm(D)} × ${mm(H)} outside; ${counts.width} fingers along the front, ${counts.height} up the corners.`, KERF_NOTE],
    };
  },
};

// ---------------------------------------------------------------------------
// Business card holder

/** How far the back leans from upright (degrees). */
export const LEAN = 15;
/** Room either side of the cards, between the sides (mm). */
export const CARD_ROOM = 1.5;

export function cardStand(v: Values): SideAssembly {
  const [cw, ch, stack, lip, t] = ["cardWidth", "cardHeight", "stack", "lip", "thickness"].map((k) => n(v, k));
  const m = Math.max(5, t);
  const zb = m + t;
  const backLen = r6(ch * 0.75);
  const angle = 90 - LEAN;
  const d: P2 = [Math.cos(rad(angle)), Math.sin(rad(angle))];
  const nrm: P2 = [-Math.sin(rad(angle)), Math.cos(rad(angle))];
  const lowBack: P2 = [m + t + stack + t * Math.sin(rad(angle)), zb];
  const centre: P2 = [r6(lowBack[0] + (backLen / 2) * d[0] + (t / 2) * nrm[0]), r6(lowBack[1] + (backLen / 2) * d[1] + (t / 2) * nrm[1])];
  const back: CrossPiece = { role: "back", label: "Back", centre, angle, length: backLen, tabs: evenTabs(backLen) };
  const sec = sectionOf(back, t);
  const baseEnd = Math.max(sec[0][0], sec[3][0]) + 4;
  const baseLen = r6(baseEnd - m);
  const base: CrossPiece = { role: "base", label: "Base", centre: [r6(m + baseLen / 2), r6(m + t / 2)], angle: 0, length: baseLen, tabs: evenTabs(baseLen) };
  const lipPiece: CrossPiece = { role: "lip", label: "Lip", centre: [r6(m + t / 2), r6(zb + lip / 2)], angle: 90, length: lip, tabs: evenTabs(lip, 1) };
  const pieces = [base, lipPiece, back];
  const hull = convexHull(pieces.flatMap((p) => sectionOf(p, t)));
  const side = round6(offsetPolygon(hull, m, 1.5));
  return { side, pieces, width: r6(cw + 2 * CARD_ROOM), t, kerf: 0 };
}

function standProblems(v: Values): string[] {
  const [t, lip] = ["thickness", "lip"].map((k) => n(v, k));
  if (lip < 3 * t + 3) return [`Make the lip at least ${mm(3 * t + 3)} tall, so its tabs hold.`];
  return assemblyProblems(cardStand(v));
}

const cardStandDesign: LibraryDesign = {
  id: "card-stand",
  name: "Business card holder",
  group: "Boxes and stands",
  description:
    "A desk holder for a stack of business cards: they stand on a base, leaning back against a sloping back, with a low lip in front. Two sides hold the pieces with tabs through slots. Set it for any card size — 85 × 55 mm is the usual one.",
  icon: '<path d="M6 40h36M10 40V30M36 40 30 12"/><path d="M14 38V18h12" opacity=".6"/><path d="M8 40l2-12h28l4 12" opacity=".4"/>',
  inputs: (m) => [
    { key: "cardWidth", label: "Card width", kind: "number", unit: "mm", default: 85, min: 30, max: 280, help: "The long side, standing level." },
    { key: "cardHeight", label: "Card height", kind: "number", unit: "mm", default: 55, min: 30, max: 200 },
    { key: "stack", label: "Stack thickness", kind: "number", unit: "mm", default: 15, min: 3, max: 60, help: "How thick a pile it holds." },
    { key: "lip", label: "Lip height", kind: "number", unit: "mm", default: 15, min: 8, max: 60 },
    thicknessInput(m),
  ],
  problems: standProblems,
  make: (v, ids) => ({
    items: placed(assemblyItems(cardStand(v), "Card holder", ids)),
    notes: [`5 pieces: 2 sides, a base, a lip and a back leaning ${LEAN}°; for cards ${mm(n(v, "cardWidth"))} wide.`, KERF_NOTE],
  }),
};

// ---------------------------------------------------------------------------
// Spice or bottle rack

/** Room between jars, and between a jar and the rails (mm). */
export const JAR_ROOM = 2;
/** Room above a jar, below the shelf over it, at least (mm, besides the shelf's thickness). */
export const HEADROOM = 12;
/** A jar is lifted this much higher than the front rail to take it out (mm). */
export const RAIL_LIFT = 5;

export interface SpiceRack {
  a: SideAssembly;
  depth: number;
  height: number;
  shelves: number[];
}

export function spiceRack(v: Values): SpiceRack {
  const [d, count, rows, tall, rail, t] = ["diameter", "count", "shelves", "jarHeight", "rail", "thickness"].map((k) => n(v, k));
  const m = Math.max(5, t);
  const width = r6(count * d + (count + 1) * JAR_ROOM);
  const depth = r6(2 * m + 2 * t + d + 2 * JAR_ROOM);
  const pitch = tall + Math.max(HEADROOM, rail + RAIL_LIFT) + t;
  const pieces: CrossPiece[] = [];
  const shelves: number[] = [];
  for (let i = 0; i < rows; i++) {
    const z0 = m + i * pitch;
    const top = r6(z0 + t);
    shelves.push(top);
    const k = i + 1;
    const len = depth - 2 * m;
    pieces.push({ role: k === 1 ? "shelf" : `shelf-${k}`, label: `Shelf ${k}`, centre: [r6(depth / 2), r6(z0 + t / 2)], angle: 0, length: r6(len), tabs: [[r6(len * 0.3), r6(len * 0.7)]] });
    const railTabs = evenTabs(rail, 1);
    pieces.push({ role: `rail-back-${k}`, label: `Back rail ${k}`, centre: [r6(m + t / 2), r6(top + rail / 2)], angle: 90, length: rail, tabs: railTabs });
    pieces.push({ role: `rail-front-${k}`, label: `Front rail ${k}`, centre: [r6(depth - m - t / 2), r6(top + rail / 2)], angle: 90, length: rail, tabs: railTabs });
  }
  const height = r6(shelves[shelves.length - 1] + rail + m);
  const side: P2[] = [
    [0, 0],
    [depth, 0],
    [depth, height],
    [0, height],
  ];
  return { a: { side, pieces, width, t, kerf: 0 }, depth, height, shelves };
}

function rackProblems(v: Values): string[] {
  const [t, rail] = ["thickness", "rail"].map((k) => n(v, k));
  if (rail < 3 * t + 3) return [`Make the rails at least ${mm(3 * t + 3)} tall, so their tabs hold.`];
  return assemblyProblems(spiceRack(v).a);
}

const spiceRackDesign: LibraryDesign = {
  id: "spice-rack",
  name: "Spice or bottle rack",
  group: "Home",
  description:
    "Shelves for spice jars or small bottles, sized from your jars: how wide they are, how tall, and how many on each shelf. A low rail along the front and back of each shelf stops them sliding off. The shelves and rails have tabs that go through slots in the two sides.",
  icon: '<path d="M6 4v40M42 4v40M6 18h36M6 34h36"/><path d="M10 18V9h6v9M20 18V8h6v10M30 18V9h6v9M10 34v-9h6v9M20 34v-10h6v10M30 34v-9h6v9" opacity=".6"/>',
  inputs: (m) => [
    { key: "diameter", label: "Jar diameter", kind: "number", unit: "mm", default: 45, min: 15, max: 150, help: "Measure the widest part of your jars or bottles." },
    { key: "jarHeight", label: "Jar height", kind: "number", unit: "mm", default: 100, min: 20, max: 280 },
    { key: "count", label: "Jars on each shelf", kind: "count", default: 4, min: 1, max: 12 },
    { key: "shelves", label: "Shelves", kind: "count", default: 3, min: 1, max: 6 },
    { key: "rail", label: "Rail height", kind: "number", unit: "mm", default: 20, min: 10, max: 80, help: "The low rails along the front and back of each shelf." },
    thicknessInput(m),
  ],
  problems: rackProblems,
  make: (v, ids) => {
    const r = spiceRack(v);
    return {
      items: placed(assemblyItems(r.a, "Spice rack", ids)),
      notes: [`${n(v, "shelves") * n(v, "count")} jars; ${mm(r.a.width + 2 * r.a.t)} wide, ${mm(r.height)} tall; ${r.a.pieces.length + 2} pieces.`, KERF_NOTE],
    };
  },
};

// ---------------------------------------------------------------------------
// Tealight lantern

/** More holes than this on one wall is too slow to cut. */
export const MAX_HOLES = 300;

export function lanternBox(v: Values): BoxSizes {
  const [s, h, t] = ["size", "height", "thickness"].map((k) => n(v, k));
  return { W: lit(s), D: lit(s), H: lit(h), t: lit(t), kerf: lit(0), lid: false, finger: n(v, "finger") };
}

/** Where a wall's pattern goes (its own across and up): clear of its fingers by the margin; the top edge is plain. */
export function patternWindow(v: Values, acrossWall: number): Box {
  const [h, t, m] = ["height", "thickness", "margin"].map((k) => n(v, k));
  return [t + m, t + m, acrossWall - t - m, h - m];
}

export function lanternHoles(v: Values): Hole[] {
  return patternHoles(String(v.pattern) as PatternKind, patternWindow(v, n(v, "size")), n(v, "shape"), n(v, "bridge"));
}

function lanternProblems(v: Values): string[] {
  const out = boxProblems(lanternBox(v));
  if (out.length) return out;
  const [shape, bridge, t] = ["shape", "bridge", "thickness"].map((k) => n(v, k));
  if (bridge < t / 2) return [`Make the bridges at least ${mm(t / 2)} wide for ${mm(t)} sheet, so they don't snap.`];
  const holes = lanternHoles(v);
  if (!holes.length) return ["The shapes are too big for the walls: make them smaller, or the lantern bigger."];
  if (holes.length > MAX_HOLES) return [`That's over ${MAX_HOLES} shapes on each wall: make them bigger.`];
  if (patternIslands(holes).nested) return ["Some shapes would sit inside others."];
  if (patternGap(holes, bridge - 1e-6) < bridge - 1e-6) return [`Some shapes come closer than ${mm(bridge)} to each other.`];
  if (shape < 4) out.push("Make the shapes at least 4 mm across, or they'll char rather than cut cleanly.");
  return out;
}

const holeOutline = (h: Hole): Outline => (h.kind === "circle" ? { segments: [{ kind: "circle", center: h.c, radius: h.d / 2 }], closed: true } : loopOf(h.points));

const lanternDesign: LibraryDesign = {
  id: "lantern",
  name: "Tealight lantern",
  group: "Home",
  description:
    "A square lantern with a pattern cut into its four walls — circles, diamonds, a honeycomb or stars — for the light to shine through. The walls and base are finger-jointed. Every shape is its own hole with sheet all round it, so nothing falls out. Use an LED tealight: never a real flame in a wooden lantern.",
  icon: '<path d="M10 12h28v32H10z"/><circle cx="18" cy="20" r="3"/><circle cx="30" cy="20" r="3"/><circle cx="24" cy="28" r="3"/><circle cx="18" cy="36" r="3"/><circle cx="30" cy="36" r="3"/><path d="M16 12l4-6h8l4 6" opacity=".5"/>',
  inputs: (m) => [
    { key: "size", label: "Width", kind: "number", unit: "mm", default: 90, min: 50, max: 280, help: "Outside, each way: the base is square." },
    { key: "height", label: "Height", kind: "number", unit: "mm", default: 130, min: 50, max: 280 },
    {
      key: "pattern",
      label: "Pattern",
      kind: "choice",
      default: "circles",
      choices: [
        { value: "circles", label: "Circles" },
        { value: "diamonds", label: "Diamonds" },
        { value: "hexagons", label: "Honeycomb" },
        { value: "stars", label: "Stars" },
      ],
    },
    { key: "shape", label: "Shape size", kind: "number", unit: "mm", default: 12, min: 4, max: 100, help: "How big each shape is across (corner to corner; flat to flat for the honeycomb)." },
    { key: "bridge", label: "Bridge width", kind: "number", unit: "mm", default: 3, min: 1, max: 30, help: "The sheet left between shapes. Wider is stronger." },
    { key: "margin", label: "Plain border", kind: "number", unit: "mm", default: 8, min: 2, max: 60, help: "Uncut sheet round the pattern on each wall." },
    thicknessInput(m, 1, 10),
    fingerInput(10),
  ],
  problems: lanternProblems,
  make: (v, ids) => {
    const b = lanternBox(v);
    const panels = new Map(panelOutlines(b).map((p) => [p.name, flat(p.nominal)]));
    const holes = lanternHoles(v);
    const wall = (name: string, kind: "front" | "left") => [makeShape(take(ids), `Lantern: ${name}`, [loopOf(panels.get(kind)!), ...holes.map(holeOutline)])];
    const pieces: Item[][] = [wall("front", "front"), wall("back", "front"), wall("left side", "left"), wall("right side", "left"), [shapeOf(ids, "Lantern: base", [panels.get("bottom")!])]];
    return { items: placed(inRows(pieces)), notes: [`5 pieces: a base and 4 walls with ${holes.length} shapes each.`, "Use an LED tealight: never a real flame in a wooden lantern.", KERF_NOTE] };
  },
};

// ---------------------------------------------------------------------------
// Key rack

/** A hook's sizes (mm): the arm's height up the wall, the lip at its end, the tab's room at each end of the arm. */
export const HOOK = { arm: 12, lip: 8, lipThick: 6, tabRoom: 2 };
/** Screw holes: diameter, and how far in from the board's top corners. */
export const SCREW = { d: 4.5, inset: 12 };
/** Board kept between a screw hole or slot and the board's edge, at least (mm). */
export const EDGE_ROOM = 3;

export interface KeyRack {
  w: number;
  h: number;
  corner: number;
  hooks: number[];
  armY: number;
  reach: number;
  slots: P2[][];
  screws: P2[];
  /** The words, and where they may go. */
  words: string;
  room: [number, number, number, number];
}

export function keyRack(v: Values): KeyRack {
  const [w, h, count, reach, t] = ["width", "height", "hooks", "reach", "thickness"].map((k) => n(v, k));
  const corner = Math.min(n(v, "corner"), w / 2 - 1, h / 2 - 1);
  const armY = r6(-h / 2 + 12);
  const hooks = Array.from({ length: count }, (_, i) => r6(-w / 2 + (w * (i + 0.5)) / count));
  const [y0, y1] = [armY + HOOK.tabRoom, armY + HOOK.arm - HOOK.tabRoom];
  const slots = hooks.map((x) => round6([[x - t / 2, y0], [x + t / 2, y0], [x + t / 2, y1], [x - t / 2, y1]]));
  const screws: P2[] = v.screws === false ? [] : [[r6(-w / 2 + SCREW.inset), r6(h / 2 - SCREW.inset)], [r6(w / 2 - SCREW.inset), r6(h / 2 - SCREW.inset)]];
  const bottom = armY + HOOK.arm + HOOK.lip + 6;
  const side = v.screws === false ? 8 : SCREW.inset + SCREW.d / 2 + 4;
  return { w, h, corner, hooks, armY, reach, slots, screws, words: str(v, "text").trim(), room: [-w / 2 + side, bottom, w / 2 - side, h / 2 - 6] };
}

/** A hook's outline (y along the wall, z out from the board), anticlockwise. */
export function hookOutline(r: KeyRack, t: number): P2[] {
  const y = r.armY;
  const { arm, lip, lipThick, tabRoom } = HOOK;
  return round6([
    [y + tabRoom, -t],
    [y + arm - tabRoom, -t],
    [y + arm - tabRoom, 0],
    [y + arm, 0],
    [y + arm, r.reach - lipThick],
    [y + arm + lip, r.reach - lipThick],
    [y + arm + lip, r.reach],
    [y, r.reach],
    [y, 0],
    [y + tabRoom, 0],
  ]);
}

/** How far a point is inside a w × h rectangle with corners rounded r, centred on the origin (negative = outside). */
export function insideRounded(p: P2, w: number, h: number, r: number): number {
  const [x, y] = [Math.abs(p[0]), Math.abs(p[1])];
  const [cx, cy] = [w / 2 - r, h / 2 - r];
  if (x > cx && y > cy) return r - Math.hypot(x - cx, y - cy);
  return Math.min(w / 2 - x, h / 2 - y);
}

/** The least board left between any screw hole, slot or hook and the board's edge (mm). */
export function edgeRoom(r: KeyRack): number {
  const holes = r.screws.map((c) => insideRounded(c, r.w, r.h, r.corner) - SCREW.d / 2);
  const slots = r.slots.flatMap((q) => q.map((p) => insideRounded(p, r.w, r.h, r.corner)));
  const t = r.slots.length ? r.slots[0][1][0] - r.slots[0][0][0] : 0;
  const feet = r.hooks.flatMap((x) => [[x - t / 2, r.armY], [x + t / 2, r.armY], [x + t / 2, r.armY + HOOK.arm + HOOK.lip], [x - t / 2, r.armY + HOOK.arm + HOOK.lip]] as P2[]).map((p) => insideRounded(p, r.w, r.h, r.corner));
  return Math.min(Infinity, ...holes, ...slots, ...feet);
}

const rackWords = (r: KeyRack, v: Values, id = "words"): Item | null => (r.words ? wordsAt(id, "Key rack words", r.words, n(v, "letters"), font(v), 0, r6((r.room[1] + r.room[3]) / 2)) : null);

function keyRackProblems(v: Values): string[] {
  const r = keyRack(v);
  const missing = r.words ? textOutline(FONTS[font(v)], r.words, 10).missing : [];
  if (missing.length) return [`The font hasn't got these letters: ${missing.join(" ")}. Use plain letters, numbers and punctuation.`];
  if (r.reach < HOOK.lipThick + 10) return [`Make the hooks reach out at least ${mm(HOOK.lipThick + 10)}.`];
  if (r.hooks.length > 1 && r.w / r.hooks.length < 20) return [`That's too many hooks for the board: at most ${Math.floor(r.w / 20)}.`];
  if (edgeRoom(r) < EDGE_ROOM) return [`The corners are rounded too much: the ${r.screws.length && Math.min(...r.screws.map((c) => insideRounded(c, r.w, r.h, r.corner) - SCREW.d / 2)) < EDGE_ROOM ? "screw holes" : "end hooks"} would come too near the edge. Round the corners less.`];
  if (r.room[3] - r.room[1] < 8) return ["The board isn't tall enough for words over the hooks: make it taller."];
  const words = rackWords(r, v);
  const box = words && itemBox(words);
  if (box && (box[0] < r.room[0] || box[2] > r.room[2] || box[1] < r.room[1] || box[3] > r.room[3]))
    return [`The words don't fit above the hooks (they're ${mm(box[2] - box[0])} × ${mm(box[3] - box[1])}): make the letters smaller or the board bigger.`];
  return [];
}

const keyRackDesign: LibraryDesign = {
  id: "key-rack",
  name: "Key rack",
  group: "Home",
  description:
    "A board for the wall with words engraved across the top and a row of hooks for keys, lanyards or dog leads. Each hook has a tab that slots into the board — glue it in. Two screw holes hang it up.",
  icon: '<rect x="4" y="10" width="40" height="28" rx="3"/><path d="M12 16h24" opacity=".6"/><path d="M12 30v6h3M22 30v6h3M32 30v6h3"/><circle cx="8" cy="14" r="1.2"/><circle cx="40" cy="14" r="1.2"/>',
  inputs: (m) => [
    { key: "text", label: "Words", kind: "text", default: "KEYS" },
    fontChoice("inter-bold"),
    { key: "letters", label: "Letter height", kind: "number", unit: "mm", default: 20, min: 4, max: 150 },
    { key: "width", label: "Board width", kind: "number", unit: "mm", default: 240, min: 60, max: 580 },
    { key: "height", label: "Board height", kind: "number", unit: "mm", default: 100, min: 50, max: 280 },
    { key: "hooks", label: "Hooks", kind: "count", default: 5, min: 1, max: 20 },
    { key: "reach", label: "Hook reach", kind: "number", unit: "mm", default: 30, min: 16, max: 100, help: "How far the hooks stick out from the wall." },
    { key: "corner", label: "Corner rounding", kind: "number", unit: "mm", default: 8, min: 0, max: 60 },
    { key: "screws", label: "Screw holes", kind: "toggle", default: true, help: "Two holes near the top corners, for 4 mm screws." },
    thicknessInput(m, 2, 10),
  ],
  problems: keyRackProblems,
  make: (v, ids) => {
    const r = keyRack(v);
    const t = n(v, "thickness");
    const group = `keyrack-${take(ids)}`;
    const board: Item[] = [{ ...makeRect(take(ids), -r.w / 2, -r.h / 2, r.w, r.h), name: "Key rack board", radius: Math.max(0, r.corner), group }];
    r.screws.forEach((c, i) => board.push({ ...makeCircle(take(ids), c[0], c[1], SCREW.d / 2), name: `Key rack screw hole ${i + 1}`, group }));
    board.push({ ...shapeOf(ids, "Key rack slots", r.slots), group });
    const words = rackWords(r, v, take(ids));
    if (words) board.push({ ...words, group });
    // Hooks lie flat: their length (z, out from the board) along x, the wall's direction (y) up.
    const hook = hookOutline(r, t).map(([y, z]) => [z, y] as P2);
    const hooks = r.hooks.map((_, i) => [shapeOf(ids, `Key rack hook ${i + 1}`, [hook])]);
    return {
      items: placed(inRows([board, ...hooks])),
      notes: [`A ${mm(r.w)} × ${mm(r.h)} board and ${r.hooks.length} hook${r.hooks.length === 1 ? "" : "s"}. Glue each hook's tab into its slot.`, KERF_NOTE],
    };
  },
};

// ---------------------------------------------------------------------------
// Dice tower

/** The exit ramp's slope (degrees): steep enough that dice roll out. */
export const RAMP_ANGLE = 25;
/** Openings (between a baffle's end and the wall, the exit) are this many times the biggest die. */
export const DIE_ROOM = 1.35;

export interface DiceTower {
  a: SideAssembly;
  xa: number;
  xb: number;
  inside: number;
  exit: number;
  ends: { x: number; z: number; down: 1 | -1 }[];
}

/** A piece's cross-section from its top side's two ends (P higher, Q lower) — length, angle, middle. */
function fromTop(role: string, label: string, P: P2, Q: P2, t: number): CrossPiece {
  const [dx, dz] = [Q[0] - P[0], Q[1] - P[1]];
  const length = Math.hypot(dx, dz);
  let angle = (Math.atan2(dz, dx) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  const nrm: P2 = [-Math.sin(rad(angle)), Math.cos(rad(angle))];
  const centre: P2 = [r6((P[0] + Q[0]) / 2 - (t / 2) * nrm[0]), r6((P[1] + Q[1]) / 2 - (t / 2) * nrm[1])];
  return { role, label, centre, angle: r6(angle), length: r6(length), tabs: evenTabs(length) };
}

export function diceTower(v: Values): DiceTower {
  const [B, D, H, die, t] = ["width", "depth", "height", "die", "thickness"].map((k) => n(v, k));
  const count = n(v, "baffles");
  const theta = n(v, "angle");
  const m = Math.max(5, t);
  const xa = m + t;
  const xb = D - m - t;
  const inside = xb - xa;
  const pieces: CrossPiece[] = [];
  pieces.push({ role: "back", label: "Back", centre: [r6(m + t / 2), r6(H / 2)], angle: 90, length: H, tabs: evenTabs(H) });
  const phi = rad(RAMP_ANGLE);
  const Q: P2 = [D - m, t * Math.cos(phi)];
  const Px = xa + t * Math.sin(phi);
  const P: P2 = [Px, Q[1] + (Q[0] - Px) * Math.tan(phi)];
  pieces.push(fromTop("ramp", "Ramp", P, Q, t));
  const rampTop = (x: number) => Q[1] + (Q[0] - x) * Math.tan(phi);
  const exit = r6(rampTop(xb) + DIE_ROOM * die);
  pieces.push({ role: "front", label: "Front", centre: [r6(xb + t / 2), r6((exit + H) / 2)], angle: 90, length: r6(H - exit), tabs: evenTabs(H - exit) });
  const th = rad(theta);
  const reach = inside - DIE_ROOM * die;
  const top = H - 1.5 * die;
  const step = (top - P[1]) / count;
  const ends: DiceTower["ends"] = [];
  for (let i = 1; i <= count; i++) {
    const z = P[1] + i * step;
    const fromFront = i % 2 === 1;
    const hx = fromFront ? xb - t * Math.sin(th) : xa + t * Math.sin(th);
    const lx = fromFront ? xb - reach : xa + reach;
    const hi: P2 = [hx, z];
    const lo: P2 = [lx, z - Math.abs(hx - lx) * Math.tan(th)];
    pieces.push(fromTop(`baffle-${i}`, `Baffle ${i}`, hi, lo, t));
    ends.push({ x: lx, z: lo[1], down: fromFront ? -1 : 1 });
  }
  const side: P2[] = [
    [0, 0],
    [D, 0],
    [D, H],
    [0, H],
  ];
  return { a: { side, pieces, width: B, t, kerf: 0 }, xa, xb, inside, exit, ends };
}

/** The height of a piece's top side at x (null where it doesn't reach). */
function topAt(p: CrossPiece, t: number, x: number): number | null {
  const s = sectionOf(p, t);
  const [top0, top1] = [s[3], s[2]];
  const [x0, x1] = [Math.min(top0[0], top1[0]), Math.max(top0[0], top1[0])];
  if (x < x0 - 1e-9 || x > x1 + 1e-9 || Math.abs(top1[0] - top0[0]) < 1e-9) return null;
  return top0[1] + ((x - top0[0]) / (top1[0] - top0[0])) * (top1[1] - top0[1]);
}

export function towerProblems(v: Values): string[] {
  const [B, die, t] = ["width", "die", "thickness"].map((k) => n(v, k));
  if (B < die * 1.5) return [`Make the inside at least ${mm(Math.ceil(die * 1.5))} wide for dice that big.`];
  const d = diceTower(v);
  if (d.inside < 3 * die) return [`The tower isn't deep enough for dice that big: make it at least ${mm(Math.ceil(3 * die + 2 * Math.max(5, t) + 2 * t))} deep.`];
  const below = d.a.pieces.filter((p) => p.role === "ramp" || p.role.startsWith("baffle"));
  for (let i = 0; i < d.ends.length; i++) {
    const end = d.ends[i];
    const floor = topAt(below[i], t, end.x) ?? 0;
    const bottom = end.z - t / Math.cos(rad(n(v, "angle")));
    if (bottom - floor < DIE_ROOM * die) return ["The baffles are too close together for dice that big: make the tower taller, or use fewer baffles."];
  }
  if (d.exit > n(v, "height") / 2) return ["The tower is too short: make it taller."];
  return assemblyProblems(d.a);
}

const diceTowerDesign: LibraryDesign = {
  id: "dice-tower",
  name: "Dice tower",
  group: "Toys and gifts",
  description:
    "Drop dice in at the top: they tumble down sloping baffles inside and roll out of the opening at the bottom of the front. Two sides hold the back, the front, the baffles and the ramp with tabs through slots — glue it, or leave it as a push-fit.",
  icon: '<path d="M14 4h20v40H14z"/><path d="M14 16l14 6M34 24l-14 6M14 34l20 8" opacity=".7"/><rect x="36" y="36" width="8" height="8" rx="1.5"/>',
  inputs: (m) => [
    { key: "width", label: "Inside width", kind: "number", unit: "mm", default: 70, min: 30, max: 280, help: "Between the two sides." },
    { key: "depth", label: "Depth", kind: "number", unit: "mm", default: 90, min: 50, max: 280, help: "Front to back, outside." },
    { key: "height", label: "Height", kind: "number", unit: "mm", default: 200, min: 100, max: 580 },
    { key: "die", label: "Biggest die", kind: "number", unit: "mm", default: 22, min: 8, max: 50, help: "A standard die is 16 mm; a D20 about 22 mm." },
    { key: "baffles", label: "Baffles", kind: "count", default: 2, min: 1, max: 5, help: "Slopes inside, besides the ramp at the bottom." },
    { key: "angle", label: "Baffle slope", kind: "count", default: 40, min: 30, max: 60, help: "Degrees from level." },
    thicknessInput(m),
  ],
  problems: towerProblems,
  make: (v, ids) => {
    const d = diceTower(v);
    return {
      items: placed(assemblyItems(d.a, "Dice tower", ids)),
      notes: [`${d.a.pieces.length + 2} pieces: 2 sides, back, front, ramp and ${n(v, "baffles")} baffle${n(v, "baffles") === 1 ? "" : "s"}; the exit is ${mm(d.exit)} high.`, KERF_NOTE],
    };
  },
};

// ---------------------------------------------------------------------------
// Name puzzle

/** The thinnest strip of board allowed between two holes (mm). */
export const MIN_BRIDGE = 3;

export interface PuzzleLetter {
  ch: string;
  outers: P2[][];
  counters: P2[][];
  box: Box;
}

export interface NamePuzzle {
  letters: PuzzleLetter[];
  w: number;
  h: number;
  r: number;
}

const cache = new Map<string, NamePuzzle>();

export function namePuzzle(v: Values): NamePuzzle {
  const key = JSON.stringify([v.text, v.font, v.height, v.gap, v.margin]);
  const known = cache.get(key);
  if (known) return known;
  const [cap, gap, margin] = ["height", "gap", "margin"].map((k) => n(v, k));
  const f = FONTS[font(v)];
  const letters: PuzzleLetter[] = [];
  let x = 0;
  for (const ch of Array.from(str(v, "text").trim())) {
    if (!ch.trim()) {
      x += cap * 0.5;
      continue;
    }
    const contours = textOutline(f, ch, cap).loops.map((l) => pathPoints(l, true, 0.02) as P2[]);
    if (!contours.length) continue;
    const dep = depths(contours);
    const outers = contours.filter((_, i) => dep[i] % 2 === 0);
    const counters = contours.filter((_, i) => dep[i] % 2 === 1);
    const b = boxOf(outers.flat());
    const [dx, dy] = [x - b[0], -(b[1] + b[3]) / 2];
    const move = (c: P2[]) => round6(c.map(([px, py]) => [px + dx, py + dy] as P2));
    letters.push({ ch, outers: outers.map(move), counters: counters.map(move), box: [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy] });
    x += b[2] - b[0] + gap;
  }
  const width = letters.length ? letters[letters.length - 1].box[2] - letters[0].box[0] : 0;
  const shift = letters.length ? -letters[0].box[0] - width / 2 : 0;
  for (const l of letters) {
    l.outers = l.outers.map((c) => round6(c.map(([px, py]) => [px + shift, py] as P2)));
    l.counters = l.counters.map((c) => round6(c.map(([px, py]) => [px + shift, py] as P2)));
    l.box = [l.box[0] + shift, l.box[1], l.box[2] + shift, l.box[3]];
  }
  const tall = letters.reduce((mx, l) => Math.max(mx, l.box[3] - l.box[1]), 0);
  const out: NamePuzzle = { letters, w: Math.round((width + 2 * margin) * 1000) / 1000, h: Math.round((tall + 2 * margin) * 1000) / 1000, r: Math.min(10, margin) };
  if (cache.size > 20) cache.clear();
  cache.set(key, out);
  return out;
}

/** A letter's holes in the board (its outlines moved out by the play). */
export const holesOf = (l: PuzzleLetter, play: number) => l.outers.map((c) => round6(offsetPolygon(c, play)));

function namePuzzleProblems(v: Values): string[] {
  const words = str(v, "text").trim();
  const missing = words ? textOutline(FONTS[font(v)], words, 10).missing : [];
  if (missing.length) return [`The font hasn't got these letters: ${missing.join(" ")}. Use plain letters, numbers and punctuation.`];
  const p = namePuzzle(v);
  if (!p.letters.length) return ["Type a name."];
  if (!fitsBed(p.w, p.h)) return [`The board would be ${mm(p.w)} × ${mm(p.h)}: too big for the laser's 600 × 300 mm bed. Use smaller letters or a shorter name.`];
  const [play, t] = ["play", "thickness"].map((k) => n(v, k));
  const holes = p.letters.flatMap((l, i) => holesOf(l, play).map((c) => ({ i, c, box: boxOf(c) })));
  const room = Math.max(MIN_BRIDGE, t);
  for (let a = 0; a < holes.length; a++)
    for (let b = a + 1; b < holes.length; b++) {
      const [A, B] = [holes[a], holes[b]];
      const far = Math.hypot(Math.max(0, A.box[0] - B.box[2], B.box[0] - A.box[2]), Math.max(0, A.box[1] - B.box[3], B.box[1] - A.box[3]));
      if (far >= room) continue;
      if (outlineGap(A.c, B.c, room) < room) {
        const ch = p.letters[A.i].ch;
        return [A.i === B.i ? `The two parts of "${ch}" are too close together to cut apart: use capital letters, or make the letters bigger.` : `The letters would be less than ${mm(room)} apart: make the gap between letters bigger.`];
      }
    }
  for (const l of p.letters)
    for (const c of [...l.outers, ...l.counters, ...holesOf(l, play)]) if (crossesItself(c)) return [`"${l.ch}" has corners too sharp for that much room round it: use less room round the letters.`];
  return [];
}

const namePuzzleDesign: LibraryDesign = {
  id: "name-puzzle",
  name: "Name puzzle",
  group: "Toys and gifts",
  description:
    "A child's name as a puzzle: each letter is a piece cut out of a board, to take out and put back in its own letter-shaped hole. With the backing board glued underneath, the holes become trays the letters sit in. Thick, chunky letters work best; sand the edges smooth for small hands.",
  icon: '<rect x="4" y="12" width="40" height="24" rx="3"/><path d="M10 31l5-14 5 14M12 26h6"/><path d="M24 17v14h7" /><path d="M34 31V17h4a4 4 0 0 1 0 8h-4" opacity=".6"/>',
  inputs: (m) => [
    { key: "text", label: "Name", kind: "text", default: "ALEX", help: "Up to 12 letters. Capitals are chunkiest." },
    fontChoice("inter-bold"),
    { key: "height", label: "Letter height", kind: "number", unit: "mm", default: 50, min: 20, max: 200, help: "How tall the capital letters are." },
    { key: "gap", label: "Gap between letters", kind: "number", unit: "mm", default: 8, min: 3, max: 50, help: "Board left between the holes." },
    { key: "margin", label: "Border", kind: "number", unit: "mm", default: 12, min: 6, max: 60, help: "Board round the letters." },
    { key: "play", label: "Room round each letter", kind: "number", unit: "mm", default: 0.3, min: 0, max: 2, help: "How much bigger each hole is than its letter, all round, so little fingers can drop it in." },
    { key: "backing", label: "Backing board", kind: "toggle", default: true, help: "A plain board glued under the board, so the letters sit in trays." },
    thicknessInput(m, 1, 12, "6 mm plywood or MDF makes sturdy pieces."),
  ],
  problems: (v) => (Array.from(str(v, "text").trim()).length > 12 ? ["Up to 12 letters, please."] : namePuzzleProblems(v)),
  make: (v, ids) => {
    const p = namePuzzle(v);
    const play = n(v, "play");
    const group = `namepuzzle-${take(ids)}`;
    const board: Item[] = [
      { ...makeRect(take(ids), -p.w / 2, -p.h / 2, p.w, p.h), name: "Name puzzle board", radius: p.r, group },
      { ...shapeOf(ids, "Name puzzle holes", p.letters.flatMap((l) => holesOf(l, play))), group },
    ];
    const pieces: Item[][] = [board];
    if (v.backing !== false) pieces.push([{ ...makeRect(take(ids), 0, 0, p.w, p.h), name: "Name puzzle backing board", radius: p.r }]);
    pieces.push(p.letters.map((l) => shapeOf(ids, `Name puzzle letter ${l.ch}`, [...l.outers, ...l.counters])));
    return {
      items: placed(inRows(pieces, 8)),
      notes: [`${p.letters.length} letter piece${p.letters.length === 1 ? "" : "s"} in a ${mm(p.w)} × ${mm(p.h)} board${v.backing !== false ? ", with a backing board" : ""}.`, "Leave “Allow for the kerf” on: the letters come out their true size and the holes just the room you set bigger."],
    };
  },
};

export const LASER_DESIGNS_4: LibraryDesign[] = [hingeBoxDesign, deckBoxDesign, cardStandDesign, spiceRackDesign, lanternDesign, keyRackDesign, diceTowerDesign, namePuzzleDesign];
