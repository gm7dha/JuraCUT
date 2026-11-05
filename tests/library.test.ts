import { describe, expect, it } from "vitest";

import { pathsBox } from "../src/geometry/segments";
import { cleanValues, defaultValues, designProblems, LIBRARY, makeDesign } from "../src/library/designs";
import { laserPaths } from "../src/laser/sheet";
import { DEFAULT_MATERIAL } from "../src/model/document";
import { itemBox, itemOutlines } from "../src/model/shapes";
import { aligned, centredOnBed, distributed, keyPiece, grouped, piecesOf, ungrouped, withGroups } from "../src/model/arrange";
import { makeRect } from "../src/model/shapes";
import { gearOutline, gearSizes, hingeCuts, rulerMarks } from "../src/library/workshop";
import { groupDesigns, searchDesigns } from "../src/library/browse";
import { allEdges, makePuzzle, pieceOutline } from "../src/library/puzzle";
import { edgeSegments, ornamentPolygon, ornamentShape, puzzleSpec } from "../src/library/toys3";
import { bookend, bookendOutlines, dividerTray, slidingBox, slidingOutlines } from "../src/library/boxes3";
import { clockLayout } from "../src/library/laserHome3";
import { arcInfo } from "../src/geometry/segments";
import { bottomOutline, deckBox, diceTower, hingeBox, hingeColumns, lanternHoles, MIN_ROWS, namePuzzle, spiceRack, stripOutline } from "../src/library/laserSet4";
import { sideSlots } from "../src/library/sidePanels";
import { patternGap } from "../src/library/patterns";
import { pathPoints } from "../src/geometry/segments";
import { panelAreas, panelPlace, panelShapes, shapeOf, holeArea, type PlateHole } from "../src/library/boxPanels";
import { lit } from "../src/library/ex";
import { assemblyAreas, sectionOf as sectionOfPiece } from "../src/library/sidePanels";
import { boxOf, insidePolygon, signedArea, type P2 } from "../src/library/outlines";
import {
  BIRD_HOLES, birdBox, birdHoles, bookStand, CLIMB, coasterHolder, coasterStanding, DIVIDER_ROOM, drawerBox, DRAIN, earringStand, HANG, HEX_WALL_SHARE,
  HOLE_WEB, keyholeOutline, MIN_FLOOR, MIN_HOLE_HEIGHT, MIN_SHEET, MIN_TIP, MIRROR_ROOM, penBox, penDividers, penHoles, pocketSlot, pullHole, shelfOutline,
  sideSlots as shelfSlots, standGaps, sunburst, tissueCover, tissueSlot, WALL_SHARE,
} from "../src/library/laserSet5";

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
    const v = cleanValues(d, DEFAULT_MATERIAL, { count: 99.4, size: "abc", shape: "octagon", ring: "yes" });
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

  it("lines up against the key shape (which stays put) or the bed, and centres on the bed", () => {
    // "c" picked first: the key.
    const right = aligned(items, ["c", "a", "b"], "right", [600, 300], "key");
    expect(right[2]).toBe(items[2]);
    expect(right.map((it) => itemBox(it)![2])).toEqual([itemBox(items[2])![2], itemBox(items[2])![2], itemBox(items[2])![2]]);
    expect(keyPiece(items, ["b", "a"])!.ids).toEqual(["b"]);
    expect(keyPiece(items, ["b"])).toBeNull();
    const bedTop = aligned(items, ["a", "b", "c"], "top", [600, 300], "bed");
    expect(bedTop.map((it) => itemBox(it)![3])).toEqual([300, 300, 300]);
    const centred = centredOnBed(items, ["a", "b"], [600, 300]);
    const box = [itemBox(centred[0])!, itemBox(centred[1])!];
    expect((Math.min(box[0][0], box[1][0]) + Math.max(box[0][2], box[1][2])) / 2).toBeCloseTo(300, 9);
    expect((Math.min(box[0][1], box[1][1]) + Math.max(box[0][3], box[1][3])) / 2).toBeCloseTo(150, 9);
    // Moved together: the gap between them is unchanged.
    expect(box[1][0] - box[0][0]).toBeCloseTo(itemBox(items[1])![0] - itemBox(items[0])![0], 9);
    expect(centredOnBed(items, ["c"], [600, 300], "x")[2]).not.toBe(items[2]);
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


describe("workshop designs", () => {
  it("every new design makes something sensible", () => {
    const hinge = make("living-hinge");
    expect(hinge.items.map((i) => i.name)).toEqual(["Hinge panel", "Hinge cuts"]);
    expect(hinge.items[1].op).toBe("cut");
    const gear = make("gear", { teeth: 20, module: 2 });
    expect(gear.items).toHaveLength(2);
    const frame = make("picture-frame");
    expect(frame.items.map((i) => i.name)).toEqual(["Frame front", "Frame window", "Frame middle", "Frame back", "Frame hanging hole"]);
    const r = make("ruler", { length: 100 });
    expect(r.items.filter((i) => i.op === "score")).toHaveLength(1);
    expect(r.items.filter((i) => i.kind === "text")).toHaveLength(11);
  });

  it("keeps JuraCAD's gear, hinge and ruler maths", () => {
    const s = gearSizes(20, 2, 20);
    expect(s.outside).toBe(22);
    const pts = gearOutline(20, 2, 20);
    const radii = pts.map(([x, y]) => Math.hypot(x, y));
    expect(Math.max(...radii)).toBeCloseTo(22, 3);
    expect(Math.min(...radii)).toBeCloseTo(17.5, 3);
    const cuts = hingeCuts({ depth: 80, zone: 40, cut: 20, gap: 3, spacing: 1.6 });
    expect(cuts.length).toBeGreaterThan(50);
    expect(cuts.every(([a, b]) => b[1] - a[1] <= 20 + 1e-9 && a[1] >= -37 - 1e-9 && b[1] <= 37 + 1e-9)).toBe(true);
    expect(rulerMarks(20, 30).map(([, l]) => l).slice(0, 11)).toEqual([10, 4, 4, 4, 4, 7, 4, 4, 4, 4, 10]);
  });
});

describe("JuraCAD's laser designs, all of them", () => {
  it("has every laser design JuraCAD has", () => {
    // JuraCAD's LASER_DESIGNS + its finger-joint box and flat-pack stand: keep this list in step with JuraCAD's library.
    const juracad = [
      "finger-box", "flat-stand", "stencil", "rubber-stamp", "name-tag", "coaster", "picture-frame", "living-hinge", "gear", "ruler",
      "sliding-lid-box", "divider-tray", "bookend", "clock-face", "cord-winder", "tealight", "jigsaw", "ornament",
      "hinge-box", "deck-box", "card-stand", "spice-rack", "lantern", "key-rack", "dice-tower", "name-puzzle",
      "bird-box", "earring-stand", "drawer-box", "pen-holder", "sunburst-mirror", "book-stand", "coaster-holder", "tissue-box",
    ];
    const ours: Record<string, string> = { "name-tag": "tag", coaster: "coasters" };
    for (const id of juracad) expect(LIBRARY.some((d) => d.id === (ours[id] ?? id))).toBe(true);
  });

  it("makes the flat-pack stand's three pieces and a stamp with its background engraved", () => {
    const stand = make("flat-stand");
    expect(stand.items.map((i) => i.name)).toEqual(["Stand side", "Stand front foot", "Stand back foot"]);
    const stamp = make("rubber-stamp", { words: "AB", height: 6 });
    expect(stamp.items.map((i) => [i.name, i.op])).toEqual([
      ["Stamp background", "engrave"],
      ["Stamp outline", "cut"],
    ]);
    // Outline + the border's two outlines + A (2 loops) + B (3 loops).
    expect(itemOutlines(stamp.items[0])).toHaveLength(3 + 2 + 3);
    expect(designProblems(LIBRARY.find((d) => d.id === "rubber-stamp")!, DEFAULT_MATERIAL, { ...defaultValues(LIBRARY.find((d) => d.id === "rubber-stamp")!, DEFAULT_MATERIAL), height: 40 })[0]).toMatch(/don't fit/);
    expect(make("coasters", { shape: "hexagon", count: 2 }).items.filter((i) => i.kind === "shape")).toHaveLength(4);
  });
});

describe("library window", () => {
  it("lists every design under a heading, in order", () => {
    const groups = groupDesigns();
    expect(groups.map((g) => g.group)).toEqual(["Boxes and stands", "Signs and stamps", "Home", "Workshop", "Toys and gifts", "Garden", "Desk"]);
    expect(groups.flatMap((g) => g.designs).length).toBe(LIBRARY.length);
    expect(LIBRARY.every((d) => d.icon.startsWith("<"))).toBe(true);
  });

  it("finds designs by the start of any word", () => {
    expect(searchDesigns("gea")[0].id).toBe("gear");
    expect(searchDesigns("photo").map((d) => d.id)).toContain("picture-frame");
    expect(searchDesigns("14.5").map((d) => d.id)).toEqual(["gear"]);
    expect(searchDesigns("  ")).toEqual([]);
    expect(searchDesigns("zebra")).toEqual([]);
  });
});

describe("JuraCAD's third batch of laser designs", () => {
  const values = (id: string, extra: Record<string, unknown> = {}) => ({ ...defaultValues(design(id), DEFAULT_MATERIAL), ...(extra as Record<string, number | string | boolean>) });
  const flat = (p: { v: number }[][]): [number, number][] => p.map(([x, y]) => [x.v, y.v]);
  const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;

  it("jigsaw: the same pattern number gives the same puzzle, the pieces tile the board, and each cut is one smooth run", () => {
    const spec = puzzleSpec(values("jigsaw"));
    expect(JSON.stringify(makePuzzle(spec))).toBe(JSON.stringify(makePuzzle(spec)));
    expect(JSON.stringify(makePuzzle({ ...spec, seed: 2 }))).not.toBe(JSON.stringify(makePuzzle(spec)));
    const p = makePuzzle(spec);
    const total = Array.from({ length: spec.rows * spec.columns }, (_, i) => area(pieceOutline(p, Math.floor(i / spec.columns), i % spec.columns))).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(spec.width * spec.height, 0);
    for (const e of allEdges(p)) {
      const segs = edgeSegments(e);
      expect(segs.map((s) => s.kind)).toEqual(["line", "arc", "arc", "arc", "line"]);
      for (let i = 0; i + 1 < segs.length; i++) expect(near((segs[i] as { to: [number, number] }).to, (segs[i + 1] as { from: [number, number] }).from)).toBe(true);
      e.arcs.forEach((a, i) => {
        const info = arcInfo(segs[i + 1] as Extract<(typeof segs)[number], { kind: "arc" }>)!;
        expect(info.r).toBeCloseTo(a.r, 5);
        expect(Math.abs(info.turn)).toBeLessThan(2 * Math.PI);
      });
    }
    // The cuts between pieces are open and go first; the border last.
    const made = make("jigsaw");
    expect(made.items.map((i) => i.name)).toEqual(["Puzzle border", "Puzzle cuts"]);
    const paths = laserPaths(made.items);
    expect(paths.filter((q) => !q.closed)).toHaveLength((spec.rows - 1) * spec.columns + (spec.columns - 1) * spec.rows);
    expect(paths[paths.length - 1].closed).toBe(true);
  });

  it("sliding-lid box: grooves the lid plus clearance, the low end level with their floor, 8 pieces", () => {
    const v = values("sliding-lid-box");
    const s = slidingBox(v);
    const t = s.b.t.v;
    expect(s.g1.v - s.g0.v).toBeCloseTo(t + 2 * s.c.v, 9);
    const o = slidingOutlines(s);
    expect(Math.max(...flat(o.right).map((q) => q[1]))).toBeCloseTo(s.g0.v, 9);
    // The rail's slot is open at the right-hand end: its outline reaches the wall there both below and above the slot.
    const rail = flat(o.rail);
    expect(rail.filter((q) => Math.abs(q[0] - (s.b.W.v - t)) < 1e-9).map((q) => q[1]).sort((a, b) => a - b)).toEqual([t, s.g0.v, s.g1.v, s.b.H.v]);
    const made = make("sliding-lid-box");
    expect(made.items.filter((i) => i.kind === "shape")).toHaveLength(8);
    expect(made.items.some((i) => i.kind === "circle")).toBe(true);
    expect(designProblems(design("sliding-lid-box"), DEFAULT_MATERIAL, values("sliding-lid-box", { height: 20 }))[0]).toMatch(/too low/);
  });

  it("tray with dividers: one divider per row and column boundary, and none when there's one of each", () => {
    expect(make("divider-tray", { rows: 3, columns: 4 }).items).toHaveLength(5 + 2 + 3);
    expect(make("divider-tray", { rows: 1, columns: 1 }).items).toHaveLength(5);
    const d = dividerTray(values("divider-tray"));
    expect(d.rowAt).toHaveLength(1);
    expect(d.columnAt).toHaveLength(2);
    expect(designProblems(design("divider-tray"), DEFAULT_MATERIAL, values("divider-tray", { columns: 12, width: 60 }))[0]).toMatch(/only/);
  });

  it("bookend: each tab has a slot of the same size", () => {
    const b = bookend(values("bookend"));
    const o = bookendOutlines(b);
    const t = b.t.v;
    const W = b.W.v;
    for (const slot of o.baseSlots.slice(0, 2)) {
      const pts = flat(slot);
      const xs = pts.map((q) => q[0]);
      const ys = pts.map((q) => q[1]);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(t, 9);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.2 * W, 9);
    }
    const made = make("bookend");
    expect(made.items.map((i) => [i.name, itemOutlines(i).length])).toEqual([["Bookend: base", 4], ["Bookend: upright", 2], ["Bookend: brace", 1]]);
  });

  it("clock face: twelve marks, the quarters longer, engraved or scored", () => {
    const L = clockLayout(values("clock-face"));
    expect(L.marks).toHaveLength(12);
    expect(L.marks[0][2] - L.marks[0][1]).toBeCloseTo(1.5 * (L.marks[1][2] - L.marks[1][1]), 9);
    const engraved = make("clock-face");
    expect(engraved.items.filter((i) => i.kind === "text")).toHaveLength(24);
    const scored = make("clock-face", { marks: "score", numbers: "quarters" });
    expect(scored.items.filter((i) => i.op === "score")).toHaveLength(12);
    expect(scored.items.filter((i) => i.kind === "text")).toHaveLength(4);
    expect(designProblems(design("clock-face"), DEFAULT_MATERIAL, values("clock-face", { height: 60 }))[0]).toMatch(/too big|run into|too close/);
  });

  it("ornaments: every shape is one closed outline holding its hole and words", () => {
    for (const shape of ["star", "heart", "circle", "snowflake"]) {
      const v = values("ornament", { shape });
      expect(designProblems(design("ornament"), DEFAULT_MATERIAL, v)).toEqual([]);
      const made = make("ornament", { shape });
      expect(made.items.map((i) => i.kind)).toEqual([shape === "circle" ? "circle" : "shape", "circle", "text"]);
      const outline = itemOutlines(made.items[0]);
      expect(outline).toHaveLength(1);
      expect(outline[0].closed).toBe(true);
      expect(area(ornamentPolygon(ornamentShape(v)))).toBeGreaterThan(0);
    }
    expect(designProblems(design("ornament"), DEFAULT_MATERIAL, values("ornament", { height: 30 }))[0]).toMatch(/don't fit/);
  });

  it("cord winders and the tealight holder make the pieces they say", () => {
    expect(make("cord-winder", { count: 3 }).items).toHaveLength(3);
    const tea = make("tealight", { rings: 3 });
    expect(tea.items).toHaveLength(1 + 2 * 3);
    expect(tea.items.filter((i) => i.kind === "circle" && /hole/.test(i.name)).map((i) => (i.kind === "circle" ? i.r * 2 : 0))).toEqual([40, 40, 40]);
  });
});

describe("JuraCAD's fourth batch of laser designs", () => {
  const values = (id: string, extra: Record<string, unknown> = {}) => ({ ...defaultValues(design(id), DEFAULT_MATERIAL), ...(extra as Record<string, number | string | boolean>) });

  it("living-hinge box: the strip's notches match the bottom's fingers, and each corner has enough hinge rows", () => {
    for (const extra of [{}, { width: 150, depth: 100, radius: 25 }, { finger: 7 }]) {
      const v = values("hinge-box", extra);
      expect(designProblems(design("hinge-box"), DEFAULT_MATERIAL, v)).toEqual([]);
      const b = hingeBox(v);
      const strip = stripOutline(b);
      // Total notch length round the strip = total finger length the bottom sticks out along its sides.
      const notched = strip.notches.reduce((a, [p, q]) => a + q - p, 0);
      const pts = bottomOutline(b);
      let out = 0;
      for (let i = 0; i < pts.length; i++) {
        const [p, q] = [pts[i], pts[(i + 1) % pts.length]];
        const onEdge = (x: [number, number]) => Math.abs(Math.abs(x[0]) - b.W / 2) < 1e-6 || Math.abs(Math.abs(x[1]) - b.D / 2) < 1e-6;
        if (onEdge(p) && onEdge(q)) out += Math.hypot(q[0] - p[0], q[1] - p[1]);
      }
      expect(notched).toBeCloseTo(out, 4);
      expect(strip.zones).toHaveLength(4);
      expect(Math.floor(b.corner / Number(v.spacing))).toBeGreaterThanOrEqual(MIN_ROWS);
      expect(hingeColumns(b, v).length).toBeGreaterThan(0);
    }
    const made = make("hinge-box");
    expect(made.items.map((i) => i.name)).toEqual(["Hinge box: wall strip", "Hinge box: hinge cuts", "Hinge box: bottom", "Hinge box: lid", "Hinge box: lid under-plate"]);
    // The bottom's four inside corners are round.
    expect(itemOutlines(made.items[2])[0].segments.filter((s) => s.kind === "arc")).toHaveLength(4);
    expect(designProblems(design("hinge-box"), DEFAULT_MATERIAL, values("hinge-box", { radius: 6 }))[0]).toMatch(/Round the corners/);
  });

  it("deck box: sized from the cards, with a round thumb notch in the front and back", () => {
    const d = deckBox(values("deck-box"));
    expect(d.b.W.v).toBe(63 + 2 + 6);
    const made = make("deck-box");
    expect(made.items).toHaveLength(7);
    const front = itemOutlines(made.items[0])[0].segments;
    expect(front.filter((s) => s.kind === "arc")).toHaveLength(1);
    expect(make("deck-box", { lid: false, notch: 0 }).items).toHaveLength(5);
  });

  it("dice tower and spice rack: a slot in each side for every tab, pieces clear of each other", () => {
    const tower = diceTower(values("dice-tower"));
    expect(sideSlots(tower.a)).toHaveLength(tower.a.pieces.reduce((k, p) => k + p.tabs.length, 0));
    expect(make("dice-tower").items).toHaveLength(2 + tower.a.pieces.length);
    expect(designProblems(design("dice-tower"), DEFAULT_MATERIAL, values("dice-tower", { baffles: 5, height: 100 }))[0]).toMatch(/too close|too short/);
    const rack = spiceRack(values("spice-rack"));
    expect(rack.a.pieces).toHaveLength(9);
    expect(make("spice-rack").items).toHaveLength(11);
    expect(make("card-stand").items).toHaveLength(5);
  });

  it("lantern: every wall's shapes keep a bridge's width apart", () => {
    for (const pattern of ["circles", "diamonds", "hexagons", "stars"]) {
      const v = values("lantern", { pattern });
      expect(designProblems(design("lantern"), DEFAULT_MATERIAL, v)).toEqual([]);
      const holes = lanternHoles(v);
      expect(holes.length).toBeGreaterThan(4);
      expect(patternGap(holes)).toBeGreaterThanOrEqual(Number(v.bridge) - 1e-6);
    }
    const made = make("lantern");
    expect(made.items).toHaveLength(5);
    expect(itemOutlines(made.items[0]).length).toBe(1 + lanternHoles(values("lantern")).length);
  });

  it("key rack and name puzzle: words that fit, one piece per letter, holes a little bigger", () => {
    expect(make("key-rack").items.filter((i) => i.name.startsWith("Key rack hook"))).toHaveLength(5);
    expect(designProblems(design("key-rack"), DEFAULT_MATERIAL, values("key-rack", { letters: 90 }))[0]).toMatch(/don't fit/);
    const p = namePuzzle(values("name-puzzle"));
    expect(p.letters.map((l) => l.ch).join("")).toBe("ALEX");
    expect(p.letters[0].counters).toHaveLength(1);
    const made = make("name-puzzle");
    expect(made.items.filter((i) => i.name.startsWith("Name puzzle letter"))).toHaveLength(4);
    // Thick sheet needs a wider strip of board between the holes.
    expect(designProblems(design("name-puzzle"), DEFAULT_MATERIAL, values("name-puzzle", { gap: 3, thickness: 6 }))[0]).toMatch(/less than 6 mm apart/);
  });
});

describe("JuraCAD's fifth batch of laser designs", () => {
  const IDS = ["bird-box", "earring-stand", "drawer-box", "pen-holder", "sunburst-mirror", "book-stand", "coaster-holder", "tissue-box"];
  const values = (id: string, extra: Record<string, unknown> = {}) => ({ ...defaultValues(design(id), DEFAULT_MATERIAL), ...(extra as Record<string, number | string | boolean>) });
  const problems = (id: string, extra: Record<string, unknown> = {}) => designProblems(design(id), DEFAULT_MATERIAL, values(id, extra));
  const polyArea = (p: P2[]) => Math.abs(signedArea(p));
  /** A piece's area as cut: its biggest loop less the others (its holes). */
  const cutArea = (it: Parameters<typeof itemOutlines>[0]) => {
    const areas = itemOutlines(it).filter((o) => o.closed).map((o) => polyArea(pathPoints(o.segments, true, 0.002) as P2[]));
    const big = Math.max(...areas);
    return 2 * big - areas.reduce((a, b) => a + b, 0);
  };
  const near = (a: number, b: number, tol = 1) => expect(Math.abs(a - b), `${a} ≈ ${b}`).toBeLessThan(tol);
  const cut = (id: string, extra: Record<string, unknown> = {}) => make(id, extra).items.filter((i) => i.op === "cut");

  it("finger boxes standing any way round, as JuraCAD lays out their sketches", () => {
    const b = { W: lit(100), D: lit(60), H: lit(40), t: lit(3), kerf: lit(0), lid: false, finger: 8 };
    const s = panelShapes(b);
    const dims = { W: 100, D: 60, H: 40, t: 3 };
    const span = (pts: P2[]) => {
      const [x0, y0, x1, y1] = boxOf(pts);
      return [x1 - x0, y1 - y0];
    };
    expect(span(shapeOf(s, "front").nominal.map(panelPlace("front", "upright", dims).map))).toEqual([100, 40]);
    expect(panelPlace("back", "upright", dims).move).toEqual({ dy: 57 });
    const down = shapeOf(s, "front").nominal.map(panelPlace("front", "upsideDown", dims).map);
    expect(down.filter((p) => Math.abs(p[1]) < 1e-9).length).toBe(2);
    expect(panelPlace("bottom", "upsideDown", dims).move).toEqual({ dz: 37 });
    expect(panelPlace("bottom", "onBack", dims)).toMatchObject({ plane: "Front", flip: true, move: { dy: 37 } });
    expect(span(shapeOf(s, "left").nominal.map(panelPlace("left", "onBack", dims).map))).toEqual([40, 60]);
    const floor = shapeOf(s, "front").nominal.map(panelPlace("front", "onBack", dims).map);
    expect(span(floor)).toEqual([100, 40]);
    expect(floor.filter((p) => Math.abs(p[1]) < 1e-9).length).toBe(2);
  });

  it("bird box: the RSPB's hole sizes, the hole's bottom the chosen height above the floor, refusals as advised", () => {
    expect(Object.fromEntries(Object.entries(BIRD_HOLES).map(([k, b]) => [k, b.hole]))).toEqual({ "blue-tit": 25, "great-tit": 28, "house-sparrow": 32 });
    for (const bird of Object.keys(BIRD_HOLES)) {
      const bb = birdBox(values("bird-box", { bird }));
      const t = bb.b.t.v;
      expect(bb.holeAt[1] - bb.hole / 2 - t).toBeCloseTo(130, 9);
      expect(bb.b.H.v - bb.holeAt[1] - bb.hole / 2).toBeGreaterThan(20);
      expect(bb.holeAt[0]).toBeCloseTo(bb.b.W.v / 2, 9);
    }
    expect([MIN_HOLE_HEIGHT, MIN_FLOOR, MIN_SHEET]).toEqual([125, 100, 6]);
    // JuraCUT keeps values inside their limits (as with every design): a lower hole, smaller floor or thinner sheet becomes the least allowed.
    const low = cleanValues(design("bird-box"), DEFAULT_MATERIAL, values("bird-box", { holeHeight: 110, floorWidth: 90, thickness: 4 }));
    expect([low.holeHeight, low.floorWidth, low.thickness]).toEqual([125, 100, 6]);
    expect(values("bird-box").thickness).toBe(6);
    expect(design("bird-box").description).toMatch(/15 mm/);
    expect(design("bird-box").description).toMatch(/north to east/);
    expect(problems("bird-box", { bird: "house-sparrow", holeHeight: 125 })).toEqual([]);
    const bb = birdBox(values("bird-box"));
    const t = bb.b.t.v;
    for (const [x, y] of bb.drains) for (const v of [x, y]) expect(v - DRAIN.d / 2).toBeGreaterThan(t + 5);
    expect(bb.roof[1]).toBe(-30);
    expect(bb.under[0]).toBeGreaterThan(t);
    expect(bb.under[2]).toBeLessThan(bb.b.W.v - t);
  });

  it("bird box: the climbing lines inside the front come out as score lines, grouped with the front", () => {
    const bb = birdBox(values("bird-box"));
    const [t, W] = [bb.b.t.v, bb.b.W.v];
    expect(bb.climb.length).toBeGreaterThan(10);
    for (const l of bb.climb) {
      expect(l.x0).toBeCloseTo(t + CLIMB.side, 9);
      expect(l.x1).toBeCloseTo(W - t - CLIMB.side, 9);
      expect(l.z).toBeGreaterThanOrEqual(t + CLIMB.from - 1e-9);
      expect(l.z).toBeLessThanOrEqual(bb.holeAt[1] - bb.hole / 2 - CLIMB.below + 1e-9);
    }
    for (let i = 1; i < bb.climb.length; i++) expect(bb.climb[i].z - bb.climb[i - 1].z).toBeCloseTo(CLIMB.pitch, 9);
    const made = make("bird-box");
    expect(made.items.filter((i) => i.op === "cut")).toHaveLength(7);
    const score = made.items.filter((i) => i.op === "score");
    expect(score.map((i) => i.name)).toEqual(["Bird box: front score lines"]);
    const lines = itemOutlines(score[0]);
    expect(lines).toHaveLength(bb.climb.length);
    expect(lines.every((o) => !o.closed)).toBe(true);
    const front = made.items.find((i) => i.name === "Bird box: front")!;
    expect(front.group).toBeTruthy();
    expect(score[0].group).toBe(front.group);
    // The lines lie inside the front, clear of its fingers.
    const fb = itemBox(front)!;
    const lb = itemBox(score[0])!;
    expect(lb[0]).toBeCloseTo(fb[0] + t + CLIMB.side, 6);
    expect(lb[2]).toBeCloseTo(fb[2] - t - CLIMB.side, 6);
    const paths = laserPaths(made.items);
    expect(paths.filter((p) => p.layer === "score")).toHaveLength(bb.climb.length);
    expect(paths.filter((p) => p.layer === "outer")).toHaveLength(7);
    expect(paths.filter((p) => p.layer === "inner")).toHaveLength(1 + 2 + 4);
  });

  it("every piece is its panel less its holes, true size (Export's kerf does the allowance)", () => {
    const expected: Record<string, number[]> = {};
    {
      const bb = birdBox(values("bird-box"));
      const a = panelAreas(bb.b, birdHoles(bb));
      const r = (q: number[]) => (q[2] - q[0]) * (q[3] - q[1]);
      expected["bird-box"] = [a.bottom, a.front, a.back, a.left, a.right, r(bb.roof), r(bb.under)];
    }
    {
      const d = drawerBox(values("drawer-box"));
      const slots = shelfSlots(d);
      const c = panelAreas(d.caseBox, { left: slots, right: slots });
      const dr = panelAreas(d.drawer, { front: pullHole(d) });
      expected["drawer-box"] = [c.bottom, c.front, c.back, c.left, c.right, ...d.shelves.map(() => polyArea(shelfOutline(d))), ...d.drawerAt.flatMap(() => [dr.bottom, dr.front, dr.back, dr.left, dr.right])];
    }
    {
      const v = values("pen-holder");
      const holes = penHoles(v) as PlateHole[];
      const a = panelAreas(penBox(v), { front: holes, back: holes, left: holes, right: holes });
      const dv = penDividers(v);
      expected["pen-holder"] = [a.bottom, a.front, a.back, a.left, a.right, polyArea(dv.plates[0]), polyArea(dv.plates[1])];
    }
    {
      const c = tissueCover(values("tissue-box"));
      const a = panelAreas(c.b, { bottom: [tissueSlot(c)] });
      expected["tissue-box"] = [a.bottom, a.front, a.back, a.left, a.right];
    }
    {
      const e = earringStand(values("earring-stand"));
      const holes = e.holes.length * holeArea({ kind: "circle", c: [0, 0], d: e.hole });
      expected["earring-stand"] = [polyArea(e.plates[0]) - holes, polyArea(e.plates[1]) - holes];
    }
    {
      const s = sunburst(values("sunburst-mirror"));
      const circle = (d: number) => (Math.PI * d * d) / 4;
      expected["sunburst-mirror"] = [polyArea(s.sun) - circle(s.window), circle(s.disc) - circle(s.ringHole) - holeArea(pocketSlot(s.hang)), circle(s.disc) - polyArea(keyholeOutline(s.hang))];
    }
    for (const id of ["book-stand", "coaster-holder"]) {
      const a = id === "book-stand" ? bookStand(values(id)).a : coasterHolder(values(id)).a;
      const w = assemblyAreas(a);
      expected[id] = [w.side, w.side, ...a.pieces.map((p) => w.pieces[p.role])];
    }
    for (const id of IDS) {
      const got = cut(id).map(cutArea);
      expect(got.length, id).toBe(expected[id].length);
      got.forEach((a, i) => near(a, expected[id][i]));
    }
  });

  it("pieces laid out on the bed never overlap, for several sizes of each", () => {
    const cases: [string, Record<string, unknown>][] = [
      ...IDS.map((id): [string, Record<string, unknown>] => [id, {}]),
      ["bird-box", { bird: "house-sparrow", floorWidth: 100, floorDepth: 100 }],
      ["drawer-box", { drawers: 1, height: 80 }],
      ["pen-holder", { dividers: false, pattern: "circles" }],
      ["sunburst-mirror", { alternate: false, mirrorThickness: 5 }],
      ["coaster-holder", { shape: "hexagon" }],
      ["tissue-box", { boxWidth: 240, boxDepth: 120, boxHeight: 85 }],
    ];
    for (const [id, extra] of cases) {
      expect(problems(id, extra), id).toEqual([]);
      const made = make(id, extra);
      const pieces = new Map<string, [number, number, number, number]>();
      for (const it of made.items) {
        const k = it.group ?? it.id;
        const b = itemBox(it)!;
        const was = pieces.get(k);
        pieces.set(k, was ? [Math.min(was[0], b[0]), Math.min(was[1], b[1]), Math.max(was[2], b[2]), Math.max(was[3], b[3])] : b);
      }
      const boxes = [...pieces.values()];
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const [a, b] = [boxes[i], boxes[j]];
          const apart = a[2] <= b[0] + 1e-6 || b[2] <= a[0] + 1e-6 || a[3] <= b[1] + 1e-6 || b[3] <= a[1] + 1e-6;
          expect(apart, `${id}: pieces ${i} and ${j}`).toBe(true);
        }
    }
  });

  it("earring stand: halving slots the sheet's thickness, half the height; holes clear of each other and the edges", () => {
    const e = earringStand(values("earring-stand"));
    const [a, b] = e.plates;
    expect(polyArea(a)).toBeCloseTo(e.w * e.h - (e.t * e.h) / 2 - e.chamfer * e.chamfer, 6);
    expect(polyArea(b)).toBeCloseTo(e.w * e.h - (e.t * e.h) / 2 - e.chamfer * e.chamfer, 6);
    expect(insidePolygon([0, e.h * 0.75], a)).toBe(false);
    expect(insidePolygon([0, e.h * 0.25], a)).toBe(true);
    expect(insidePolygon([0, e.h * 0.25], b)).toBe(false);
    expect(insidePolygon([0, e.h * 0.75], b)).toBe(true);
    expect(e.holes.length).toBeGreaterThan(20);
    const g = standGaps(e);
    expect(g.between).toBeGreaterThanOrEqual(HOLE_WEB);
    expect(g.edge).toBeGreaterThanOrEqual(HOLE_WEB);
    expect(e.holes.filter((p) => p[0] < 0).length).toBe(e.holes.filter((p) => p[0] > 0).length);
    expect(problems("earring-stand", { rows: 30, columns: 20 })[0]).toMatch(/closer than/);
  });

  it("box with drawers: the clearance either side, above and behind; shelves' tabs match the sides' slots", () => {
    const d = drawerBox(values("drawer-box"));
    const { W, D, H, t, c, n } = d;
    expect(d.drawer.W.v + 2 * c + 2 * t).toBeCloseTo(W, 9);
    expect(d.drawer.D.v + c + t).toBeCloseTo(D, 9);
    expect(n * (d.drawer.H.v + c) + (n - 1) * t + 2 * t).toBeCloseTo(H, 6);
    expect(d.shelves).toHaveLength(n - 1);
    const tops = [...d.shelves, H - t];
    d.drawerAt.forEach((at, i) => {
      expect(at.dz).toBeCloseTo(i === 0 ? t : d.shelves[i - 1] + t, 6);
      expect(tops[i] - (at.dz + d.drawer.H.v)).toBeCloseTo(c, 6);
    });
    expect(polyArea(shelfOutline(d))).toBeCloseTo((W - 2 * t) * (D - t) + 2 * t * (d.tab[1] - d.tab[0]), 6);
    for (const s of shelfSlots(d)) if (s.kind === "poly") expect(polyArea(s.points)).toBeCloseTo(t * (d.tab[1] - d.tab[0]), 6);
    expect(d.pull.a[1] + d.pull.w / 2).toBeLessThan(d.drawer.H.v);
    expect(d.pull.a[0] - d.pull.w / 2).toBeGreaterThan(t);
    expect(problems("drawer-box", { drawers: 6, height: 150 })[0]).toMatch(/drawers would be only/);
    expect(problems("drawer-box", { drawers: 2 })).toEqual([]);
    // The case's sides have a slot per shelf; each drawer front its pull slot (two half circles).
    const made = make("drawer-box");
    expect(itemOutlines(made.items.find((i) => i.name === "Box with drawers: left side")!)).toHaveLength(1 + d.shelves.length);
    const front = itemOutlines(made.items.find((i) => i.name === "Box with drawers: drawer 1 front")!);
    expect(front).toHaveLength(2);
    expect(front[1].segments.filter((s) => s.kind === "arc")).toHaveLength(2);
    expect(made.items).toHaveLength(5 + 2 + 15);
    expect(made.notes.join(" ")).toMatch(/don't all fit on the bed/);
  });

  it("desk pot, sunburst, book stand, coaster holder and tissue cover keep JuraCAD's numbers", () => {
    const pv = values("pen-holder");
    const dv = penDividers(pv);
    expect(dv.length).toBeCloseTo(90 - 6 - DIVIDER_ROOM, 9);
    expect(polyArea(dv.plates[0])).toBeCloseTo(dv.length * dv.height - (3 * dv.height) / 2, 6);
    expect(penHoles(pv).length).toBeGreaterThan(10);
    expect(penHoles(pv).every((h) => h.kind === "poly" && h.points.length === 6)).toBe(true);
    expect(make("pen-holder", { dividers: false }).items).toHaveLength(5);

    const s = sunburst(values("sunburst-mirror"));
    expect(s.sun).toHaveLength(32);
    expect(s.window).toBe(140);
    expect(s.ringHole).toBe(150 + 2 * MIRROR_ROOM);
    expect(s.disc).toBeGreaterThan(s.ringHole);
    expect(s.disc / 2).toBeLessThan(s.body);
    expect(s.tip).toBeGreaterThan(MIN_TIP);
    expect(sunburst(values("sunburst-mirror", { mirrorThickness: 4 })).rings).toBe(2);
    const pocket = pocketSlot(s.hang);
    if (pocket.kind !== "slot") throw new Error("slot");
    expect(pocket.a[1] - pocket.w / 2).toBeGreaterThanOrEqual(s.ringHole / 2 + HANG.web - 1e-9);
    expect(pocket.b[1] + pocket.w / 2).toBeLessThanOrEqual(s.disc / 2 - HANG.web + 1e-9);
    const key = keyholeOutline(s.hang);
    const [x0, , x1, y1] = boxOf(key);
    expect(x1 - x0).toBeCloseTo(HANG.head, 6);
    expect(y1 - (s.hang[1] - HANG.head / 2)).toBeCloseTo(HANG.head / 2 + HANG.travel + HANG.shank / 2, 6);
    expect(problems("sunburst-mirror", { rays: 15 })[0]).toMatch(/even number/);
    expect(problems("sunburst-mirror", { rays: 60, size: 290 })[0]).toMatch(/too sharp/);
    expect(problems("sunburst-mirror", { rays: 15, alternate: false })).toEqual([]);
    // The back and rings are true circles.
    const back = make("sunburst-mirror").items.find((i) => i.name === "Sunburst: back")!;
    expect(itemOutlines(back)[0].segments[0].kind).toBe("circle");

    for (const lean of [10, 20, 35]) {
      const b = bookStand(values("book-stand", { lean }));
      const [base, lip, rest] = b.a.pieces;
      expect(rest.angle).toBe(90 - lean);
      expect(b.restFoot[0] - (lip.centre[0] + b.a.t / 2)).toBeCloseTo(20, 6);
      expect(base.centre[0] + base.length / 2).toBeGreaterThan(Math.max(...sectionOfPiece(rest, b.a.t).map((p) => p[0])));
    }

    const coaster = defaultValues(design("coasters"), DEFAULT_MATERIAL);
    const cv = values("coaster-holder");
    expect([cv.shape, cv.size, cv.count]).toEqual([coaster.shape, coaster.size, coaster.count]);
    const h = coasterHolder(cv);
    expect(h.a.width).toBeCloseTo(4 * 3 + 2 * 1.5, 9);
    const [base, left, right] = h.a.pieces;
    expect(right.centre[0] - left.centre[0] - h.a.t).toBeCloseTo(95 + 3, 6);
    expect(base.length).toBeCloseTo(95 + 3 + 6, 6);
    expect(coasterStanding("hexagon", 95).w).toBeCloseTo((2 * 95) / Math.sqrt(3), 5);
    expect(coasterHolder(values("coaster-holder", { shape: "hexagon" })).a.pieces[1].length).toBeCloseTo(95 * HEX_WALL_SHARE, 6);
    expect(left.length).toBeCloseTo(95 * WALL_SHARE, 6);

    const c = tissueCover(values("tissue-box", { boxWidth: 240, boxDepth: 120, boxHeight: 85 }));
    expect([c.b.W.v, c.b.D.v, c.b.H.v]).toEqual([250, 130, 90]);
    expect(c.slot.a[1]).toBe(c.slot.b[1]);
    expect(c.slot.b[0] - c.slot.a[0]).toBeCloseTo(80 - 30, 9);
    expect(problems("tissue-box", { slotLength: 200 })[0]).toMatch(/too big for the top/);
  });

  it("are under JuraCAD's headings and found by search", () => {
    const groups = Object.fromEntries(groupDesigns().map((g) => [g.group, g.designs.map((d) => d.id)]));
    expect(groups.Garden).toEqual(["bird-box"]);
    expect(groups.Desk).toEqual(["pen-holder", "book-stand"]);
    for (const id of ["earring-stand", "sunburst-mirror", "coaster-holder"]) expect(groups.Home).toContain(id);
    for (const id of ["drawer-box", "tissue-box"]) expect(groups["Boxes and stands"]).toContain(id);
    const first = (q: string) => searchDesigns(q)[0].id;
    expect([first("bird"), first("sparrow"), first("drawers"), first("earring"), first("sunburst"), first("tissue"), first("honeycomb"), first("coaster holder")]).toEqual([
      "bird-box", "bird-box", "drawer-box", "earring-stand", "sunburst-mirror", "tissue-box", "pen-holder", "coaster-holder",
    ]);
  });
});
