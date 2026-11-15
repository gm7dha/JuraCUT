/**
 * Break apart (pure): a shape made of several separate pieces — a traced picture, an imported drawing, words, a
 * joined shape — split into one shape per piece. A piece is an outside with the holes directly in it; an island in a
 * hole is a piece of its own; each open line is one too.
 */
import { signedArea } from "../geometry/boolean";
import { nestingDepths } from "../geometry/offset";
import { pathPoints, pointInPolygon, type Pt } from "../geometry/segments";
import { itemOutlines } from "./shapes";
import type { Item, Outline } from "./types";

/** The pieces' outlines (one entry per piece, outsides first, then open lines). */
export function piecesOfOutlines(outlines: Outline[]): Outline[][] {
  const closed = outlines.filter((o) => o.closed);
  const open = outlines.filter((o) => !o.closed);
  const depths = nestingDepths(closed.map((o) => o.segments));
  const polys = closed.map((o) => pathPoints(o.segments, true, 0.02));
  const areas = polys.map((p) => Math.abs(signedArea(p as Pt[])));
  const pieces = new Map<number, Outline[]>();
  closed.forEach((o, i) => {
    if (depths[i] % 2 === 0) pieces.set(i, [o]);
  });
  closed.forEach((o, i) => {
    if (depths[i] % 2 === 0) return;
    // Its parent: the smallest outside round it, one level up.
    const p = polys[i][0];
    let best = -1;
    closed.forEach((_, j) => {
      if (depths[j] !== depths[i] - 1 || !pointInPolygon(p, polys[j])) return;
      if (best < 0 || areas[j] < areas[best]) best = j;
    });
    if (best >= 0) pieces.get(best)!.push(o);
    else pieces.set(i, [o]);
  });
  return [...pieces.values(), ...open.map((o) => [o])];
}

/** The item as separate shapes (the same item, unchanged, when it's one piece or can't be split). */
export function brokenApart(item: Item, newIds: () => string): Item[] {
  if (item.kind === "picture") return [item];
  const pieces = piecesOfOutlines(itemOutlines(item));
  if (pieces.length < 2) return [item];
  return pieces.map((outlines, k) => ({
    id: k === 0 ? item.id : newIds(),
    name: `${item.name} ${k + 1}`,
    op: item.op,
    kind: "shape",
    outlines,
    ...(item.hidden ? { hidden: true } : {}),
  }));
}
