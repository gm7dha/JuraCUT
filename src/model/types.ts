/**
 * What a JuraCUT design is made of. Everything is in millimetres on the laser's
 * bed: x to the right, y up, (0, 0) the bed's front-left corner — the same way
 * round as the files JuraCUT writes (geometry/segments.ts).
 */
import type { FontId, TextAlign } from "../geometry/text";
import type { Segment } from "../geometry/segments";

/** What the laser does with a shape. */
export type Op = "cut" | "score" | "engrave";

export const OPS: Op[] = ["cut", "score", "engrave"];

export interface OpInfo {
  label: string;
  /** Shown beside the shape in the list and on the bed. */
  colour: string;
  hint: string;
}

export const OP_INFO: Record<Op, OpInfo> = {
  cut: { label: "Cut", colour: "#FF0000", hint: "Cut right through. Holes are cut before the outside round them." },
  score: { label: "Score", colour: "#00FF00", hint: "A light pass that marks the surface without cutting through (fold lines, decoration)." },
  engrave: { label: "Engrave", colour: "#000000", hint: "Fill the area in (letters, pictures)." },
};

export const isOp = (v: unknown): v is Op => typeof v === "string" && (OPS as string[]).includes(v);

/** One outline: a closed loop or an open run of curves. */
export interface Outline {
  segments: Segment[];
  closed: boolean;
}

interface ItemBase {
  id: string;
  /** Shown in the list. */
  name: string;
  op: Op;
  /** Hidden shapes stay in the design but aren't exported. */
  hidden?: boolean;
  /** Shapes with the same group id are picked, moved and turned together. */
  group?: string;
}

/** A rectangle, `angle` degrees anticlockwise about its centre, corners rounded by `radius`. */
export interface RectItem extends ItemBase {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  angle: number;
}

export interface CircleItem extends ItemBase {
  kind: "circle";
  cx: number;
  cy: number;
  r: number;
}

export interface LineItem extends ItemBase {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Words: `x`, `y` is where the first line's baseline starts (its left end, middle or right end by `align`). */
export interface TextItem extends ItemBase {
  kind: "text";
  text: string;
  x: number;
  y: number;
  /** Height of a capital letter (mm). */
  size: number;
  font: FontId;
  align: TextAlign;
  angle: number;
}

/** Any outlines (brought in from an SVG or DXF, or converted from another shape), already on the bed. */
export interface ShapeItem extends ItemBase {
  kind: "shape";
  outlines: Outline[];
}

/**
 * A photo to engrave. `src` is the picture (a data: URL, kept small); it's drawn `w` × `h` mm before turning, centred
 * on (cx, cy), turned `turns` quarter turns anticlockwise, then flipped left to right if `flip`. The other settings say
 * how it's made ready for the laser (geometry/photo.ts). Always engraved.
 */
export interface PictureItem extends ItemBase {
  kind: "picture";
  src: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  turns: number;
  flip: boolean;
  mode: "dots" | "black" | "greys";
  brightness: number;
  contrast: number;
  invert: boolean;
  /** Engraving resolution: dots (lines) per mm. */
  dpm: number;
}

export type Item = RectItem | CircleItem | LineItem | TextItem | ShapeItem | PictureItem;
export type ItemKind = Item["kind"];

/** The material on the bed (saved with the design; sizes in mm). */
export interface Material {
  name: string;
  thickness: number;
  /** Width of the cut the beam leaves. Not applied yet; kept for the kerf setting to come. */
  kerf: number;
}

export interface JuraCUTDocument {
  format: "juracut";
  version: 1;
  name: string;
  /** The bed's usable size [width, height] in mm. */
  bed: [number, number];
  material: Material;
  /** Back to front: later items are drawn on top. */
  items: Item[];
}
