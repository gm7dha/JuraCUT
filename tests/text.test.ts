import { describe, expect, it } from "vitest";

import { FONTS, FONT_IDS, textOutline } from "../src/geometry/text";

describe("textOutline", () => {
  it("makes capitals exactly the asked height", () => {
    for (const id of FONT_IDS) {
      const { box, loops } = textOutline(FONTS[id], "H", 20);
      expect(loops.length).toBeGreaterThanOrEqual(1);
      expect(box![3] - box![1]).toBeCloseTo(20, 3);
      expect(box![1]).toBeCloseTo(0, 0);
    }
  });

  it("gives an o two loops (its outside and its hole)", () => {
    const { loops } = textOutline(FONTS["inter-regular"], "o", 10);
    expect(loops).toHaveLength(2);
  });

  it("keeps curves as Bézier pieces, not straight lines", () => {
    const { loops } = textOutline(FONTS["poppins-regular"], "O", 10);
    expect(loops.flat().some((s) => s.kind === "bezier")).toBe(true);
  });

  it("centres and right-aligns lines about x = 0", () => {
    const left = textOutline(FONTS["inter-regular"], "HELLO", 10, "left").box!;
    const centre = textOutline(FONTS["inter-regular"], "HELLO", 10, "centre").box!;
    const right = textOutline(FONTS["inter-regular"], "HELLO", 10, "right").box!;
    expect(left[0]).toBeGreaterThanOrEqual(0);
    expect(centre[0] + centre[2]).toBeCloseTo(0, 0);
    expect(right[2]).toBeLessThanOrEqual(0.01);
  });

  it("puts a second line below the first and names missing letters", () => {
    const one = textOutline(FONTS["inter-regular"], "A", 10).box!;
    const two = textOutline(FONTS["inter-regular"], "A\nA", 10).box!;
    expect(two[1]).toBeLessThan(one[1] - 5);
    expect(textOutline(FONTS["inter-regular"], "A→B", 10).missing).toEqual(["→"]);
  });
});
