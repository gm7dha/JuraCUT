import { describe, expect, it } from "vitest";

import { adjustGreys, darkness, ditherFloydSteinberg, pngDotsPerMm, processPhoto, withPngDpi } from "../src/geometry/photo";
import { laserSvg } from "../src/laser/files";
import { laserPaths, makeSheet } from "../src/laser/sheet";
import { newDocument, parseDocument, serializeDocument } from "../src/model/document";
import { itemBox, makePicture, makeRect, mirroredItem, rotatedItem, transformedItem, mirrorX, pictureSize } from "../src/model/shapes";
import type { PictureItem } from "../src/model/types";

const SRC = "data:image/png;base64,iVBORw0KGgo=";

describe("photo engraving", () => {
  it("dithers a mid grey to about half dots", () => {
    const grey = new Uint8Array(100 * 100).fill(128);
    const out = ditherFloydSteinberg(grey, 100, 100);
    expect(out.every((v) => v === 0 || v === 255)).toBe(true);
    expect(darkness(out)).toBeGreaterThan(0.45);
    expect(darkness(out)).toBeLessThan(0.55);
  });

  it("brightens, adds contrast and inverts", () => {
    expect([...adjustGreys(new Uint8Array([100]), { brightness: 50, contrast: 0, invert: false })]).toEqual([164]);
    const c = adjustGreys(new Uint8Array([100, 156]), { brightness: 0, contrast: 50, invert: false });
    expect(c[0]).toBeLessThan(100);
    expect(c[1]).toBeGreaterThan(156);
    expect([...adjustGreys(new Uint8Array([0]), { brightness: 0, contrast: 0, invert: true })]).toEqual([255]);
    expect([...processPhoto(new Uint8Array([10, 200]), 2, 1, { mode: "black", brightness: 0, contrast: 0, invert: false })]).toEqual([0, 255]);
  });

  it("writes a PNG's size in dots per mm", () => {
    // The smallest valid-looking PNG: signature + IHDR + IEND.
    const ihdr = [0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0, 0, 0, 0, 0];
    const iend = [0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0];
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...ihdr, ...iend]);
    const out = withPngDpi(png, 10);
    expect(pngDotsPerMm(out)).toBe(10);
    expect(pngDotsPerMm(withPngDpi(out, 5))).toBe(5);
    expect(withPngDpi(new Uint8Array([1, 2, 3]), 10)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("turns and flips a picture by quarter turns, keeping it a picture", () => {
    const p = makePicture("p", "Photo", SRC, 50, 50, 40, 20);
    const t = rotatedItem(p, 90) as PictureItem;
    expect(t.turns).toBe(1);
    expect(pictureSize(t)).toEqual([20, 40]);
    expect(itemBox(t)).toEqual([40, 30, 60, 70]);
    const f = mirroredItem(t) as PictureItem;
    expect(f.flip).toBe(true);
    // Turning a flipped picture goes the other way inside it.
    expect((rotatedItem(f, 90) as PictureItem).turns).toBe(0);
    const moved = transformedItem(p, mirrorX(0)) as PictureItem;
    expect(moved.kind).toBe("picture");
    expect([moved.cx, moved.flip]).toEqual([-50, true]);
    expect(rotatedItem(p, 45)).toBe(p);
  });

  it("is saved, read back, kept out of the cut lines and placed on the sheet", () => {
    const doc = newDocument();
    doc.items = [makeRect("r", 0, 0, 100, 60), makePicture("p", "Photo", SRC, 50, 30, 40, 20)];
    expect(parseDocument(JSON.parse(serializeDocument(doc)))).toEqual(doc);
    expect(parseDocument({ format: "juracut", items: [{ ...doc.items[1], src: "javascript:alert(1)" }] })!.items).toEqual([]);
    expect(laserPaths(doc.items)).toHaveLength(1);
    const sheet = makeSheet(doc, { mirror: true });
    expect(sheet.pictures[0].box).toEqual([30, 20, 70, 40]);
    expect(sheet.pictures[0].mirrored).toBe(true);
    const svg = laserSvg(sheet, { images: [{ box: sheet.pictures[0].box, href: SRC }] });
    expect(svg).toContain('<image x="30" y="20" width="40" height="20"');
  });
});
