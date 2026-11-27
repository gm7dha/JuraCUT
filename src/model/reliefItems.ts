/**
 * The island relief put on the bed as ordinary shapes (pure): the depth picture (engraved in greys, only inside the
 * coast), the coast and any jigsaw cuts (cut), contour lines (scored), and the frame with the island's name. All one
 * group, placed `corner` mm in from the bed's front-left corner.
 */
import type { Segment } from "../geometry/segments";
import type { Relief, ReliefSpec } from "../terrain/relief";
import { makePicture, makeRect, makeText, makeShape, movedItem } from "./shapes";
import type { Item, Outline, PictureItem } from "./types";

const outlines = (loops: Segment[][], closed: boolean): Outline[] => loops.map((segments) => ({ segments, closed }));

/** Ids are taken from `freshId` in turn; `src` is the depth picture (a data: URL of `relief.greys`). */
export function reliefItems(relief: Relief, spec: ReliefSpec, src: string, name: string, freshId: () => string, corner: [number, number] = [10, 10]): Item[] {
  const group = freshId();
  const label = name.trim() || "Island";
  const items: Item[] = [];
  const W = relief.width;
  const H = relief.height;
  const coast = outlines(relief.coast, true);
  const picture: PictureItem = {
    ...makePicture(freshId(), `${label} — depth`, src, W / 2, H / 2, W, H),
    mode: "greys",
    dpm: 10,
    // Only the land is carved: the picture is clipped to the coast (measured from the picture's middle).
    clip: coast.map((o) => moveOutline(o, -W / 2, -H / 2)),
  };
  items.push(picture);
  if (relief.contours.length) items.push({ ...makeShape(freshId(), `${label} — contours`, outlines(relief.contours, true)), op: "score" });
  items.push(makeShape(freshId(), `${label} — coast`, coast));
  if (relief.cuts.length) items.push(makeShape(freshId(), `${label} — jigsaw cuts`, outlines(relief.cuts, false)));
  if (relief.frame) {
    const f = relief.frame;
    items.push({ ...makeRect(freshId(), f.x, f.y, f.w, f.h), name: `${label} — frame`, radius: Math.min(4, f.w / 20) });
    if (f.nameAt && spec.name.trim()) items.push({ ...makeText(freshId(), f.nameAt[0], f.nameAt[1], spec.name.trim(), f.nameSize), name: `${label} — name`, align: "centre", font: "inter-bold" });
  }
  // Placed with the whole thing's lower-left corner at `corner`.
  const [x0, y0] = relief.frame ? [relief.frame.x, relief.frame.y] : [0, 0];
  return items.map((it) => ({ ...movedItem(it, corner[0] - x0, corner[1] - y0), group }));
}

function moveOutline(o: Outline, dx: number, dy: number): Outline {
  // A shape item moved by the shared code, so every kind of segment moves the same way.
  const moved = movedItem(makeShape("x", "x", [o]), dx, dy);
  return moved.kind === "shape" ? moved.outlines[0] : o;
}

/**
 * A depth test strip: squares from no burn to full depth (an engraved greys picture), each labelled with its depth,
 * and a cut line round it, to try on scrap before the real thing. `src` is testStripGreys' picture; `levels` its shares.
 */
export function testStripItems(levels: number[], depth: number, src: string, freshId: () => string, corner: [number, number] = [10, 10], cell = 10): Item[] {
  const group = freshId();
  const n = levels.length;
  const W = n * cell;
  const margin = 3;
  const labelSize = 3;
  const items: Item[] = [];
  const pic = { ...makePicture(freshId(), "Depth test — squares", src, W / 2, labelSize + 2 + cell / 2, W, cell), mode: "greys" as const, dpm: 10 };
  items.push(pic);
  levels.forEach((share, k) => {
    const mm = Math.round(share * depth * 10) / 10;
    items.push({ ...makeText(freshId(), k * cell + cell / 2, 0.5, `${mm}`, labelSize), name: `Depth test — ${mm} mm`, align: "centre" });
  });
  items.push({ ...makeRect(freshId(), -margin, -margin, W + 2 * margin, labelSize + 2 + cell + 2 * margin), name: "Depth test — cut out" });
  return items.map((it) => ({ ...movedItem(it, corner[0] + margin, corner[1] + margin), group }));
}
