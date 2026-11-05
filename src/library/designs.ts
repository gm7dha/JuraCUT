/**
 * The design library: ready-made laser designs you fill in and put on the
 * bed — a finger-jointed box, name tags, coasters and stencils. Each design
 * lists its inputs (with defaults and limits), says what's wrong with a set of
 * values in plain words, and makes ordinary shapes (rectangles, circles,
 * words, outlines) that can then be moved, changed and exported like any
 * other. Pure.
 *
 * Shared ideas (and the finger and bridge maths) come from JuraCAD's library.
 */
import { chainEdges, pathPoints, type Pt } from "../geometry/segments";
import { FONTS, textOutline } from "../geometry/text";
import { itemBox, makeCircle, makeRect, makeShape, makeText, movedItem } from "../model/shapes";
import type { Item, Material } from "../model/types";
import { font, fontChoice, loopOf, n, placed, str, take, type LibraryDesign, type MadeDesign, type Values } from "./kit";
import { STAND_AND_STAMP } from "./stands";
import { WORKSHOP_DESIGNS } from "./workshop";
import { BOXES_3 } from "./boxes3";
import { HOME_3 } from "./laserHome3";
import { TOYS_3 } from "./toys3";
import { LASER_DESIGNS_4 } from "./laserSet4";
import { planBridges } from "./bridges";
import { boxProblems, fingerCounts, panelOutlines } from "./fingers";
import { lit } from "./ex";
import { stencilCuts } from "./stencilCut";

// ---------------------------------------------------------------------------
// Finger-jointed box.

const fingerBox: LibraryDesign = {
  id: "finger-box",
  group: "Boxes and stands",
  icon: '<path d="M8 18 24 10l16 8v18l-16 8-16-8z"/><path d="M8 18l16 8 16-8M24 26v18"/><path d="M12 20v3l3 1.5v-3M18 23v3l3 1.5v-3M27 25.5v3l3-1.5v-3M33 22.5v3l3-1.5v-3"/>',
  name: "Finger-joint box",
  description: "Six panels (five without a lid) whose edges interlock. Glue or press them together.",
  inputs: (m) => [
    { key: "width", label: "Width", kind: "number", unit: "mm", default: 120, min: 20, max: 580, help: "Outside size." },
    { key: "depth", label: "Depth", kind: "number", unit: "mm", default: 80, min: 20, max: 580 },
    { key: "height", label: "Height", kind: "number", unit: "mm", default: 60, min: 20, max: 580 },
    { key: "thickness", label: "Material thickness", kind: "number", unit: "mm", default: m.thickness || 3, min: 0.5, max: 25, help: "Measure your sheet: 3 mm plywood is often 2.8–3.2 mm." },
    { key: "finger", label: "Finger width", kind: "number", unit: "mm", default: 10, min: 2, max: 200, help: "Roughly — each edge gets an odd number of equal fingers that fit exactly." },
    { key: "lid", label: "Lid", kind: "toggle", default: true, help: "Off: an open-topped box." },
  ],
  problems: (v) =>
    boxProblems({ W: lit(n(v, "width")), D: lit(n(v, "depth")), H: lit(n(v, "height")), t: lit(n(v, "thickness")), kerf: lit(0), lid: !!v.lid, finger: n(v, "finger") }),
  make: (v, ids) => {
    const sizes = { W: lit(n(v, "width")), D: lit(n(v, "depth")), H: lit(n(v, "height")), t: lit(n(v, "thickness")), kerf: lit(0), lid: !!v.lid, finger: n(v, "finger") };
    const counts = fingerCounts(sizes);
    const outlines = new Map(panelOutlines(sizes, counts).map((p) => [p.name, p.outline.map(([x, y]) => [x.v, y.v] as [number, number])]));
    const panels: [string, "bottom" | "front" | "left"][] = [
      ["Bottom", "bottom"],
      ...(v.lid ? ([["Lid", "bottom"]] as [string, "bottom"][]) : []),
      ["Front", "front"],
      ["Back", "front"],
      ["Left side", "left"],
      ["Right side", "left"],
    ];
    // In a row, wrapping at the bed's width, 5 mm apart.
    const gap = 5;
    let x = 0;
    let y = 0;
    let rowH = 0;
    const items: Item[] = [];
    for (const [name, kind] of panels) {
      const pts = outlines.get(kind)!;
      const w = Math.max(...pts.map((p) => p[0]));
      const h = Math.max(...pts.map((p) => p[1]));
      if (x > 0 && x + w > 580) {
        x = 0;
        y += rowH + gap;
        rowH = 0;
      }
      const shape = makeShape(take(ids), `Box: ${name.toLowerCase()}`, [loopOf(pts.map(([px, py]) => [px + x, py + y]))]);
      items.push(shape);
      x += w + gap;
      rowH = Math.max(rowH, h);
    }
    return {
      items: placed(items),
      notes: [
        `Fingers: ${counts.width} along the width, ${counts.depth} along the depth, ${counts.height} up the height.`,
        "Tick “Allow for the kerf” when you export, so the fingers fit snugly.",
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Name or key tag.

const tag: LibraryDesign = {
  id: "tag",
  group: "Signs and stamps",
  icon: '<rect x="4" y="16" width="40" height="16" rx="5"/><circle cx="11" cy="24" r="2.5"/><path d="M19 21v6M19 24h5M24 21v6M28 21h6M31 21v6M37 21v6h4" opacity=".7"/>',
  name: "Name or key tag",
  description: "A tag with rounded corners, a hole for a ring, and engraved words.",
  inputs: () => [
    { key: "text", label: "Words", kind: "text", default: "WORKSHOP", multiline: true },
    fontChoice(),
    { key: "height", label: "Letter height", kind: "number", unit: "mm", default: 8, min: 2, max: 60 },
    { key: "width", label: "Tag length", kind: "number", unit: "mm", default: 70, min: 20, max: 580 },
    { key: "depth", label: "Tag height", kind: "number", unit: "mm", default: 24, min: 8, max: 280 },
    { key: "corner", label: "Corner rounding", kind: "number", unit: "mm", default: 5, min: 0, max: 50 },
    { key: "hole", label: "Hole diameter", kind: "number", unit: "mm", default: 5, min: 0, max: 30, help: "0 for no hole." },
  ],
  problems: (v) => {
    const out: string[] = [];
    if (n(v, "hole") > 0 && n(v, "hole") + 4 > n(v, "depth")) out.push("The hole is too big for the tag's height: leave at least 2 mm round it.");
    return out;
  },
  make: (v, ids) => {
    const W = n(v, "width");
    const H = n(v, "depth");
    const hole = n(v, "hole");
    const holeRoom = hole > 0 ? hole + 6 : 0;
    const group = `tag-${take(ids)}`;
    const items: Item[] = [{ ...makeRect(take(ids), 0, 0, W, H), name: "Tag", radius: Math.min(n(v, "corner"), W / 2, H / 2), group }];
    if (hole > 0) items.push({ ...makeCircle(take(ids), 3 + hole / 2, H / 2, hole / 2), name: "Tag hole", group });
    const words = str(v, "text").trim();
    const notes: string[] = [];
    if (words) {
      // In the middle of what's left beside the hole, made smaller if they wouldn't fit.
      const roomW = W - holeRoom - 4;
      const roomH = H - 4;
      let size = n(v, "height");
      let t = { ...makeText(take(ids), 0, 0, words, size), name: "Tag words", font: font(v), align: "centre" as const, group };
      let box = itemBox(t);
      if (box && (box[2] - box[0] > roomW || box[3] - box[1] > roomH)) {
        const k = Math.min(roomW / (box[2] - box[0]), roomH / (box[3] - box[1]));
        size = Math.max(1, Math.floor(size * k * 10) / 10);
        t = { ...t, size };
        box = itemBox(t);
        notes.push(`The words were made ${size} mm tall so they fit on the tag.`);
      }
      if (box) items.push(movedItem(t, holeRoom + (W - holeRoom) / 2 - (box[0] + box[2]) / 2, H / 2 - (box[1] + box[3]) / 2));
    }
    return { items: placed(items), notes };
  },
};

// ---------------------------------------------------------------------------
// Coasters.

const coasters: LibraryDesign = {
  id: "coasters",
  group: "Home",
  icon: '<circle cx="17" cy="24" r="12"/><circle cx="17" cy="24" r="8" opacity=".45"/><path d="M13 24h8" /><rect x="31" y="14" width="14" height="20" rx="3" opacity=".7"/>',
  name: "Coasters",
  description: "A set of round or square coasters, with engraved words and a scored ring if you like.",
  inputs: () => [
    {
      key: "shape",
      label: "Shape",
      kind: "choice",
      default: "round",
      choices: [
        { value: "round", label: "Round" },
        { value: "square", label: "Square" },
        { value: "hexagon", label: "Six-sided" },
      ],
    },
    { key: "size", label: "Size", kind: "number", unit: "mm", default: 95, min: 30, max: 280, help: "Across (flat to flat for six-sided)." },
    { key: "corner", label: "Corner rounding", kind: "number", unit: "mm", default: 8, min: 0, max: 50, help: "Square coasters only." },
    { key: "count", label: "How many", kind: "count", default: 4, min: 1, max: 12 },
    { key: "text", label: "Words", kind: "text", default: "", multiline: true, help: "Optional." },
    fontChoice("lora-regular"),
    { key: "height", label: "Letter height", kind: "number", unit: "mm", default: 12, min: 2, max: 100 },
    { key: "ring", label: "Scored ring", kind: "toggle", default: true, help: "A light line 5 mm in from the edge." },
  ],
  problems: () => [],
  make: (v, ids) => {
    const S = n(v, "size");
    const count = Math.max(1, Math.min(12, Math.round(n(v, "count"))));
    const square = v.shape === "square";
    const hexagon = v.shape === "hexagon";
    const corner = Math.min(n(v, "corner"), S / 2);
    /** A six-sided outline `across` flat to flat, centred on c (flat top and bottom). */
    const hex = (c: [number, number], across: number): [number, number][] =>
      Array.from({ length: 6 }, (_, k) => [c[0] + (across / Math.sqrt(3)) * Math.cos(((60 * k) * Math.PI) / 180), c[1] + (across / Math.sqrt(3)) * Math.sin(((60 * k) * Math.PI) / 180)]);
    const perRow = Math.max(1, Math.floor((580 + 5) / (S + 5)));
    const items: Item[] = [];
    const words = str(v, "text").trim();
    for (let k = 0; k < count; k++) {
      const x = (k % perRow) * (S + 5);
      const y = Math.floor(k / perRow) * (S + 5);
      const group = `coaster-${take(ids)}`;
      const c: [number, number] = [x + S / 2, y + S / 2];
      items.push(
        hexagon
          ? { ...makeShape(take(ids), `Coaster ${k + 1}`, [loopOf(hex(c, S))]), group }
          : square
            ? { ...makeRect(take(ids), x, y, S, S), name: `Coaster ${k + 1}`, radius: corner, group }
            : { ...makeCircle(take(ids), c[0], c[1], S / 2), name: `Coaster ${k + 1}`, group },
      );
      if (v.ring)
        items.push(
          hexagon
            ? { ...makeShape(take(ids), `Coaster ${k + 1} ring`, [loopOf(hex(c, S - 10))]), op: "score" as const, group }
            : square
              ? { ...makeRect(take(ids), x + 5, y + 5, S - 10, S - 10), name: `Coaster ${k + 1} ring`, radius: Math.max(0, corner - 4), op: "score", group }
              : { ...makeCircle(take(ids), c[0], c[1], S / 2 - 5), name: `Coaster ${k + 1} ring`, op: "score", group },
        );
      if (words) {
        const t = { ...makeText(take(ids), 0, 0, words, n(v, "height")), name: `Coaster ${k + 1} words`, font: font(v), align: "centre" as const, group };
        const box = itemBox(t);
        if (box) items.push(movedItem(t, c[0] - (box[0] + box[2]) / 2, c[1] - (box[1] + box[3]) / 2));
      }
    }
    const notes = count > perRow * Math.floor((280 + 5) / (S + 5)) ? ["They don't all fit on the bed at once: cut them in two goes."] : [];
    return { items: placed(items), notes };
  },
};

// ---------------------------------------------------------------------------
// Stencil.

const stencil: LibraryDesign = {
  id: "stencil",
  group: "Signs and stamps",
  icon: '<rect x="4" y="12" width="40" height="24" rx="1.5"/><path d="M10 30V18h5a3 3 0 0 1 0 6h-5M14 24l4 6"/><ellipse cx="27" cy="24" rx="4.5" ry="6"/><path d="M27 17.5v3M27 27.5v3" stroke-width="2.6" opacity=".6"/><path d="M34 18h6M37 18v12"/>',
  name: "Stencil",
  description: "Words cut out of a sheet, with bridges added so the middles of letters like O and A don't fall out.",
  inputs: () => [
    { key: "text", label: "Words", kind: "text", default: "HELLO", multiline: true },
    fontChoice("inter-bold"),
    { key: "height", label: "Letter height", kind: "number", unit: "mm", default: 30, min: 5, max: 250, help: "How tall the capital letters are." },
    { key: "bridge", label: "Bridge width", kind: "number", unit: "mm", default: 2, min: 0.5, max: 20, help: "The strips holding the middles of letters. 1.5–3 mm suits card or plywood." },
    { key: "steady", label: "Two bridges per middle", kind: "toggle", default: false, help: "On opposite sides, so big letters' middles don't wobble." },
    { key: "margin", label: "Sheet margin", kind: "number", unit: "mm", default: 15, min: 3, max: 200, help: "Sheet left round the words." },
  ],
  problems: (v) => (str(v, "text").trim() ? [] : ["Type the words for the stencil."]),
  make: (v, ids) => {
    const { loops, box } = textOutline(FONTS[font(v)], str(v, "text").trim(), n(v, "height"), "centre");
    if (!box) return { items: [], notes: ["Those words have no letters to cut."] };
    const contours = loops.map((l) => pathPoints(l, true, 0.02) as Pt[]);
    const plan = planBridges(contours, { width: n(v, "bridge"), perIsland: v.steady ? 2 : 1 });
    const pieces = stencilCuts(contours, plan.bridges);
    const { loops: closed, open } = chainEdges(pieces, 1e-6);
    const letters = makeShape(take(ids), "Stencil letters", [...closed.map((segments) => ({ segments, closed: true })), ...open.map((segments) => ({ segments, closed: false }))]);
    const m = n(v, "margin");
    const group = `stencil-${take(ids)}`;
    const sheet = { ...makeRect(take(ids), box[0] - m, box[1] - m, box[2] - box[0] + 2 * m, box[3] - box[1] + 2 * m), name: "Stencil sheet", radius: 3, group };
    const notes = [`${plan.islands.length} letter ${plan.islands.length === 1 ? "middle is" : "middles are"} held by ${plan.bridges.length} ${plan.bridges.length === 1 ? "bridge" : "bridges"}.`];
    if (plan.unheld.length) notes.push(`${plan.unheld.length} letter ${plan.unheld.length === 1 ? "middle" : "middles"} couldn't be held: try a wider bridge or another font.`);
    return { items: placed([sheet, { ...letters, group }]), notes };
  },
};

export const LIBRARY: LibraryDesign[] = [fingerBox, STAND_AND_STAMP[0], tag, stencil, STAND_AND_STAMP[1], coasters, ...WORKSHOP_DESIGNS, ...BOXES_3, ...HOME_3, ...TOYS_3, ...LASER_DESIGNS_4];

export type { DesignInput, InputKind, LibraryDesign, MadeDesign, Values } from "./kit";

/** Every input at its default (the material's thickness where it applies). */
export function defaultValues(design: LibraryDesign, material: Material): Values {
  return Object.fromEntries(design.inputs(material).map((i) => [i.key, i.default]));
}

/** Values made safe: numbers inside their limits, choices one of the choices, text not too long. */
export function cleanValues(design: LibraryDesign, material: Material, v: Values): Values {
  const out: Values = {};
  for (const i of design.inputs(material)) {
    const raw = v[i.key];
    if (i.kind === "number" || i.kind === "count") {
      let x = Number(raw);
      if (!Number.isFinite(x)) x = Number(i.default);
      if (i.min !== undefined) x = Math.max(i.min, x);
      if (i.max !== undefined) x = Math.min(i.max, x);
      out[i.key] = i.kind === "count" ? Math.round(x) : x;
    } else if (i.kind === "toggle") out[i.key] = typeof raw === "boolean" ? raw : !!i.default;
    else if (i.kind === "choice" || i.kind === "font") out[i.key] = i.choices?.some((c) => c.value === raw) ? (raw as string) : (i.default as string);
    else out[i.key] = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").slice(0, 200) : String(i.default);
  }
  return out;
}

/** Everything wrong with the values, in plain words (none = ready to make). */
export function designProblems(design: LibraryDesign, material: Material, v: Values): string[] {
  return design.problems(cleanValues(design, material, v));
}

/** Make the design with these values (cleaned first), new ids not clashing with `taken`. */
export function makeDesign(design: LibraryDesign, material: Material, v: Values, taken: Iterable<string>): MadeDesign {
  return design.make(cleanValues(design, material, v), new Set(taken));
}
