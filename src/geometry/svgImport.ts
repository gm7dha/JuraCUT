/**
 * Import SVG: reads the shapes in an SVG drawing (paths, rectangles, circles,
 * ellipses, lines, polylines and polygons, inside any groups and transforms)
 * as outlines in millimetres, y up. Curves are kept as cubic Bézier pieces
 * (arcs and quadratics are turned into them exactly), so nothing is lost.
 *
 * What the laser should do with each shape comes from its colours, as laser
 * programs and JuraCAD's files have it: a filled shape with no stroke is
 * engraved, a green stroke is scored, anything else is cut.
 *
 * Pure: a small XML reader of its own, so it runs in tests without a browser.
 */
import type { Op, Outline } from "../model/types";
import type { Pt, Segment } from "./segments";

export class SvgError extends Error {}

/** Files bigger than this (characters) aren't read: they'd freeze the page. */
export const MAX_SVG_SIZE = 20 * 1024 * 1024;
export const MAX_SVG_SHAPES = 20000;

// ---------------------------------------------------------------------------
// A small XML reader.

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** The element tree of an XML document (text is ignored; namespaces are kept as plain prefixes). */
export function parseXml(text: string): XmlElement {
  const root: XmlElement = { name: "", attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf("<", i);
    if (lt < 0) break;
    i = lt + 1;
    if (text.startsWith("!--", i)) {
      const end = text.indexOf("-->", i);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (text.startsWith("![CDATA[", i)) {
      const end = text.indexOf("]]>", i);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (text[i] === "!" || text[i] === "?") {
      // <!DOCTYPE …> (may hold [ … ] with its own < >) and <?xml …?>.
      let depth = 0;
      while (i < n) {
        const c = text[i++];
        if (c === "[") depth++;
        else if (c === "]") depth--;
        else if (c === ">" && depth <= 0) break;
      }
      continue;
    }
    if (text[i] === "/") {
      const end = text.indexOf(">", i);
      i = end < 0 ? n : end + 1;
      if (stack.length > 1) stack.pop();
      continue;
    }
    // A start tag: name, attributes, maybe self-closing.
    let j = i;
    while (j < n && !/[\s/>]/.test(text[j])) j++;
    const name = text.slice(i, j);
    const el: XmlElement = { name, attrs: {}, children: [] };
    i = j;
    let selfClosing = false;
    for (;;) {
      while (i < n && /\s/.test(text[i])) i++;
      if (i >= n) break;
      if (text[i] === ">") {
        i++;
        break;
      }
      if (text[i] === "/") {
        selfClosing = true;
        i++;
        continue;
      }
      let k = i;
      while (k < n && !/[\s=/>]/.test(text[k])) k++;
      const attr = text.slice(i, k);
      i = k;
      while (i < n && /\s/.test(text[i])) i++;
      let value = "";
      if (text[i] === "=") {
        i++;
        while (i < n && /\s/.test(text[i])) i++;
        const q = text[i];
        if (q === '"' || q === "'") {
          const end = text.indexOf(q, i + 1);
          value = text.slice(i + 1, end < 0 ? n : end);
          i = end < 0 ? n : end + 1;
        } else {
          let e = i;
          while (e < n && !/[\s>]/.test(text[e])) e++;
          value = text.slice(i, e);
          i = e;
        }
      }
      if (attr) el.attrs[attr] = decode(value);
    }
    stack[stack.length - 1].children.push(el);
    if (!selfClosing) stack.push(el);
  }
  return root;
}

// ---------------------------------------------------------------------------
// Transforms and lengths.

/** x' = a·x + c·y + e, y' = b·x + d·y + f. */
type M = [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (m2: M, m1: M): M => [
  m2[0] * m1[0] + m2[2] * m1[1],
  m2[1] * m1[0] + m2[3] * m1[1],
  m2[0] * m1[2] + m2[2] * m1[3],
  m2[1] * m1[2] + m2[3] * m1[3],
  m2[0] * m1[4] + m2[2] * m1[5] + m2[4],
  m2[1] * m1[4] + m2[3] * m1[5] + m2[5],
];
const ap = (m: M, p: Pt): Pt => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

/** An SVG transform attribute as a matrix (unknown parts ignored). */
export function parseTransform(s: string | undefined): M {
  let m = I;
  if (!s) return m;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let r: RegExpExecArray | null;
  while ((r = re.exec(s))) {
    const a = r[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (a.some((v) => !Number.isFinite(v))) continue;
    let t: M | null = null;
    switch (r[1]) {
      case "matrix":
        if (a.length === 6) t = [a[0], a[1], a[2], a[3], a[4], a[5]];
        break;
      case "translate":
        t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case "scale":
        t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case "rotate": {
        const ang = ((a[0] ?? 0) * Math.PI) / 180;
        const c = Math.cos(ang), sn = Math.sin(ang);
        const rot: M = [c, sn, -sn, c, 0, 0];
        if (a.length >= 3) t = mul(mul([1, 0, 0, 1, a[1], a[2]], rot), [1, 0, 0, 1, -a[1], -a[2]]);
        else t = rot;
        break;
      }
      case "skewX":
        t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case "skewY":
        t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    if (t) m = mul(m, t);
  }
  return m;
}

/** Millimetres per CSS unit. */
const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, "": 25.4 / 96 };

/** A length attribute in mm (null when missing or a percentage). */
function lengthMm(v: string | undefined): number | null {
  if (!v) return null;
  const r = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(v);
  if (!r) return null;
  const unit = r[2].toLowerCase();
  if (unit === "%") return null;
  const k = UNIT_MM[unit];
  return k === undefined ? null : Number(r[1]) * k;
}

const numAttr = (v: string | undefined, fallback = 0): number => {
  if (v === undefined) return fallback;
  const r = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/i.exec(v);
  const n = r ? Number(r[1]) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

// ---------------------------------------------------------------------------
// Path data.

/** SVG path data as pieces in the path's own coordinates: lines and cubic Béziers, in runs (one per subpath). */
export function parsePathData(d: string): { segments: Segment[]; closed: boolean }[] {
  const runs: { segments: Segment[]; closed: boolean }[] = [];
  const tokens = d.match(/[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = "";
  let at: Pt = [0, 0];
  let start: Pt = [0, 0];
  let lastC: Pt | null = null; // the last cubic control point (for S)
  let lastQ: Pt | null = null; // the last quadratic control point (for T)
  let cur: Segment[] = [];
  const num = () => {
    const t = tokens[i++];
    const n = Number(t);
    if (!Number.isFinite(n)) throw new SvgError("That SVG file has a drawing command that can't be read.");
    return n;
  };
  const more = () => i < tokens.length && !/[a-zA-Z]/.test(tokens[i]);
  const flush = (closed: boolean) => {
    if (cur.length) runs.push({ segments: cur, closed });
    cur = [];
  };
  const line = (to: Pt) => {
    if (Math.hypot(to[0] - at[0], to[1] - at[1]) > 1e-12) cur.push({ kind: "line", from: at, to });
    at = to;
  };
  const cubic = (c1: Pt, c2: Pt, to: Pt) => {
    cur.push({ kind: "bezier", from: at, c1, c2, to });
    at = to;
  };
  const quad = (c: Pt, to: Pt) => {
    cubic([at[0] + (2 / 3) * (c[0] - at[0]), at[1] + (2 / 3) * (c[1] - at[1])], [to[0] + (2 / 3) * (c[0] - to[0]), to[1] + (2 / 3) * (c[1] - to[1])], to);
  };
  let guard = 0;
  while (i < tokens.length) {
    if (++guard > 1_000_000) throw new SvgError("That SVG file is too complicated to read.");
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) throw new SvgError("That SVG file's drawing doesn't start with a move.");
    const rel = cmd === cmd.toLowerCase();
    const P = (): Pt => {
      const x = num(), y = num();
      return rel ? [at[0] + x, at[1] + y] : [x, y];
    };
    const C = cmd.toUpperCase();
    let hadC = false, hadQ = false;
    switch (C) {
      case "M": {
        flush(false);
        at = P();
        start = at;
        // Further pairs are lines.
        while (more()) line(P());
        break;
      }
      case "Z":
        if (cur.length && Math.hypot(at[0] - start[0], at[1] - start[1]) > 1e-9) line(start);
        at = start;
        flush(true);
        break;
      case "L":
        do line(P());
        while (more());
        break;
      case "H":
        do {
          const x = num();
          line([rel ? at[0] + x : x, at[1]]);
        } while (more());
        break;
      case "V":
        do {
          const y = num();
          line([at[0], rel ? at[1] + y : y]);
        } while (more());
        break;
      case "C":
        do {
          const c1 = P(), c2 = P(), to = P();
          cubic(c1, c2, to);
          lastC = c2;
        } while (more());
        hadC = true;
        break;
      case "S":
        do {
          const c1: Pt = lastC ? [2 * at[0] - lastC[0], 2 * at[1] - lastC[1]] : at;
          const c2 = P(), to = P();
          cubic(c1, c2, to);
          lastC = c2;
        } while (more());
        hadC = true;
        break;
      case "Q":
        do {
          const c = P(), to = P();
          quad(c, to);
          lastQ = c;
        } while (more());
        hadQ = true;
        break;
      case "T":
        do {
          const c: Pt = lastQ ? [2 * at[0] - lastQ[0], 2 * at[1] - lastQ[1]] : at;
          const to = P();
          quad(c, to);
          lastQ = c;
        } while (more());
        hadQ = true;
        break;
      case "A":
        do {
          const rx = num(), ry = num(), rot = num(), large = num(), sweep = num();
          const to = P();
          for (const b of arcToBeziers(at, rx, ry, rot, !!large, !!sweep, to)) cubic(b[0], b[1], b[2]);
        } while (more());
        break;
      default:
        throw new SvgError(`That SVG file uses a drawing command ("${cmd}") JuraCUT doesn't know.`);
    }
    if (!hadC) lastC = null;
    if (!hadQ) lastQ = null;
  }
  flush(false);
  return runs;
}

/** An SVG elliptical arc as cubic Bézier pieces [c1, c2, to] (the standard centre conversion). */
export function arcToBeziers(from: Pt, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, to: Pt): [Pt, Pt, Pt][] {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx < 1e-12 || ry < 1e-12 || (from[0] === to[0] && from[1] === to[1])) return [[from, to, to]];
  const phi = (rotDeg * Math.PI) / 180;
  const cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (from[0] - to[0]) / 2, dy = (from[1] - to[1]) / 2;
  const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const sign = large === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = sign * Math.sqrt(Math.max(0, num / den));
  const cx1 = (k * rx * y1) / ry, cy1 = (-k * ry * x1) / rx;
  const cx = cp * cx1 - sp * cy1 + (from[0] + to[0]) / 2;
  const cy = sp * cx1 + cp * cy1 + (from[1] + to[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t0 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const out: [Pt, Pt, Pt][] = [];
  const pt = (t: number): Pt => [cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp];
  const tan = (t: number): Pt => [-rx * Math.sin(t) * cp - ry * Math.cos(t) * sp, -rx * Math.sin(t) * sp + ry * Math.cos(t) * cp];
  for (let j = 0; j < n; j++) {
    const a = t0 + (dt * j) / n, b = t0 + (dt * (j + 1)) / n;
    const kk = (4 / 3) * Math.tan((b - a) / 4);
    const p0 = j === 0 ? from : pt(a);
    const p3 = j === n - 1 ? to : pt(b);
    const d0 = tan(a), d1 = tan(b);
    out.push([[p0[0] + kk * d0[0], p0[1] + kk * d0[1]], [p3[0] - kk * d1[0], p3[1] - kk * d1[1]], p3]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shapes to outlines.

/** A circle or ellipse as four Bézier quarters (exact under any transform). */
function ellipseBeziers(cx: number, cy: number, rx: number, ry: number): Segment[] {
  const k = 0.5522847498307936;
  const p = (a: number, b: number): Pt => [cx + a * rx, cy + b * ry];
  return [
    { kind: "bezier", from: p(1, 0), c1: p(1, k), c2: p(k, 1), to: p(0, 1) },
    { kind: "bezier", from: p(0, 1), c1: p(-k, 1), c2: p(-1, k), to: p(-1, 0) },
    { kind: "bezier", from: p(-1, 0), c1: p(-1, -k), c2: p(-k, -1), to: p(0, -1) },
    { kind: "bezier", from: p(0, -1), c1: p(k, -1), c2: p(1, -k), to: p(1, 0) },
  ];
}

function rectSegments(x: number, y: number, w: number, h: number, rx: number, ry: number): Segment[] {
  rx = Math.min(Math.max(rx, 0), w / 2);
  ry = Math.min(Math.max(ry, 0), h / 2);
  const L = (a: Pt, b: Pt): Segment[] => (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-12 ? [{ kind: "line", from: a, to: b }] : []);
  if (rx < 1e-12 || ry < 1e-12) {
    return [...L([x, y], [x + w, y]), ...L([x + w, y], [x + w, y + h]), ...L([x + w, y + h], [x, y + h]), ...L([x, y + h], [x, y])];
  }
  // Each corner as a quarter ellipse.
  const corner = (cx: number, cy: number, a0: number): Segment => {
    const a1 = a0 + Math.PI / 2;
    const p = (t: number): Pt => [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
    const d = (t: number): Pt => [-rx * Math.sin(t), ry * Math.cos(t)];
    const kk = (4 / 3) * Math.tan(Math.PI / 8);
    const p0 = p(a0), p3 = p(a1), d0 = d(a0), d1 = d(a1);
    return { kind: "bezier", from: p0, c1: [p0[0] + kk * d0[0], p0[1] + kk * d0[1]], c2: [p3[0] - kk * d1[0], p3[1] - kk * d1[1]], to: p3 };
  };
  return [
    ...L([x + rx, y], [x + w - rx, y]),
    corner(x + w - rx, y + ry, -Math.PI / 2),
    ...L([x + w, y + ry], [x + w, y + h - ry]),
    corner(x + w - rx, y + h - ry, 0),
    ...L([x + w - rx, y + h], [x + rx, y + h]),
    corner(x + rx, y + h - ry, Math.PI / 2),
    ...L([x, y + h - ry], [x, y + ry]),
    corner(x + rx, y + ry, Math.PI),
  ];
}

function moveSeg(s: Segment, m: M): Segment {
  switch (s.kind) {
    case "line":
      return { kind: "line", from: ap(m, s.from), to: ap(m, s.to) };
    case "bezier":
      return { kind: "bezier", from: ap(m, s.from), c1: ap(m, s.c1), c2: ap(m, s.c2), to: ap(m, s.to) };
    default:
      return s; // (never made here)
  }
}

interface Style {
  fill: string | null;
  stroke: string | null;
  hidden: boolean;
}

/** Fill, stroke and visibility, from attributes and the style attribute, over the parent's. */
function styleOf(el: XmlElement, parent: Style): Style {
  const s: Style = { ...parent };
  const css: Record<string, string> = {};
  for (const part of (el.attrs.style ?? "").split(";")) {
    const k = part.indexOf(":");
    if (k > 0) css[part.slice(0, k).trim().toLowerCase()] = part.slice(k + 1).trim();
  }
  const get = (name: string) => css[name] ?? el.attrs[name];
  const fill = get("fill");
  const stroke = get("stroke");
  if (fill !== undefined) s.fill = fill.trim().toLowerCase();
  if (stroke !== undefined) s.stroke = stroke.trim().toLowerCase();
  if (get("display")?.trim() === "none" || get("visibility")?.trim() === "hidden") s.hidden = true;
  return s;
}

const isNone = (v: string | null) => v === null || v === "none" || v === "transparent";

/** The colour as [r, g, b] (0–255), or null for none/unknown. */
export function parseColour(v: string | null): [number, number, number] | null {
  if (isNone(v)) return null;
  const s = v!;
  const hex = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    if (h.length === 6 || h.length === 8) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)/i.exec(s);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map((c) => (c.endsWith("%") ? (Number(c.slice(0, -1)) * 255) / 100 : Number(c))) as [number, number, number];
  const NAMES: Record<string, [number, number, number]> = { black: [0, 0, 0], red: [255, 0, 0], blue: [0, 0, 255], green: [0, 128, 0], lime: [0, 255, 0], white: [255, 255, 255] };
  return NAMES[s] ?? [0, 0, 0];
}

/** What the laser should do, from the colours: filled only = engrave; green stroke = score; else cut. */
export function opForStyle(style: Style, explicit: boolean): Op {
  const stroke = parseColour(style.stroke);
  const fill = parseColour(style.fill);
  if (stroke) {
    const [r, g, b] = stroke;
    if (g > 128 && r < 128 && b < 128) return "score";
    return "cut";
  }
  // No stroke. An explicitly filled shape is engraved; a shape with no colours at all is cut.
  if (fill && explicit) return "engrave";
  return "cut";
}

export interface SvgImport {
  outlines: { outline: Outline; op: Op }[];
  /** Kinds of thing that were skipped (text, images…), with how many of each. */
  skipped: Record<string, number>;
  /** Millimetres per user unit used. */
  unitMm: number;
}

const SKIP = new Set(["defs", "clipPath", "mask", "symbol", "marker", "pattern", "metadata", "title", "desc", "style", "script", "linearGradient", "radialGradient", "filter"]);
const NOTED = new Set(["text", "image", "use", "foreignObject"]);

/** Read an SVG file's text as outlines in millimetres, y up (the drawing's top-left corner is near (0, 0) with y going down from it, so y is negative: the caller places it). */
export function svgOutlines(text: string): SvgImport {
  if (text.length > MAX_SVG_SIZE) throw new SvgError("That SVG file is too big to bring in (over 20 MB). Open it in a drawing program and save just the part you need.");
  const root = parseXml(text);
  const svg = root.children.find((c) => c.name === "svg" || c.name.endsWith(":svg"));
  if (!svg) throw new SvgError("That doesn't look like an SVG drawing. Choose a .svg file.");
  // Scale: with a viewBox and a real-world width, user units are viewBox units; else user units are px (96 per inch).
  const vb = (svg.attrs.viewBox ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
  const wMm = lengthMm(svg.attrs.width);
  const hMm = lengthMm(svg.attrs.height);
  let unitMm = UNIT_MM.px;
  if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) {
    if (wMm) unitMm = wMm / vb[2];
    else if (hMm) unitMm = hMm / vb[3];
  }
  const outlines: { outline: Outline; op: Op }[] = [];
  const skipped: Record<string, number> = {};
  // User units → mm, y up.
  const base: M = [unitMm, 0, 0, -unitMm, 0, 0];
  const noted = (name: string) => {
    skipped[name] = (skipped[name] ?? 0) + 1;
  };
  const walk = (el: XmlElement, m: M, style: Style, explicitColour: boolean) => {
    const name = el.name.replace(/^.*:/, "");
    if (SKIP.has(name)) return;
    const st = styleOf(el, style);
    if (st.hidden) return;
    const mm = mul(m, parseTransform(el.attrs.transform));
    const explicit = explicitColour || el.attrs.fill !== undefined || el.attrs.stroke !== undefined || /(?:^|;)\s*(?:fill|stroke)\s*:/i.test(el.attrs.style ?? "");
    const add = (segs: Segment[], closed: boolean) => {
      if (!segs.length) return;
      if (outlines.length >= MAX_SVG_SHAPES) throw new SvgError(`That drawing has more than ${MAX_SVG_SHAPES.toLocaleString("en")} shapes, too many to bring in. Open it in a drawing program and save just the part you need.`);
      outlines.push({ outline: { segments: segs.map((s) => moveSeg(s, mm)), closed }, op: opForStyle(st, explicit) });
    };
    const a = el.attrs;
    switch (name) {
      case "svg":
      case "g":
      case "a":
      case "switch":
        for (const c of el.children) walk(c, mm, st, explicit);
        break;
      case "path":
        if (a.d) for (const run of parsePathData(a.d)) add(run.segments, run.closed);
        break;
      case "rect": {
        const w = numAttr(a.width), h = numAttr(a.height);
        if (w > 0 && h > 0) {
          const rx = a.rx !== undefined ? numAttr(a.rx) : a.ry !== undefined ? numAttr(a.ry) : 0;
          const ry = a.ry !== undefined ? numAttr(a.ry) : rx;
          add(rectSegments(numAttr(a.x), numAttr(a.y), w, h, rx, ry), true);
        }
        break;
      }
      case "circle": {
        const r = numAttr(a.r);
        if (r > 0) add(ellipseBeziers(numAttr(a.cx), numAttr(a.cy), r, r), true);
        break;
      }
      case "ellipse": {
        const rx = numAttr(a.rx), ry = numAttr(a.ry);
        if (rx > 0 && ry > 0) add(ellipseBeziers(numAttr(a.cx), numAttr(a.cy), rx, ry), true);
        break;
      }
      case "line": {
        const from: Pt = [numAttr(a.x1), numAttr(a.y1)];
        const to: Pt = [numAttr(a.x2), numAttr(a.y2)];
        if (Math.hypot(to[0] - from[0], to[1] - from[1]) > 1e-12) add([{ kind: "line", from, to }], false);
        break;
      }
      case "polyline":
      case "polygon": {
        const nums = (a.points ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
        const pts: Pt[] = [];
        for (let i = 0; i + 1 < nums.length; i += 2) if (Number.isFinite(nums[i]) && Number.isFinite(nums[i + 1])) pts.push([nums[i], nums[i + 1]]);
        const closed = name === "polygon";
        const segs: Segment[] = [];
        for (let i = 0; i < (closed ? pts.length : pts.length - 1); i++) {
          const p = pts[i], q = pts[(i + 1) % pts.length];
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-12) segs.push({ kind: "line", from: p, to: q });
        }
        add(segs, closed && segs.length > 1);
        break;
      }
      default:
        if (NOTED.has(name)) noted(name);
        else for (const c of el.children) walk(c, mm, st, explicit);
    }
  };
  walk(svg, base, { fill: null, stroke: null, hidden: false }, false);
  return { outlines, skipped, unitMm };
}
