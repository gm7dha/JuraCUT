/**
 * What a JuraCUT design is made of. Everything is in millimetres on the laser's
 * bed: x to the right, y up, (0, 0) the bed's front-left corner — the same way
 * round as the files JuraCUT writes (geometry/segments.ts).
 */
import type { FontId, TextAlign } from "../geometry/text";
import type { Segment } from "../geometry/segments";
import type { QrEcc } from "../geometry/qr";
import type { PhotoMask } from "../geometry/photo";

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
  /** Locked shapes can't be picked or moved on the bed (only from the shapes list). */
  locked?: boolean;
  /** Holding tabs: so many small uncut gaps in each closed cut line, so the piece stays in the sheet until snapped out. */
  tabs?: number;
  /** How wide each tab is (mm; missing = `DEFAULT_TAB_WIDTH`). */
  tabWidth?: number;
}

export const DEFAULT_TAB_WIDTH = 0.6;
export const MOST_TABS = 20;

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

/**
 * A regular polygon or star: centre (cx, cy), `r` from the middle to a corner, `sides` corners (3–100), the first
 * corner `angle` degrees anticlockwise from straight right. A star (`star` 0.05–0.95) has as many inner corners
 * between them, that share of `r` out.
 */
export interface PolygonItem extends ItemBase {
  kind: "polygon";
  cx: number;
  cy: number;
  r: number;
  sides: number;
  angle: number;
  star?: number;
}

/** An ellipse (oval): centre (cx, cy), half-widths `rx` across and `ry` up before turning `angle` degrees anticlockwise. */
export interface EllipseItem extends ItemBase {
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
}

/** A QR code: `text` (a web address or any words) as a square `size` mm across, bottom-left corner at (x, y). */
export interface QrItem extends ItemBase {
  kind: "qr";
  x: number;
  y: number;
  size: number;
  text: string;
  /** How much of the code can be damaged and still read: L 7%, M 15%, Q 25%, H 30% (bigger codes). */
  ecc: QrEcc;
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
  /** Bent round a circle of this radius (mm): + over the top, − under the bottom. Missing or 0 = straight. */
  curve?: number;
  /** Words running along a path (a copy of another shape's outline, on the bed): they start `pathAt` mm along it. */
  path?: Outline;
  pathAt?: number;
  /** Along the path the other way, letters on its other side. */
  pathFlip?: boolean;
  /** Letters joined into one shape where they touch or overlap (script fonts), so they engrave and cut as one. */
  weld?: boolean;
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
  /** The part of the picture kept, as shares of its width and height from its top-left corner [x0, y0, x1, y1]. */
  crop?: [number, number, number, number];
  /** Only an oval (round) or a rounded rectangle of it is engraved; outside that is left. */
  mask?: PhotoMask;
  /** Only the part inside these outlines is engraved (any shape; mm, measured from the photo's middle, as on the bed). */
  clip?: Outline[];
}

export type Item = RectItem | CircleItem | EllipseItem | PolygonItem | LineItem | TextItem | QrItem | ShapeItem | PictureItem;
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
  /** Guide lines pulled out of the rulers (never cut); missing = none. */
  guides?: { xs: number[]; ys: number[] };
}
