/**
 * Import DXF: reads the drawing in a DXF file (lines, arcs, circles,
 * polylines, splines, ellipses) as outlines to cut, score or engrave. The
 * layer each shape is on decides what the laser does with it (SCORE and
 * ENGRAVE layers, as JuraCAD writes them; anything else is cut). Sizes follow
 * the file's units when it says, else they're taken as millimetres.
 *
 * The reader is shared with JuraCAD's Insert DXF.
 */
import { ellipseArcBeziers, type Pt, type Segment } from "./segments";
import type { Outline } from "../model/types";
import type { Op } from "../model/types";

export type DxfEntity =
  | { kind: "line"; a: Pt; b: Pt }
  | { kind: "circle"; c: Pt; r: number }
  /** Anticlockwise from a0 to a1 (degrees), as DXF has them. */
  | { kind: "arc"; c: Pt; r: number; a0: number; a1: number }
  /** Straight or bulged pieces between vertices (bulge = tan(¼ of the turn), + anticlockwise). */
  | { kind: "polyline"; points: { p: Pt; bulge: number }[]; closed: boolean }
  | { kind: "spline"; degree: number; control: Pt[]; knots: number[]; weights: number[]; fit: Pt[]; closed: boolean }
  /** Centre, the end of the long axis (relative to the centre), short ÷ long, and the part drawn (radians). */
  | { kind: "ellipse"; c: Pt; major: Pt; ratio: number; t0: number; t1: number }
  | { kind: "point"; p: Pt };

export interface DxfDrawing {
  entities: DxfEntity[];
  /** The layer each entity is on (same order as `entities`). */
  layers: string[];
  /** Millimetres per drawing unit, from the file's $INSUNITS (null when it doesn't say). */
  unitMm: number | null;
  /** The file's unit, in words (for the panel), or null. */
  unitName: string | null;
  /** Kinds of thing in the file that can't be brought in (TEXT, HATCH…), with how many of each. */
  skipped: Record<string, number>;
}

/** $INSUNITS codes JuraCUT understands: millimetres per unit, and the unit's name. */
const UNITS: Record<number, [number, string]> = {
  1: [25.4, "inches"],
  2: [304.8, "feet"],
  4: [1, "millimetres"],
  5: [10, "centimetres"],
  6: [1000, "metres"],
  8: [0.0254, "thousandths of an inch"],
  9: [0.0254 / 1000, "millionths of an inch"],
  10: [914.4, "yards"],
  13: [0.001, "microns"],
  14: [100, "decimetres"],
};

/** A problem with the file, in plain English (anything else thrown while reading one is a bug or a damaged file). */
export class DxfError extends Error {}

/** Files bigger than this (characters) aren't read: they'd freeze the page. */
export const MAX_DXF_SIZE = 20 * 1024 * 1024;
/** Nor drawings with more than this many shapes. */
export const MAX_DXF_ENTITIES = 20000;


/** Every number in an entity is a real, finite number (a broken file can hold "abc" or 1e999). */
function finite(e: DxfEntity): boolean {
  const nums: number[] = [];
  const add = (...v: number[]) => nums.push(...v);
  switch (e.kind) {
    case "line":
      add(...e.a, ...e.b);
      break;
    case "circle":
      add(...e.c, e.r);
      break;
    case "arc":
      add(...e.c, e.r, e.a0, e.a1);
      break;
    case "point":
      add(...e.p);
      break;
    case "polyline":
      for (const q of e.points) add(...q.p, q.bulge);
      break;
    case "spline":
      add(e.degree, ...e.control.flat(), ...e.knots, ...e.weights, ...e.fit.flat());
      break;
    case "ellipse":
      add(...e.c, ...e.major, e.ratio, e.t0, e.t1);
      break;
  }
  return nums.every(Number.isFinite);
}

/** Read a DXF file's text. Throws a plain-English error when it isn't a DXF drawing. */
export function parseDxf(text: string): DxfDrawing {
  if (text.length > MAX_DXF_SIZE) throw new DxfError("That DXF file is too big to bring in (over 20 MB). Open it in a drawing program and save just the part you need.");
  const lines = text.split(/\r\n|\r|\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isInteger(code)) throw new DxfError("That doesn't look like a DXF file (or it's a binary DXF, which can't be read). Save it as an ASCII DXF and try again.");
    pairs.push([code, lines[i + 1].trim()]);
  }
  if (!pairs.some(([c, v]) => c === 0 && v === "SECTION")) throw new DxfError("That doesn't look like a DXF file. Choose a .dxf drawing.");

  // Units, from the header.
  let unitMm: number | null = null;
  let unitName: string | null = null;
  const u = pairs.findIndex(([c, v]) => c === 9 && v === "$INSUNITS");
  if (u >= 0 && pairs[u + 1]?.[0] === 70) {
    const known = UNITS[Number(pairs[u + 1][1])];
    if (known) [unitMm, unitName] = known;
  }

  // The ENTITIES section.
  let start = -1;
  for (let i = 0; i + 1 < pairs.length; i++) if (pairs[i][0] === 0 && pairs[i][1] === "SECTION" && pairs[i + 1][0] === 2 && pairs[i + 1][1] === "ENTITIES") start = i + 2;
  const entities: DxfEntity[] = [];
  const layers: string[] = [];
  const skipped: Record<string, number> = {};
  if (start < 0) return { entities, layers, unitMm, unitName, skipped };

  // Split into entities: each starts with a 0 code.
  const items: { type: string; g: [number, string][] }[] = [];
  for (let i = start; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 0) {
      if (v === "ENDSEC") break;
      items.push({ type: v, g: [] });
    } else items[items.length - 1]?.g.push([c, v]);
  }

  /** A value by its code: the fallback when it's missing, NaN when it isn't a number (the entity is then left out). */
  const num = (g: [number, string][], code: number, fallback = 0) => {
    const f = g.find(([c]) => c === code);
    if (!f || f[1] === "") return fallback;
    const n = Number(f[1]);
    return Number.isFinite(n) ? n : NaN;
  };
  const all = (g: [number, string][], code: number) => g.filter(([c]) => c === code).map(([, v]) => Number(v));
  /** Points from paired x (code) and y (code + 10) values, in order. */
  const points = (g: [number, string][], xCode: number): Pt[] => {
    const out: Pt[] = [];
    let x: number | null = null;
    for (const [c, v] of g) {
      if (c === xCode) x = Number(v);
      else if (c === xCode + 10 && x !== null) {
        out.push([x, Number(v)]);
        x = null;
      }
    }
    return out;
  };

  for (let k = 0; k < items.length; k++) {
    const { type, g } = items[k];
    switch (type) {
      case "LINE":
        entities.push({ kind: "line", a: [num(g, 10), num(g, 20)], b: [num(g, 11), num(g, 21)] });
        break;
      case "CIRCLE":
        entities.push({ kind: "circle", c: [num(g, 10), num(g, 20)], r: num(g, 40) });
        break;
      case "ARC":
        entities.push({ kind: "arc", c: [num(g, 10), num(g, 20)], r: num(g, 40), a0: num(g, 50), a1: num(g, 51) });
        break;
      case "POINT":
        entities.push({ kind: "point", p: [num(g, 10), num(g, 20)] });
        break;
      case "LWPOLYLINE": {
        // Vertices in order; a bulge (42) belongs to the vertex before it.
        const pts: { p: Pt; bulge: number }[] = [];
        let x: number | null = null;
        for (const [c, v] of g) {
          if (c === 10) x = Number(v);
          else if (c === 20 && x !== null) {
            pts.push({ p: [x, Number(v)], bulge: 0 });
            x = null;
          } else if (c === 42 && pts.length) pts[pts.length - 1].bulge = Number(v) || 0;
        }
        entities.push({ kind: "polyline", points: pts, closed: (num(g, 70) & 1) === 1 });
        break;
      }
      case "POLYLINE": {
        // The old kind: VERTEX entities follow, up to SEQEND.
        const pts: { p: Pt; bulge: number }[] = [];
        while (items[k + 1]?.type === "VERTEX") {
          k++;
          const vg = items[k].g;
          // Vertices that are only spline frame points are left out.
          if (num(vg, 70) & 16) continue;
          pts.push({ p: [num(vg, 10), num(vg, 20)], bulge: num(vg, 42) });
        }
        if (items[k + 1]?.type === "SEQEND") k++;
        entities.push({ kind: "polyline", points: pts, closed: (num(g, 70) & 1) === 1 });
        break;
      }
      case "SPLINE":
        entities.push({
          kind: "spline",
          degree: num(g, 71, 3),
          control: points(g, 10),
          knots: all(g, 40),
          weights: all(g, 41),
          fit: points(g, 11),
          closed: (num(g, 70) & 1) === 1,
        });
        break;
      case "ELLIPSE":
        entities.push({ kind: "ellipse", c: [num(g, 10), num(g, 20)], major: [num(g, 11), num(g, 21)], ratio: num(g, 40, 1), t0: num(g, 41, 0), t1: num(g, 42, 2 * Math.PI) });
        break;
      case "SEQEND":
      case "VERTEX":
        break;
      default:
        skipped[type] = (skipped[type] ?? 0) + 1;
    }
    while (layers.length < entities.length) layers.push(g.find(([c]) => c === 8)?.[1] ?? "0");
    if (entities.length > MAX_DXF_ENTITIES)
      throw new DxfError(`That drawing has more than ${MAX_DXF_ENTITIES.toLocaleString("en")} shapes, too many to bring in. Open it in a drawing program and save just the part you need.`);
  }
  // Long polylines and splines count by their points.
  const pieces = entities.reduce((n, e) => n + (e.kind === "polyline" ? e.points.length : e.kind === "spline" ? e.control.length + e.fit.length : 1), 0);
  if (pieces > 2.5 * MAX_DXF_ENTITIES)
    throw new DxfError(`That drawing has more than ${(2.5 * MAX_DXF_ENTITIES).toLocaleString("en")} points and pieces, too many to bring in. Open it in a drawing program and save just the part you need.`);
  // Shapes with broken numbers in them are left out (and counted).
  const good: DxfEntity[] = [];
  const goodLayers: string[] = [];
  entities.forEach((e, i) => {
    if (finite(e)) {
      good.push(e);
      goodLayers.push(layers[i]);
    }
  });
  if (good.length < entities.length) skipped["shapes with unreadable numbers"] = entities.length - good.length;
  return { entities: good, layers: goodLayers, unitMm, unitName, skipped };
}

/** A point on a B-spline (de Boor), with weights for a rational one. */
function deBoor(degree: number, control: Pt[], knots: number[], weights: number[], t: number): Pt {
  const n = control.length;
  let k = degree;
  while (k < n - 1 && t >= knots[k + 1]) k++;
  const w = (i: number) => weights[i] ?? 1;
  const d = Array.from({ length: degree + 1 }, (_, j) => {
    const i = j + k - degree;
    return [control[i][0] * w(i), control[i][1] * w(i), w(i)];
  });
  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const i = j + k - degree;
      const den = knots[i + degree - r + 1] - knots[i];
      const a = den > 0 ? (t - knots[i]) / den : 0;
      d[j] = [0, 1, 2].map((q) => (1 - a) * d[j - 1][q] + a * d[j][q]);
    }
  }
  const [x, y, ww] = d[degree];
  return [x / ww, y / ww];
}

/** Points along a spline from its control points (when the file gives no points it passes through). */
export function sampleSpline(e: Extract<DxfEntity, { kind: "spline" }>): Pt[] {
  const { degree, control, knots, weights } = e;
  if (control.length < 2) return [...control];
  if (!Number.isInteger(degree) || degree < 1 || degree > 11 || knots.length !== control.length + degree + 1) return [...control];
  const t0 = knots[degree];
  const t1 = knots[control.length];
  const steps = Math.max(8, Math.min(200, control.length * 4));
  return Array.from({ length: steps + 1 }, (_, i) => deBoor(degree, control, knots, weights, i === steps ? t1 - 1e-12 * Math.max(1, Math.abs(t1)) : t0 + ((t1 - t0) * i) / steps));
}


/** Which layer names mean what (JuraCAD's export layers; anything else is cut). */
export function opForLayer(layer: string): Op {
  const l = layer.toUpperCase();
  if (l.includes("SCORE")) return "score";
  if (l.includes("ENGRAVE")) return "engrave";
  return "cut";
}

const TWO_PI = 2 * Math.PI;

/** An arc from a centre, radius and two angles (anticlockwise, radians) as a 3-point arc (or a circle for a whole turn). */
function arcSegment(c: Pt, r: number, a0: number, a1: number): Segment {
  let turn = ((a1 - a0) % TWO_PI + TWO_PI) % TWO_PI;
  if (turn < 1e-9) turn = TWO_PI;
  if (Math.abs(turn - TWO_PI) < 1e-9) return { kind: "circle", center: c, radius: r };
  const p = (t: number): Pt => [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)];
  return { kind: "arc", from: p(a0), mid: p(a0 + turn / 2), to: p(a0 + turn) };
}

/** A polyline's pieces: straight, or an arc where the vertex has a bulge (tan of a quarter of the turn, + anticlockwise). */
function polylineSegments(points: { p: Pt; bulge: number }[], closed: boolean): Segment[] {
  const out: Segment[] = [];
  const n = points.length;
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i].p;
    const b = points[(i + 1) % n].p;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) continue;
    const bulge = points[i].bulge;
    if (Math.abs(bulge) < 1e-9) {
      out.push({ kind: "line", from: a, to: b });
      continue;
    }
    // The arc's middle lies off the chord's middle by bulge × half the chord: on the right of the
    // way from a to b for a + bulge (the arc turns anticlockwise round its centre), the left for −.
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const half = Math.hypot(dx, dy) / 2;
    const s = bulge * half;
    const nx = dy / (2 * half), ny = -dx / (2 * half);
    out.push({ kind: "arc", from: a, mid: [mx + nx * s, my + ny * s], to: b });
  }
  return out;
}

function lines(pts: Pt[], closed: boolean): Segment[] {
  const out: Segment[] = [];
  const count = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < count; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9) out.push({ kind: "line", from: a, to: b });
  }
  return out;
}

export interface DxfImport {
  /** Each outline with what the laser should do with it. */
  outlines: { outline: Outline; op: Op }[];
  /** Millimetres per drawing unit used. */
  unitMm: number;
  skipped: Record<string, number>;
}

/**
 * The drawing as outlines in millimetres (× `scale` on top of the file's unit).
 * Loose lines and arcs that meet end to end are joined by the caller (sheet.ts chains cut pieces).
 */
export function dxfOutlines(drawing: DxfDrawing, scale = 1): DxfImport {
  const unitMm = drawing.unitMm ?? 1;
  const k = unitMm * scale;
  const S = (p: Pt): Pt => [p[0] * k, p[1] * k];
  const out: { outline: Outline; op: Op }[] = [];
  const add = (segments: Segment[], closed: boolean, i: number) => {
    if (segments.length) out.push({ outline: { segments, closed }, op: opForLayer(drawing.layers[i] ?? "0") });
  };
  drawing.entities.forEach((e, i) => {
    switch (e.kind) {
      case "line":
        add(lines([S(e.a), S(e.b)], false), false, i);
        break;
      case "circle":
        if (e.r > 0) add([{ kind: "circle", center: S(e.c), radius: e.r * k }], true, i);
        break;
      case "arc": {
        if (e.r <= 0) break;
        const s = arcSegment(S(e.c), e.r * k, (e.a0 * Math.PI) / 180, (e.a1 * Math.PI) / 180);
        add([s], s.kind === "circle", i);
        break;
      }
      case "polyline": {
        const pts = e.points.map((q) => ({ p: S(q.p), bulge: q.bulge }));
        const segs = polylineSegments(pts, e.closed);
        add(segs, e.closed && segs.length > 1, i);
        break;
      }
      case "spline": {
        const pts = sampleSpline(e).map(S);
        add(lines(pts, e.closed), e.closed, i);
        break;
      }
      case "ellipse": {
        const c = S(e.c);
        const major = S(e.major);
        const rx = Math.hypot(major[0] - 0, major[1] - 0);
        const ry = rx * e.ratio;
        if (rx <= 0 || ry <= 0) break;
        const angle = Math.atan2(major[1], major[0]);
        const whole = Math.abs(((e.t1 - e.t0) % TWO_PI + TWO_PI) % TWO_PI) < 1e-9;
        if (whole) {
          add([{ kind: "ellipse", center: c, rx, ry, angle }], true, i);
        } else {
          let t0 = e.t0, t1 = e.t1;
          while (t1 <= t0) t1 += TWO_PI;
          const at = (t: number): Pt => {
            const ca = Math.cos(angle), sa = Math.sin(angle);
            const x = rx * Math.cos(t), y = ry * Math.sin(t);
            return [c[0] + x * ca - y * sa, c[1] + x * sa + y * ca];
          };
          add(ellipseArcBeziers({ kind: "ellipseArc", center: c, rx, ry, angle, t0, t1, from: at(t0), to: at(t1) }), false, i);
        }
        break;
      }
      case "point":
        break;
    }
  });
  return { outlines: out, unitMm, skipped: drawing.skipped };
}
