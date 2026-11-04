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
import { pathsBox, type Pt, type Segment } from "./segments";

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

export type FontId = "inter-regular" | "inter-bold" | "poppins-regular" | "poppins-bold" | "lora-regular";

/** The fonts, in the order the app lists them. */
export const FONTS: Record<FontId, OutlineFont> = {
  "inter-regular": interRegular as OutlineFont,
  "inter-bold": interBold as OutlineFont,
  "poppins-regular": poppinsRegular as OutlineFont,
  "poppins-bold": poppinsBold as OutlineFont,
  "lora-regular": loraRegular as OutlineFont,
};
export const FONT_IDS = Object.keys(FONTS) as FontId[];
export const DEFAULT_FONT: FontId = "inter-regular";

export const isFontId = (v: unknown): v is FontId => typeof v === "string" && v in FONTS;

export type TextAlign = "left" | "centre" | "right";

export interface TextOutline {
  /** Closed loops (a letter's outside and the holes in it are separate loops). */
  loops: Segment[][];
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
 * The outlines of `text` with capital letters `capHeight` mm tall. The first
 * line's baseline is y = 0 and lines run downwards; x = 0 is the left edge
 * (`align` centres or right-aligns each line about x = 0). Lines are split by "\n".
 */
export function textOutline(font: OutlineFont, text: string, capHeight: number, align: TextAlign = "left"): TextOutline {
  const scale = capHeight / (font.capHeight || font.unitsPerEm * 0.7);
  const lineHeight = (font.ascender - font.descender) * scale;
  const loops: Segment[][] = [];
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
        loops.push(...glyphLoops(glyph.o, scale, x, y));
      }
      x += glyph.a * scale;
    }
  });
  return { loops, box: pathsBox(loops.map((segments) => ({ layer: "engrave", segments, closed: true }))), missing: [...missing] };
}
