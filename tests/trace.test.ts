import { describe, expect, it } from "vitest";

import { pathPoints, pathsBox } from "../src/geometry/segments";
import { binarize, greyscale, loopArea, otsuThreshold, simplifyLoop, traceBitmap, tracePicture } from "../src/geometry/trace";

/** An RGBA picture from rows of "#" (black) and "." (white). */
function picture(rows: string[]) {
  const H = rows.length;
  const W = rows[0].length;
  const rgba = new Uint8Array(W * H * 4);
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const v = c === "#" ? 0 : 255;
      rgba.set([v, v, v, 255], 4 * (y * W + x));
    }),
  );
  return { rgba, W, H };
}

describe("tracing", () => {
  it("picks a threshold between dark and light", () => {
    const grey = new Uint8Array([10, 12, 15, 200, 210, 220]);
    const t = otsuThreshold(grey);
    expect(t).toBeGreaterThanOrEqual(15);
    expect(t).toBeLessThan(200);
  });

  it("counts see-through pixels as light", () => {
    expect([...greyscale(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255]), 2, 1)]).toEqual([255, 0]);
  });

  it("traces a square with a hole into two loops", () => {
    const { rgba, W, H } = picture(["......", ".####.", ".#..#.", ".#..#.", ".####.", "......"]);
    const loops = traceBitmap(binarize(greyscale(rgba, W, H), W, H, 128));
    expect(loops).toHaveLength(2);
    const areas = loops.map((l) => Math.abs(loopArea(l))).sort((a, b) => a - b);
    expect(areas).toEqual([4, 16]);
  });

  it("keeps pixels touching only at a corner apart", () => {
    const { rgba, W, H } = picture(["#.", ".#"]);
    const loops = traceBitmap(binarize(greyscale(rgba, W, H), W, H, 128));
    expect(loops).toHaveLength(2);
    expect(loops.every((l) => Math.abs(loopArea(l)) === 1)).toBe(true);
  });

  it("straightens a staircase into a few points", () => {
    // A 45° staircase (a triangle of pixels).
    const rows = Array.from({ length: 20 }, (_, y) => "#".repeat(y + 1) + ".".repeat(20 - y - 1));
    const { rgba, W, H } = picture(rows);
    const [loop] = traceBitmap(binarize(greyscale(rgba, W, H), W, H, 128));
    expect(loop.length).toBeGreaterThan(40);
    expect(simplifyLoop(loop, 1).length).toBeLessThanOrEqual(5);
  });

  it("traces to millimetres, y up, leaving out specks", () => {
    const { rgba, W, H } = picture(["#.........", "..........", "..####....", "..####....", "..####....", "..####....", ".........."]);
    const r = tracePicture(rgba, W, H, { scale: 0.5, minArea: 2 });
    expect(r.specks).toBe(1);
    expect(r.loops).toHaveLength(1);
    expect(pathsBox([{ layer: "engrave", segments: r.loops[0], closed: true }])).toEqual([1, 0.5, 3, 2.5]);
  });

  it("smooths a traced circle into curves that stay close to it", () => {
    const N = 60;
    const rows = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => (Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) < 25 ? "#" : ".")).join(""));
    const { rgba, W, H } = picture(rows);
    const r = tracePicture(rgba, W, H, { smooth: true, tolerance: 1 });
    expect(r.loops).toHaveLength(1);
    expect(r.loops[0].some((s) => s.kind === "bezier")).toBe(true);
    for (const p of pathPoints(r.loops[0], true, 0.05)) expect(Math.abs(Math.hypot(p[0] - N / 2, p[1] - N / 2) - 25)).toBeLessThan(1.5);
  });
});
