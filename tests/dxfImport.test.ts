import { describe, expect, it } from "vitest";

import { dxfOutlines, parseDxf } from "../src/geometry/dxfImport";
import { pathPoints, pathsBox } from "../src/geometry/segments";
import { laserDxf } from "../src/laser/files";
import { makeSheet } from "../src/laser/sheet";
import { newDocument } from "../src/model/document";
import { makeCircle, makeLine, makeRect } from "../src/model/shapes";

/** A small ASCII DXF: a line, a circle, an arc and a closed polyline with a bulge, on two layers, in inches. */
const DXF = [
  "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "1", "0", "ENDSEC",
  "0", "SECTION", "2", "ENTITIES",
  "0", "LINE", "8", "SCORE", "10", "0", "20", "0", "11", "1", "21", "0",
  "0", "CIRCLE", "8", "0", "10", "2", "20", "2", "40", "0.5",
  "0", "ARC", "8", "0", "10", "4", "20", "0", "40", "1", "50", "0", "51", "90",
  "0", "LWPOLYLINE", "8", "CUT_OUTER", "70", "1", "10", "0", "20", "3", "10", "1", "20", "3", "42", "1", "10", "1", "20", "4", "10", "0", "20", "4",
  "0", "TEXT", "8", "0", "1", "hi",
  "0", "ENDSEC", "0", "EOF", "",
].join("\n");

describe("DXF import", () => {
  it("reads shapes with their layers and units", () => {
    const d = parseDxf(DXF);
    expect(d.unitName).toBe("inches");
    expect(d.entities.map((e) => e.kind)).toEqual(["line", "circle", "arc", "polyline"]);
    expect(d.layers).toEqual(["SCORE", "0", "0", "CUT_OUTER"]);
    expect(d.skipped).toEqual({ TEXT: 1 });
    const r = dxfOutlines(d);
    expect(r.outlines.map((o) => o.op)).toEqual(["score", "cut", "cut", "cut"]);
    // Inches → mm.
    const circle = r.outlines[1].outline.segments[0];
    expect(circle.kind === "circle" && circle.radius).toBeCloseTo(12.7, 9);
    // The bulge of 1 is a half circle bulging to the right of the polyline's second side.
    const poly = r.outlines[3].outline;
    expect(poly.closed).toBe(true);
    const b = pathsBox([{ layer: "outer", ...poly }])!;
    expect(b[2]).toBeCloseTo(25.4 * 1.5, 6);
  });

  it("turns a whole-turn arc into a circle", () => {
    const d = parseDxf(["0", "SECTION", "2", "ENTITIES", "0", "ARC", "8", "0", "10", "0", "20", "0", "40", "5", "50", "0", "51", "360", "0", "ENDSEC", "0", "EOF", ""].join("\n"));
    const r = dxfOutlines(d);
    expect(r.outlines[0].outline.segments[0].kind).toBe("circle");
  });

  it("reads back the DXF JuraCUT writes", () => {
    const doc = newDocument();
    doc.items = [makeRect("a", 0, 0, 40, 30), makeCircle("b", 20, 15, 5), { ...makeLine("c", 0, 15, 40, 15), op: "score" }];
    const text = laserDxf(makeSheet(doc));
    const back = dxfOutlines(parseDxf(text));
    expect(back.outlines.map((o) => o.op).sort()).toEqual(["cut", "cut", "score"]);
    const rect = back.outlines.find((o) => o.outline.segments.length === 4)!;
    const pts = pathPoints(rect.outline.segments, true);
    expect(pathsBox([{ layer: "outer", ...rect.outline }])).toEqual([0, 0, 40, 30]);
    expect(pts.length).toBe(4);
  });

  it("refuses something that isn't a DXF in plain words", () => {
    expect(() => parseDxf("hello\nworld")).toThrow(/doesn't look like a DXF/);
  });
});
