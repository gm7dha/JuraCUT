/**
 * More laser designs: a living-hinge panel (rows of short cuts that let
 * plywood bend), an involute gear, a three-layer picture frame and a ruler.
 * The maths (hingeCuts, gearOutline, rulerMarks) is JuraCAD's
 * src/library/designs/workshop.ts and engraved.ts: keep the two in step.
 */
import type { Segment } from "../geometry/segments";
import { makeCircle, makeRect, makeShape, makeText } from "../model/shapes";
import type { Item } from "../model/types";
import { loopOf, n, placed, take, type LibraryDesign } from "./kit";

type P2 = [number, number];

const mm = (v: number) => `${Math.round(v * 100) / 100} mm`;

// ---------------------------------------------------------------------------
// Living hinge

export interface HingeSizes {
  depth: number;
  zone: number;
  cut: number;
  gap: number;
  spacing: number;
}

/** The hinge's cuts: upright lines in columns `spacing` apart across the bending zone, every other column offset half a step. */
export function hingeCuts(v: HingeSizes): [P2, P2][] {
  const { depth: h, zone, cut, gap, spacing } = v;
  const cols = Math.floor(zone / spacing + 1e-9) + 1;
  const bottom = -h / 2 + gap;
  const top = h / 2 - gap;
  const step = cut + gap;
  const out: [P2, P2][] = [];
  for (let i = 0; i < cols; i++) {
    const x = Math.round((-((cols - 1) / 2) * spacing + i * spacing) * 1e6) / 1e6;
    const shift = i % 2 ? step / 2 : 0;
    for (let y = bottom - shift; y < top; y += step) {
      const a = Math.max(bottom, y);
      const b = Math.min(top, y + cut);
      if (b - a >= Math.min(2, cut / 3)) out.push([[x, Math.round(a * 1e6) / 1e6], [x, Math.round(b * 1e6) / 1e6]]);
    }
  }
  return out;
}

export const MAX_HINGE_CUTS = 3000;

const hingeOf = (v: Record<string, unknown>): HingeSizes => ({
  depth: Number(v.depth),
  zone: Number(v.zone),
  cut: Number(v.cut),
  gap: Number(v.gap),
  spacing: Number(v.spacing),
});

const livingHinge: LibraryDesign = {
  id: "living-hinge",
  group: "Workshop",
  icon: '<rect x="4" y="12" width="40" height="24" rx="1"/><path d="M18 15v8M18 27v6M22 12v0M22 19v10M26 15v8M26 27v6M30 19v10" />',
  name: "Living hinge panel",
  description: "A panel with rows of short cuts across its middle, so plywood or MDF bends there — for curved box corners, book covers and lamp shades.",
  inputs: (m) => [
    { key: "width", label: "Panel width", kind: "number", unit: "mm", default: 150, min: 20, max: 580 },
    { key: "depth", label: "Panel height", kind: "number", unit: "mm", default: 80, min: 15, max: 280, help: "Along the cuts." },
    { key: "zone", label: "Bending zone width", kind: "number", unit: "mm", default: 40, min: 2, max: 580, help: "How wide the cut area is, in the middle of the panel." },
    { key: "cut", label: "Cut length", kind: "number", unit: "mm", default: 20, min: 3, max: 280 },
    { key: "gap", label: "Gap between cuts", kind: "number", unit: "mm", default: 3, min: 0.5, max: 50, help: "The uncut bits in each row: smaller bends more easily but is weaker." },
    {
      key: "spacing",
      label: "Row spacing",
      kind: "number",
      unit: "mm",
      default: Math.round(Math.max(0.8, (m.thickness || 3) / 2) * 10) / 10,
      min: 0.5,
      max: 20,
      help: "Between rows of cuts: about half the sheet's thickness is a good start.",
    },
  ],
  problems: (v) => {
    const out: string[] = [];
    if (n(v, "zone") > n(v, "width") - 10) out.push(`The bending zone must be at least 10 mm narrower than the panel (at most ${mm(n(v, "width") - 10)}).`);
    if (n(v, "cut") > n(v, "depth") - 2 * n(v, "gap")) out.push(`The cuts are longer than the panel allows: at most ${mm(n(v, "depth") - 2 * n(v, "gap"))}.`);
    if (!out.length && hingeCuts(hingeOf(v)).length > MAX_HINGE_CUTS) out.push(`That's over ${MAX_HINGE_CUTS} cuts: make the zone narrower or the rows further apart.`);
    return out;
  },
  make: (v, ids) => {
    const W = n(v, "width");
    const H = n(v, "depth");
    const cuts = hingeCuts(hingeOf(v));
    const group = `hinge-${take(ids)}`;
    const panel: Item = { ...makeRect(take(ids), -W / 2, -H / 2, W, H), name: "Hinge panel", group };
    const lines: Item = {
      ...makeShape(
        take(ids),
        "Hinge cuts",
        cuts.map(([a, b]) => ({ segments: [{ kind: "line", from: a, to: b } as Segment], closed: false })),
      ),
      group,
    };
    const rows = Math.floor(n(v, "zone") / n(v, "spacing") + 1e-9) + 1;
    return { items: placed([panel, lines]), notes: [`${cuts.length} cuts in ${rows} rows. They're cut right through: thinner sheet and closer rows bend further.`] };
  },
};

// ---------------------------------------------------------------------------
// Gear

const inv = (a: number) => Math.tan(a) - a;

export interface GearSizes {
  pitch: number;
  base: number;
  outside: number;
  root: number;
}

/** A spur gear's circles (radii, mm): pitch m·z/2, base (× cos pressure angle), outside (+ m), root (− 1.25 m). */
export function gearSizes(teeth: number, module: number, pressure: number): GearSizes {
  const pitch = (module * teeth) / 2;
  return { pitch, base: pitch * Math.cos((pressure * Math.PI) / 180), outside: pitch + module, root: pitch - 1.25 * module };
}

/** Half a tooth's angle at radius r (on the involute; r ≥ the base circle). */
function halfAngle(teeth: number, pressure: number, s: GearSizes, r: number): number {
  return Math.PI / (2 * teeth) + inv((pressure * Math.PI) / 180) - inv(Math.acos(Math.min(1, s.base / r)));
}

/** Points along each flank: enough to stay within about 0.01 mm of the true involute, a few thousand lines at most. */
export function gearFlankPoints(teeth: number, module: number): number {
  return Math.max(6, Math.min(6 + 2 * Math.ceil(module), Math.floor(1400 / teeth)));
}

/** Below this many teeth a gear's roots are undercut and its tips may clash with a big gear's (by pressure angle). */
export const UNDERCUT_TEETH: Record<string, number> = { "20": 13, "14.5": 23 };

/** The gear's outline: involute flanks, flat-ish tips and roots as short straight pieces, anticlockwise. */
export function gearOutline(teeth: number, module: number, pressure: number, flankPoints = gearFlankPoints(teeth, module)): P2[] {
  const s = gearSizes(teeth, module, pressure);
  const from = Math.max(s.base, s.root);
  const at = (r: number, a: number): P2 => [Math.round(r * Math.cos(a) * 1e6) / 1e6, Math.round(r * Math.sin(a) * 1e6) / 1e6];
  const out: P2[] = [];
  const rs = Array.from({ length: flankPoints }, (_, i) => from + ((s.outside - from) * i) / (flankPoints - 1));
  const tip = halfAngle(teeth, pressure, s, s.outside);
  const low = halfAngle(teeth, pressure, s, from);
  for (let k = 0; k < teeth; k++) {
    const c = (2 * Math.PI * k) / teeth;
    if (s.root < from) out.push(at(s.root, c - low));
    for (const r of rs) out.push(at(r, c - halfAngle(teeth, pressure, s, r)));
    out.push(at(s.outside, c - tip / 3), at(s.outside, c + tip / 3));
    for (const r of [...rs].reverse()) out.push(at(r, c + halfAngle(teeth, pressure, s, r)));
    if (s.root < from) out.push(at(s.root, c + low));
    const next = c + (2 * Math.PI) / teeth - low;
    for (const t of [1 / 3, 2 / 3]) out.push(at(s.root, c + low + (next - c - low) * t));
  }
  return out;
}

const gear: LibraryDesign = {
  id: "gear",
  group: "Workshop",
  icon: '<path d="M24 6l3 5 5-2 1 5 5 1-2 5 5 3-5 3 2 5-5 1-1 5-5-2-3 5-3-5-5 2-1-5-5-1 2-5-5-3 5-3-2-5 5-1 1-5 5 2z"/><circle cx="24" cy="24" r="4"/>',
  name: "Gear",
  description: "A spur gear with proper involute teeth. Two gears mesh when their modules match; their centres are module × (teeth + teeth) ÷ 2 apart.",
  inputs: () => [
    { key: "teeth", label: "Teeth", kind: "count", default: 24, min: 8, max: 100 },
    { key: "module", label: "Module (tooth size)", kind: "number", unit: "mm", default: 2, min: 0.5, max: 10, help: "Gears that mesh need the same module. 2 mm suits 3 mm plywood." },
    {
      key: "pressure",
      label: "Pressure angle",
      kind: "choice",
      default: "20",
      choices: [
        { value: "20", label: "20° (usual)" },
        { value: "14.5", label: "14.5° (older gears)" },
      ],
    },
    { key: "bore", label: "Middle hole", kind: "number", unit: "mm", default: 6, min: 0, max: 200, help: "0 for none." },
  ],
  problems: (v) => {
    const s = gearSizes(n(v, "teeth"), n(v, "module"), Number(v.pressure));
    if (n(v, "bore") > 0 && n(v, "bore") > 2 * s.root - 2 * n(v, "module")) return [`The middle hole is too big: at most ${mm(2 * s.root - 2 * n(v, "module"))}.`];
    if (halfAngle(n(v, "teeth"), Number(v.pressure), s, s.outside) <= 0) return ["The teeth come to a point: use more teeth."];
    return [];
  },
  make: (v, ids) => {
    const teeth = n(v, "teeth");
    const s = gearSizes(teeth, n(v, "module"), Number(v.pressure));
    const group = `gear-${take(ids)}`;
    const items: Item[] = [{ ...makeShape(take(ids), `Gear (${teeth} teeth)`, [loopOf(gearOutline(teeth, n(v, "module"), Number(v.pressure)))]), group }];
    if (n(v, "bore") > 0) items.push({ ...makeCircle(take(ids), 0, 0, n(v, "bore") / 2), name: "Gear hole", group });
    const few = UNDERCUT_TEETH[String(v.pressure)] ?? 13;
    const notes = [`Pitch circle ${mm(2 * s.pitch)}, outside ${mm(2 * s.outside)}.`];
    if (teeth < few) notes.push(`With fewer than ${few} teeth the roots are undercut and it may jam against a big gear: use ${few} or more if you can.`);
    return { items: placed(items), notes };
  },
};

// ---------------------------------------------------------------------------
// Picture frame

/** Room round the photo in the middle layer (mm each side), so it slides in. */
const SLIDE = 0.5;

const pictureFrame: LibraryDesign = {
  id: "picture-frame",
  group: "Home",
  icon: '<rect x="8" y="6" width="32" height="36" rx="1"/><rect x="14" y="12" width="20" height="24"/><path d="M17 31l5-6 4 4 3-3 3 5" opacity=".6"/>',
  name: "Picture frame",
  description: "Three layers to glue together: a front with a window, a middle the photo slides into from the top, and a solid back with a hole to hang it on a nail.",
  inputs: () => [
    { key: "photoWidth", label: "Photo width", kind: "number", unit: "mm", default: 102, min: 20, max: 500, help: "A 6 × 4 inch photo is 152 × 102 mm." },
    { key: "photoHeight", label: "Photo height", kind: "number", unit: "mm", default: 152, min: 20, max: 500 },
    { key: "border", label: "Frame width", kind: "number", unit: "mm", default: 20, min: 6, max: 150, help: "How wide the frame is round the photo." },
    { key: "overlap", label: "Overlap", kind: "number", unit: "mm", default: 4, min: 1, max: 30, help: "How far the front covers the photo's edges." },
    { key: "hang", label: "Hanging hole", kind: "toggle", default: true },
  ],
  problems: (v) => {
    const out: string[] = [];
    if (n(v, "overlap") >= Math.min(n(v, "photoWidth"), n(v, "photoHeight")) / 3) out.push("The overlap is too big for the photo: the window would be tiny.");
    if (n(v, "overlap") >= n(v, "border")) out.push("The overlap must be less than the frame width.");
    return out;
  },
  make: (v, ids) => {
    const pw = n(v, "photoWidth");
    const ph = n(v, "photoHeight");
    const b = n(v, "border");
    const o = n(v, "overlap");
    const W = pw + 2 * b;
    const H = ph + 2 * b;
    const gap = 6;
    const sw = pw / 2 + SLIDE;
    const sh = ph / 2 + SLIDE;
    const front = `frame-front-${take(ids)}`;
    const back = `frame-back-${take(ids)}`;
    // Side by side: front, middle, back (each centred on its own spot).
    const at = (k: number): P2 => [k * (W + gap) + W / 2, H / 2];
    const [fx, fy] = at(0);
    const [mx, my] = at(1);
    const [bx, by] = at(2);
    const items: Item[] = [
      { ...makeRect(take(ids), fx - W / 2, fy - H / 2, W, H), name: "Frame front", group: front },
      { ...makeRect(take(ids), fx - pw / 2 + o, fy - ph / 2 + o, pw - 2 * o, ph - 2 * o), name: "Frame window", group: front },
      makeShape(take(ids), "Frame middle", [
        loopOf([
          [mx - W / 2, my - H / 2],
          [mx + W / 2, my - H / 2],
          [mx + W / 2, my + H / 2],
          [mx + sw, my + H / 2],
          [mx + sw, my - sh],
          [mx - sw, my - sh],
          [mx - sw, my + H / 2],
          [mx - W / 2, my + H / 2],
        ]),
      ]),
      { ...makeRect(take(ids), bx - W / 2, by - H / 2, W, H), name: "Frame back", group: back },
    ];
    if (v.hang !== false) items.push({ ...makeCircle(take(ids), bx, by + H / 2 - b / 2, 2.5), name: "Frame hanging hole", group: back });
    return { items: placed(items), notes: [`3 layers, ${mm(W)} × ${mm(H)} each. The photo slides into the middle layer from the top.`] };
  },
};

// ---------------------------------------------------------------------------
// Ruler

/** The ruler's marks: one per millimetre from 0 to the length, longer every 5 and 10 (each [x, length]). */
export function rulerMarks(length: number, width: number): [number, number][] {
  const out: [number, number][] = [];
  for (let x = 0; x <= length + 1e-9; x++) out.push([x, x % 10 === 0 ? Math.min(10, width * 0.4) : x % 5 === 0 ? Math.min(7, width * 0.28) : Math.min(4, width * 0.16)]);
  return out;
}

/** How far in from the edge the marks start, so they don't touch the outline. */
export const MARK_GAP = 0.5;
const RULER_END = 6;

const ruler: LibraryDesign = {
  id: "ruler",
  group: "Workshop",
  icon: '<rect x="3" y="18" width="42" height="12" rx="1"/><path d="M7 30v-6M11 30v-3M15 30v-3M19 30v-6M23 30v-3M27 30v-3M31 30v-6M35 30v-3M39 30v-3" />',
  name: "Ruler",
  description: "A straight ruler with millimetre marks (scored) and centimetre numbers (engraved). Check the first one against a good ruler.",
  inputs: () => [
    { key: "length", label: "Length", kind: "number", unit: "mm", default: 150, min: 20, max: 560, help: "Marked length (the ruler is a little longer)." },
    { key: "width", label: "Width", kind: "number", unit: "mm", default: 30, min: 15, max: 100 },
    { key: "hole", label: "Hanging hole", kind: "toggle", default: true },
  ],
  problems: () => [],
  make: (v, ids) => {
    const length = n(v, "length");
    const width = n(v, "width");
    const hole = v.hole !== false;
    const x0 = -RULER_END;
    const x1 = length + RULER_END + (hole ? 12 : 0);
    const group = `ruler-${take(ids)}`;
    const items: Item[] = [{ ...makeRect(take(ids), x0, 0, x1 - x0, width), name: "Ruler", radius: 2, group }];
    if (hole) items.push({ ...makeCircle(take(ids), length + RULER_END + 6, width / 2, 3), name: "Ruler hole", group });
    // The marks hang down from the top edge, so the numbers sit below them.
    const marks = rulerMarks(length, width).map(([x, len]) => ({ segments: [{ kind: "line", from: [x, width - MARK_GAP], to: [x, width - MARK_GAP - len] } as Segment], closed: false }));
    items.push({ ...makeShape(take(ids), "Ruler marks", marks), op: "score", group });
    const size = Math.min(4, width * 0.15);
    const longest = Math.min(10, width * 0.4);
    const baseline = width - MARK_GAP - longest - 1.5 - size;
    for (let cm = 0; cm * 10 <= length; cm++) {
      const t = { ...makeText(take(ids), cm * 10, baseline, String(cm), size), name: `Ruler ${cm}`, align: "centre" as const, font: "inter-regular" as const, group };
      items.push(t);
    }
    return { items: placed(items), notes: [`${Math.floor(length) + 1} marks, numbered every 10 mm.`] };
  },
};

export const WORKSHOP_DESIGNS: LibraryDesign[] = [livingHinge, gear, pictureFrame, ruler];
