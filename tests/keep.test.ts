import { describe, expect, it } from "vitest";
import { fromKeptText, keepInBrowser, keptText, readKept, STORAGE_KEY } from "../src/model/keep";
import { newDocument, parseDocument, serializeDocument } from "../src/model/document";
import { makePicture, makeRect } from "../src/model/shapes";
import type { Item } from "../src/model/types";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const big = "data:image/png;base64," + "A".repeat(200000);
const clip = [{ closed: true, segments: [{ kind: "line" as const, from: [0, 0] as [number, number], to: [10, 0] as [number, number] }, { kind: "line" as const, from: [10, 0] as [number, number], to: [0, 10] as [number, number] }, { kind: "line" as const, from: [0, 10] as [number, number], to: [0, 0] as [number, number] }] }];

describe("keeping the design in the browser", () => {
  it("writes a picture and a clip shared by many shapes once, and reads them back the same", () => {
    const items: Item[] = [makeRect("r", 1, 2, 3, 4), ...Array.from({ length: 8 }, (_, k) => ({ ...makePicture(`p${k}`, `Pass ${k}`, big, 50, 50, 100, 100), mode: "black" as const, brightness: k * 10, clip }))];
    const doc = { ...newDocument(), items };
    const text = keptText(doc);
    expect(text.length).toBeLessThan(big.length * 1.1);
    const back = parseDocument(fromKeptText(text));
    expect(back).toEqual(parseDocument(JSON.parse(serializeDocument(doc))));
    const s = memory();
    expect(keepInBrowser(s, doc)).toBe(true);
    expect(readKept(s)?.items.length).toBe(9);
  });
  it("still reads copies kept by older versions, and keeps designs without pictures as plain JSON", () => {
    const doc = { ...newDocument(), items: [makeRect("r", 1, 2, 3, 4)] };
    const s = memory();
    s.setItem(STORAGE_KEY, serializeDocument(doc));
    expect(readKept(s)?.items[0].id).toBe("r");
    expect(JSON.parse(keptText(doc)).items[0].id).toBe("r");
  });
});
