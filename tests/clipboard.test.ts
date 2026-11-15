import { describe, expect, it } from "vitest";
import { clipText, copiesOf, whatIsPasted } from "../src/model/clipboard";
import type { Item } from "../src/model/types";

const rect: Item = { id: "a", name: "Plate", op: "cut", kind: "rect", x: 0, y: 0, w: 10, h: 5, radius: 0, angle: 0 };
const ring: Item = { id: "b", name: "Hole", op: "cut", kind: "circle", cx: 5, cy: 2, r: 1, group: "g1" };
const pin: Item = { id: "c", name: "Pin", op: "cut", kind: "circle", cx: 8, cy: 2, r: 1, group: "g1" };

describe("copy and paste", () => {
  it("reads back JuraCUT's own shapes", () => {
    const back = whatIsPasted(clipText([rect, ring]));
    expect(back.kind).toBe("shapes");
    if (back.kind === "shapes") expect(back.items.map((i) => i.name)).toEqual(["Plate", "Hole"]);
  });
  it("tells SVG drawings, words and nothing apart", () => {
    expect(whatIsPasted('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>').kind).toBe("svg");
    expect(whatIsPasted("Hello there").kind).toBe("words");
    expect(whatIsPasted("   ").kind).toBe("nothing");
    expect(whatIsPasted('{"format":"juracut-shapes","items":[{"kind":"nonsense"}]}').kind).toBe("nothing");
  });
  it("gives copies new ids and a group of their own, moved", () => {
    const copies = copiesOf([rect, ring, pin], [ring, pin], 10, -10);
    expect(copies.map((c) => c.id).some((id) => ["a", "b", "c"].includes(id))).toBe(false);
    expect(copies[0].group).toBe(copies[1].group);
    expect(copies[0].group).not.toBe("g1");
    expect(copies[0].kind === "circle" && copies[0].cx === 15 && copies[0].cy === -8).toBe(true);
  });
});
