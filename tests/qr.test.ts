import { describe, expect, it } from "vitest";
import { signedArea } from "../src/geometry/boolean";
import { qrLoops, qrModules } from "../src/geometry/qr";
import { parseDocument } from "../src/model/document";
import { namedCopies } from "../src/model/names";
import { itemBox, makeQr, makeRect } from "../src/model/shapes";
import { canStretch, scaledItem } from "../src/model/resize";

describe("QR codes", () => {
  it("makes codes of the right size, with finder squares in three corners", () => {
    const m = qrModules("https://gm7dha.github.io/JuraCUT/", "M")!;
    expect(m.size).toBe(29); // version 3
    const at = (x: number, y: number) => m.dark[y * m.size + x];
    for (const [x, y] of [[0, 0], [m.size - 7, 0], [0, m.size - 7]]) {
      // The finder square's dark ring and middle, its light ring.
      expect(at(x, y) && at(x + 6, y + 6) && at(x + 3, y + 3)).toBe(1);
      expect(at(x + 1, y + 1)).toBe(0);
    }
    expect(at(m.size - 4, m.size - 4)).toBe(1); // the alignment square's middle (version 2 and up)
    expect(qrModules("", "M")).toBe(null);
    expect(qrModules("x".repeat(2000), "H")).toBe(null);
  });
  it("outlines cover exactly the dark squares, at the size asked", () => {
    const text = "Hello from JuraCUT";
    const m = qrModules(text, "Q")!;
    const darkCount = m.dark.reduce((a, b) => a + b, 0);
    const loops = qrLoops(text, "Q", 10, 20, 42);
    const cell = 42 / m.size;
    const area = Math.abs(loops.reduce((a, l) => a + signedArea(l), 0));
    expect(Math.abs(area - darkCount * cell * cell) < 1e-6).toBe(true);
    const b = itemBox(makeQr("q", 10, 20, text, 42))!;
    expect(Math.abs(b[0] - 10) < 1e-9 && Math.abs(b[3] - 62) < 1e-9).toBe(true);
  });
  it("is kept in files, resizes evenly only, and takes a name per copy", () => {
    const doc = parseDocument({ format: "juracut", items: [{ ...makeQr("q", 1, 2, "abc", 25), ecc: "H" }] });
    const q = doc!.items[0];
    expect(q.kind === "qr" && q.ecc === "H" && q.text === "abc" && q.size === 25).toBe(true);
    expect(canStretch([makeQr("q", 0, 0)])).toBe(false);
    const big = scaledItem(makeQr("q", 0, 0, "a", 20), 2, 2, [0, 0]);
    expect(big.kind === "qr" && big.size).toBe(40);
    const { made } = namedCopies([], [makeRect("r", 0, 0, 30, 30), makeQr("q", 2, 2, "https://x.org/#", 26)], ["7", "8"], 2, 5, false);
    expect(made.some((i) => i.kind === "qr" && i.text === "https://x.org/8")).toBe(true);
  });
});
