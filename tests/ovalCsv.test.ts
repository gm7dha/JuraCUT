import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/model/document";
import { csvCells, entriesFrom, filledWords, namedCopies } from "../src/model/names";
import { itemArea } from "../src/model/measure";
import { scaledItem } from "../src/model/resize";
import { itemBox, makeEllipse, makeText, mirroredItem, rotatedItem } from "../src/model/shapes";
import type { TextItem } from "../src/model/types";

describe("ovals", () => {
  it("has the area and box it should, turns, flips and stretches square to the bed", () => {
    const o = makeEllipse("e", 50, 50, 20, 10);
    expect(Math.abs(itemArea(o) - Math.PI * 200) < 0.5).toBe(true);
    const b = itemBox(o)!;
    expect(Math.abs(b[2] - b[0] - 40) < 1e-6 && Math.abs(b[3] - b[1] - 20) < 1e-6).toBe(true);
    const t = rotatedItem(o, 90);
    expect(t.kind === "ellipse" && t.angle === 90).toBe(true);
    const tb = itemBox(t)!;
    expect(Math.abs(tb[3] - tb[1] - 40) < 1e-6).toBe(true);
    expect(mirroredItem({ ...o, angle: 30 }).kind).toBe("ellipse");
    const wide = scaledItem(t, 2, 1, [50, 50]);
    expect(wide.kind === "ellipse" && wide.ry === 20 && wide.rx === 20).toBe(true); // sideways: across is its height
    expect(scaledItem({ ...o, angle: 30 }, 2, 1, [0, 0]).kind).toBe("shape");
    const doc = parseDocument({ format: "juracut", items: [o] });
    expect(doc!.items[0].kind).toBe("ellipse");
  });
});

describe("names from a spreadsheet", () => {
  it("reads quoted cells, other separators and headings", () => {
    expect(csvCells('Amy,"Smith, Jr",3', ",")).toEqual(["Amy", "Smith, Jr", "3"]);
    expect(csvCells('"Say ""hi""";x', ";")).toEqual(['Say "hi"', "x"]);
    const { entries, headings } = entriesFrom("Name,Table\nAmy,3\nBen,5\n");
    expect(headings).toEqual(["Name", "Table"]);
    expect(entries[1]).toEqual({ name: "Ben", fields: { name: "Ben", table: "5" } });
    // Without {Heading} places, commas are just part of the names.
    expect(entriesFrom("Smith, John\nJones, Ann", false).entries.map((e) => e.name)).toEqual(["Smith, John", "Jones, Ann"]);
  });
  it("fills {Heading} places, # and plain words", () => {
    const e = { name: "Amy", fields: { name: "Amy", table: "3" } };
    expect(filledWords("{Name} — table {table}", e)).toBe("Amy — table 3");
    expect(filledWords("Table #", e)).toBe("Table Amy");
    expect(filledWords("Guest", e)).toBe("Amy");
    expect(filledWords("{Unknown} #", e)).toBe("{Unknown} Amy");
    const { renamed, made } = namedCopies([], [makeText("t", 0, 0, "{Name} · {Table}", 5)], entriesFrom("Name,Table\nAmy,3\nBen,5").entries, 2, 5, false);
    expect((renamed[0] as TextItem).text).toBe("Amy · 3");
    expect((made[0] as TextItem).text).toBe("Ben · 5");
  });
});
