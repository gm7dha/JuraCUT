import { describe, expect, it } from "vitest";

import { DEFAULT_MATERIALS, findMaterial, freeName, parseMaterials, readMaterials, writeMaterials } from "../src/model/materials";

describe("materials", () => {
  it("starts with the starter list and keeps the user's own", () => {
    const store = new Map<string, string>();
    const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    expect(readMaterials(fake)).toEqual(DEFAULT_MATERIALS);
    const mine = [{ name: "4 mm poplar", thickness: 4, kerf: 0.18, notes: "40% 12 mm/s" }];
    expect(writeMaterials(fake, mine)).toBe(true);
    expect(readMaterials(fake)).toEqual(mine);
    expect(readMaterials(null)).toEqual(DEFAULT_MATERIALS);
  });

  it("reads a damaged list carefully", () => {
    expect(parseMaterials([{ name: "ok" }, { name: "" }, { thickness: 3 }, "x", { name: "neg", kerf: -1, thickness: "3" }])).toEqual([
      { name: "ok", thickness: 3, kerf: 0.15, notes: "" },
      { name: "neg", thickness: 3, kerf: 0.15, notes: "" },
    ]);
    expect(parseMaterials({})).toBeNull();
  });

  it("finds free names and matches a design's material", () => {
    expect(freeName(DEFAULT_MATERIALS, "3 mm plywood")).toBe("3 mm plywood 2");
    expect(freeName(DEFAULT_MATERIALS, "  ")).toBe("New material");
    expect(findMaterial(DEFAULT_MATERIALS, { name: "3 mm MDF", thickness: 3, kerf: 0.15 })?.name).toBe("3 mm MDF");
    expect(findMaterial(DEFAULT_MATERIALS, { name: "Oak", thickness: 3, kerf: 0.15 })).toBeNull();
  });
});
