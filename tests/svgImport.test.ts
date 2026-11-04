import { describe, expect, it } from "vitest";

import { pathPoints, pathsBox } from "../src/geometry/segments";
import { parsePathData, parseTransform, parseXml, svgOutlines } from "../src/geometry/svgImport";

const box = (r: ReturnType<typeof svgOutlines>) => pathsBox(r.outlines.map((o) => ({ layer: "outer" as const, ...o.outline })))!;

describe("parseXml", () => {
  it("reads nested elements, attributes and self-closing tags, skipping comments and doctypes", () => {
    const root = parseXml(`<?xml version="1.0"?><!DOCTYPE svg [ <!ENTITY x "y"> ]><!-- hi --><svg a='1' b="&lt;2&gt;"><g><rect x="3"/></g></svg>`);
    const svg = root.children[0];
    expect(svg.name).toBe("svg");
    expect(svg.attrs).toEqual({ a: "1", b: "<2>" });
    expect(svg.children[0].children[0].attrs.x).toBe("3");
  });
});

describe("parsePathData", () => {
  it("reads absolute and relative commands into closed runs", () => {
    const runs = parsePathData("M10 10 h20 v20 h-20 z m30 0 l5 5");
    expect(runs).toHaveLength(2);
    expect(runs[0].closed).toBe(true);
    expect(runs[0].segments).toHaveLength(4);
    expect(runs[1].closed).toBe(false);
    expect(runs[1].segments[0]).toEqual({ kind: "line", from: [40, 10], to: [45, 15] });
  });

  it("turns arcs into Bézier pieces that end where asked", () => {
    // Sweep 0 goes anticlockwise in SVG's y-down coordinates, so the arc bulges to +y (downwards on the page).
    const runs = parsePathData("M0 0 A10 10 0 0 0 20 0");
    const last = runs[0].segments[runs[0].segments.length - 1];
    expect(last.kind).toBe("bezier");
    if (last.kind === "bezier") expect(last.to).toEqual([20, 0]);
    // The middle of the arc is 10 mm above the chord.
    const pts = pathPoints(runs[0].segments, false, 0.01);
    expect(Math.max(...pts.map((p) => p[1]))).toBeCloseTo(10, 2);
  });
});

describe("parseTransform", () => {
  it("composes translate, scale and rotate", () => {
    const m = parseTransform("translate(10, 20) scale(2) rotate(90)");
    // (1, 0) → rotate → (0, 1) → scale → (0, 2) → translate → (10, 22)
    const x = m[0] * 1 + m[2] * 0 + m[4];
    const y = m[1] * 1 + m[3] * 0 + m[5];
    expect(x).toBeCloseTo(10, 9);
    expect(y).toBeCloseTo(22, 9);
  });
});

describe("svgOutlines", () => {
  it("brings a millimetre drawing in at true size, y up", () => {
    const r = svgOutlines(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><rect x="10" y="10" width="30" height="20"/></svg>`);
    expect(r.unitMm).toBe(1);
    expect(r.outlines).toHaveLength(1);
    const b = box(r);
    expect(b[2] - b[0]).toBeCloseTo(30, 9);
    expect(b[3] - b[1]).toBeCloseTo(20, 9);
    // Top of the drawing is y = 0, so the rectangle (10 down from the top) sits at y = -30…-10.
    expect(b[1]).toBeCloseTo(-30, 9);
  });

  it("takes pixels as 96 per inch when the file has no real-world size", () => {
    const r = svgOutlines(`<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="48"/></svg>`);
    const b = box(r);
    expect(b[2] - b[0]).toBeCloseTo(96 * (25.4 / 96), 6);
  });

  it("reads JuraCAD's laser layers back as cut, score and engrave", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="30mm" viewBox="0 0 40 30">
      <g id="engrave"><path d="M5 5 h5 v5 h-5 z" fill="#000000" stroke="none"/></g>
      <g id="score"><path d="M0 15 h40" fill="none" stroke="#00FF00"/></g>
      <g id="cut-inner"><circle cx="20" cy="15" r="3" fill="none" stroke="#0000FF"/></g>
      <g id="cut-outer"><path d="M0 0 h40 v30 h-40 z" fill="none" stroke="#FF0000"/></g>
    </svg>`;
    const r = svgOutlines(svg);
    expect(r.outlines.map((o) => o.op)).toEqual(["engrave", "score", "cut", "cut"]);
  });

  it("applies group transforms and skips hidden things, noting text", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
      <g transform="translate(50 0)"><rect x="0" y="0" width="10" height="10"/></g>
      <rect x="0" y="0" width="10" height="10" style="display:none"/>
      <defs><rect x="0" y="0" width="99" height="99"/></defs>
      <text x="1" y="1">hello</text>
    </svg>`;
    const r = svgOutlines(svg);
    expect(r.outlines).toHaveLength(1);
    expect(box(r)[0]).toBeCloseTo(50, 9);
    expect(r.skipped).toEqual({ text: 1 });
  });

  it("refuses things that aren't SVG drawings in plain words", () => {
    expect(() => svgOutlines("<html><body>no</body></html>")).toThrow(/doesn't look like an SVG/);
  });
});
