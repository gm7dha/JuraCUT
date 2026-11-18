import { describe, expect, it } from "vitest";
import { newDocument } from "../src/model/document";
import { changeLabel, historySteps } from "../src/model/historyLabel";
import { importDrawing } from "../src/model/importFile";
import { itemArea } from "../src/model/measure";
import { makeCircle, makeRect, makeShape, movedItem } from "../src/model/shapes";
import { useStore } from "../src/model/store";
import { tidyOutlines, tidyText } from "../src/model/tidy";
import type { Outline } from "../src/model/types";
import type { Pt } from "../src/geometry/segments";

const line = (from: Pt, to: Pt): Outline => ({ segments: [{ kind: "line", from, to }], closed: false });

describe("what each undo step did", () => {
  const base = newDocument();
  const rect = { ...makeRect("r", 0, 0, 10, 10), name: "Rectangle 1" };
  const one = { ...base, items: [rect] };
  it("names additions, moves, resizes, deletions and op changes", () => {
    expect(changeLabel(base, one)).toBe('Added "Rectangle 1"');
    expect(changeLabel(one, { ...one, items: [movedItem(rect, 5, 0)] })).toBe('Moved "Rectangle 1"');
    expect(changeLabel(one, { ...one, items: [{ ...rect, w: 20 }] })).toBe('Resized "Rectangle 1"');
    expect(changeLabel(one, { ...one, items: [{ ...rect, op: "engrave" }] })).toBe('Set "Rectangle 1" to be engraved');
    expect(changeLabel(one, { ...one, items: [{ ...rect, hidden: true }] })).toBe('Hid "Rectangle 1"');
    expect(changeLabel(one, base)).toBe('Deleted "Rectangle 1"');
    const c = makeCircle("c", 5, 5, 2);
    const two = { ...one, items: [rect, c] };
    expect(changeLabel(one, two)).toMatch(/^Added/);
    expect(changeLabel(two, { ...two, items: [c, rect] })).toBe("Changed the order");
    expect(changeLabel(two, { ...two, items: [movedItem(rect, 1, 1), movedItem(c, 1, 1)] })).toBe("Moved 2 shapes");
    expect(changeLabel(one, { ...one, bed: [400, 300] })).toBe("Bed size 400 × 300 mm");
    expect(changeLabel(base, newDocument())).toBe("Started a new design");
    expect(changeLabel(base, { ...one, name: "Sign" })).toBe('Opened "Sign"');
  });
  it("lists every step, oldest first, with where you are", () => {
    const steps = historySteps([base, one], { ...one, items: [movedItem(rect, 1, 0)] }, [base]);
    expect(steps.map((s) => s.offset)).toEqual([-2, -1, 0, 1]);
    expect(steps[1].label).toBe('Added "Rectangle 1"');
    expect(steps[2].label).toBe('Moved "Rectangle 1"');
  });
  it("jumps several steps back and forward at once", () => {
    const s = useStore.getState();
    s.newDocument();
    s.addItems([makeRect("a", 0, 0, 5, 5)]);
    s.addItems([makeRect("b", 10, 0, 5, 5)]);
    s.addItems([makeRect("c", 20, 0, 5, 5)]);
    useStore.getState().jumpHistory(-2);
    expect(useStore.getState().history.present.items.map((it) => it.id)).toEqual(["a"]);
    expect(useStore.getState().history.future.length).toBe(2);
    useStore.getState().jumpHistory(2);
    expect(useStore.getState().history.present.items.length).toBe(3);
    useStore.getState().jumpHistory(-1000);
    expect(useStore.getState().history.past.length).toBe(0);
  });
});

describe("tidying a drawing", () => {
  it("closes a square drawn as four loose lines with hairline gaps", () => {
    const sq = [line([0, 0], [10, 0]), line([10.1, 0.05], [10, 10]), line([10, 10], [0.05, 10]), line([0, 9.9], [0, 0.1])];
    const { outlines, report } = tidyOutlines(sq, 0.2);
    expect(outlines.length).toBe(1);
    expect(outlines[0].closed).toBe(true);
    expect(report.joins).toBe(3);
    expect(report.closedAfter).toBe(1);
    const area = itemArea(makeShape("s", "s", outlines));
    expect(Math.abs(area - 100)).toBeLessThan(2);
    expect(tidyText(report)).toMatch(/Closed 3 gaps — 1 more closed shape/);
  });
  it("leaves gaps bigger than asked", () => {
    const sq = [line([0, 0], [10, 0]), line([10.5, 0], [10, 10])];
    expect(tidyOutlines(sq, 0.2).report.joins).toBe(0);
    expect(tidyOutlines(sq, 1).report.joins).toBe(1);
  });
  it("takes out lines drawn twice and lines of no length", () => {
    const { outlines, report } = tidyOutlines([line([0, 0], [10, 0]), line([10, 0], [0, 0]), line([5, 5], [5, 5])], 0.2);
    expect(report.doubles).toBe(1);
    expect(report.tiny).toBe(1);
    expect(outlines.length).toBe(1);
  });
  it("joins the nearest ends first, not a run to itself when short", () => {
    // Two lines end to end with a small gap; each is a short dash that shouldn't close on itself.
    const { outlines } = tidyOutlines([line([0, 0], [0.3, 0]), line([0.35, 0], [0.6, 0])], 0.2);
    expect(outlines.length).toBe(1);
    expect(outlines[0].closed).toBe(false);
  });
  it("keeps closed shapes as they are", () => {
    const circle: Outline = { segments: [{ kind: "circle", center: [5, 5], radius: 3 }], closed: true };
    const { outlines, report } = tidyOutlines([circle], 0.2);
    expect(outlines).toEqual([circle]);
    expect(tidyText(report)).toBe("Nothing needed tidying.");
  });
  it("says so when an imported drawing would need it", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="20mm" viewBox="0 0 20 20"><path d="M0 0 H10 V10" fill="none" stroke="red"/><path d="M10.1 10 H0 V0.1" fill="none" stroke="red"/></svg>`;
    const r = importDrawing(svg, "box.svg", [], { bed: [600, 300] });
    expect(r.summary).toMatch(/nearly meet/);
    useStore.getState().newDocument();
    useStore.getState().addItems(r.items);
    useStore.getState().tidySelected(0.2);
    const it = useStore.getState().history.present.items[0];
    expect(it.kind === "shape" && it.outlines.length === 1 && it.outlines[0].closed).toBe(true);
  });
});
