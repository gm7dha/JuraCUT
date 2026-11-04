/**
 * What every library design shares: the input and design types, and small
 * helpers for making shapes (new ids, loops, placing on the bed). Pure.
 */
import { FONTS, FONT_IDS, isFontId, type FontId } from "../geometry/text";
import type { Segment } from "../geometry/segments";
import { newId } from "../model/document";
import { itemBox, movedItem } from "../model/shapes";
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

