import { describe, expect, it } from "vitest";
import { laserPaths } from "../src/laser/sheet";
import { SLOT_STEPS, testCard } from "../src/model/testCard";
import type { Material } from "../src/model/types";

describe("kerf and fit test card", () => {
  const mat: Material = { name: "3 mm plywood", thickness: 3, kerf: 0 };
  let n = 0;
  const card = testCard(mat, 10, 10, () => `t${n++}`, "g1");
  it("is one group with a window of ten squares and a comb with a slot per step", () => {
    expect(card.every((i) => i.group === "g1")).toBe(true);
    expect(card.filter((i) => i.name === "Kerf test cut").length).toBe(9);
    const comb = card.find((i) => i.name === "Fit test comb")!;
    expect(comb.kind).toBe("shape");
    // Each slot: two upright sides 15 deep, the width between them t + step.
    if (comb.kind !== "shape") return;
    const ups = comb.outlines[0].segments.filter((s) => s.kind === "line" && Math.abs(s.from[0] - s.to[0]) < 1e-9 && Math.abs(Math.abs(s.from[1] - s.to[1]) - 15) < 1e-9);
    expect(ups.length).toBe(SLOT_STEPS.length * 2);
    const xs = ups.map((s) => (s.kind === "line" ? s.from[0] : 0)).sort((a, b) => a - b);
    const widths = SLOT_STEPS.map((_, i) => xs[2 * i + 1] - xs[2 * i]);
    SLOT_STEPS.forEach((st, i) => expect(Math.abs(widths[i] - (3 + st)) < 1e-9).toBe(true));
  });
  it("cuts the squares' lines as cut lines, and engraves the words", () => {
    const paths = laserPaths(card);
    expect(paths.some((p) => p.layer === "engrave")).toBe(true);
    expect(paths.filter((p) => p.layer === "inner" && !p.closed).length).toBe(9);
  });
});
