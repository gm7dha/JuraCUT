import { describe, expect, it } from "vitest";

import { nestingDepths, offsetLoop } from "../src/geometry/offset";
import { pathPoints, pathsBox, type Segment } from "../src/geometry/segments";
import { laserPaths } from "../src/laser/sheet";
import { makeCircle, makeRect } from "../src/model/shapes";

const square = (x: number, y: number, s: number): Segment[] => [
  { kind: "line", from: [x, y], to: [x + s, y] },
  { kind: "line", from: [x + s, y], to: [x + s, y + s] },
  { kind: "line", from: [x + s, y + s], to: [x, y + s] },
  { kind: "line", from: [x, y + s], to: [x, y] },
];
const area = (poly: [number, number][]) => Math.abs(poly.reduce((a, p, i) => a + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1], 0) / 2);

describe("offsetLoop", () => {
  it("moves a square out with round corners, and in with square ones", () => {
    const out = offsetLoop(square(0, 0, 10), 1)!;
    expect(out.filter((s) => s.kind === "arc")).toHaveLength(4);
    expect(pathsBox([{ layer: "outer", segments: out, closed: true }])!.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([-1, -1, 11, 11]);
    const inn = offsetLoop(square(0, 0, 10), -1)!;
    expect(inn.every((s) => s.kind === "line")).toBe(true);
    expect(pathsBox([{ layer: "outer", segments: inn, closed: true }])!.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 1, 9, 9]);
  });

  it("does the same whichever way round the loop was drawn", () => {
    const cw = [...square(0, 0, 10)].reverse().map((s) => (s.kind === "line" ? { kind: "line" as const, from: s.to, to: s.from } : s));
    const out = offsetLoop(cw, 1)!;
    expect(pathsBox([{ layer: "outer", segments: out, closed: true }])!.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([-1, -1, 11, 11]);
  });

  it("keeps a circle a circle and loses a hole smaller than the move", () => {
    const c = offsetLoop([{ kind: "circle", center: [5, 5], radius: 2 }], 0.1)!;
    expect(c[0]).toEqual({ kind: "circle", center: [5, 5], radius: 2.1 });
    expect(offsetLoop([{ kind: "circle", center: [5, 5], radius: 0.05 }], -0.1)).toBeNull();
    expect(offsetLoop(square(0, 0, 1), -0.6)).toBeNull();
  });

  it("handles a concave shape: an L keeps its inside corner sharp when moved out", () => {
    const L: Segment[] = [
      { kind: "line", from: [0, 0], to: [10, 0] },
      { kind: "line", from: [10, 0], to: [10, 4] },
      { kind: "line", from: [10, 4], to: [4, 4] },
      { kind: "line", from: [4, 4], to: [4, 10] },
      { kind: "line", from: [4, 10], to: [0, 10] },
      { kind: "line", from: [0, 10], to: [0, 0] },
    ];
    const out = offsetLoop(L, 0.5)!;
    const pts = pathPoints(out, true, 0.01);
    // The inside corner (4, 4) moves to (4.5, 4.5).
    expect(pts.some((p) => Math.abs(p[0] - 4.5) < 1e-6 && Math.abs(p[1] - 4.5) < 1e-6)).toBe(true);
    expect(area(pts)).toBeGreaterThan(area(pathPoints(L, true)));
  });
});

describe("kerf on a sheet", () => {
  it("moves the outside out and holes in, by half the kerf", () => {
    const items = [makeRect("plate", 0, 0, 40, 30), makeCircle("hole", 20, 15, 5)];
    const paths = laserPaths(items, 0.2);
    const outer = paths.find((p) => p.layer === "outer")!;
    const inner = paths.find((p) => p.layer === "inner")!;
    expect(pathsBox([outer])!.map((v) => Math.round(v * 1000) / 1000)).toEqual([-0.1, -0.1, 40.1, 30.1]);
    expect(inner.segments[0]).toEqual({ kind: "circle", center: [20, 15], radius: 4.9 });
    expect(nestingDepths([square(0, 0, 40), square(10, 10, 20), square(15, 15, 5)])).toEqual([0, 1, 2]);
  });
});
