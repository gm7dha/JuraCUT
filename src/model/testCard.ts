/**
 * A kerf and fit test card for a material (pure), the usual way to find both:
 * - Kerf: ten 10 mm squares cut inside a 100 mm window. Push them all to one end of the window: the gap left is about
 *   ten kerfs (each square loses half a kerf each side), so the gap ÷ 10 is the kerf to put in Materials.
 * - Fit: a comb (one outline) of slots from 0.3 mm narrower to 0.2 mm wider than the material, each labelled. Push an offcut of the
 *   same sheet into each: the one that holds snugly is the slot width to use for joints in it.
 * Everything is one group, placed with its bottom-left corner at (x, y).
 */
import type { Pt, Segment } from "../geometry/segments";
import { makeLine, makeRect, makeShape, makeText } from "./shapes";
import type { Item, Material } from "./types";

export const SLOT_STEPS = [-0.3, -0.2, -0.1, 0, 0.1, 0.2];

export function testCard(material: Material, x: number, y: number, ids: () => string, group: string): Item[] {
  const t = Math.max(0.5, material.thickness);
  const items: Item[] = [];
  const add = (it: Item) => items.push({ ...it, group });
  const fmt = (v: number) => (Math.round(v * 100) / 100).toString();
  // Kerf test: a 120 × 40 plate with a 100 × 10 window of ten squares.
  const W = 120;
  add({ ...makeRect(ids(), x, y + 46, W, 40), name: "Kerf test plate" });
  add({ ...makeRect(ids(), x + 10, y + 46 + 20, 100, 10), name: "Kerf test window" });
  for (let i = 1; i < 10; i++) add({ ...makeLine(ids(), x + 10 + i * 10, y + 46 + 20, x + 10 + i * 10, y + 46 + 30), name: "Kerf test cut" });
  add({ ...makeText(ids(), x + W / 2, y + 46 + 8, "Push the squares to one end: gap ÷ 10 = kerf", 3.2), align: "centre", name: "Kerf test words" });
  add({ ...makeText(ids(), x + W / 2, y + 46 + 33.5, `KERF TEST · ${material.name}`, 3.5), align: "centre", name: "Kerf test title" });
  // Fit test: a comb of slots, each t + step wide and 15 deep, 14 apart, with its width engraved under it.
  const n = SLOT_STEPS.length;
  const pitch = 18;
  const CW = n * pitch + 8;
  const H = 40;
  const DEPTH = 15;
  // One outline: along the bottom, up the right, then leftwards along the top dipping into each slot.
  const pts: Pt[] = [
    [x, y],
    [x + CW, y],
    [x + CW, y + H],
  ];
  for (let i = n - 1; i >= 0; i--) {
    const w = t + SLOT_STEPS[i];
    const cx = x + 4 + pitch * (i + 0.5);
    pts.push([cx + w / 2, y + H], [cx + w / 2, y + H - DEPTH], [cx - w / 2, y + H - DEPTH], [cx - w / 2, y + H]);
  }
  pts.push([x, y + H]);
  add({ ...makeShape(ids(), "Fit test comb", [{ closed: true, segments: pts.map((p, i): Segment => ({ kind: "line", from: p, to: pts[(i + 1) % pts.length] })) }]) });
  SLOT_STEPS.forEach((st, i) => {
    const cx = x + 4 + pitch * (i + 0.5);
    add({ ...makeText(ids(), cx, y + H - DEPTH - 7, fmt(t + st), 3), align: "centre", name: `Slot ${fmt(t + st)} mm` });
  });
  add({ ...makeText(ids(), x + CW / 2, y + 5, `FIT TEST · ${fmt(t)} mm sheet`, 3.5), align: "centre", name: "Fit test title" });
  return items;
}
