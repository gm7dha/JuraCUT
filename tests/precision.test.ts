import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/model/document";
import { makeCircle, makeLine, makeRect, makeText, rotatedItem } from "../src/model/shapes";
import { shapePoints, snapLines, snapPoint, snapPointsMove } from "../src/model/snap";

describe("snapping to shapes' points", () => {
  it("offers corners, middles, ends and centres", () => {
    const pts = shapePoints(makeRect("r", 0, 0, 10, 10));
    expect(pts.some(([x, y]) => x === 10 && y === 10)).toBe(true);
    expect(pts.some(([x, y]) => x === 5 && y === 0)).toBe(true);
    expect(shapePoints(makeCircle("c", 3, 4, 2))[0]).toEqual([3, 4]);
    expect(shapePoints(makeLine("l", 0, 0, 4, 0)).some(([x]) => x === 2)).toBe(true);
    expect(shapePoints(makeText("t", 0, 0, "Hi")).length).toBe(0);
  });
  it("a point near a corner lands on it; moving shapes' corners land on others'", () => {
    const lines = snapLines([makeRect("r", 10, 10, 20, 20)], [], [600, 300]);
    const s = snapPoint([30.4, 29.7], lines, 1);
    expect(s.p).toEqual([30, 30]);
    expect(s.point).toEqual([30, 30]);
    const m = snapPointsMove([[0, 0]], 9.6, 10.3, lines.points!, 1)!;
    expect(m.dx === 10 && m.dy === 10).toBe(true);
    expect(snapPointsMove([[0, 0]], 5, 5, lines.points!, 1)).toBe(null);
  });
});

describe("locking", () => {
  it("is kept in files and when a shape becomes an outline", () => {
    const doc = parseDocument({ format: "juracut", items: [{ ...makeRect("r", 0, 0, 5, 5), locked: true }, makeRect("s", 0, 0, 5, 5)] });
    expect(doc!.items[0].locked).toBe(true);
    expect(doc!.items[1].locked).toBe(undefined);
    expect(rotatedItem({ ...makeLine("l", 0, 0, 5, 5), locked: true }, 30).locked).toBe(true);
  });
});
