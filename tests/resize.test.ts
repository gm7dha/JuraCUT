import { describe, expect, it } from "vitest";

import { pathsBox } from "../src/geometry/segments";
import { anchorOf, canStretch, dragScale, resizedItems, scaledItem } from "../src/model/resize";
import { itemBox, itemOutlines, makeCircle, makeLine, makeRect, makeText } from "../src/model/shapes";
import type { Item } from "../src/model/types";

const box = (it: Item) => itemBox(it)!;
const near = (a: number[], b: number[], d = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], d));

describe("resizing shapes", () => {
  it("a rectangle stays a rectangle, scaled from the anchor (turned a quarter turn, its sides swap)", () => {
    const r = makeRect("r", 10, 10, 40, 20);
    const s = scaledItem(r, 2, 0.5, [10, 10]);
    expect(s.kind).toBe("rect");
    near(box(s), [10, 10, 90, 20]);
    const turned = { ...r, angle: 90 };
    const t = scaledItem(turned, 2, 1, [0, 0]);
    expect(t.kind).toBe("rect");
    const b = box(turned);
    near(box(t), [b[0] * 2, b[1], b[2] * 2, b[3]]);
    // At a slant it can only stay a rectangle when scaled evenly.
    expect(scaledItem({ ...r, angle: 30 }, 2, 2, [0, 0]).kind).toBe("rect");
    const slanted = scaledItem({ ...r, angle: 30 }, 2, 1, [0, 0]);
    expect(slanted.kind).toBe("shape");
    near(box(slanted), [box({ ...r, angle: 30 })[0] * 2, box({ ...r, angle: 30 })[1], box({ ...r, angle: 30 })[2] * 2, box({ ...r, angle: 30 })[3]], 3);
  });

  it("circles and words grow evenly and stay editable; stretched, they become outlines of the right size", () => {
    const c = makeCircle("c", 50, 50, 10);
    expect(scaledItem(c, 1.5, 1.5, [40, 40])).toMatchObject({ kind: "circle", cx: 55, cy: 55, r: 15 });
    const oval = scaledItem(c, 2, 1, [40, 40]);
    expect(oval.kind).toBe("shape");
    near(box(oval), [40, 40, 80, 60], 4);
    const t = makeText("t", 0, 0, "HI", 10);
    const big = scaledItem(t, 2, 2, [0, 0]);
    expect(big).toMatchObject({ kind: "text", size: 20 });
    const b = box(t);
    near(box(big), b.map((v) => v * 2), 4);
    expect(canStretch([c, t])).toBe(false);
    expect(canStretch([c, makeLine("l", 0, 0, 5, 5)])).toBe(true);
  });

  it("shape outlines with arcs keep their arcs when scaled evenly and stay exact when stretched", () => {
    const rounded = { ...makeRect("r", 0, 0, 40, 20), radius: 5 };
    const asShape: Item = { id: "s", name: "S", op: "cut", kind: "shape", outlines: itemOutlines(rounded) };
    const even = scaledItem(asShape, 3, 3, [0, 0]);
    expect(even.kind === "shape" && even.outlines[0].segments.some((s) => s.kind === "arc")).toBe(true);
    near(box(even), [0, 0, 120, 60], 4);
    const stretched = scaledItem(asShape, 2, 1, [0, 0]);
    expect(stretched.kind === "shape" && stretched.outlines[0].segments.every((s) => s.kind === "line" || s.kind === "bezier")).toBe(true);
    near(pathsBox((stretched as Extract<Item, { kind: "shape" }>).outlines.map((o) => ({ layer: "outer" as const, ...o })))!, [0, 0, 80, 20], 4);
  });

  it("works out the scale from a dragged handle, keeping proportions when asked, never below the smallest size", () => {
    const b: [number, number, number, number] = [0, 0, 100, 50];
    expect(anchorOf(b, "ne")).toEqual([0, 0]);
    expect(dragScale(b, "ne", [200, 75], false)).toEqual([2, 1.5]);
    expect(dragScale(b, "ne", [200, 75], true)).toEqual([2, 2]);
    expect(dragScale(b, "e", [50, 999], false)).toEqual([0.5, 1]);
    expect(dragScale(b, "sw", [-100, -50], false)).toEqual([2, 2]);
    const tiny = dragScale(b, "e", [-500, 0], false);
    expect(tiny[0] * 100).toBeCloseTo(0.5, 9);
  });

  it("scales only the chosen shapes", () => {
    const items = [makeRect("a", 0, 0, 10, 10), makeRect("b", 50, 0, 10, 10)];
    const out = resizedItems(items, ["a"], 2, 2, [0, 0]);
    near(box(out[0]), [0, 0, 20, 20]);
    expect(out[1]).toBe(items[1]);
  });
});
