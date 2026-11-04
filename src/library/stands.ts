/**
 * Two more of JuraCAD's laser designs: a flat-pack phone stand (a side profile
 * and two feet that slot together) and a rubber stamp (mirrored words, the
 * background engraved away). The maths is JuraCAD's standProfile.ts,
 * flatStand.ts and stamp.ts, in plain numbers: keep them in step.
 */
import { FONTS, textOutline } from "../geometry/text";
import type { Pt, Segment } from "../geometry/segments";
import { makeCircle, makeRect, makeShape, mirrorX, transformedItem } from "../model/shapes";
import type { Item, Outline } from "../model/types";
import { font, fontChoice, loopOf, n, placed, str, take, type LibraryDesign, type Values } from "./kit";

const mm = (v: number) => `${Math.round(v * 100) / 100} mm`;
const six = (v: number) => Math.round(v * 1e6) / 1e6;

// ---------------------------------------------------------------------------
// Flat-pack phone stand

export interface StandSizes {
  angle: number;
  slot: number;
  lip: number;
  back: number;
  bar: number;
}

/** The side view's corners (anticlockwise from the back of the foot): x forwards, y up, origin under the slot's back corner. */
export function standProfile(s: StandSizes) {
  const a = (s.angle * Math.PI) / 180;
  const sin = six(Math.sin(a));
  const cos = six(Math.cos(a));
  const perSin = six(1 / sin);
  const { slot, lip, back, bar } = s;
  const slotFront = slot * perSin;
  const lipFront = slotFront + bar;
  const lipTop = bar + lip;
  const rear = -(back * cos + bar * sin);
  const outline: Pt[] = [
    [rear, 0],
    [lipFront, 0],
    [lipFront, lipTop],
    [slotFront, lipTop],
    [slotFront, bar],
    [0, bar],
    [-back * cos, bar + back * sin],
    [rear, bar * (1 - cos) + back * sin],
    [-bar * perSin, bar],
    [rear, bar],
  ];
  return { outline, rear, slotFront, lipFront, cos };
}

/** The side profile with a notch up for each foot, and a foot with a notch down (each notch `kerf` narrower than the sheet). */
export function flatStandShapes(v: Values) {
  const bar = n(v, "bar");
  const t = n(v, "thickness");
  const foot = n(v, "foot");
  const kerf = n(v, "kerf");
  const p = standProfile({ angle: n(v, "angle"), slot: n(v, "slot"), lip: n(v, "lip"), back: n(v, "back"), bar });
  const notch = bar / 2;
  const inset = kerf / 2;
  const backAt = p.rear + bar - t / 2;
  const notchAt = (x0: number): Pt[] => [
    [x0 + inset, 0],
    [x0 + inset, notch],
    [x0 + t - inset, notch],
    [x0 + t - inset, 0],
  ];
  const [first, ...rest] = p.outline;
  const profile: Pt[] = [first, ...notchAt(backAt), ...notchAt(0), ...rest];
  const left = t / 2 - foot / 2;
  const right = t / 2 + foot / 2;
  const footShape: Pt[] = [
    [left, 0],
    [right, 0],
    [right, bar],
    [t - inset, bar],
    [t - inset, notch],
    [inset, notch],
    [inset, bar],
    [left, bar],
  ];
  return { profile, foot: footShape, backAt, cos: p.cos };
}

const flatStand: LibraryDesign = {
  id: "flat-stand",
  name: "Flat-pack phone stand",
  group: "Boxes and stands",
  icon: '<path d="M6 34h30l-10-24h-5l10 24" /><path d="M10 30v8M30 30v8" opacity=".55"/><path d="M4 38h10M24 38h12" />',
  description: "A phone stand cut from flat sheet: a side profile and two feet that slot together, no glue needed. The phone stands on the front foot, so it can't roll off sideways.",
  inputs: (m) => [
    { key: "angle", label: "Lean angle (degrees)", kind: "count", default: 65, min: 45, max: 85, help: "How far the screen leans back, from the table: 90 would be upright. 60–70 suits most people." },
    { key: "slot", label: "Slot (phone thickness)", kind: "number", unit: "mm", default: 12, min: 2, max: 60, help: "Your phone's thickness in its case, plus 1–2 mm." },
    { key: "lip", label: "Lip height", kind: "number", unit: "mm", default: 10, min: 2, max: 200 },
    { key: "back", label: "Back rest length", kind: "number", unit: "mm", default: 90, min: 20, max: 400, help: "Along the slope, from the slot to the top." },
    { key: "bar", label: "Bar width", kind: "number", unit: "mm", default: 15, min: 5, max: 100, help: "How wide the profile's strips are (and how tall the feet)." },
    { key: "foot", label: "Foot length", kind: "number", unit: "mm", default: 80, min: 20, max: 400, help: "Left to right: how wide a base it stands on." },
    { key: "thickness", label: "Material thickness", kind: "number", unit: "mm", default: m.thickness || 3, min: 1, max: 12, help: "Measure your sheet: 3 mm plywood is often 2.8–3.2 mm." },
    { key: "kerf", label: "Slot allowance", kind: "number", unit: "mm", default: 0, min: 0, max: 1, help: "The slots are drawn this much narrower so the pieces fit snugly. Leave at 0 if you tick “Allow for the kerf” when you export." },
  ],
  problems: (v) => {
    const out: string[] = [];
    const [slot, lip, back, bar, t, foot] = ["slot", "lip", "back", "bar", "thickness", "foot"].map((k) => n(v, k));
    const cos = Math.cos((n(v, "angle") * Math.PI) / 180);
    if (lip >= back) out.push(`The lip must be lower than the back rest is long (less than ${mm(back)}).`);
    if (back * cos < bar + 2) out.push(`The back rest is too short for the stand to lean: make it at least ${mm(Math.ceil(((bar + 2) / cos) * 10) / 10)} long, or the angle smaller.`);
    if (slot < 2) out.push("The slot must be at least 2 mm wide.");
    const along = slot / Math.sin((n(v, "angle") * Math.PI) / 180);
    if (along < t + 1) out.push(`The slot is too narrow for the front foot under it: make it at least ${mm(Math.ceil((t + 1) * Math.sin((n(v, "angle") * Math.PI) / 180) * 10) / 10)} wide.`);
    if (bar < 2 * t + 2) out.push(`The bars must be at least ${mm(2 * t + 2)} wide for the slots in them.`);
    if (foot < 2 * bar) out.push(`The feet must be at least ${mm(2 * bar)} long, so it doesn't fall over sideways.`);
    if (!out.length && flatStandShapes(v).backAt + t >= -1) out.push("The back rest is too short for the back foot: make it longer.");
    return out;
  },
  make: (v, ids) => {
    const s = flatStandShapes(v);
    const bar = n(v, "bar");
    const side = makeShape(take(ids), "Stand side", [loopOf(s.profile)]);
    const xs = s.profile.map((p) => p[0]);
    const gap = 6;
    const fx = Math.max(...xs) + gap - Math.min(...s.foot.map((p) => p[0]));
    const feet = [0, 1].map((i) =>
      makeShape(
        take(ids),
        i ? "Stand back foot" : "Stand front foot",
        [loopOf(s.foot.map(([x, y]): Pt => [x + fx, y + i * (bar + gap)]))],
      ),
    );
    return { items: placed([side, ...feet]), notes: ["3 pieces: the side and two feet. Slide the feet into the side's slots, notches together."] };
  },
};

// ---------------------------------------------------------------------------
// Rubber stamp

type P2 = [number, number];

/** A rectangle or circle outline centred on (0, 0). */
function outlineOf(round: boolean, [w, h]: P2): Outline {
  if (round) return { closed: true, segments: [{ kind: "circle", center: [0, 0], radius: w / 2 }] };
  return loopOf([
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ]);
}

export function stampLayout(v: Values) {
  const round = v.shape === "round";
  const w = n(v, "width");
  const h = round ? w : n(v, "depth");
  const edge = n(v, "edge");
  const line = v.border !== false ? n(v, "line") : 0;
  const outer: P2 = [w - 2 * edge, h - 2 * edge];
  const inner: P2 = [outer[0] - 2 * line, outer[1] - 2 * line];
  return { round, size: [w, h] as P2, border: v.border !== false ? { outer, inner } : null, room: [inner[0] - 2, inner[1] - 2] as P2 };
}

/** The words, mirrored left to right about x = 0 and centred on (0, 0). */
function mirroredWords(v: Values): Segment[][] {
  const { loops, box } = textOutline(FONTS[font(v)], str(v, "words").trim(), n(v, "height"), "centre");
  if (!box) return [];
  const dy = -(box[1] + box[3]) / 2;
  const dx = -(box[0] + box[2]) / 2;
  const moved = makeShape("w", "w", loops.map((segments) => ({ segments, closed: true })));
  const shifted = transformedItem(moved, [1, 0, 0, 1, dx, dy]);
  const flipped = transformedItem(shifted, mirrorX(0));
  return flipped.kind === "shape" ? flipped.outlines.map((o) => o.segments) : [];
}

const rubberStamp: LibraryDesign = {
  id: "rubber-stamp",
  name: "Rubber stamp",
  group: "Signs and stamps",
  icon: '<rect x="6" y="14" width="36" height="20" rx="1"/><rect x="9" y="17" width="30" height="14" opacity=".55"/><path d="M30 20v8h-3.5a2.5 2.5 0 0 1 0-5H30M25 28l-3 0M20 20v8h-4"/>',
  description: "Words (and a border) for stamp rubber: the background is engraved away, leaving the letters raised, mirrored so the stamp prints the right way round. Use laser-safe rubber made for stamps.",
  inputs: () => [
    { key: "words", label: "Words", kind: "text", default: "MADE BY\nHAND", multiline: true },
    fontChoice("inter-bold"),
    { key: "height", label: "Letter height", kind: "number", unit: "mm", default: 6, min: 1.5, max: 80, help: "How tall the capital letters are." },
    {
      key: "shape",
      label: "Shape",
      kind: "choice",
      default: "rectangle",
      choices: [
        { value: "rectangle", label: "Rectangle" },
        { value: "round", label: "Round" },
      ],
    },
    { key: "width", label: "Stamp width", kind: "number", unit: "mm", default: 50, min: 10, max: 280, help: "A round stamp's diameter." },
    { key: "depth", label: "Stamp height", kind: "number", unit: "mm", default: 25, min: 10, max: 280, help: "Top to bottom (not used for a round stamp)." },
    { key: "border", label: "Border", kind: "toggle", default: true },
    { key: "line", label: "Border line width", kind: "number", unit: "mm", default: 1.2, min: 0.4, max: 10 },
    { key: "edge", label: "Space round the edge", kind: "number", unit: "mm", default: 2, min: 0.5, max: 30, help: "Between the outline and the border." },
  ],
  problems: (v) => {
    if (!str(v, "words").trim()) return ["Type the words for the stamp."];
    const L = stampLayout(v);
    if (!(L.room[0] > 2 && L.room[1] > 2)) return ["The border and edge space leave no room for words: make the stamp bigger."];
    const loops = mirroredWords(v);
    const pts = loops.flatMap((l) => l.flatMap((s) => (s.kind === "line" ? [s.from, s.to] : s.kind === "bezier" ? [s.from, s.to] : [])));
    if (!pts.length) return ["Those words have no letters to engrave."];
    const fits = L.round ? pts.every(([x, y]) => Math.hypot(x, y) <= L.room[0] / 2) : pts.every(([x, y]) => Math.abs(x) <= L.room[0] / 2 && Math.abs(y) <= L.room[1] / 2);
    const w = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
    const h = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
    return fits ? [] : [`The words don't fit inside the ${L.border ? "border" : "stamp"}: they're ${mm(w)} × ${mm(h)}. Make the letters smaller or the stamp bigger.`];
  },
  make: (v, ids) => {
    const L = stampLayout(v);
    const group = `stamp-${take(ids)}`;
    // Engraved: everything inside the outline but the border ring and the letters (even–odd over all these loops).
    const loops: Outline[] = [outlineOf(L.round, L.size)];
    if (L.border) loops.push(outlineOf(L.round, L.border.outer), outlineOf(L.round, L.border.inner));
    loops.push(...mirroredWords(v).map((segments) => ({ segments, closed: true })));
    const background: Item = { ...makeShape(take(ids), "Stamp background", loops), op: "engrave", group };
    const cut: Item = L.round
      ? { ...makeCircle(take(ids), 0, 0, L.size[0] / 2), name: "Stamp outline", group }
      : { ...makeRect(take(ids), -L.size[0] / 2, -L.size[1] / 2, L.size[0], L.size[1]), name: "Stamp outline", group };
    const lines = str(v, "words").trim().split("\n").length;
    return { items: placed([background, cut]), notes: [`${L.round ? `A ${mm(L.size[0])} round` : `A ${mm(L.size[0])} × ${mm(L.size[1])}`} stamp; ${lines} line${lines === 1 ? "" : "s"} of words, mirrored.`] };
  },
};

export const STAND_AND_STAMP: LibraryDesign[] = [flatStand, rubberStamp];
