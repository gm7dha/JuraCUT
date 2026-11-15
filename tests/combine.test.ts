import { describe, expect, it } from "vitest";
import { booleanRings, signedArea } from "../src/geometry/boolean";
import type { Pt } from "../src/geometry/segments";
import { combinedRings, outlineRings } from "../src/model/combine";
import { makeCircle, makeLine, makeRect, makeText } from "../src/model/shapes";

const sq = (x: number, y: number, s: number): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const area = (rings: Pt[][]) => rings.reduce((a, r) => a + signedArea(r), 0);
const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b) < tol, `${a} ≈ ${b}`).toBe(true);

describe("Boolean operations", () => {
  it("joins, cuts and overlaps two squares", () => {
    const a = [sq(0, 0, 10)];
    const b = [sq(5, 5, 10)];
    near(area(booleanRings(a, b, "union")), 175, 1e-6);
    near(area(booleanRings(a, b, "difference")), 75, 1e-6);
    near(area(booleanRings(a, b, "intersection")), 25, 1e-6);
    near(area(booleanRings(a, b, "xor")), 150, 1e-6);
    expect(booleanRings(a, b, "union").length).toBe(1);
  });
  it("keeps holes, shares edges and handles squares touching at a corner", () => {
    const frame = [sq(0, 0, 10), [...sq(2, 2, 6)].reverse()];
    near(area(booleanRings(frame, [sq(20, 0, 5)], "union")), 64 + 25, 1e-6);
    // Side by side, sharing an edge: one rectangle.
    const r = booleanRings([sq(0, 0, 10)], [sq(10, 0, 10)], "union");
    expect(r.length).toBe(1);
    expect(r[0].length).toBe(4);
    // Corner to corner: two squares.
    const c = booleanRings([sq(0, 0, 10)], [sq(10, 10, 10)], "union");
    expect(c.length).toBe(2);
    near(area(c), 200, 1e-6);
    // A hole punched through the middle.
    const h = booleanRings([sq(0, 0, 10)], [sq(3, 3, 4)], "difference");
    expect(h.length).toBe(2);
    near(area(h), 84, 1e-6);
  });
  it("lines along each other", () => {
    const u = booleanRings([sq(0, 0, 10)], [[[0, 0], [5, 0], [5, 3], [0, 3]]], "union");
    near(area(u), 100, 1e-6);
    expect(u.length).toBe(1);
  });
});

describe("outline and combine", () => {
  it("outlines a rectangle and a line", () => {
    const r = outlineRings([makeRect("a", 0, 0, 20, 10)], 2);
    // 24 × 14 less the corners' squares plus quarter circles.
    near(area(r), 24 * 14 - 16 + 4 * Math.PI, 0.3);
    const l = outlineRings([makeLine("b", 0, 0, 10, 0)], 1);
    near(area(l), 20 + Math.PI, 0.1);
  });
  it("puts a border round words with the gaps filled", () => {
    const r = outlineRings([makeText("t", 0, 0, "OK", 10)], 2);
    expect(r.length).toBe(1);
    expect(area(r) > 0).toBe(true);
  });
  it("joins, cuts out and overlaps shapes", () => {
    const plate = makeRect("p", 0, 0, 40, 20);
    const hole = makeCircle("h", 10, 10, 5);
    near(area(combinedRings([plate, hole], "cutOut")!), 800 - 25 * Math.PI, 0.5);
    near(area(combinedRings([hole, plate], "cutOut")!), 800 - 25 * Math.PI, 0.5);
    near(area(combinedRings([plate, hole], "overlap")!), 25 * Math.PI, 0.5);
    near(area(combinedRings([plate, makeCircle("c", 40, 10, 5)], "join")!), 800 + 12.5 * Math.PI, 0.5);
    expect(combinedRings([plate], "join")).toBe(null);
  });
});
