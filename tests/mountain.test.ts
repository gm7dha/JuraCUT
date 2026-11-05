/**
 * The layered mountain puzzle (pure): contours, sheets inside each other, cuts inside their sheet and offset between
 * sheets, sturdy pieces, names, and the sheets as shapes on beds that export. osGrid.ts, elevation.ts and peaks.ts are
 * JuraCAD's (its tests/mountainPuzzle.test.ts covers them in full); a couple of checks here make sure they came over.
 */
import { describe, expect, it } from "vitest";
import { laserPaths } from "../src/laser/sheet";
import { itemBox } from "../src/model/shapes";
import { bedItems, bedSheets, MOUNTAIN_GROUP } from "../src/terrain/contourItems";
import { contourChecks, contourLoops, CONTOUR_DEFAULTS, makeContourPuzzle, smallestPiece, type ContourSpec } from "../src/terrain/contourPuzzle";
import { gridFrom } from "../src/terrain/elevation";
import { gridToLatLon, parseGridRef } from "../src/terrain/osGrid";
import { PEAKS } from "../src/terrain/peaks";
import type { P2 } from "../src/library/puzzle";

const area = (p: P2[]) => p.reduce((s, a, i) => s + a[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * a[1], 0) / 2;
const inside = (p: P2, loops: P2[][]) => {
  let c = false;
  for (const poly of loops)
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
    }
  return c;
};

describe("Shared with JuraCAD", () => {
  it("reads grid references and finds Ben Nevis", () => {
    const g = parseGridRef("NN 16667 71283")!;
    expect(g).toEqual({ e: 216667, n: 771283 });
    const ll = gridToLatLon(g);
    expect(ll.lat).toBeCloseTo(56.7969, 3);
    expect(ll.lon).toBeCloseTo(-5.0037, 3);
    for (const p of PEAKS) expect(parseGridRef(p.ref), p.name).not.toBeNull();
  });
});

describe("Contours", () => {
  // A cone (height 100 − distance) with a pit in it.
  const nx = 101;
  const v = new Float64Array(nx * nx);
  for (let j = 0; j < nx; j++)
    for (let i = 0; i < nx; i++) {
      const d = Math.hypot(i - 50, j - 50);
      v[j * nx + i] = 100 - d - (Math.hypot(i - 50, j - 50) < 5 ? 40 : 0);
    }
  const samples = { nx, ny: nx, sx: 1, sy: 1, v };

  it("goes round high ground anticlockwise, close to the true circle", () => {
    const loops = contourLoops(samples, 70);
    const outer = loops.filter((l) => area(l) > 0);
    expect(outer).toHaveLength(1);
    expect(area(outer[0])).toBeCloseTo(Math.PI * 30 * 30, -2);
  });

  it("goes round a pit clockwise", () => {
    const loops = contourLoops(samples, 80);
    expect(loops.filter((l) => area(l) > 0)).toHaveLength(1);
    expect(loops.filter((l) => area(l) < 0)).toHaveLength(1);
  });

  it("closes along the edge where the high ground runs off it", () => {
    const loops = contourLoops(samples, 45);
    expect(loops).toHaveLength(1);
    expect(area(loops[0])).toBeGreaterThan(8000);
    expect(Math.min(...loops[0].map((p) => p[0]))).toBe(0);
  });
});

const W = 4000;
const H = 3000;
const hills = gridFrom({ e: 200000, n: 770000 }, W, H, 20, (e, n) => 300 + 1000 * Math.exp(-(((e - 201800) / 900) ** 2 + ((n - 771500) / 700) ** 2)) + 300 * Math.exp(-(((e - 203200) / 400) ** 2 + ((n - 770700) / 500) ** 2)) + 40 * Math.sin(e / 170));
const SPEC: ContourSpec = { ...CONTOUR_DEFAULTS, width: 250, piece: 40, layers: 16 };

describe("Layered puzzle", () => {
  const puzzle = makeContourPuzzle(hills, W, H, SPEC);

  it("sizes the sheets and stacks each inside the one below", () => {
    expect(puzzle.width).toBe(250);
    expect(puzzle.height).toBeCloseTo(187.5, 6);
    expect(puzzle.layers[0].loops).toHaveLength(1);
    expect(puzzle.metresPerLayer * SPEC.layers).toBeCloseTo(puzzle.high - puzzle.low, 6);
    expect(puzzle.stretch).toBeCloseTo(SPEC.thickness / (puzzle.metresPerLayer * puzzle.k), 9);
    for (let i = 1; i < puzzle.layers.length; i++) {
      const [below, above] = [puzzle.layers[i - 1], puzzle.layers[i]];
      // Points well inside the sheet above are inside the sheet below.
      for (const l of above.loops.filter((x) => area(x) > 0)) {
        const cx = l.reduce((s, p) => s + p[0], 0) / l.length;
        const cy = l.reduce((s, p) => s + p[1], 0) / l.length;
        if (inside([cx, cy], above.loops)) expect(inside([cx, cy], below.loops)).toBe(true);
      }
    }
  });

  it("cuts only inside each sheet, into whole pieces", () => {
    for (const L of puzzle.layers) {
      for (const c of L.cuts)
        for (let i = 0; i + 1 < c.length; i++) {
          const mid: P2 = [(c[i][0] + c[i + 1][0]) / 2, (c[i][1] + c[i + 1][1]) / 2];
          expect(inside(mid, L.loops), `sheet ${L.index + 1}`).toBe(true);
        }
      expect(L.pieces).toBeGreaterThanOrEqual(1);
    }
    // The base is a whole 6 × 5 jigsaw.
    expect(puzzle.layers[0].pieces).toBe(30);
    expect(puzzle.layers.reduce((n, l) => n + l.pieces, 0)).toBeGreaterThan(80);
  });

  it("offsets every other sheet's joins by half a piece", () => {
    const straightXs = (i: number) =>
      new Set(
        puzzle.layers[i].cuts.flatMap((c) =>
          c.slice(0, -1).flatMap((p, k) => (Math.abs(p[0] - c[k + 1][0]) < 1e-6 && Math.abs(p[1] - c[k + 1][1]) > 5 ? [Math.round(p[0])] : [])),
        ),
      );
    const [a, b] = [straightXs(0), straightXs(1)];
    expect(a.size).toBeGreaterThan(0);
    expect(b.size).toBeGreaterThan(0);
    for (const x of b) expect(a.has(x)).toBe(false);
    const flat = makeContourPuzzle(hills, W, H, { ...SPEC, stagger: false });
    const c = new Set(
      flat.layers[1].cuts.flatMap((cut) => cut.slice(0, -1).flatMap((p, k) => (Math.abs(p[0] - cut[k + 1][0]) < 1e-6 && Math.abs(p[1] - cut[k + 1][1]) > 5 ? [Math.round(p[0])] : []))),
    );
    expect([...c].every((x) => a.has(x))).toBe(true);
  });

  it("names every piece, inside its sheet, each name once", () => {
    for (const L of puzzle.layers) {
      expect(L.labels.length).toBeLessThanOrEqual(L.pieces);
      for (const l of L.labels) expect(inside(l.at, L.loops)).toBe(true);
      expect(new Set(L.labels.map((l) => l.text)).size).toBe(L.labels.length);
    }
    expect(puzzle.layers[0].labels).toHaveLength(30);
    expect(makeContourPuzzle(hills, W, H, { ...SPEC, labels: false }).layers.every((l) => !l.labels.length)).toBe(true);
  });

  it("refuses pieces too small for the sheet's tabs", () => {
    // Necks at least 3 mm whatever the sheet: 30 mm pieces work in 3 mm and 5 mm alike.
    expect(smallestPiece(3)).toBe(27);
    expect(smallestPiece(5)).toBe(27);
    expect(contourChecks({ ...SPEC, piece: 30, thickness: 5 }).problems).toEqual([]);
    expect(contourChecks({ ...SPEC, piece: 26 }).problems[0]).toMatch(/too small/);
    expect(contourChecks({ ...SPEC, layers: 100 }).problems).toEqual([]);
    expect(contourChecks({ ...SPEC, layers: 101 }).problems[0]).toMatch(/100 sheets/);
    expect(contourChecks(SPEC).problems).toEqual([]);
    expect(() => makeContourPuzzle(hills, W, H, { ...SPEC, piece: 10 })).toThrow(/too small/);
  });

  it("lays sheets out on beds and makes shapes that export", () => {
    const bed: [number, number] = [600, 300];
    const sheets = bedSheets(puzzle, bed);
    expect(sheets.flatMap((s) => s.layers).length).toBe(puzzle.layers.length);
    const items = bedItems(puzzle, sheets[0], []);
    expect(items.every((i) => i.group?.startsWith(MOUNTAIN_GROUP))).toBe(true);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(items.some((i) => i.op === "cut")).toBe(true);
    expect(items.some((i) => i.op === "score")).toBe(true);
    expect(items.some((i) => i.op === "engrave")).toBe(true);
    for (const s of sheets) {
      for (const it of bedItems(puzzle, s, [])) {
        const b = itemBox(it)!;
        expect(b[0]).toBeGreaterThanOrEqual(0);
        expect(b[1]).toBeGreaterThanOrEqual(0);
        expect(b[2]).toBeLessThanOrEqual(bed[0]);
        expect(b[3]).toBeLessThanOrEqual(bed[1]);
      }
    }
    const paths = laserPaths(items);
    expect(paths.length).toBeGreaterThan(10);
  });
});
