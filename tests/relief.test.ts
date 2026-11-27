import { describe, expect, it } from "vitest";
import { gridFrom } from "../src/terrain/elevation";
import { depthShare, makeRelief, patternLines, reliefProblems, RELIEF_DEFAULTS, testStripGreys, type ReliefArea } from "../src/terrain/relief";
import { pathPoints, pointInPolygon, type Pt } from "../src/geometry/segments";
import { loopArea } from "../src/geometry/trace";
import { reliefItems, testStripItems } from "../src/model/reliefItems";
import { itemBox } from "../src/model/shapes";

const toSegment = (p: Pt, a: Pt, b: Pt) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

// A round island 10 km across rising to 500 m in the middle of a 20 × 16 km area, and a small one (2 km) to the east.
const area: ReliefArea = { sw: { e: 100000, n: 200000 }, width: 20000, height: 16000 };
const grid = gridFrom(area.sw, area.width, area.height, 50, (e, n) => {
  const d = Math.hypot(e - 109000, n - 208000);
  const big = 500 * (1 - d / 5000);
  const d2 = Math.hypot(e - 116500, n - 208000);
  const small = 80 * (1 - d2 / 1000);
  return Math.max(big, small, -20);
});

describe("island relief", () => {
  it("checks the board can take the carving", () => {
    expect(reliefProblems(RELIEF_DEFAULTS)).toEqual([]);
    expect(reliefProblems({ ...RELIEF_DEFAULTS, thickness: 3, depth: 2.5 })[0]).toMatch(/less than 1 mm/);
  });
  it("maps height to depth: the top at the surface, the coast deepest, in steps when terraced", () => {
    expect(depthShare(500, 500, { curve: 1, style: "smooth", steps: 8 })).toBe(0);
    expect(depthShare(0, 500, { curve: 1, style: "smooth", steps: 8 })).toBe(1);
    expect(depthShare(250, 500, { curve: 1, style: "smooth", steps: 8 })).toBeCloseTo(0.5);
    const t = [0, 100, 200, 300, 400, 500].map((h) => depthShare(h, 500, { curve: 1, style: "terraced", steps: 4 }));
    expect(new Set(t).size).toBeLessThanOrEqual(4);
    expect(t[0]).toBe(1);
    expect(t[5]).toBe(0);
  });
  it("makes one piece: the coast cut round both islands, the depth picture light at the top and dark at the coast", () => {
    const r = makeRelief(grid, area, { ...RELIEF_DEFAULTS, size: 200 });
    expect(r.coast.length).toBe(2);
    expect(r.cuts.length).toBe(0);
    expect(Math.max(r.width, r.height)).toBeGreaterThan(195);
    // 200 mm across ~17.5 km of land: about 11.4 mm per km.
    expect(r.scale * 1000).toBeGreaterThan(10);
    expect(r.highest).toBeGreaterThan(450);
    // The brightest grey is the summit; near the coast the picture is dark.
    const top = r.greys.reduce((a, b) => Math.max(a, b), 0);
    expect(top).toBeGreaterThan(240);
    const rings = r.coast.map((l) => pathPoints(l, true, 0.05));
    const big = rings.reduce((a, b) => (Math.abs(loopArea(a)) > Math.abs(loopArea(b)) ? a : b));
    const xs = big.map((p) => p[0]);
    const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
    const px = Math.round((middle / r.width) * r.gw);
    const py = Math.round(r.gh / 2);
    expect(r.greys[py * r.gw + px]).toBeGreaterThan(200);
  });
  it("keeps only the biggest when asked", () => {
    const r = makeRelief(grid, area, { ...RELIEF_DEFAULTS, size: 200, land: "biggest" });
    expect(r.coast.length).toBe(1);
  });
  it("cuts a jigsaw whose lines stop at the coast, and counts its pieces", () => {
    for (const puzzle of ["classic", "small", "wavy", "straight"] as const) {
      const r = makeRelief(grid, area, { ...RELIEF_DEFAULTS, size: 200, land: "biggest", puzzle, pieces: 4 });
      expect(r.cuts.length).toBeGreaterThan(2);
      expect(r.pieces).toBeGreaterThanOrEqual(8);
      const ring = pathPoints(r.coast[0], true, 0.05);
      for (const run of r.cuts) {
        const pts = pathPoints(run, false, 0.05);
        // The middle of every run is on the island; the ends reach just past the coast.
        const mid = pts[Math.floor(pts.length / 2)];
        expect(pointInPolygon(mid as Pt, ring)).toBe(true);
        // Every end reaches the coast's cut (outside it, or within half a millimetre of it), so the pieces part.
        for (const end of [pts[0], pts[pts.length - 1]]) {
          const gap = Math.min(...ring.map((p, i) => toSegment(end as Pt, p as Pt, ring[(i + 1) % ring.length] as Pt)));
          expect(!pointInPolygon(end as Pt, ring) || gap <= 0.5, `end ${end} is ${gap} mm inside the coast`).toBe(true);
        }
      }
    }
  });
  it("makes a frame with room for the name, and contour lines", () => {
    const r = makeRelief(grid, area, { ...RELIEF_DEFAULTS, size: 150, land: "biggest", frame: 15, name: "Round Island", contours: 100 });
    expect(r.frame).not.toBe(null);
    expect(r.frame!.w).toBeCloseTo(r.width + 30);
    expect(r.frame!.nameAt).not.toBe(null);
    expect(r.contours.length).toBe(4);
  });
  it("refuses an area with no land", () => {
    const sea = gridFrom(area.sw, area.width, area.height, 100, () => -10);
    expect(() => makeRelief(sea, area, RELIEF_DEFAULTS)).toThrow(/no land/);
  });
  it("lays a test strip from white to black", () => {
    const s = testStripGreys(6, 10);
    expect(s.w).toBe(60);
    expect(s.greys[0]).toBe(255);
    expect(s.greys[59]).toBe(0);
    expect(s.levels).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
  it("gives no pattern for one piece", () => {
    expect(patternLines("none", 100, 100, 5, 1).lines).toEqual([]);
    // 4 × 2 pieces: one line between the rows, three between the columns.
    expect(patternLines("straight", 100, 50, 4, 1).lines.length).toBe(4);
  });
  it("puts it on the bed as one group: a clipped greys picture, the coast and cuts, contours scored, the frame and name", () => {
    const spec = { ...RELIEF_DEFAULTS, size: 150, land: "biggest" as const, frame: 12, name: "Round Island", contours: 100, puzzle: "classic" as const, pieces: 3 };
    const r = makeRelief(grid, area, spec);
    let k = 0;
    const items = reliefItems(r, spec, "data:image/png;base64,", "Round Island", () => `i${k++}`);
    expect(new Set(items.map((it) => it.group)).size).toBe(1);
    const pic = items.find((it) => it.kind === "picture");
    expect(pic && pic.kind === "picture" && pic.mode).toBe("greys");
    expect(pic && pic.kind === "picture" && pic.clip?.length).toBe(1);
    expect(items.find((it) => it.name.endsWith("contours"))?.op).toBe("score");
    expect(items.some((it) => it.name.endsWith("jigsaw cuts") && it.op === "cut")).toBe(true);
    expect(items.some((it) => it.kind === "text" && it.text === "Round Island")).toBe(true);
    // The frame's lower-left corner is 10 mm in, and the picture sits inside it.
    const frame = items.find((it) => it.name.endsWith("frame"))!;
    const fb = itemBox(frame)!;
    expect(fb[0]).toBeCloseTo(10);
    expect(fb[1]).toBeCloseTo(10);
    const pb = itemBox(pic!)!;
    expect(pb[0]).toBeCloseTo(22);
    expect(pb[2]).toBeLessThan(fb[2]);
  });
  it("lays out a labelled depth test strip with a cut line round it", () => {
    const s = testStripGreys(6, 100);
    let k = 0;
    const items = testStripItems(s.levels, 3, "data:", () => `s${k++}`);
    expect(items.filter((it) => it.kind === "text").map((it) => (it.kind === "text" ? it.text : ""))).toEqual(["0", "0.6", "1.2", "1.8", "2.4", "3"]);
    expect(items.filter((it) => it.kind === "rect" && it.op === "cut").length).toBe(1);
  });
});
