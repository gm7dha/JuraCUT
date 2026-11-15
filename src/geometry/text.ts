/**
 * Words as outlines: letters from the fonts in `fonts/` (compact JSON made by
 * scripts/make-fonts.py) turned into closed loops of lines and Bézier curves
 * in millimetres, sized by the height of a capital letter — the number people
 * measure on a sign.
 */
import interRegular from "./fonts/inter-regular.json";
import interBold from "./fonts/inter-bold.json";
import poppinsRegular from "./fonts/poppins-regular.json";
import poppinsBold from "./fonts/poppins-bold.json";
import loraRegular from "./fonts/lora-regular.json";
import greatVibes from "./fonts/great-vibes.json";
import pacifico from "./fonts/pacifico.json";
import allura from "./fonts/allura.json";
import caveat from "./fonts/caveat.json";
import amaticSc from "./fonts/amatic-sc.json";
import bebasNeue from "./fonts/bebas-neue.json";
import anton from "./fonts/anton.json";
import dmSerifDisplay from "./fonts/dm-serif-display.json";
import sairaStencil from "./fonts/saira-stencil.json";
import { moveSegment, pathsBox, type Pt, type Segment } from "./segments";

export interface OutlineFont {
  id: string;
  label: string;
  unitsPerEm: number;
  ascender: number;
  descender: number;
  capHeight: number;
  xHeight: number;
  /** Per character: the advance width `a` and the outline commands `o` (font units). */
  glyphs: Record<string, { a: number; o: string }>;
}

export type FontId =
  | "inter-regular"
  | "inter-bold"
  | "poppins-regular"
  | "poppins-bold"
  | "lora-regular"
  | "dm-serif-display"
  | "bebas-neue"
  | "anton"
  | "great-vibes"
  | "allura"
  | "pacifico"
  | "caveat"
  | "amatic-sc"
  | "saira-stencil";

/** The fonts, in the order the app lists them. */
export const FONTS: Record<FontId, OutlineFont> = {
  "inter-regular": interRegular as OutlineFont,
  "inter-bold": interBold as OutlineFont,
  "poppins-regular": poppinsRegular as OutlineFont,
  "poppins-bold": poppinsBold as OutlineFont,
  "lora-regular": loraRegular as OutlineFont,
  "dm-serif-display": dmSerifDisplay as OutlineFont,
  "bebas-neue": bebasNeue as OutlineFont,
  "anton": anton as OutlineFont,
  "great-vibes": greatVibes as OutlineFont,
  "allura": allura as OutlineFont,
  "pacifico": pacifico as OutlineFont,
  "caveat": caveat as OutlineFont,
  "amatic-sc": amaticSc as OutlineFont,
  "saira-stencil": sairaStencil as OutlineFont,
};

/** Fonts whose letters join up or overlap (scripts): their words are joined into one shape by default. */
export const JOINED_FONTS: FontId[] = ["great-vibes", "allura", "pacifico"];
export const FONT_IDS = Object.keys(FONTS) as FontId[];
export const DEFAULT_FONT: FontId = "inter-regular";

export const isFontId = (v: unknown): v is FontId => typeof v === "string" && v in FONTS;

export type TextAlign = "left" | "centre" | "right";

export interface TextOutline {
  /** Closed loops (a letter's outside and the holes in it are separate loops). */
  loops: Segment[][];
  /** For each letter, how many of `loops` (in order) are its own. */
  letterLoops: number[];
  /** The box round the letters [x0, y0, x1, y1] in mm (null for nothing printable). */
  box: [number, number, number, number] | null;
  /** Characters the font has no outline for (shown as a note). */
  missing: string[];
}

/** One glyph's outline commands as loops of segments, scaled and moved. */
function glyphLoops(o: string, scale: number, dx: number, dy: number): Segment[][] {
  const t = o.split(" ");
  const loops: Segment[][] = [];
  let cur: Segment[] = [];
  let start: Pt | null = null;
  let at: Pt | null = null;
  let i = 0;
  const num = () => Number(t[i++]);
  const pt = (): Pt => [num() * scale + dx, num() * scale + dy];
  const close = () => {
    if (at && start && Math.hypot(at[0] - start[0], at[1] - start[1]) > 1e-9) cur.push({ kind: "line", from: at, to: start });
    if (cur.length) loops.push(cur);
    cur = [];
    start = at = null;
  };
  while (i < t.length) {
    const c = t[i++];
    if (c === "m") {
      if (cur.length) close();
      start = at = pt();
    } else if (c === "l" && at) {
      const p = pt();
      if (Math.hypot(p[0] - at[0], p[1] - at[1]) > 1e-9) cur.push({ kind: "line", from: at, to: p });
      at = p;
    } else if (c === "q" && at) {
      // A quadratic curve as the cubic that is exactly the same curve.
      const cp = pt();
      const p = pt();
      const c1: Pt = [at[0] + (2 / 3) * (cp[0] - at[0]), at[1] + (2 / 3) * (cp[1] - at[1])];
      const c2: Pt = [p[0] + (2 / 3) * (cp[0] - p[0]), p[1] + (2 / 3) * (cp[1] - p[1])];
      cur.push({ kind: "bezier", from: at, c1, c2, to: p });
      at = p;
    } else if (c === "c" && at) {
      const c1 = pt();
      const c2 = pt();
      const p = pt();
      cur.push({ kind: "bezier", from: at, c1, c2, to: p });
      at = p;
    } else if (c === "z") {
      close();
    } else if (c === "") {
      continue;
    } else {
      break; // Something unexpected: stop reading this glyph.
    }
  }
  if (cur.length) close();
  return loops;
}

/** How wide a line of text is in font units. */
function lineAdvance(font: OutlineFont, line: string): number {
  let w = 0;
  for (const ch of Array.from(line)) w += (font.glyphs[ch] ?? font.glyphs["?"])?.a ?? 0;
  return w;
}

/**
 * A path for words to run along (bed mm): its points (a closed path's first point not repeated), whether it's closed,
 * where along it the words' anchor sits (mm from its start), and `flip` to run the other way, letters on its other side.
 */
export interface AlongPath {
  points: Pt[];
  closed: boolean;
  at: number;
  flip?: boolean;
}

/** A function from distance along the words (0 at their anchor) to a point on the path and its direction there. */
function pathWalker(path: AlongPath): (s: number) => [Pt, number] {
  let pts = path.closed && path.points.length ? [...path.points, path.points[0]] : [...path.points];
  if (path.flip) pts = pts.reverse();
  const along: number[] = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = along[along.length - 1] || 1;
  const start = path.flip ? total - path.at : path.at;
  return (s: number): [Pt, number] => {
    let d = start + s;
    if (path.closed) d = ((d % total) + total) % total;
    // Past an open path's ends, carry straight on.
    let i = 1;
    while (i < pts.length - 1 && along[i] < d) i++;
    const a = pts[i - 1];
    const b = pts[i];
    const len = along[i] - along[i - 1] || 1e-9;
    const t = (d - along[i - 1]) / len;
    return [[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], Math.atan2(b[1] - a[1], b[0] - a[0])];
  };
}

/** The smallest radius words may be bent round (mm). */
export const MIN_CURVE = 1;

/**
 * The outlines of `text` with capital letters `capHeight` mm tall. The first
 * line's baseline is y = 0 and lines run downwards; x = 0 is the left edge
 * (`align` centres or right-aligns each line about x = 0). Lines are split by "\n".
 *
 * `curve` bends the words round a circle of that radius (mm): positive, over the top of a circle whose middle is
 * `curve` below (0, 0), reading clockwise; negative, under the bottom of one `-curve` above, letters' tops towards its
 * middle (as on the bottom of a badge). Each letter is turned as a whole, so its curves stay exact; distances along
 * the baseline are kept.
 */
export function textOutline(font: OutlineFont, text: string, capHeight: number, align: TextAlign = "left", curve = 0, along?: AlongPath): TextOutline {
  const R = Math.abs(curve) < MIN_CURVE ? 0 : curve;
  const walk = along ? pathWalker(along) : null;
  const scale = capHeight / (font.capHeight || font.unitsPerEm * 0.7);
  const lineHeight = (font.ascender - font.descender) * scale;
  const loops: Segment[][] = [];
  const letterLoops: number[] = [];
  const missing = new Set<string>();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, row) => {
    const width = lineAdvance(font, line) * scale;
    let x = align === "left" ? 0 : align === "centre" ? -width / 2 : -width;
    const y = -row * lineHeight;
    for (const ch of Array.from(line)) {
      let glyph = font.glyphs[ch];
      if (!glyph) {
        if (ch.trim()) missing.add(ch);
        glyph = font.glyphs["?"];
        if (!glyph) continue;
      }
      if (glyph.o) {
        const before = loops.length;
        if (walk) {
          // On a path: the letter's middle at its distance along it, turned to the path's direction there.
          const mid = x + (glyph.a * scale) / 2;
          const [p, angle] = walk(mid);
          const c = Math.cos(angle);
          const s = Math.sin(angle);
          // p' = P + turn(angle) · (u, v), with u = px - mid, v = py.
          const m: [number, number, number, number, number, number] = [c, s, -s, c, p[0] - c * mid, p[1] - s * mid];
          for (const loop of glyphLoops(glyph.o, scale, x, y)) loops.push(loop.map((seg) => moveSegment(seg, m)));
        } else if (!R) loops.push(...glyphLoops(glyph.o, scale, x, y));
        else {
          // Drawn about its own middle, then turned onto the circle.
          const mid = x + (glyph.a * scale) / 2;
          const phi = -mid / R;
          const c = Math.cos(phi);
          const s = Math.sin(phi);
          // p = (0, -R) + turn(phi) · (u, v + R), with u = px - mid, v = py.
          const m: [number, number, number, number, number, number] = [c, s, -s, c, -c * mid - s * R, -s * mid + c * R - R];
          for (const loop of glyphLoops(glyph.o, scale, x, y)) loops.push(loop.map((seg) => moveSegment(seg, m)));
        }
        if (loops.length > before) letterLoops.push(loops.length - before);
      }
      x += glyph.a * scale;
    }
  });
  return { loops, letterLoops, box: pathsBox(loops.map((segments) => ({ layer: "engrave", segments, closed: true }))), missing: [...missing] };
}
