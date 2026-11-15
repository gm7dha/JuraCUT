import { describe, expect, it } from "vitest";
import type { LaserPath } from "../src/geometry/segments";
import { laserPaths } from "../src/laser/sheet";
import { withoutShared } from "../src/laser/shared";
import { pathLength } from "../src/model/measure";
import { makeCircle, makeRect } from "../src/model/shapes";

const total = (ps: LaserPath[]) => ps.reduce((s, p) => s + pathLength(p.segments, p.closed), 0);

describe("lines on top of each other cut once", () => {
  it("cuts the edge two butted squares share only once", () => {
    const paths = laserPaths([makeRect("a", 0, 0, 10, 10), makeRect("b", 10, 0, 10, 10)]);
    const once = withoutShared(paths);
    expect(Math.abs(total(paths) - 80) < 1e-6).toBe(true);
    expect(Math.abs(total(once) - 70) < 1e-6).toBe(true);
  });
  it("leaves part of a longer edge, and paths with nothing shared alone", () => {
    const paths = laserPaths([makeRect("a", 0, 0, 10, 10), makeRect("b", 5, 10, 20, 5)]);
    const once = withoutShared(paths);
    expect(Math.abs(total(once) - (40 + 50 - 5)) < 1e-6).toBe(true);
    const lone = laserPaths([makeCircle("c", 0, 0, 5), makeRect("r", 20, 0, 5, 5)]);
    const kept = withoutShared(lone);
    expect(kept.length).toBe(2);
    expect(kept[0]).toBe(lone[0]);
  });
});
