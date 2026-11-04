import { describe, expect, it } from "vitest";

import { arrangeOnBed, chainEdges, layoutPieces, pathsBox, sortLoops, type Segment } from "../src/geometry/segments";

const line = (a: [number, number], b: [number, number]): Segment => ({ kind: "line", from: a, to: b });

const square = (x: number, y: number, s: number): Segment[] => [
  line([x, y], [x + s, y]),
  line([x + s, y], [x + s, y + s]),
  line([x + s, y + s], [x, y + s]),
  line([x, y + s], [x, y]),
];

describe("chainEdges", () => {
  it("joins pieces in any order and direction into one loop", () => {
    const sq = square(0, 0, 10);
    const shuffled = [sq[2], line([10, 0], [0, 0]), sq[3], sq[1]];
    const { loops, open } = chainEdges(shuffled);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(4);
    expect(open).toHaveLength(0);
  });

  it("keeps an open run open and a circle as a loop of its own", () => {
    const { loops, open } = chainEdges([line([0, 0], [5, 0]), line([5, 0], [5, 5]), { kind: "circle", center: [20, 20], radius: 3 }]);
    expect(loops).toHaveLength(1);
    expect(open).toHaveLength(1);
    expect(open[0]).toHaveLength(2);
  });
});

describe("sortLoops", () => {
  it("cuts holes before the outline round them", () => {
    const paths = sortLoops([square(0, 0, 40), square(10, 10, 5)]);
    expect(paths.map((p) => p.layer)).toEqual(["inner", "outer"]);
  });

  it("an island inside a hole is cut first of all", () => {
    const paths = sortLoops([square(0, 0, 40), square(5, 5, 30), square(10, 10, 5)]);
    expect(paths.map((p) => p.layer)).toEqual(["inner", "inner", "outer"]);
    expect(pathsBox([paths[0]])).toEqual([10, 10, 15, 15]);
  });
});

describe("layoutPieces", () => {
  it("lays pieces side by side from the origin", () => {
    const sheet = layoutPieces([
      { name: "a", paths: [{ layer: "outer", segments: square(100, 100, 30), closed: true }] },
      { name: "b", paths: [{ layer: "outer", segments: square(0, 0, 20), closed: true }] },
    ]);
    expect(sheet.size[0]).toBeCloseTo(55, 6);
    expect(sheet.size[1]).toBeCloseTo(30, 6);
    const box = pathsBox(sheet.paths)!;
    expect(box[0]).toBeCloseTo(0, 9);
    expect(box[1]).toBeCloseTo(0, 9);
  });
});

describe("arrangeOnBed", () => {
  it("turns a piece a quarter turn when that's the only way it fits", () => {
    const r = arrangeOnBed([{ id: "long", size: [250, 50] }], [100, 300], 5);
    expect(r.places[0].turned).toBe(true);
    expect(r.tooBig).toHaveLength(0);
  });

  it("puts what can't fit beside the bed", () => {
    const r = arrangeOnBed([{ id: "huge", size: [700, 50] }], [600, 300], 5);
    expect(r.tooBig).toEqual(["huge"]);
    expect(r.places[0].onBed).toBe(false);
    expect(r.places[0].x).toBeGreaterThan(600);
  });
});
