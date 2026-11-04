import { describe, expect, it } from "vitest";

import { pathsBox } from "../src/geometry/segments";
import { cleanValues, defaultValues, designProblems, LIBRARY, makeDesign } from "../src/library/designs";
import { laserPaths } from "../src/laser/sheet";
import { DEFAULT_MATERIAL } from "../src/model/document";
import { itemBox, itemOutlines } from "../src/model/shapes";
import { aligned, distributed, grouped, piecesOf, ungrouped, withGroups } from "../src/model/arrange";
import { makeRect } from "../src/model/shapes";

const design = (id: string) => LIBRARY.find((d) => d.id === id)!;
const make = (id: string, v: Record<string, unknown> = {}) => {
  const d = design(id);
  return makeDesign(d, DEFAULT_MATERIAL, { ...defaultValues(d, DEFAULT_MATERIAL), ...(v as Record<string, number | string | boolean>) }, []);
};
const area = (pts: [number, number][]) => Math.abs(pts.reduce((a, p, i) => a + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0) / 2);

describe("design library", () => {
  it("every design makes something with its defaults, all on the bed", () => {
    for (const d of LIBRARY) {
      expect(designProblems(d, DEFAULT_MATERIAL, defaultValues(d, DEFAULT_MATERIAL))).toEqual([]);
      const made = make(d.id);
      expect(made.items.length).toBeGreaterThan(0);
      const ids = new Set(made.items.map((it) => it.id));
      expect(ids.size).toBe(made.items.length);
      for (const it of made.items) {
        const b = itemBox(it)!;
        expect(b[0]).toBeGreaterThanOrEqual(10 - 1e-6);
        expect(b[2]).toBeLessThanOrEqual(600);
      }
    }
  });

  it("a finger box's panels add up to the box's walls", () => {
    const made = make("finger-box", { width: 100, depth: 80, height: 60, thickness: 3, finger: 10, lid: true });
    expect(made.items).toHaveLength(6);
    const panelArea = made.items.reduce((sum, it) => sum + area(itemOutlines(it)[0].segments.map((s) => (s.kind === "line" ? s.from : [0, 0]) as [number, number])), 0);
    // Volume of the shell ÷ thickness.
    const shell = 100 * 80 * 60 - 94 * 74 * 54;
    expect(panelArea * 3).toBeCloseTo(shell, 3);
    expect(make("finger-box", { lid: false }).items).toHaveLength(5);
  });

  it("a tag has its outline, hole and words, grouped", () => {
    const made = make("tag", { text: "KEYS" });
    expect(made.items.map((i) => i.kind)).toEqual(["rect", "circle", "text"]);
    expect(new Set(made.items.map((i) => i.group)).size).toBe(1);
    const paths = laserPaths(made.items);
    expect(paths.filter((p) => p.layer === "outer")).toHaveLength(1);
    expect(paths.filter((p) => p.layer === "inner")).toHaveLength(1);
  });

  it("shrinks a tag's words to fit", () => {
    const made = make("tag", { text: "A VERY LONG NAME INDEED", height: 10, width: 60 });
    const words = made.items.find((i) => i.kind === "text")!;
    const tagBox = itemBox(made.items[0])!;
    const b = itemBox(words)!;
    expect(b[2]).toBeLessThanOrEqual(tagBox[2] - 2 + 1e-6);
    expect(made.notes[0]).toMatch(/made .* mm tall so they fit/);
  });

  it("coasters come as separate groups, with rings scored", () => {
    const made = make("coasters", { count: 3, text: "Tea", ring: true });
    expect(new Set(made.items.map((i) => i.group)).size).toBe(3);
    expect(made.items.filter((i) => i.op === "score")).toHaveLength(3);
  });

  it("a stencil keeps the middle of an O on bridges, and its cuts close up", () => {
    const made = make("stencil", { text: "O", height: 40, bridge: 3 });
    expect(made.notes[0]).toMatch(/1 letter middle is held by 1 bridge/);
    const letters = made.items.find((i) => i.name === "Stencil letters")!;
    const outlines = itemOutlines(letters);
    // An O with one bridge is one loop (outside, across the bridge, round the middle, back): nothing left open.
    expect(outlines.every((o) => o.closed)).toBe(true);
    expect(outlines).toHaveLength(1);
    const sheet = itemBox(made.items.find((i) => i.name === "Stencil sheet")!)!;
    const b = pathsBox(outlines.map((o) => ({ layer: "inner", ...o })))!;
    expect(b[0] - sheet[0]).toBeCloseTo(15, 0);
  });

  it("cleans values to their limits", () => {
    const d = design("coasters");
    const v = cleanValues(d, DEFAULT_MATERIAL, { count: 99.4, size: "abc", shape: "hexagon", ring: "yes" });
    expect(v.count).toBe(12);
    expect(v.size).toBe(95);
    expect(v.shape).toBe("round");
    expect(v.ring).toBe(true);
  });
});

describe("groups, align and distribute", () => {
  const items = [makeRect("a", 0, 0, 10, 10), makeRect("b", 50, 20, 20, 10), makeRect("c", 200, 5, 10, 30)];

  it("groups and ungroups, and a click on one brings the group", () => {
    const g = grouped(items, ["a", "b"]);
    expect(withGroups(g, ["a"])).toEqual(["a", "b"]);
    expect(piecesOf(g, ["a", "b", "c"])).toHaveLength(2);
    const u = ungrouped(g, ["b"]);
    expect(u.every((it) => !it.group)).toBe(true);
  });

  it("aligns left edges, and a lone shape to the bed", () => {
    const left = aligned(items, ["a", "b", "c"], "left", [600, 300]);
    expect(left.map((it) => itemBox(it)![0])).toEqual([0, 0, 0]);
    const top = aligned(items, ["c"], "top", [600, 300]);
    expect(itemBox(top[2])![3]).toBe(300);
  });

  it("spaces pieces out evenly, or a set gap apart", () => {
    const even = distributed(items, ["a", "b", "c"], "x");
    const boxes = even.map((it) => itemBox(it)!);
    // Gaps: (210 - 40) / 2 = 85 each.
    expect(boxes[1][0] - boxes[0][2]).toBeCloseTo(85, 9);
    expect(boxes[2][0] - boxes[1][2]).toBeCloseTo(85, 9);
    const fixed = distributed(items, ["a", "b", "c"], "x", 5).map((it) => itemBox(it)!);
    expect(fixed[1][0]).toBe(15);
    expect(fixed[2][0]).toBe(40);
  });
});
