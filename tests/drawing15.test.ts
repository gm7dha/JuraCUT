import { describe, expect, it } from "vitest";
import { signedArea } from "../src/geometry/boolean";
import { brokenApart } from "../src/model/breakApart";
import { insetRings } from "../src/model/combine";
import { parseDocument } from "../src/model/document";
import { itemArea, itemLength } from "../src/model/measure";
import { roundItems } from "../src/model/repeat";
import { scaledItem } from "../src/model/resize";
import { itemBox, makeCircle, makePolygon, makeRect, makeText, mirroredItem, polygonPoints, rotatedItem } from "../src/model/shapes";

const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b) < tol, `${a} ≈ ${b}`).toBe(true);

describe("polygons and stars", () => {
  it("has its corners on the circle, a star's inner ones nearer", () => {
    const hex = makePolygon("p", 10, 10, 5, 6, 90);
    const pts = polygonPoints(hex);
    expect(pts.length).toBe(6);
    for (const p of pts) near(Math.hypot(p[0] - 10, p[1] - 10), 5);
    near(pts[0][0], 10);
    near(pts[0][1], 15);
    const star = makePolygon("s", 0, 0, 10, 5, 90, 0.4);
    const sp = polygonPoints(star);
    expect(sp.length).toBe(10);
    near(Math.hypot(sp[1][0], sp[1][1]), 4);
    near(itemArea(makePolygon("q", 0, 0, Math.SQRT1_2 * 10, 4, 45)), 100, 1e-3);
  });
  it("turns, flips, resizes and is read back from a file", () => {
    const tri = makePolygon("t", 0, 0, 10, 3, 90);
    const turned = rotatedItem(tri, 30);
    expect(turned.kind === "polygon" && turned.angle).toBe(120);
    const flipped = mirroredItem(makePolygon("t", 0, 0, 10, 5, 80));
    expect(flipped.kind === "polygon" && Math.round(flipped.angle)).toBe(100);
    const big = scaledItem(tri, 2, 2, [0, 0]);
    expect(big.kind === "polygon" && big.r).toBe(20);
    expect(scaledItem(tri, 2, 1, [0, 0]).kind).toBe("shape");
    const doc = parseDocument({ format: "juracut", items: [{ ...makePolygon("x", 1, 2, 3, 200, 0, 0.5) }] });
    const p = doc!.items[0];
    expect(p.kind === "polygon" && p.sides === 100 && p.star === 0.5).toBe(true);
  });
});

describe("break apart, inside outline, round repeat, measuring", () => {
  it("splits words into letters, keeping holes with their letters", () => {
    let k = 0;
    const parts = brokenApart(makeText("w", 0, 0, "OO", 10), () => `n${k++}`);
    expect(parts.length).toBe(2);
    for (const p of parts) expect(p.kind === "shape" && p.outlines.length).toBe(2);
    expect(brokenApart(makeRect("r", 0, 0, 5, 5), () => "z").length).toBe(1);
  });
  it("moves a frame's edges in", () => {
    const rings = insetRings([makeRect("r", 0, 0, 20, 10)], 2);
    near(rings.reduce((a, r) => a + signedArea(r), 0), 16 * 6, 1e-6);
    expect(insetRings([makeRect("r", 0, 0, 20, 3)], 2).length).toBe(0);
  });
  it("puts copies round a circle", () => {
    const c = makeCircle("c", 0, 50, 5);
    const made = roundItems([c], [c], 4, 50, true);
    expect(made.length).toBe(3);
    const centres = made.map((it) => itemBox(it)!).map((b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
    near(centres[0][0], 50);
    near(centres[0][1], 0);
    near(centres[1][0], 0);
    near(centres[1][1], -50);
  });
  it("measures lines and areas", () => {
    near(itemLength(makeRect("r", 0, 0, 20, 10)), 60);
    near(itemLength(makeCircle("c", 0, 0, 10)), 20 * Math.PI, 0.05);
    near(itemArea(makeRect("r", 0, 0, 20, 10)), 200);
  });
});
