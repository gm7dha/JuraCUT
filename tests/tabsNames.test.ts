import { describe, expect, it } from "vitest";
import { laserPaths } from "../src/laser/sheet";
import { tabPlaces, withTabs } from "../src/laser/tabs";
import { parseDocument } from "../src/model/document";
import { itemOutlines, makeCircle, makeRect, makeText, itemBox, rotatedItem } from "../src/model/shapes";
import { namedCopies, namesFrom, numberNames } from "../src/model/names";
import { pathLength } from "../src/model/measure";
import type { Item } from "../src/model/types";

const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b) < tol, `${a} ≈ ${b}`).toBe(true);

describe("holding tabs", () => {
  it("leaves gaps of the tab's width, off the corners", () => {
    const square = itemOutlines(makeRect("r", 0, 0, 40, 40))[0].segments;
    const runs = withTabs(square, 4, 1)!;
    expect(runs.length).toBe(4);
    near(runs.reduce((s, r) => s + pathLength(r, false), 0), 160 - 4, 1e-6);
    const { gaps } = tabPlaces(square, 4, 1);
    for (const [a, b] of gaps) {
      const m = ((a + b) / 2) % 40;
      expect(m > 1 && m < 39).toBe(true);
    }
    // Too many for the loop: none.
    expect(withTabs(itemOutlines(makeCircle("c", 0, 0, 1))[0].segments, 5, 1)).toBe(null);
  });
  it("cuts a tabbed piece as open runs, in its place after its holes", () => {
    const plate: Item = { ...makeRect("p", 0, 0, 50, 30), tabs: 2, tabWidth: 1 };
    const hole = makeCircle("h", 25, 15, 5);
    const paths = laserPaths([plate, hole]);
    expect(paths[0].closed).toBe(true);
    expect(paths.slice(1).every((p) => !p.closed && p.layer === "outer")).toBe(true);
    expect(paths.length).toBe(3);
    // Kerf widens the gap by the kerf, so the bridge left is still a tab wide.
    const k = laserPaths([plate], 0.2);
    const total = k.reduce((s, p) => s + pathLength(p.segments, p.closed), 0);
    // Moved out by 0.1 with round corners: 160 + 0.2π, less two 1.2 mm gaps.
    near(total, 160 + 0.2 * Math.PI - 2 * 1.2, 0.05);
  });
  it("keeps tabs in files and when shapes become outlines", () => {
    const doc = parseDocument({ format: "juracut", items: [{ ...makeRect("p", 0, 0, 5, 5), tabs: 3, tabWidth: 0.8 }] });
    const p = doc!.items[0];
    expect(p.tabs === 3 && p.tabWidth === 0.8).toBe(true);
    const star: Item = { ...makeText("t", 0, 0, "A"), op: "cut", tabs: 2 };
    expect(rotatedItem({ ...star, kind: "shape", outlines: itemOutlines(star) } as Item, 10).tabs).toBe(2);
  });
});

describe("copies with different words", () => {
  it("reads lists and makes numbers", () => {
    expect(namesFrom(" Amy \n\nBen\r\n")).toEqual(["Amy", "Ben"]);
    expect(numberNames(1, 3)).toEqual(["1", "2", "3"]);
    expect(numberNames(3, 1)).toEqual(["3", "2", "1"]);
    expect(numberNames(7, 9, 1, 3)).toEqual(["007", "008", "009"]);
  });
  it("names the originals and each copy, shrinking long names", () => {
    const tag = makeRect("tag", 0, 0, 40, 15);
    const words = { ...makeText("w", 20, 5, "Table #", 6), align: "centre" as const };
    const { renamed, made } = namedCopies([tag, words], [tag, words], ["1", "Charlotte-Anne Smithson", "3"], 2, 5, true);
    expect(renamed.find((i) => i.id === "w")!.kind === "text" && (renamed.find((i) => i.id === "w") as { text: string }).text).toBe("Table 1");
    expect(made.length).toBe(4);
    const long = made.find((i) => i.kind === "text" && i.text.includes("Charlotte"))!;
    const wb = itemBox(long)!;
    const was = itemBox({ ...words, text: "Table #" })!;
    expect(wb[2] - wb[0] <= was[2] - was[0] + 1e-6).toBe(true);
    // Second copy across, third up a row.
    const third = made.filter((i) => i.kind === "rect")[1];
    expect(third.kind === "rect" && third.x === 0 && third.y === 20).toBe(true);
  });
});
