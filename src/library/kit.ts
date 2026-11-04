/**
 * What every library design shares: the input and design types, and small
 * helpers for making shapes (new ids, loops, placing on the bed). Pure.
 */
import { FONTS, FONT_IDS, isFontId, type FontId } from "../geometry/text";
import type { Segment } from "../geometry/segments";
import { newId } from "../model/document";
import { itemBox, makeText, movedItem } from "../model/shapes";
import type { Item, Material, Outline } from "../model/types";

export type InputKind = "number" | "count" | "text" | "choice" | "toggle" | "font";

export interface DesignInput {
  key: string;
  label: string;
  kind: InputKind;
  default: number | string | boolean;
  min?: number;
  max?: number;
  /** "mm" for lengths. */
  unit?: string;
  choices?: { value: string; label: string }[];
  /** Several lines allowed (text). */
  multiline?: boolean;
  help?: string;
}

export type Values = Record<string, number | string | boolean>;

export interface MadeDesign {
  items: Item[];
  /** Things worth knowing about what was made. */
  notes: string[];
}

export interface LibraryDesign {
  id: string;
  name: string;
  description: string;
  /** The heading it's listed under in the library window. */
  group: string;
  /** A small drawing for its card: fixed SVG markup in a 48 × 48 box (written in the code, never user data). */
  icon: string;
  /** Inputs whose defaults come from the design's material (thickness). */
  inputs: (material: Material) => DesignInput[];
  problems: (v: Values) => string[];
  make: (v: Values, ids: Set<string>) => MadeDesign;
}

export const fontChoice = (def: FontId = "inter-bold"): DesignInput => ({
  key: "font",
  label: "Font",
  kind: "font",
  default: def,
  choices: FONT_IDS.map((id) => ({ value: id, label: FONTS[id].label })),
});

export const n = (v: Values, k: string) => Number(v[k]);
export const str = (v: Values, k: string) => String(v[k] ?? "");
export const font = (v: Values): FontId => (isFontId(v.font) ? v.font : "inter-regular");

/** A new id, recorded as taken. */
export const take = (ids: Set<string>) => {
  const id = newId(ids);
  ids.add(id);
  return id;
};

/** Straight lines through points (a closed loop). */
export function loopOf(pts: [number, number][]): Outline {
  const segments: Segment[] = pts.map((p, i) => ({ kind: "line", from: p, to: pts[(i + 1) % pts.length] }));
  return { segments, closed: true };
}

/** Where a group of shapes' bottom-left corner goes: 10 mm in from the bed's corner. */
export function placed(items: Item[], x = 10, y = 10): Item[] {
  const boxes = items.map(itemBox).filter((b): b is [number, number, number, number] => !!b);
  if (!boxes.length) return items;
  const x0 = Math.min(...boxes.map((b) => b[0]));
  const y0 = Math.min(...boxes.map((b) => b[1]));
  return items.map((it) => movedItem(it, x - x0, y - y0));
}


/** "12.5 mm" for messages. */
export const mm = (v: number) => `${Math.round(v * 100) / 100} mm`;

/** Rounded to 6 places (no 0.30000000000000004 in shapes). */
export const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** Engraved words whose box is centred on (cx, cy), capitals `size` tall, turned `angle` degrees. */
export function wordsAt(id: string, name: string, text: string, size: number, fontId: FontId, cx: number, cy: number, angle = 0): Item {
  const t = { ...makeText(id, 0, 0, text, size), name, font: fontId, align: "centre" as const, angle };
  const box = itemBox(t);
  return box ? movedItem(t, cx - (box[0] + box[2]) / 2, cy - (box[1] + box[3]) / 2) : t;
}

/**
 * Pieces (each a few shapes that go together) laid out flat in rows, `gap` apart, a new row when the next would pass
 * `width` (the bed less a margin); the first piece's corner at (0, 0).
 */
export function inRows(pieces: Item[][], gap = 5, width = 580): Item[] {
  const out: Item[] = [];
  let [x, y, rowH] = [0, 0, 0];
  for (const piece of pieces) {
    const boxes = piece.map(itemBox).filter((b): b is [number, number, number, number] => !!b);
    if (!boxes.length) continue;
    const box = [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
    const [w, h] = [box[2] - box[0], box[3] - box[1]];
    if (x > 0 && x + w > width) {
      x = 0;
      y += rowH + gap;
      rowH = 0;
    }
    out.push(...piece.map((it) => movedItem(it, x - box[0], y - box[1])));
    x += w + gap;
    rowH = Math.max(rowH, h);
  }
  return out;
}
