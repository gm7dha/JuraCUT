import { describe, expect, it } from "vitest";
import { svgPathData } from "../src/laser/files";
import type { LaserPath } from "../src/geometry/segments";

/** Every arc command in some SVG path data, as its numbers. */
const arcs = (d: string) => [...d.matchAll(/A([^A-Za-z]*)/g)].map((m) => m[1].trim().split(/[\s,]+/).filter(Boolean).map(Number));

describe("SVG arcs", () => {
  it("writes circles and ellipses with seven numbers per arc (rx ry turn large sweep x y)", () => {
    const paths: LaserPath[] = [
      { layer: "outer", closed: true, segments: [{ kind: "circle", center: [10, 10], radius: 5 }] },
      { layer: "outer", closed: true, segments: [{ kind: "ellipse", center: [30, 20], rx: 8, ry: 4, angle: 0.3 }] },
      { layer: "outer", closed: false, segments: [{ kind: "arc", from: [0, 0], mid: [5, 5], to: [10, 0] }] },
    ];
    for (const p of paths)
      for (const H of [null, 100]) {
        const found = arcs(svgPathData(p, H));
        expect(found.length).toBeGreaterThan(0);
        for (const a of found) {
          expect(a.length).toBe(7);
          expect(a.every((v) => Number.isFinite(v))).toBe(true);
          // The two flags are 0 or 1.
          expect([0, 1].includes(a[3]) && [0, 1].includes(a[4])).toBe(true);
        }
      }
  });
});
