import { describe, expect, it } from "vitest";
import { clipped } from "../src/geometry/photo";
import { laserPaths } from "../src/laser/sheet";
import { orderSteps, orderTotals } from "../src/laser/order";
import { makeCircle, makeRect, mirroredItem, rotatedItem } from "../src/model/shapes";
import type { PictureItem } from "../src/model/types";

describe("cut order", () => {
  it("lists holes before the outline round them, with what each is and the travel between", () => {
    const steps = orderSteps(laserPaths([makeRect("p", 0, 0, 50, 30), makeCircle("h", 25, 15, 5)]));
    expect(steps.map((s) => s.what)).toEqual(["a hole", "an outline"]);
    expect(Math.abs(steps[1].length - 160) < 1e-6).toBe(true);
    expect(steps[0].travel).toBe(0);
    expect(steps[1].travel > 0).toBe(true);
    const t = orderTotals(steps);
    expect(Math.abs(t.length - (160 + 10 * Math.PI)) < 0.05).toBe(true);
  });
});

describe("photo masks of any shape", () => {
  it("leaves white everything outside the shape", () => {
    // A 10 × 10 mm picture at 10 px/mm, masked by a 4 × 4 mm square in its middle.
    const sq: [number, number][] = [[-2, -2], [2, -2], [2, 2], [-2, 2]];
    const out = clipped(new Uint8Array(100 * 100), 100, 100, 10, [sq]);
    const kept = out.reduce((n, v) => n + (v === 0 ? 1 : 0), 0);
    expect(kept).toBe(40 * 40);
    // Off to the right and mirrored: it lands on the left.
    const right: [number, number][] = [[2, -1], [4, -1], [4, 1], [2, 1]];
    const m = clipped(new Uint8Array(100 * 100), 100, 100, 10, [right], true);
    expect(m[50 * 100 + 20]).toBe(0);
    expect(m[50 * 100 + 80]).toBe(255);
  });
  it("turns and flips with the photo", () => {
    const pic: PictureItem = { id: "p", name: "Photo", op: "engrave", kind: "picture", src: "data:image/png;base64,AA", cx: 50, cy: 50, w: 20, h: 20, turns: 0, flip: false, mode: "dots", brightness: 0, contrast: 0, invert: false, dpm: 10, clip: [{ closed: true, segments: [{ kind: "circle", center: [5, 0], radius: 2 }] }] };
    const turned = rotatedItem(pic, 90) as PictureItem;
    const c = turned.clip![0].segments[0];
    expect(c.kind === "circle" && Math.abs(c.center[0]) < 1e-9 && Math.abs(c.center[1] - 5) < 1e-9).toBe(true);
    const flipped = mirroredItem(pic) as PictureItem;
    const f = flipped.clip![0].segments[0];
    expect(f.kind === "circle" && f.center[0]).toBe(-5);
  });
});

describe("clipping a big picture to a long outline", () => {
  // The old way, pixel by pixel against every edge: slow, but plainly right.
  const slow = (width: number, height: number, k: number, rings: [number, number][][], mirrored: boolean) => {
    const out = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const my = height / (2 * k) - (y + 0.5) / k;
      for (let x = 0; x < width; x++) {
        let mx = (x + 0.5) / k - width / (2 * k);
        if (mirrored) mx = -mx;
        let inside = false;
        for (const r of rings)
          for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
            const [xi, yi] = r[i];
            const [xj, yj] = r[j];
            if (yi > my !== yj > my && mx < ((xj - xi) * (my - yi)) / (yj - yi) + xi) inside = !inside;
          }
        if (!inside) out[y * width + x] = 255;
      }
    }
    return out;
  };
  const wiggly = (n: number, r: number, cx = 0, cy = 0): [number, number][] =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * 2 * Math.PI;
      const rr = r * (1 + 0.25 * Math.sin(7 * a) + 0.1 * Math.sin(31 * a));
      return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
    });
  it("gives exactly what checking every pixel against every edge gives, holes and mirroring too", () => {
    const rings = [wiggly(300, 4), wiggly(50, 1, 0.5, 0.3), wiggly(40, 1.5, 6, -4)];
    for (const mirrored of [false, true]) expect(Array.from(clipped(new Uint8Array(120 * 90), 120, 90, 8, rings, mirrored))).toEqual(Array.from(slow(120, 90, 8, rings, mirrored)));
  });
  it("is quick on an island-sized picture (2500 × 2500 pixels, a 6000-point coast)", () => {
    const t = Date.now();
    clipped(new Uint8Array(2500 * 2500), 2500, 2500, 10, [wiggly(6000, 100)]);
    expect(Date.now() - t).toBeLessThan(10000);
  });
});
