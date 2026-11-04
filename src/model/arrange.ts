/**
 * Groups, and lining shapes up: align their edges or middles, and space them
 * out evenly. Pure: each takes the design's items and gives new ones.
 *
 * A group is a set of shapes with the same `group` id: clicking one picks
 * them all, and align/distribute treat a group as one piece.
 */
import { itemBox, mirrorX, movedItem, rotatedItemAbout, transformedItem } from "./shapes";
import type { Item } from "./types";

type Box = [number, number, number, number];

/** Every id in the same group as any of `ids` (and the ids themselves). */
export function withGroups(items: readonly Item[], ids: readonly string[]): string[] {
  const groups = new Set(items.filter((it) => ids.includes(it.id) && it.group).map((it) => it.group!));
  if (!groups.size) return [...ids];
  const out = new Set(ids);
  for (const it of items) if (it.group && groups.has(it.group)) out.add(it.id);
  // Keep the design's order, so selections compare equal however they were made.
  return items.filter((it) => out.has(it.id)).map((it) => it.id);
}

/** A group id not used yet. */
export function newGroupId(items: readonly Item[]): string {
  const taken = new Set(items.map((it) => it.group).filter(Boolean));
  for (let k = 1; ; k++) if (!taken.has(`g${k}`)) return `g${k}`;
}

/** The chosen shapes made into one group (their old groups merged into it). */
export function grouped(items: readonly Item[], ids: readonly string[]): Item[] {
  const all = withGroups(items, ids);
  if (all.length < 2) return [...items];
  const id = newGroupId(items);
  return items.map((it) => (all.includes(it.id) ? { ...it, group: id } : it));
}

/** The chosen shapes (and the rest of their groups) taken out of their groups. */
export function ungrouped(items: readonly Item[], ids: readonly string[]): Item[] {
  const all = withGroups(items, ids);
  return items.map((it) => {
    if (!all.includes(it.id) || !it.group) return it;
    const { group: _drop, ...rest } = it;
    void _drop;
    return rest as Item;
  });
}

/** Groups left with a single shape are no longer groups. */
export function tidyGroups(items: readonly Item[]): Item[] {
  const count = new Map<string, number>();
  for (const it of items) if (it.group) count.set(it.group, (count.get(it.group) ?? 0) + 1);
  return items.map((it) => {
    if (!it.group || (count.get(it.group) ?? 0) > 1) return it;
    const { group: _drop, ...rest } = it;
    void _drop;
    return rest as Item;
  });
}

const union = (boxes: Box[]): Box | null =>
  boxes.length ? [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))] : null;

/** The chosen shapes as pieces: a group is one piece, any other shape its own. */
export function piecesOf(items: readonly Item[], ids: readonly string[]): { ids: string[]; box: Box }[] {
  const chosen = items.filter((it) => ids.includes(it.id) && itemBox(it));
  const byKey = new Map<string, Item[]>();
  for (const it of chosen) {
    const key = it.group ? `group:${it.group}` : `item:${it.id}`;
    byKey.set(key, [...(byKey.get(key) ?? []), it]);
  }
  return [...byKey.values()].map((members) => ({ ids: members.map((m) => m.id), box: union(members.map((m) => itemBox(m)!))! }));
}

/** The box round some shapes, or null. */
export function boxOf(items: readonly Item[], ids: readonly string[]): Box | null {
  return union(items.filter((it) => ids.includes(it.id)).flatMap((it) => (itemBox(it) ? [itemBox(it)!] : [])));
}

export type AlignTo = "left" | "centre" | "right" | "bottom" | "middle" | "top";

/**
 * What the pieces line up against: each other (the box round them all), the key shape (the piece picked first, which
 * stays put), or the bed. A single piece always lines up with the bed.
 */
export type AlignAgainst = "each" | "key" | "bed";

/** The piece the others line up with when lining up against the key shape: the one holding the first shape picked. */
export function keyPiece(items: readonly Item[], ids: readonly string[]): { ids: string[]; box: Box } | null {
  const pieces = piecesOf(items, ids);
  if (pieces.length < 2) return null;
  return pieces.find((p) => p.ids.includes(ids[0])) ?? pieces[0];
}

/**
 * Line the chosen pieces up: left edges, middles or right edges; bottoms, middles or tops — against each other (the box
 * round them all), the key shape (which stays put) or the bed. A single piece lines up with the bed.
 */
export function aligned(items: readonly Item[], ids: readonly string[], to: AlignTo, bed: [number, number], against: AlignAgainst = "each"): Item[] {
  const pieces = piecesOf(items, ids);
  if (!pieces.length) return [...items];
  const key = against === "key" ? keyPiece(items, ids) : null;
  const all: Box = pieces.length === 1 || against === "bed" ? [0, 0, bed[0], bed[1]] : key ? key.box : union(pieces.map((p) => p.box))!;
  const shift = new Map<string, [number, number]>();
  for (const p of pieces) {
    const b = p.box;
    let dx = 0;
    let dy = 0;
    if (to === "left") dx = all[0] - b[0];
    if (to === "right") dx = all[2] - b[2];
    if (to === "centre") dx = (all[0] + all[2]) / 2 - (b[0] + b[2]) / 2;
    if (to === "bottom") dy = all[1] - b[1];
    if (to === "top") dy = all[3] - b[3];
    if (to === "middle") dy = (all[1] + all[3]) / 2 - (b[1] + b[3]) / 2;
    for (const id of p.ids) shift.set(id, [dx, dy]);
  }
  return movedBy(items, shift);
}

/**
 * Move the chosen shapes together, as they are, so the box round them sits in the middle of the bed: across, up and
 * down, or both.
 */
export function centredOnBed(items: readonly Item[], ids: readonly string[], bed: [number, number], axis: "x" | "y" | "both" = "both"): Item[] {
  const box = boxOf(items, ids);
  if (!box) return [...items];
  const dx = axis === "y" ? 0 : bed[0] / 2 - (box[0] + box[2]) / 2;
  const dy = axis === "x" ? 0 : bed[1] / 2 - (box[1] + box[3]) / 2;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return [...items];
  return items.map((it) => (ids.includes(it.id) && itemBox(it) ? movedItem(it, dx, dy) : it));
}

function movedBy(items: readonly Item[], shift: Map<string, [number, number]>): Item[] {
  return items.map((it) => {
    const d = shift.get(it.id);
    return d && (d[0] || d[1]) ? movedItem(it, d[0], d[1]) : it;
  });
}

/**
 * Space the chosen pieces out evenly across (x) or up (y): the first and last
 * stay where they are and the gaps between all the pieces become equal.
 * With `gap`, they're set exactly that far apart instead, from the first.
 */
export function distributed(items: readonly Item[], ids: readonly string[], axis: "x" | "y", gap?: number): Item[] {
  const pieces = piecesOf(items, ids);
  if (pieces.length < (gap === undefined ? 3 : 2)) return [...items];
  const lo = axis === "x" ? 0 : 1;
  const hi = axis === "x" ? 2 : 3;
  const sorted = [...pieces].sort((a, b) => a.box[lo] + a.box[hi] - (b.box[lo] + b.box[hi]));
  const sizes = sorted.map((p) => p.box[hi] - p.box[lo]);
  const span = sorted[sorted.length - 1].box[hi] - sorted[0].box[lo];
  const even = gap ?? (span - sizes.reduce((a, b) => a + b, 0)) / (sorted.length - 1);
  const shift = new Map<string, number>();
  let at = sorted[0].box[lo];
  sorted.forEach((p, i) => {
    const d = at - p.box[lo];
    for (const id of p.ids) shift.set(id, d);
    at += sizes[i] + even;
  });
  return items.map((it) => {
    const d = shift.get(it.id);
    if (!d) return it;
    return axis === "x" ? movedItem(it, d, 0) : movedItem(it, 0, d);
  });
}

/** Groups turn about their middle as one piece; other shapes about their own middle. */
export function turnedPieces(items: readonly Item[], ids: readonly string[], angle: number): Item[] {
  const turned = new Map<string, Item>();
  for (const p of piecesOf(items, ids)) {
    const centre: [number, number] = [(p.box[0] + p.box[2]) / 2, (p.box[1] + p.box[3]) / 2];
    for (const id of p.ids) {
      const it = items.find((x) => x.id === id)!;
      turned.set(id, rotatedItemAbout(it, angle, centre));
    }
  }
  return items.map((it) => turned.get(it.id) ?? it);
}

/** Groups flip left to right about their middle as one piece; other shapes about their own middle. */
export function mirroredPieces(items: readonly Item[], ids: readonly string[]): Item[] {
  const flipped = new Map<string, Item>();
  for (const p of piecesOf(items, ids)) {
    const m = mirrorX((p.box[0] + p.box[2]) / 2);
    for (const id of p.ids) flipped.set(id, transformedItem(items.find((x) => x.id === id)!, m));
  }
  return items.map((it) => flipped.get(it.id) ?? it);
}
