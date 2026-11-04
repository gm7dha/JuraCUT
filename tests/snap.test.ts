import { describe, expect, it } from "vitest";

import { nearestLine, rulerStep, snapBoxMove, snapLines, snapPoint } from "../src/model/snap";
import { makeRect } from "../src/model/shapes";

describe("snapping", () => {
  const items = [makeRect("a", 10, 10, 20, 20), makeRect("b", 100, 100, 10, 10)];
  const lines = snapLines(items, ["b"], [600, 300]);

  it("offers the other shapes' edges and middles, and the bed's", () => {
    expect(lines.xs).toEqual([0, 300, 600, 10, 20, 30]);
    expect(lines.ys).toEqual([0, 150, 300, 10, 20, 30]);
    expect(nearestLine(29.5, lines.xs, 1)).toBe(30);
    expect(nearestLine(25, lines.xs, 1)).toBeNull();
  });

  it("pulls a drawn point onto nearby lines", () => {
    const near = snapPoint([30.4, 55], lines, 1);
    expect(near.p).toEqual([30, 55]);
    expect(near.guideX).toBe(30);
    expect(near.guideY).toBeNull();
  });

  it("lines a moved box's edge up with another shape's edge", () => {
    // b (100…110) moved left by 69.6 would put its left edge at 30.4: snap it to a's right edge at 30.
    const m = snapBoxMove([100, 100, 110, 110], -69.6, 0, lines, 1);
    expect(m.dx).toBeCloseTo(-70, 9);
    expect(m.guideX).toBe(30);
    expect(m.guideY).toBeNull();
  });

  it("picks ruler steps that stay readable", () => {
    expect(rulerStep(1)).toBe(100);
    expect(rulerStep(1.5)).toBe(50);
    expect(rulerStep(10)).toBe(10);
    expect(rulerStep(40)).toBe(2);
  });
});
