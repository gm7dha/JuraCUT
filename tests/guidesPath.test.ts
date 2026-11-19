import { describe, expect, it } from "vitest";
import { newDocument, parseDocument, serializeDocument } from "../src/model/document";
import { guideNear, guidesOf, parseGuides, withGuideAt, withoutGuide } from "../src/model/guides";
import { changeLabel } from "../src/model/historyLabel";
import { alongPathItems, pathSpots } from "../src/model/repeat";
import { boxCentre, itemBox, makeCircle, makeLine, makeRect } from "../src/model/shapes";
import { snapLines } from "../src/model/snap";
import { useStore } from "../src/model/store";
import { pathFor } from "../src/model/textPath";

const near = (a: number, b: number, tol = 1e-3) => expect(Math.abs(a - b) < tol, `${a} ≈ ${b}`).toBe(true);

describe("guide lines", () => {
  it("are added, moved, removed and saved with the design", () => {
    let doc = withGuideAt(newDocument(), "x", 0, 50);
    doc = withGuideAt(doc, "y", 0, 20);
    doc = withGuideAt(doc, "x", 1, 120);
    doc = withGuideAt(doc, "x", 0, 55);
    expect(guidesOf(doc)).toEqual({ xs: [55, 120], ys: [20] });
    const back = parseDocument(JSON.parse(serializeDocument(doc)))!;
    expect(back.guides).toEqual({ xs: [55, 120], ys: [20] });
    expect(guideNear(guidesOf(doc), [56, 200], 2)).toEqual({ axis: "x", index: 0 });
    expect(guideNear(guidesOf(doc), [80, 80], 2)).toBe(null);
    doc = withoutGuide(withoutGuide(withoutGuide(doc, "x", 0), "x", 0), "y", 0);
    expect(doc.guides).toBeUndefined();
    expect(changeLabel(newDocument(), withGuideAt(newDocument(), "y", 0, 5))).toBe("Added a guide line");
  });
  it("are read carefully from files", () => {
    expect(parseGuides({ xs: [1, "2", NaN, 3], ys: "no" })).toEqual({ xs: [1, 3], ys: [] });
    expect(parseGuides({ xs: [], ys: [] })).toBeUndefined();
    expect(parseDocument({ format: "juracut", items: [] })!.guides).toBeUndefined();
  });
  it("are lines shapes snap to", () => {
    const lines = snapLines([], [], [600, 300], { xs: [123], ys: [45] });
    expect(lines.xs).toContain(123);
    expect(lines.ys).toContain(45);
  });
  it("are cleared in one step", () => {
    const s = useStore.getState();
    s.newDocument();
    s.commit(withGuideAt(useStore.getState().history.present, "x", 0, 10));
    useStore.getState().clearGuides();
    expect(useStore.getState().history.present.guides).toBeUndefined();
  });
});

describe("copies along a path", () => {
  it("spreads copies round a closed path and end to end on an open one", () => {
    expect(pathSpots(100, true, 4)).toEqual([0, 25, 50, 75]);
    expect(pathSpots(100, false, 3)).toEqual([0, 50, 100]);
    expect(pathSpots(100, false, 1)).toEqual([50]);
  });
  it("puts each copy's middle on the path", () => {
    const dot = makeCircle("d", 0, 0, 2);
    const ring = makeCircle("r", 50, 50, 40);
    const path = pathFor([dot, ring])!;
    expect(path.item.id).toBe("r");
    const made = alongPathItems([dot, ring], [dot], path.path, 12, false);
    expect(made.length).toBe(12);
    for (const it of made) {
      const c = boxCentre(itemBox(it)!);
      near(Math.hypot(c[0] - 50, c[1] - 50), 40, 0.05);
    }
  });
  it("turns copies to follow the path", () => {
    const bar = makeRect("b", 0, 0, 10, 2);
    const line = makeLine("l", 0, 0, 0, 100);
    const made = alongPathItems([bar, line], [bar], pathFor([bar, line])!.path, 3, true);
    // Up the line: each bar turned a quarter turn, so it's 2 wide and 10 tall.
    const b = itemBox(made[1])!;
    near(b[2] - b[0], 2);
    near(b[3] - b[1], 10);
    near(boxCentre(b)[1], 50);
  });
  it("works from the store", () => {
    const s = useStore.getState();
    s.newDocument();
    s.addItems([makeCircle("d", 0, 0, 2), makeRect("r", 100, 100, 200, 100)]);
    useStore.getState().copyAlongPathSelected(10, true);
    expect(useStore.getState().history.present.items.length).toBe(12);
  });
});
