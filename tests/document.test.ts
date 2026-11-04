import { describe, expect, it } from "vitest";

import { newDocument, parseDocument, readDocumentFile, serializeDocument } from "../src/model/document";
import { importDrawing } from "../src/model/importFile";
import { keepInBrowser, readKept } from "../src/model/keep";
import { describeItem, itemAt, itemBox, itemsInBox, makeCircle, makeRect, makeText, mirroredItem, movedItem, pieceOf, placedAt, rotatedItem } from "../src/model/shapes";
import { copyName, useStore } from "../src/model/store";
import { laserPaths, makeSheet, offBed } from "../src/laser/sheet";
import { laserSvg } from "../src/laser/files";

describe("documents", () => {
  it("round-trips through a file and keeps the browser copy", () => {
    const doc = newDocument("Sign");
    doc.items = [makeRect("r", 10, 10, 50, 30), makeText("t", 20, 20, "Hi", 12)];
    const r = readDocumentFile(serializeDocument(doc), "Sign.juracut");
    expect(r.ok && r.doc).toEqual(doc);
    const store = new Map<string, string>();
    const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
    expect(keepInBrowser(fake, doc)).toBe(true);
    expect(readKept(fake)).toEqual(doc);
  });

  it("falls back to sensible values for odd files and refuses non-designs", () => {
    const doc = parseDocument({ format: "juracut", items: [{ kind: "rect", id: "a", w: -5 }, { kind: "circle", id: "a", r: "big" }, { kind: "what" }, { kind: "text", text: 5, font: "comic" }] })!;
    expect(doc.name).toBe("Untitled design");
    expect(doc.bed).toEqual([600, 300]);
    expect(doc.items).toHaveLength(3);
    expect(doc.items[0]).toMatchObject({ kind: "rect", w: 0.01, h: 10 });
    expect(doc.items[1].id).not.toBe("a");
    expect(doc.items[2]).toMatchObject({ kind: "text", text: "", font: "inter-regular" });
    expect(parseDocument({ format: "partsmith" })).toBeNull();
    expect(readDocumentFile("{not json", "x.juracut")).toMatchObject({ ok: false });
  });
});

describe("shapes", () => {
  it("measures, moves, turns and flips", () => {
    const r = makeRect("r", 10, 20, 40, 10);
    expect(itemBox(r)).toEqual([10, 20, 50, 30]);
    expect(itemBox(movedItem(r, 5, -5))).toEqual([15, 15, 55, 25]);
    const turned = rotatedItem(r, 90);
    const b = itemBox(turned)!;
    expect(b.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([25, 5, 35, 45]);
    expect(itemBox(placedAt(turned, 0, 0))!.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0, 10, 40]);
    const t = makeText("t", 0, 0, "F", 10);
    const flipped = mirroredItem(t);
    expect(flipped.kind).toBe("shape");
    expect(itemBox(flipped)!.map((v) => Math.round(v * 1e3) / 1e3)).toEqual(itemBox(t)!.map((v) => Math.round(v * 1e3) / 1e3));
    expect(describeItem(r)).toBe("40 × 10 mm");
    expect(describeItem(makeCircle("c", 0, 0, 5))).toBe("⌀ 10 mm");
  });

  it("finds the shape under a point, topmost first, and shapes inside a box", () => {
    const items = [makeRect("a", 0, 0, 100, 100), makeCircle("b", 50, 50, 10)];
    expect(itemAt(items, [50, 50], 1)?.id).toBe("b");
    expect(itemAt(items, [5, 5], 1)?.id).toBe("a");
    expect(itemAt(items, [200, 200], 1)).toBeNull();
    expect(itemsInBox(items, [30, 30, 70, 70]).map((i) => i.id)).toEqual(["b"]);
  });

  it("names copies", () => {
    expect(copyName("Rectangle")).toBe("Rectangle copy");
    expect(copyName("Rectangle copy")).toBe("Rectangle copy 2");
    expect(copyName("Rectangle copy 2")).toBe("Rectangle copy 3");
  });
});

describe("sheet", () => {
  it("sorts cuts into holes and outlines, keeps scores and engraving, and writes a true-size SVG", () => {
    const doc = newDocument("Tag");
    doc.items = [makeRect("plate", 10, 10, 60, 30), makeCircle("hole", 15, 25, 2), { ...makeText("words", 25, 20, "A", 10), op: "engrave" }, { ...makeRect("fold", 40, 10, 0.01, 30), op: "score" }];
    const paths = laserPaths(doc.items);
    const layers = paths.map((p) => p.layer);
    expect(layers.filter((l) => l === "outer")).toHaveLength(1);
    expect(layers.filter((l) => l === "inner")).toHaveLength(1);
    expect(layers.filter((l) => l === "engrave")).toHaveLength(2); // the A's outside and its hole
    expect(layers.filter((l) => l === "score")).toHaveLength(1);
    // Holes come before the outline in the file.
    expect(layers.indexOf("inner")).toBeLessThan(layers.indexOf("outer"));
    const sheet = makeSheet(doc);
    expect(sheet.size[0]).toBeCloseTo(60, 6);
    expect(sheet.size[1]).toBeCloseTo(30, 6);
    const svg = laserSvg(sheet);
    expect(svg).toContain('width="60mm"');
    expect(svg).toContain('stroke="#FF0000"');
    expect(svg).toContain('stroke="#0000FF"');
    expect(svg).toContain('fill="#000000"');
    expect(svg).toContain('id="cut-outer"');
    const whole = makeSheet(doc, { wholeBed: true });
    expect(whole.size).toEqual([600, 300]);
  });

  it("warns about shapes off the bed", () => {
    const doc = newDocument();
    doc.items = [makeRect("in", 0, 0, 10, 10), makeRect("out", 595, 0, 10, 10)];
    expect(offBed(doc).map((i) => i.id)).toEqual(["out"]);
  });
});

describe("import", () => {
  it("brings an SVG in as shapes by what the laser does, placed on the bed", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="30mm" viewBox="0 0 40 30"><path d="M5 5 h5 v5 h-5 z" fill="#000" stroke="none"/><path d="M0 0 h40 v30 h-40 z" fill="none" stroke="#FF0000"/></svg>`;
    const r = importDrawing(svg, "badge.svg", [], { bed: [600, 300] });
    expect(r.items.map((i) => [i.op, i.name])).toEqual([
      ["cut", "badge (cut)"],
      ["engrave", "badge (engrave)"],
    ]);
    const b = itemBox(r.items[0])!;
    expect(b[0]).toBeCloseTo(10, 9);
    expect(b[1]).toBeCloseTo(10, 9);
    expect(r.summary).toMatch(/Brought in 2 shapes from badge.svg \(40 × 30 mm\)/);
  });

  it("says when a drawing has nothing usable", () => {
    expect(() => importDrawing(`<svg xmlns="http://www.w3.org/2000/svg"><text>hi</text></svg>`, "empty.svg", [], { bed: [600, 300] })).toThrow(/no lines or shapes/);
  });
});

describe("store", () => {
  it("records undo steps, with drags as one step", () => {
    const s = useStore.getState();
    s.newDocument();
    s.addItems([makeRect("r", 0, 0, 10, 10)]);
    expect(useStore.getState().selection).toEqual(["r"]);
    s.dragStart();
    s.dragUpdate((base) => ({ ...base, items: base.items.map((it) => movedItem(it, 5, 0)) }));
    s.dragUpdate((base) => ({ ...base, items: base.items.map((it) => movedItem(it, 20, 0)) }));
    s.dragEnd();
    expect(itemBox(useStore.getState().history.present.items[0])![0]).toBe(20);
    s.undo();
    expect(itemBox(useStore.getState().history.present.items[0])![0]).toBe(0);
    s.redo();
    expect(itemBox(useStore.getState().history.present.items[0])![0]).toBe(20);
    s.duplicateSelected();
    expect(useStore.getState().history.present.items).toHaveLength(2);
    expect(useStore.getState().history.present.items[1].name).toBe("Rectangle copy");
    s.deleteSelected();
    expect(useStore.getState().history.present.items).toHaveLength(1);
  });

  it("arranges every shape onto the bed, keeping holes with their plates", () => {
    const s = useStore.getState();
    s.newDocument();
    s.addItems([makeRect("a", -50, -50, 100, 20), makeRect("b", 700, 0, 20, 100), makeCircle("c", -40, -40, 3), makeCircle("d", 400, 200, 10)]);
    s.arrangeAll(5);
    const doc = useStore.getState().history.present;
    expect(offBed(doc)).toHaveLength(0);
    // The small circle was inside the first rectangle, and still is.
    const a = itemBox(doc.items[0])!;
    const c = itemBox(doc.items[2])!;
    expect(c[0] > a[0] && c[2] < a[2] && c[1] > a[1] && c[3] < a[3]).toBe(true);
    const roots = pieceOf(doc.items);
    expect(roots.get("c")).toBe("a");
    expect(roots.has("d")).toBe(false);
  });
});
