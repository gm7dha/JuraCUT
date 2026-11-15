import { describe, expect, it } from "vitest";
import { FONTS, textOutline } from "../src/geometry/text";
import { pathPoints } from "../src/geometry/segments";
import { parseDocument } from "../src/model/document";
import { repeatedItems } from "../src/model/repeat";
import { itemBox, makeCircle, makeText } from "../src/model/shapes";

describe("step and repeat", () => {
  it("makes a grid of copies a gap apart", () => {
    const c = makeCircle("a", 10, 10, 5);
    const made = repeatedItems([c], [c], 3, 2, 2, 4);
    expect(made.length).toBe(5);
    const boxes = made.map((it) => itemBox(it)!);
    expect(boxes.some((b) => Math.abs(b[0] - 17) < 1e-9 && Math.abs(b[1] - 5) < 1e-9)).toBe(true);
    expect(boxes.some((b) => Math.abs(b[0] - 29) < 1e-9 && Math.abs(b[1] - 19) < 1e-9)).toBe(true);
    expect(new Set(made.map((it) => it.id)).size).toBe(5);
    expect(repeatedItems([c], [c], 1, 1, 0, 0)).toEqual([]);
  });
});

describe("words round a circle", () => {
  it("puts the letters between the circle and the circle plus their height", () => {
    const R = 30;
    for (const curve of [R, -R]) {
      const { loops } = textOutline(FONTS["inter-regular"], "HELLO WORLD", 5, "centre", curve);
      const centre = [0, -curve];
      for (const l of loops)
        for (const p of pathPoints(l, true, 0.01)) {
          const d = Math.hypot(p[0] - centre[0], p[1] - centre[1]);
          // Over the top the letters stand outside the circle; under it, inside.
          if (curve > 0) expect(d > R - 0.3 && d < R + 5.5).toBe(true);
          else expect(d < R + 0.3 && d > R - 5.5).toBe(true);
        }
    }
  });
  it("is kept in files and straight when missing", () => {
    const doc = parseDocument({ format: "juracut", items: [{ ...makeText("t", 0, 0, "Hi"), curve: -25 }, makeText("u", 0, 0, "Yo")] });
    expect(doc!.items[0].kind === "text" && doc!.items[0].curve).toBe(-25);
    expect(doc!.items[1].kind === "text" && doc!.items[1].curve).toBe(undefined);
  });
});
