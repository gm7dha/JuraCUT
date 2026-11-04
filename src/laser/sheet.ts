/**
 * From a design to the sheet the laser files are written from: every shape's
 * outlines on their layers. Closed "cut" loops are sorted into outer cuts and
 * inner cuts (holes, cut first) by nesting, scores and engraving keep their
 * layer, and open cut lines are cut as inner lines (before any outline).
 */
import { nestingDepths, offsetLoop } from "../geometry/offset";
import { movePaths, pathsBox, sortLoops, type LaserPath, type LaserSheet } from "../geometry/segments";
import { itemBox, itemOutlines } from "../model/shapes";
import type { Item, JuraCUTDocument, Op, PictureItem } from "../model/types";

export interface SheetOptions {
  /** Only these shapes (default: every shape that isn't hidden). */
  items?: readonly Item[];
  /** The beam's width (mm): cut lines are moved out by half of it (holes in), so pieces come out the size drawn. */
  kerf?: number;
  /** Flip left to right, for engraving on the back of a piece. */
  mirror?: boolean;
  /** Keep the shapes where they are on the bed (the sheet is the whole bed); else the sheet is just the box round them. */
  wholeBed?: boolean;
}

/** The laser paths of some shapes, on the bed, cuts sorted (and moved by half the kerf when one is given). */
export function laserPaths(items: readonly Item[], kerf = 0): LaserPath[] {
  const byOp: Record<Op, { closed: LaserPath[]; open: LaserPath[] }> = {
    cut: { closed: [], open: [] },
    score: { closed: [], open: [] },
    engrave: { closed: [], open: [] },
  };
  for (const it of items) {
    // Pictures are engraved as images (see sheetPictures), not as outlines.
    if (it.hidden || it.kind === "picture") continue;
    for (const o of itemOutlines(it)) {
      if (!o.segments.length) continue;
      const layer = it.op === "cut" ? "inner" : it.op;
      (o.closed ? byOp[it.op].closed : byOp[it.op].open).push({ layer, segments: o.segments, closed: o.closed });
    }
  }
  const out: LaserPath[] = [];
  // Engraving: every closed loop in one even–odd fill (the sheet writer merges them); open lines engrave as scores would.
  out.push(...byOp.engrave.closed, ...byOp.engrave.open.map((p) => ({ ...p, layer: "score" as const })));
  out.push(...byOp.score.closed, ...byOp.score.open);
  // Cuts: open runs first (lines never free a piece), then holes before the outlines round them.
  out.push(...byOp.cut.open);
  const sorted = sortLoops(byOp.cut.closed.map((p) => p.segments));
  out.push(...(kerf > 0 ? withKerf(sorted, kerf) : sorted));
  return out;
}

/**
 * Cut loops moved by half the kerf: outsides (and islands) outwards, holes inwards. Open runs (cut lines)
 * stay where they are. A hole smaller than the kerf disappears — the beam would take all of it anyway.
 */
export function withKerf(paths: LaserPath[], kerf: number): LaserPath[] {
  const closed = paths.filter((p) => p.closed);
  const depths = nestingDepths(closed.map((p) => p.segments));
  const out: LaserPath[] = [];
  let k = 0;
  for (const p of paths) {
    if (!p.closed) {
      out.push(p);
      continue;
    }
    const depth = depths[k++];
    const moved = offsetLoop(p.segments, depth % 2 === 0 ? kerf / 2 : -kerf / 2);
    if (moved) out.push({ ...p, segments: moved });
  }
  return out;
}

/** A photo on the sheet: the picture, where it goes on the sheet (mm, y up), and whether the whole sheet is mirrored. */
export interface SheetPicture {
  item: PictureItem;
  box: [number, number, number, number];
  /** The sheet is mirrored: draw the picture flipped once more. */
  mirrored: boolean;
}

export interface Sheet extends LaserSheet {
  pictures: SheetPicture[];
}

/** The sheet to write: paths (and photos) moved so the sheet's bottom-left corner is (0, 0). */
export function makeSheet(doc: JuraCUTDocument, opts: SheetOptions = {}): Sheet {
  const items = opts.items ?? doc.items;
  const paths = laserPaths(items, opts.kerf ?? 0);
  const pics = items.filter((it): it is PictureItem => it.kind === "picture" && !it.hidden);
  const picBoxes = pics.map((p) => itemBox(p)!);
  const all = [pathsBox(paths), ...picBoxes].filter((b): b is [number, number, number, number] => !!b);
  const union: [number, number, number, number] = all.length
    ? [Math.min(...all.map((b) => b[0])), Math.min(...all.map((b) => b[1])), Math.max(...all.map((b) => b[2])), Math.max(...all.map((b) => b[3]))]
    : [0, 0, 0, 0];
  const box = opts.wholeBed ? [0, 0, doc.bed[0], doc.bed[1]] : union;
  const W = box[2] - box[0];
  const H = box[3] - box[1];
  const m: [number, number, number, number, number, number] = opts.mirror ? [-1, 0, 0, 1, box[2], -box[1]] : [1, 0, 0, 1, -box[0], -box[1]];
  const moved = movePaths(paths, m);
  const pictures = pics.map((item, i): SheetPicture => {
    const b = picBoxes[i];
    const x0 = m[0] * b[0] + m[4];
    const x1 = m[0] * b[2] + m[4];
    return { item, box: [Math.min(x0, x1), b[1] + m[5], Math.max(x0, x1), b[3] + m[5]], mirrored: !!opts.mirror };
  });
  return { paths: moved, size: [W, H], pieces: [{ name: doc.name, box: [0, 0, W, H] }], pictures };
}

/** Shapes that lie (even partly) off the bed, so the user can be warned. */
export function offBed(doc: JuraCUTDocument): Item[] {
  const [W, H] = doc.bed;
  return doc.items.filter((it) => {
    if (it.hidden) return false;
    const box = pathsBox(itemOutlines(it).map((o) => ({ layer: "outer" as const, ...o })));
    return !!box && (box[0] < -1e-6 || box[1] < -1e-6 || box[2] > W + 1e-6 || box[3] > H + 1e-6);
  });
}
