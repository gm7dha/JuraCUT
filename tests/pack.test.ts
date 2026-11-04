import { describe, expect, it } from "vitest";

import { packPieces, rasterize, type PackPiece } from "../src/geometry/pack";
import type { Pt, Segment } from "../src/geometry/segments";
import { offBed } from "../src/laser/sheet";
import { itemBox, makeCircle, makeRect } from "../src/model/shapes";
import { useStore } from "../src/model/store";

const loop = (pts: Pt[]): { segments: Segment[]; closed: boolean } => ({ segments: pts.map((p, i) => ({ kind: "line", from: p, to: pts[(i + 1) % pts.length] })), closed: true });
const rect = (id: string, w: number, h: number): PackPiece => ({ id, outlines: [loop([[0, 0], [w, 0], [w, h], [0, h]])] });
/** An L: a w × w square with its top-right quarter missing. */
const ell = (id: string, w: number): PackPiece => ({ id, outlines: [loop([[0, 0], [w, 0], [w, w / 2], [w / 2, w / 2], [w / 2, w], [0, w]])] });

describe("tight packing", () => {
  it("draws a shape on the grid, holes left free", () => {
    const frame: PackPiece = { id: "f", outlines: [loop([[0, 0], [10, 0], [10, 10], [0, 10]]), loop([[3, 3], [7, 3], [7, 7], [3, 7]])] };
    const m = rasterize(frame, 0, 1, 0);
    expect(m.w).toBe(10);
    // (An outline lying exactly on a cell boundary takes the cell after it: a cell to spare, never one too few.)
    expect(m.rows[5]).toEqual([
      [0, 3],
      [7, 9],
    ]);
    expect(m.rows[0]).toEqual([[0, 9]]);
  });

  it("puts pieces side by side from the front-left corner, the gap apart", () => {
    const r = packPieces([rect("a", 50, 20), rect("b", 30, 20)], [200, 100], { gap: 4, turns: false });
    expect(r.left).toEqual([]);
    const a = r.places.find((p) => p.id === "a")!;
    const b = r.places.find((p) => p.id === "b")!;
    expect([a.x, a.y]).toEqual([0, 0]);
    expect(b.y).toBe(0);
    expect(b.x).toBeGreaterThanOrEqual(54);
    expect(b.x).toBeLessThanOrEqual(56);
  });

  it("nests one L into another's corner when turned", () => {
    // Two 40 mm Ls fit in a 60 × 60 bed only if one turns round into the other's notch.
    const r = packPieces([ell("a", 40), ell("b", 40)], [62, 62], { gap: 1, cell: 1 });
    expect(r.left).toEqual([]);
    expect(r.places.some((p) => p.turns === 2)).toBe(true);
  });

  it("puts a small piece inside a big one's hole", () => {
    const frame: PackPiece = { id: "frame", outlines: [loop([[0, 0], [100, 0], [100, 100], [0, 100]]), loop([[10, 10], [90, 10], [90, 90], [10, 90]])] };
    const r = packPieces([frame, rect("tile", 50, 50)], [101, 101], { gap: 2, turns: false });
    expect(r.left).toEqual([]);
    const tile = r.places.find((p) => p.id === "tile")!;
    expect(tile.x).toBeGreaterThanOrEqual(11);
    expect(tile.y).toBeGreaterThanOrEqual(11);
  });

  it("lists what doesn't fit", () => {
    const r = packPieces([rect("big", 700, 10), rect("ok", 10, 10)], [600, 300]);
    expect(r.left).toEqual(["big"]);
    expect(r.places.map((p) => p.id)).toEqual(["ok"]);
  });

  it("packs 30 pieces on the R1's bed quickly", () => {
    const pieces = Array.from({ length: 30 }, (_, i) => (i % 2 ? rect(`r${i}`, 40 + (i % 5) * 10, 25) : ell(`l${i}`, 50)));
    const t = Date.now();
    const r = packPieces(pieces, [600, 300], { gap: 3 });
    expect(Date.now() - t).toBeLessThan(5000);
    expect(r.places.length + r.left.length).toBe(30);
    expect(r.places.length).toBeGreaterThan(25);
  });
});


describe("Pack tightly on the bed", () => {
  it("packs every piece onto the bed without overlaps, holes travelling with their plates", () => {
    const s = useStore.getState();
    s.newDocument();
    s.addItems([
      makeRect("plate", 400, 200, 120, 60),
      makeCircle("hole", 430, 230, 5),
      makeRect("a", -100, -100, 80, 40),
      makeRect("b", 700, 50, 200, 30),
      makeCircle("c", 300, 150, 25),
    ]);
    s.packAll(3, true);
    const doc = useStore.getState().history.present;
    expect(offBed(doc)).toHaveLength(0);
    const box = (id: string) => itemBox(doc.items.find((i) => i.id === id)!)!;
    const p = box("plate");
    const h = box("hole");
    expect(h[0] > p[0] && h[2] < p[2] && h[1] > p[1] && h[3] < p[3]).toBe(true);
    // No two pieces' boxes overlap (these shapes are box-shaped, so that's the real test).
    const ids = ["plate", "a", "b", "c"];
    for (const i of ids)
      for (const j of ids) {
        if (i >= j) continue;
        const A = box(i);
        const B = box(j);
        const overlap = A[0] < B[2] - 1e-6 && B[0] < A[2] - 1e-6 && A[1] < B[3] - 1e-6 && B[1] < A[3] - 1e-6;
        expect(overlap).toBe(false);
      }
  });
});
