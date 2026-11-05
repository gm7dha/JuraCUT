/**
 * OpenStreetMap files (pure; osm.ts and osGrid.ts are JuraCAD's, unchanged): latitude/longitude onto the OS grid,
 * reading an .osm file's area, paths, rivers, lochs (with islands), buildings and names, the three levels of detail,
 * and those features on a layered mountain's sheets — each line scored on the sheet whose band it crosses, lochs
 * engraved on their shore's sheet, names wholly on one sheet's visible band and off the water, all on the bed.
 */
import { describe, expect, it } from "vitest";
import { bedItems, bedSheets } from "../src/terrain/contourItems";
import { nameWidth, NAME_SIZE } from "../src/terrain/contourMarks";
import { CONTOUR_DEFAULTS, makeContourPuzzle } from "../src/terrain/contourPuzzle";
import { gridFrom } from "../src/terrain/elevation";
import { gridToLatLon, latLonToGrid, parseGridRef } from "../src/terrain/osGrid";
import { sampleOsm } from "./support/osmSample";
import { featuresOnGrid, featureSummary, osmArea, OsmError, readOsm } from "../src/terrain/osm";

describe("Latitude/longitude onto the OS grid", () => {
  it("is the exact way back from gridToLatLon (within 1 cm), and puts Ben Nevis where the map does", () => {
    for (const ref of ["NN 16667 71283", "SH 60971 54366", "TQ 30080 80390", "NC 20000 30000", "SX 50000 60000"]) {
      const g = parseGridRef(ref)!;
      const back = latLonToGrid(gridToLatLon(g));
      expect(Math.abs(back.e - g.e), ref).toBeLessThan(0.01);
      expect(Math.abs(back.n - g.n), ref).toBeLessThan(0.01);
    }
    const ben = latLonToGrid({ lat: 56.79685, lon: -5.00368 });
    expect(Math.abs(ben.e - 216667)).toBeLessThan(10);
    expect(Math.abs(ben.n - 771283)).toBeLessThan(10);
  });
});

describe("Reading an OpenStreetMap file", () => {
  const data = readOsm(sampleOsm());

  it("finds the area, the lines, the loch with its island, the building and the names", () => {
    expect(data.lines.map((l) => l.kind).sort()).toEqual(["path", "road", "stream"]);
    const loch = data.shapes.find((s) => s.kind === "water")!;
    expect(loch.rings.length).toBe(2);
    expect(loch.name).toBe("Lochan Meall");
    expect(data.shapes.filter((s) => s.kind === "building").length).toBe(1);
    expect(data.names.map((n) => n.text).sort()).toEqual(["CIC Hut", "Sgùrr & Beinn 1044 m"]);
    const a = osmArea(data);
    if (typeof a === "string") throw new Error(a);
    // The grid-aligned box inside the export box (the grid is turned about 2.5° there): a little smaller, never bigger.
    expect(a.sw.e).toBeGreaterThanOrEqual(201000);
    expect(a.sw.n).toBeGreaterThanOrEqual(770500);
    expect(a.width).toBeGreaterThan(3600);
    expect(a.width).toBeLessThanOrEqual(4000);
    expect(a.height).toBeGreaterThan(2600);
    expect(a.height).toBeLessThanOrEqual(3000);
  });

  it("keeps as much as asked for", () => {
    expect(featuresOnGrid(data, "area")).toEqual({ lines: [], shapes: [], names: [] });
    const water = featuresOnGrid(data, "water");
    expect(water.lines.map((l) => l.kind).sort()).toEqual(["path", "stream"]);
    expect(water.shapes.map((s) => s.kind)).toEqual(["water"]);
    expect(water.names).toEqual([]);
    const all = featuresOnGrid(data, "all");
    expect(all.lines.length).toBe(3);
    expect(all.shapes.length).toBe(2);
    expect(all.names.map((n) => n.kind).sort()).toEqual(["hut", "peak", "water"]);
    // The loch's name sits in the water, not on its island.
    const name = all.names.find((n) => n.kind === "water")!.at;
    expect(name[0]).toBeGreaterThan(201000 + 2800);
    expect(name[0]).toBeLessThan(201000 + 3500);
    expect(featureSummary(water)).toBe("1 path or track, 1 river or stream, 1 loch");
    // On the grid within a metre of where they were put.
    const p = water.lines.find((l) => l.kind === "path")!.pts[1];
    expect(Math.abs(p[0] - 202500)).toBeLessThan(1);
    expect(Math.abs(p[1] - 772000)).toBeLessThan(1);
  });

  it("says plainly when a file won't do", () => {
    expect(() => readOsm("<svg></svg>")).toThrow(OsmError);
    expect(() => readOsm('<osm version="0.6"></osm>')).toThrow(OsmError);
    const paris = readOsm('<osm><bounds minlat="48.85" minlon="2.29" maxlat="48.86" maxlon="2.30"/><node id="1" lat="48.855" lon="2.295"/></osm>');
    expect(typeof osmArea(paris)).toBe("string");
  });
});

describe("Map features on the sheets", () => {
  const sw = { e: 201000, n: 770500 };
  const hill = gridFrom(sw, 4000, 3000, 20, (e, n) => 300 + 700 * Math.exp(-(((e - 202800) / 900) ** 2 + ((n - 771500) / 700) ** 2)));
  const all = featuresOnGrid(readOsm(sampleOsm()), "all");
  const spec = { ...CONTOUR_DEFAULTS, layers: 20 };
  const puzzle = makeContourPuzzle(hill, 4000, 3000, spec, sw, all);
  const k = puzzle.k;
  const band = puzzle.metresPerLayer;
  const sheetOf = (x: number, y: number) => Math.max(0, Math.min(spec.layers - 1, Math.floor((heightMm(x, y) - puzzle.low) / band)));
  const heightMm = (x: number, y: number) => {
    const e = sw.e + x / k;
    const n = sw.n + y / k;
    return 300 + 700 * Math.exp(-(((e - 202800) / 900) ** 2 + ((n - 771500) / 700) ** 2));
  };

  it("scores each stretch of a line on the sheet whose band it lies in", () => {
    const sheets = puzzle.layers.filter((l) => l.marks.lines.length);
    // The path climbs the hill, so it crosses several sheets.
    expect(sheets.length).toBeGreaterThan(2);
    for (const l of puzzle.layers)
      for (const run of l.marks.lines)
        for (let i = 0; i + 1 < run.length; i++) {
          const mid: [number, number] = [(run[i][0] + run[i + 1][0]) / 2, (run[i][1] + run[i + 1][1]) / 2];
          expect(Math.abs(sheetOf(...mid) - l.index), `sheet ${l.index + 1}`).toBeLessThanOrEqual(1);
          expect(mid[0]).toBeGreaterThanOrEqual(0);
          expect(mid[1]).toBeLessThanOrEqual(puzzle.height + 1e-9);
        }
  });

  it("engraves the loch (with its island) and the hut, and engraves names on every sheet they're seen on, off the water", () => {
    const fills = puzzle.layers.flatMap((l) => l.marks.fills);
    expect(fills.length).toBe(3);
    // Each name on every sheet whose band it crosses (the same place on each), and on no other.
    const names = new Map<string, { at: [number, number]; sheets: number[] }>();
    for (const l of puzzle.layers) for (const n of l.marks.names) names.set(n.text, { at: n.at, sheets: [...(names.get(n.text)?.sheets ?? []), l.index] });
    expect([...names.keys()].sort()).toEqual(["CIC Hut", "Lochan Meall", "Sgùrr & Beinn 1044 m"]);
    for (const [text, { at, sheets }] of names) {
      const w = nameWidth(text) / 2;
      const seen = new Set<number>();
      for (let y = -NAME_SIZE / 2; y <= NAME_SIZE / 2; y += 0.25) for (let x = -w; x <= w; x += 0.25) seen.add(sheetOf(at[0] + x, at[1] + y));
      const near = (a: Set<number> | number[], L: number) => [L - 1, L, L + 1].some((m) => (a instanceof Set ? a.has(m) : a.includes(m)));
      for (const L of seen) expect(near(sheets, L), `${text} seen on ${L + 1}`).toBe(true);
      for (const L of sheets) expect(near(seen, L), `${text} engraved on ${L + 1}`).toBe(true);
    }
    // Piece names keep off map names on the same sheet.
    for (const l of puzzle.layers)
      for (const n of l.marks.names)
        for (const p of l.labels) {
          const w = nameWidth(n.text) / 2;
          const inside = Math.abs(p.at[0] - n.at[0]) < w && Math.abs(p.at[1] - n.at[1]) < NAME_SIZE / 2;
          expect(inside, `${p.text} on ${n.text}`).toBe(false);
        }
    // On the bed: scored lines, engraved lochs and names, as shapes.
    const sheets = bedSheets(puzzle, [600, 300]);
    const items = sheets.flatMap((s) => bedItems(puzzle, s, []));
    expect(items.some((i) => i.name.endsWith("paths and rivers") && i.op === "score")).toBe(true);
    expect(items.some((i) => i.name.endsWith("lochs and buildings") && i.op === "engrave")).toBe(true);
    expect(items.some((i) => i.name.endsWith("map names") && i.op === "engrave")).toBe(true);
  });

  it("puts nothing from the map on the sheets with just the area", () => {
    const plain = makeContourPuzzle(hill, 4000, 3000, spec, sw, featuresOnGrid(readOsm(sampleOsm()), "area"));
    expect(plain.layers.every((l) => !l.marks.lines.length && !l.marks.fills.length && !l.marks.names.length)).toBe(true);
  });
});
