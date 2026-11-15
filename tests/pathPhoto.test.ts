import { describe, expect, it } from "vitest";
import { pathPoints } from "../src/geometry/segments";
import { insideMask, masked } from "../src/geometry/photo";
import { parseDocument } from "../src/model/document";
import { itemBox, itemOutlines, makeCircle, makeLine, makeText, movedItem } from "../src/model/shapes";
import { offPath, pathOf, placedOnPath } from "../src/model/textPath";
import type { TextItem } from "../src/model/types";

describe("words along a path", () => {
  it("sits round the top of a circle, letters outside it, reading left to right", () => {
    const circle = makeCircle("c", 100, 100, 40);
    const words = { ...makeText("t", 0, 0, "ALONG THE TOP", 6) };
    const placed = placedOnPath(words, pathOf(circle)!);
    expect(placed.align).toBe("centre");
    for (const o of itemOutlines(placed))
      for (const p of pathPoints(o.segments, true, 0.01)) {
        const d = Math.hypot(p[0] - 100, p[1] - 100);
        expect(d > 40 - 0.3 && d < 46.5).toBe(true);
      }
    // Centred on the top: its box's middle is straight above the circle's middle.
    const b = itemBox(placed)!;
    expect(Math.abs((b[0] + b[2]) / 2 - 100) < 1).toBe(true);
    expect(b[1] > 100).toBe(true);
  });
  it("follows a line drawn right to left the right way up", () => {
    const line = makeLine("l", 100, 0, 0, 0);
    const placed = placedOnPath(makeText("t", 0, 0, "HI", 5), pathOf(line)!);
    expect(placed.pathFlip).toBe(true);
    const b = itemBox(placed)!;
    expect(b[1] > -0.5 && b[3] > 4).toBe(true); // above the line
  });
  it("moves with its path, is kept in files and comes off again", () => {
    const placed = placedOnPath(makeText("t", 0, 0, "HI", 5), pathOf(makeLine("l", 0, 0, 50, 0))!);
    const moved = movedItem(placed, 10, 20) as TextItem;
    const a = itemBox(placed)!;
    const b = itemBox(moved)!;
    expect(Math.abs(b[0] - a[0] - 10) < 1e-6 && Math.abs(b[1] - a[1] - 20) < 1e-6).toBe(true);
    const doc = parseDocument({ format: "juracut", items: [moved] });
    const back = doc!.items[0] as TextItem;
    expect(!!back.path && back.pathAt === placed.pathAt).toBe(true);
    expect(offPath(back).path).toBe(undefined);
  });
});

describe("photo shapes and crops", () => {
  it("keeps only the oval or rounded rectangle", () => {
    expect(insideMask("round", 50, 50, 100, 100)).toBe(true);
    expect(insideMask("round", 2, 2, 100, 100)).toBe(false);
    expect(insideMask("rounded", 0, 0, 100, 100)).toBe(false);
    expect(insideMask("rounded", 0, 50, 100, 100)).toBe(true);
    const out = masked(new Uint8Array(100 * 100).fill(0), 100, 100, "round");
    const white = out.reduce((n, v) => n + (v === 255 ? 1 : 0), 0);
    // Outside a circle in a square: 1 − π/4 of it.
    expect(Math.abs(white / 10000 - (1 - Math.PI / 4)) < 0.01).toBe(true);
  });
  it("reads crops and shapes from files, ignoring silly ones", () => {
    const pic = { kind: "picture", src: "data:image/png;base64,AAAA", cx: 0, cy: 0, w: 10, h: 10, turns: 0, flip: false, mode: "dots", brightness: 0, contrast: 0, invert: false, dpm: 10 };
    const doc = parseDocument({ format: "juracut", items: [{ ...pic, crop: [0.1, 0.2, 0.9, 0.8], mask: "round" }, { ...pic, crop: [0.5, 0.5, 0.5, 0.5], mask: "star" }] });
    const [a, b] = doc!.items;
    expect(a.kind === "picture" && a.crop?.join() === "0.1,0.2,0.9,0.8" && a.mask === "round").toBe(true);
    expect(b.kind === "picture" && b.crop === undefined && b.mask === undefined).toBe(true);
  });
});
