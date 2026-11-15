import { describe, expect, it } from "vitest";
import { itemLength } from "../src/model/measure";
import { makeCircle, makeLine, makeRect } from "../src/model/shapes";
import { outlineNear, trimmed } from "../src/model/trim";

const near = (a: number, b: number, tol = 1e-3) => expect(Math.abs(a - b) < tol, `${a} ≈ ${b}`).toBe(true);

describe("trimming", () => {
  const square = makeRect("s", 0, 0, 10, 10);
  const line = makeLine("l", 5, -5, 5, 15);
  it("takes out the stretch of a closed shape between two crossings", () => {
    const t = trimmed(square, 0, [8, 10], [line])!;
    expect(t.kind).toBe("shape");
    near(itemLength(t), 20);
  });
  it("takes an open line back to its last crossing, or away entirely", () => {
    near(itemLength(trimmed(line, 0, [5, 12], [square])!), 15);
    near(itemLength(trimmed(line, 0, [5, 5], [square])!), 10); // the middle goes: two pieces of 5
    expect(trimmed(makeLine("m", 50, 50, 60, 50), 0, [55, 50], [square])).toBe(null);
  });
  it("leaves a closed shape alone when it's crossed fewer than twice", () => {
    const lone = makeCircle("c", 100, 100, 5);
    expect(trimmed(lone, 0, [105, 100], [square])).toBe(lone);
  });
  it("finds the outline nearest the click", () => {
    expect(outlineNear(square, [10.2, 5], 0.5)).toBe(0);
    expect(outlineNear(square, [20, 5], 0.5)).toBe(null);
  });
  it("trims where two overlapping circles cross", () => {
    const a = makeCircle("a", 0, 0, 10);
    const b = makeCircle("b", 10, 0, 10);
    const t = trimmed(a, 0, [10, 0], [b])!; // the part of a inside b
    // a's arc inside b spans 120°: a third of its line goes.
    near(itemLength(t), ((2 * Math.PI * 10) * 2) / 3, 0.05);
  });
});
