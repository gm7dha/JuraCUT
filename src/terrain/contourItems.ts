/**
 * A layered mountain puzzle's sheets as JuraCUT shapes (pure): the sheets laid out on beds, and each sheet's outline
 * and cuts (cut), the next sheet's outline (score) and the pieces' names (engrave), grouped per sheet.
 */
import { FONTS, textOutline } from "../geometry/text";
import type { Segment } from "../geometry/segments";
import { take } from "../library/kit";
import { makeShape, moveOutlines, translation } from "../model/shapes";
import type { Item, Outline } from "../model/types";
import { NAME_SIZE } from "./contourMarks";
import { LABEL_SIZE, type ContourLayer, type ContourPuzzle } from "./contourPuzzle";
import type { P2 } from "../library/puzzle";

/** Room round the bed's edge and between sheets, mm. */
export const SHEET_MARGIN = 5;
export const SHEET_GAP = 5;
/** Every mountain shape's group starts with this, so a new sheet can replace the last one. */
export const MOUNTAIN_GROUP = "mountain-";

export interface BedSheet {
  /** Sheet indices (into puzzle.layers) on this bed, and where each goes. */
  layers: { at: number; move: [number, number] }[];
}

/** Sheets onto beds in rows, in order (base first). A sheet bigger than the bed gets a bed of its own. */
export function bedSheets(puzzle: ContourPuzzle, bed: [number, number]): BedSheet[] {
  const out: BedSheet[] = [];
  let cur: BedSheet = { layers: [] };
  let [x, y, rowDepth] = [SHEET_MARGIN, SHEET_MARGIN, 0];
  puzzle.layers.forEach((L, at) => {
    const [x0, y0, x1, y1] = L.box;
    const [w, d] = [x1 - x0, y1 - y0];
    if (x + w > bed[0] - SHEET_MARGIN && x > SHEET_MARGIN) {
      x = SHEET_MARGIN;
      y += rowDepth + SHEET_GAP;
      rowDepth = 0;
    }
    if (y + d > bed[1] - SHEET_MARGIN && cur.layers.length) {
      out.push(cur);
      cur = { layers: [] };
      [x, y, rowDepth] = [SHEET_MARGIN, SHEET_MARGIN, 0];
    }
    cur.layers.push({ at, move: [x - x0, y - y0] });
    x += w + SHEET_GAP;
    rowDepth = Math.max(rowDepth, d);
  });
  if (cur.layers.length) out.push(cur);
  return out;
}

const lines = (pts: P2[], closed: boolean): Outline => ({
  segments: (closed ? pts : pts.slice(0, -1)).map((p, i): Segment => ({ kind: "line", from: p, to: pts[(i + 1) % pts.length] })),
  closed,
});

/** One sheet's shapes, moved by `move`. */
export function sheetItems(layer: ContourLayer, move: [number, number], ids: Set<string>): Item[] {
  const group = `${MOUNTAIN_GROUP}${take(ids)}`;
  const m = translation(...move);
  const name = `Mountain sheet ${layer.index + 1}`;
  const items: Item[] = [{ ...makeShape(take(ids), `${name} outline`, moveOutlines(layer.loops.map((l) => lines(l, true)), m)), group }];
  if (layer.cuts.length) items.push({ ...makeShape(take(ids), `${name} cuts`, moveOutlines(layer.cuts.map((c) => lines(c, false)), m)), group });
  if (layer.guide.length) items.push({ ...makeShape(take(ids), `${name} next sheet`, moveOutlines(layer.guide.map((l) => lines(l, true)), m)), op: "score", group });
  const { lines: mapLines, fills, names } = layer.marks;
  if (mapLines.length) items.push({ ...makeShape(take(ids), `${name} paths and rivers`, moveOutlines(mapLines.map((l) => lines(l, false)), m)), op: "score", group });
  if (fills.length) items.push({ ...makeShape(take(ids), `${name} lochs and buildings`, moveOutlines(fills.map((l) => lines(l, true)), m)), op: "engrave", group });
  const words = (list: { text: string; at: P2 }[], size: number): Outline[] => {
    const outlines: Outline[] = [];
    for (const { text, at } of list) {
      const t = textOutline(FONTS["inter-bold"], text, size, "centre");
      if (!t.box) continue;
      const [cx, cy] = [(t.box[0] + t.box[2]) / 2, (t.box[1] + t.box[3]) / 2];
      outlines.push(...moveOutlines(t.loops.map((segments) => ({ segments, closed: true })), translation(at[0] - cx + move[0], at[1] - cy + move[1])));
    }
    return outlines;
  };
  if (names.length) {
    const outlines = words(names, NAME_SIZE);
    if (outlines.length) items.push({ ...makeShape(take(ids), `${name} map names`, outlines), op: "engrave", group });
  }
  if (layer.labels.length) {
    const outlines: Outline[] = [];
    for (const { text, at } of layer.labels) {
      const t = textOutline(FONTS["inter-bold"], text, LABEL_SIZE, "centre");
      if (!t.box) continue;
      const [cx, cy] = [(t.box[0] + t.box[2]) / 2, (t.box[1] + t.box[3]) / 2];
      outlines.push(...moveOutlines(t.loops.map((segments) => ({ segments, closed: true })), translation(at[0] - cx + move[0], at[1] - cy + move[1])));
    }
    if (outlines.length) items.push({ ...makeShape(take(ids), `${name} piece names`, outlines), op: "engrave", group });
  }
  return items;
}

/** A bed's worth of sheets as shapes. */
export function bedItems(puzzle: ContourPuzzle, sheet: BedSheet, taken: Iterable<string>): Item[] {
  const ids = new Set(taken);
  return sheet.layers.flatMap(({ at, move }) => sheetItems(puzzle.layers[at], move, ids));
}
