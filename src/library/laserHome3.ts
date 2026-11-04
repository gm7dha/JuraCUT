/**
 * Laser designs for the home: a clock face, cord winders and a tealight holder. JuraCAD's
 * src/library/designs/laserHome3.ts with flat shapes instead of sketches: keep the two in step.
 */
import { isFontId, type FontId } from "../geometry/text";
import { itemBox, makeCircle, makeLine, makeRect, makeShape } from "../model/shapes";
import type { Item } from "../model/types";
import { fontChoice, inRows, loopOf, mm, n, placed, r6, take, wordsAt, type LibraryDesign, type Values } from "./kit";

type P2 = [number, number];
type Box = [number, number, number, number];

const fontOf = (v: Values): FontId => (isFontId(v.font) ? v.font : "inter-bold");

// ---------------------------------------------------------------------------
// Clock face

/** How far in from the edge the hour marks start (mm). */
export const CLOCK_EDGE = 5;
/** Room left clear round the centre hole for the movement's nut and the hands' hub (mm, beyond the hole). */
export const HUB_ROOM = 10;

export interface ClockLayout {
  R: number;
  hole: number;
  /** Hour marks: each [angle (degrees, anticlockwise from 3 o'clock), inner radius, outer radius]. */
  marks: [number, number, number][];
  /** The numbers, each centred on its point. */
  numbers: { text: string; at: P2 }[];
  height: number;
  /** Marks as engraved bars (letter I) or scored lines. */
  style: "engrave" | "score" | "none";
}

export function clockLayout(v: Values): ClockLayout {
  const R = n(v, "diameter") / 2;
  const m = n(v, "mark");
  const outer = R - CLOCK_EDGE;
  const style = v.marks === "score" ? "score" : v.marks === "none" ? "none" : "engrave";
  const marks: [number, number, number][] =
    style === "none" ? [] : Array.from({ length: 12 }, (_, h) => [r6(90 - 30 * h), outer - (h % 3 === 0 ? 1.5 * m : m), outer] as [number, number, number]);
  const h = n(v, "height");
  const show = v.numbers === "all" ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : v.numbers === "quarters" ? [12, 3, 6, 9] : [];
  const ring = outer - (style === "none" ? 0 : 1.5 * m) - 3 - h * 0.85;
  const numbers = show.map((k) => {
    const a = ((90 - 30 * (k % 12)) * Math.PI) / 180;
    return { text: String(k), at: [r6(ring * Math.cos(a)), r6(ring * Math.sin(a))] as P2 };
  });
  return { R, hole: n(v, "hole"), marks, numbers, height: h, style };
}

/** The clock's shapes, centred on (0, 0): outline, centre hole, marks and numbers. */
function clockItems(v: Values, ids: Set<string>): Item[] {
  const L = clockLayout(v);
  const group = `clock-${take(ids)}`;
  const items: Item[] = [
    { ...makeCircle(take(ids), 0, 0, L.R), name: "Clock face", group },
    { ...makeCircle(take(ids), 0, 0, L.hole / 2), name: "Clock centre hole", group },
  ];
  L.marks.forEach(([deg, r0, r1], k) => {
    const a = (deg * Math.PI) / 180;
    const name = `Clock mark ${k === 0 ? 12 : k}`;
    if (L.style === "score") items.push({ ...makeLine(take(ids), r6(r0 * Math.cos(a)), r6(r0 * Math.sin(a)), r6(r1 * Math.cos(a)), r6(r1 * Math.sin(a))), name, op: "score", group });
    // An engraved capital I, as tall as the mark, turned to point at the centre.
    else items.push({ ...wordsAt(take(ids), name, "I", r1 - r0, fontOf(v), r6(((r0 + r1) / 2) * Math.cos(a)), r6(((r0 + r1) / 2) * Math.sin(a)), r6(deg - 90)), group });
  });
  for (const k of L.numbers) items.push({ ...wordsAt(take(ids), `Clock ${k.text}`, k.text, L.height, fontOf(v), k.at[0], k.at[1]), group });
  return items;
}

function clockProblems(v: Values): string[] {
  const L = clockLayout(v);
  const out: string[] = [];
  if (L.hole > L.R) return ["The centre hole is bigger than the clock."];
  const m = n(v, "mark");
  if (L.style !== "none" && L.R - CLOCK_EDGE - 1.5 * m < L.hole / 2 + HUB_ROOM) out.push("The hour marks are too long for the clock: make them shorter.");
  if (out.length || !L.numbers.length) return out;
  const boxes = clockItems(v, new Set())
    .filter((it) => it.kind === "text" && /^Clock \d+$/.test(it.name))
    .map(itemBox)
    .filter((b): b is Box => b !== null);
  const reach = (b: Box) => Math.max(...[[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map(([x, y]) => Math.hypot(x, y)));
  const near = (b: Box) => Math.hypot(Math.max(b[0], 0, -b[2]), Math.max(b[1], 0, -b[3]));
  const markIn = L.R - CLOCK_EDGE - (L.style === "none" ? 0 : 1.5 * m);
  if (boxes.some((b) => reach(b) > markIn - 1)) out.push("The numbers are too big to fit inside the hour marks: make them smaller.");
  else if (boxes.some((b) => near(b) < L.hole / 2 + HUB_ROOM)) out.push("The numbers come too close to the centre: make them smaller or the clock bigger.");
  else if (boxes.some((a, i) => boxes.some((b, j) => j > i && a[0] < b[2] + 1 && b[0] < a[2] + 1 && a[1] < b[3] + 1 && b[1] < a[3] + 1))) out.push("The numbers run into each other: make them smaller or the clock bigger.");
  return out;
}

const clockFace: LibraryDesign = {
  id: "clock-face",
  name: "Clock face",
  group: "Home",
  description:
    "A round clock face with hour marks, numbers if you like, and a hole in the middle for a battery quartz clock movement (the kind sold with hands). The outline and hole are cut, the numbers engraved, and the marks engraved or scored.",
  icon: '<circle cx="24" cy="24" r="19"/><path d="M24 8v4M24 36v4M8 24h4M36 24h4" /><path d="M24 24V15M24 24l6 4" /><circle cx="24" cy="24" r="1.5"/>',
  inputs: () => [
    { key: "diameter", label: "Diameter", kind: "number", unit: "mm", default: 250, min: 80, max: 290, help: "The R1's bed is 300 mm deep." },
    { key: "hole", label: "Centre hole", kind: "number", unit: "mm", default: 8, min: 3, max: 15, help: "Measure your movement's threaded tube: most need 7.5–8 mm." },
    {
      key: "marks",
      label: "Hour marks",
      kind: "choice",
      default: "engrave",
      choices: [
        { value: "engrave", label: "Engraved bars" },
        { value: "score", label: "Scored lines" },
        { value: "none", label: "None" },
      ],
    },
    { key: "mark", label: "Mark length", kind: "number", unit: "mm", default: 12, min: 3, max: 60, help: "12, 3, 6 and 9 o'clock are half as long again." },
    {
      key: "numbers",
      label: "Numbers",
      kind: "choice",
      default: "all",
      choices: [
        { value: "all", label: "1 to 12" },
        { value: "quarters", label: "12, 3, 6, 9" },
        { value: "none", label: "None" },
      ],
    },
    { key: "height", label: "Number height", kind: "number", unit: "mm", default: 18, min: 4, max: 80 },
    fontChoice("inter-bold"),
  ],
  problems: clockProblems,
  make: (v, ids) => {
    const L = clockLayout(v);
    return {
      items: placed(clockItems(v, ids)),
      notes: [`${mm(2 * L.R)} across, ${mm(L.hole)} centre hole, ${L.marks.length} hour marks${L.numbers.length ? ` and ${L.numbers.length} numbers` : ""}.`],
    };
  },
};

// ---------------------------------------------------------------------------
// Cord winders

/**
 * A winder `length` long and `width` wide (an H, centred on 0, 0, anticlockwise): notches `depth` deep cut into both
 * long sides between two ends, and a slit as deep as the notch down into the top of the right-hand end, to grip the
 * cord's tail.
 */
export function winderShape(v: Values): { outline: P2[]; pitch: number } {
  const [L, W, N, s] = [n(v, "length"), n(v, "width"), n(v, "notch"), n(v, "cord")];
  const E = Math.max(10, Math.round(L * 0.18));
  const [x0, x1, y0, y1] = [-L / 2, L / 2, -W / 2, W / 2];
  const slitX = x1 - E / 2;
  const outline: P2[] = [
    [x0, y0],
    [x0 + E, y0],
    [x0 + E, y0 + N],
    [x1 - E, y0 + N],
    [x1 - E, y0],
    [x1, y0],
    [x1, y1],
    [slitX + s / 2, y1],
    [slitX + s / 2, y1 - N],
    [slitX - s / 2, y1 - N],
    [slitX - s / 2, y1],
    [x1 - E, y1],
    [x1 - E, y1 - N],
    [x0 + E, y1 - N],
    [x0 + E, y1],
    [x0, y1],
  ].map(([x, y]) => [r6(x), r6(y)] as P2);
  return { outline, pitch: W + 5 };
}

const cordWinder: LibraryDesign = {
  id: "cord-winder",
  name: "Cord winders",
  group: "Home",
  description:
    "Flat H-shaped winders to keep earphone, charger and fairy-light cables tidy: wind the cable round the middle and tuck its end into the slit. A set of them side by side. Plywood or 2–3 mm acrylic.",
  icon: '<path d="M8 10h8v8h16v-8h8v28h-8v-8H16v8H8z"/><path d="M36 10v5" /><path d="M16 22h16M16 26h16" opacity=".5"/>',
  inputs: () => [
    { key: "length", label: "Length", kind: "number", unit: "mm", default: 70, min: 30, max: 300 },
    { key: "width", label: "Width", kind: "number", unit: "mm", default: 40, min: 20, max: 200 },
    { key: "notch", label: "Notch depth", kind: "number", unit: "mm", default: 10, min: 3, max: 80, help: "How deep the cable sits: deeper holds more." },
    { key: "cord", label: "Slit width", kind: "number", unit: "mm", default: 2.5, min: 0.8, max: 10, help: "A little less than the cable's thickness, so it grips." },
    { key: "count", label: "How many", kind: "count", default: 4, min: 1, max: 12 },
  ],
  problems: (v) => {
    const [L, W, N, s] = [n(v, "length"), n(v, "width"), n(v, "notch"), n(v, "cord")];
    const E = Math.max(10, Math.round(L * 0.18));
    const out: string[] = [];
    if (2 * N > W - 8) out.push(`The notches are too deep for the width: at most ${mm((W - 8) / 2)}.`);
    if (L - 2 * E < 10) out.push("The winder is too short: make it longer.");
    if (s > E - 4) out.push(`The slit is too wide for the ends: at most ${mm(E - 4)}.`);
    return out;
  },
  make: (v, ids) => {
    const w = winderShape(v);
    const count = n(v, "count");
    const items = Array.from({ length: count }, (_, i) => makeShape(take(ids), `Winder ${i + 1}`, [loopOf(w.outline.map(([x, y]) => [x, r6(y + i * w.pitch)]))]));
    return { items: placed(items), notes: [`${count} winder${count === 1 ? "" : "s"}, ${mm(n(v, "length"))} × ${mm(n(v, "width"))}.`] };
  },
};

// ---------------------------------------------------------------------------
// Tealight holder

/** Room round a tealight in its hole, all round (mm). */
export const TEALIGHT_ROOM = 0.75;

/** One layer's outline, centred on (cx, 0). */
function holderOutline(v: Values, ids: Set<string>, name: string, cx: number): Item {
  const size = n(v, "size");
  if (v.shape === "round") return { ...makeCircle(take(ids), cx, 0, size / 2), name };
  if (v.shape === "square") return { ...makeRect(take(ids), cx - size / 2, -size / 2, size, size), name };
  // Six-sided, `size` flat to flat.
  const pts = Array.from({ length: 6 }, (_, k) => [r6(cx + (size / Math.sqrt(3)) * Math.cos(((60 * k + 30) * Math.PI) / 180)), r6((size / Math.sqrt(3)) * Math.sin(((60 * k + 30) * Math.PI) / 180))] as P2);
  return makeShape(take(ids), name, [loopOf(pts)]);
}

const tealightHolder: LibraryDesign = {
  id: "tealight",
  name: "Tealight holder",
  group: "Home",
  description:
    "A holder for a tealight candle made of flat layers glued in a stack: a solid base, then rings with a hole the tealight drops into. Only ever use it with tealights in their metal cups, never a bare flame on wood.",
  icon: '<rect x="8" y="22" width="32" height="16" rx="2"/><path d="M16 22h16" /><path d="M24 20c-3-4 0-8 0-10 2 3 4 6 0 10z"/>',
  inputs: () => [
    {
      key: "shape",
      label: "Shape",
      kind: "choice",
      default: "hexagon",
      choices: [
        { value: "hexagon", label: "Six-sided" },
        { value: "round", label: "Round" },
        { value: "square", label: "Square" },
      ],
    },
    { key: "size", label: "Size", kind: "number", unit: "mm", default: 70, min: 50, max: 280, help: "Across (flat to flat for six-sided)." },
    { key: "candle", label: "Tealight diameter", kind: "number", unit: "mm", default: 38.5, min: 20, max: 80, help: "Most tealights are 38–39 mm across; the hole is 1.5 mm bigger." },
    { key: "rings", label: "Rings", kind: "count", default: 4, min: 1, max: 12, help: "Layers with a hole: 4 of 3 mm sheet hold a tealight 12 mm deep." },
  ],
  problems: (v) => {
    const hole = n(v, "candle") + 2 * TEALIGHT_ROOM;
    return n(v, "size") - hole < 10 ? [`The holder must be at least ${mm(hole + 10)} across for that tealight.`] : [];
  },
  make: (v, ids) => {
    const rings = n(v, "rings");
    const hole = n(v, "candle") + 2 * TEALIGHT_ROOM;
    const pieces: Item[][] = [[holderOutline(v, ids, "Tealight base", 0)]];
    for (let i = 1; i <= rings; i++) {
      const group = `tealight-ring-${take(ids)}`;
      pieces.push([
        { ...holderOutline(v, ids, `Tealight ring ${i}`, 0), group },
        { ...makeCircle(take(ids), 0, 0, hole / 2), name: `Tealight ring ${i} hole`, group },
      ]);
    }
    return {
      items: placed(inRows(pieces, 5)),
      notes: [`${rings + 1} layers: a base and ${rings} ring${rings === 1 ? "" : "s"} with a ${mm(hole)} hole. Glue them in a stack, the base at the bottom.`],
    };
  },
};

export const HOME_3: LibraryDesign[] = [clockFace, cordWinder, tealightHolder];
