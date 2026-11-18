import { describe, expect, it } from "vitest";
import { roundedOutlines } from "../src/model/corners";
import { hatchLines } from "../src/model/hatch";
import { itemArea, pathLength } from "../src/model/measure";
import { itemOutlines, makeRect, makeShape } from "../src/model/shapes";
import { useStore } from "../src/model/store";
import type { Outline } from "../src/model/types";
import type { Pt } from "../src/geometry/segments";

const near = (a: number, b: number, tol = 1e-3) => expect(Math.abs(a - b) < tol, `${a} ≈ ${b}`).toBe(true);

const poly = (pts: Pt[], closed = true): Outline => ({
  segments: pts.slice(0, closed ? pts.length : pts.length - 1).map((p, i) => ({ kind: "line" as const, from: p, to: pts[(i + 1) % pts.length] })),
  closed,
});

const square = poly([
  [0, 0],
  [20, 0],
  [20, 20],
  [0, 20],
]);

describe("rounding corners", () => {
  it("rounds a square's four corners to the radius asked", () => {
    const { outlines, corners } = roundedOutlines([square], 3);
    expect(corners).toBe(4);
    // A rounded square loses (4 − π)·r² of area.
    near(itemArea(makeShape("s", "s", outlines)), 400 - (4 - Math.PI) * 9, 0.15);
    // Perimeter: 80 − 8r + 2πr.
    near(pathLength(outlines[0].segments, true), 80 - 24 + 6 * Math.PI, 0.03);
  });
  it("uses the biggest radius that fits when the sides are short", () => {
    const { outlines } = roundedOutlines([square], 50);
    // Every side shared by two corners: the radius becomes 10, a circle.
    near(itemArea(makeShape("s", "s", outlines)), Math.PI * 100, 0.6);
  });
  it("leaves an open line's ends alone and rounds its bends", () => {
    const { outlines, corners } = roundedOutlines(
      [
        poly(
          [
            [0, 0],
            [10, 0],
            [10, 10],
          ],
          false,
        ),
      ],
      2,
    );
    expect(corners).toBe(1);
    const segs = outlines[0].segments;
    expect(segs[0].kind === "line" && segs[0].from).toEqual([0, 0]);
    const last = segs[segs.length - 1];
    expect(last.kind === "line" && last.to).toEqual([10, 10]);
  });
  it("keeps a rectangle a rectangle (just its radius)", () => {
    const s = useStore.getState();
    s.newDocument();
    s.addItems([makeRect("r", 0, 0, 10, 30)]);
    useStore.getState().roundCornersSelected(8);
    const r = useStore.getState().history.present.items[0];
    expect(r.kind === "rect" && r.radius).toBe(5);
  });
});

describe("hatch fill", () => {
  it("fills a square with lines the spacing apart, back and forth", () => {
    const h = hatchLines([square], { spacing: 2, angle: 0, cross: false })!;
    expect(h.length).toBe(10);
    // Each is the square's width.
    for (const o of h) near(pathLength(o.segments, false), 20);
    const a = h[0].segments[0];
    const b = h[1].segments[0];
    expect(a.kind === "line" && b.kind === "line" && a.from[0] < a.to[0] && b.from[0] > b.to[0]).toBe(true);
  });
  it("leaves holes empty and turns with the angle", () => {
    const hole = poly([
      [5, 5],
      [5, 15],
      [15, 15],
      [15, 5],
    ]);
    const h = hatchLines([square, hole], { spacing: 1, angle: 0, cross: false })!;
    const total = h.reduce((sum, o) => sum + pathLength(o.segments, false), 0);
    // Area covered ≈ total length × spacing = 400 − 100.
    near(total, 300, 1e-6);
    const turned = hatchLines([square], { spacing: 1, angle: 45, cross: false })!;
    const t2 = turned.reduce((sum, o) => sum + pathLength(o.segments, false), 0);
    near(t2, 400, 3);
    const cross = hatchLines([square], { spacing: 1, angle: 0, cross: true })!;
    expect(cross.length).toBe(40);
  });
  it("refuses far too many lines, and groups the hatch with its shape", () => {
    expect(hatchLines([poly([[0, 0], [5000, 0], [5000, 5000], [0, 5000]])], { spacing: 0.1, angle: 0, cross: false })).toBe(null);
    const s = useStore.getState();
    s.newDocument();
    s.addItems([makeRect("r", 0, 0, 10, 10)]);
    useStore.getState().hatchSelected({ spacing: 1, angle: 30, cross: false });
    const items = useStore.getState().history.present.items;
    expect(items.length).toBe(2);
    expect(items[1].op).toBe("score");
    expect(items[0].group && items[0].group === items[1].group).toBe(true);
    expect(itemOutlines(items[1]).every((o) => !o.closed)).toBe(true);
  });
});
