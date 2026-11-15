/**
 * QR codes (pure): the dark squares of a QR code for some words or a web address, as outlines in mm. The code is
 * made by Nayuki's generator (qrcodegen.ts); neighbouring dark squares are joined into one outline (traced as a
 * picture would be), so the engraving fills them in one pass with no seams. A light margin round the code (its
 * "quiet zone") is needed for phones to read it — the material round it gives that.
 */
import { qrcodegen } from "./qrcodegen";
import { traceBitmap } from "./trace";
import type { Pt } from "./segments";

export type QrEcc = "L" | "M" | "Q" | "H";
export const QR_ECCS: QrEcc[] = ["L", "M", "Q", "H"];
/** The most characters a code may hold here (the biggest codes hold about 2,900 letters; keep them sensible). */
export const MOST_QR_TEXT = 1200;

const ECC = { L: qrcodegen.QrCode.Ecc.LOW, M: qrcodegen.QrCode.Ecc.MEDIUM, Q: qrcodegen.QrCode.Ecc.QUARTILE, H: qrcodegen.QrCode.Ecc.HIGH };

export interface QrModules {
  /** Squares across (and up). */
  size: number;
  /** Dark squares, row by row from the top. */
  dark: Uint8Array;
}

const cache = new Map<string, QrModules | null>();

/** The code's squares, or null when the words don't fit in a QR code. */
export function qrModules(text: string, ecc: QrEcc = "M"): QrModules | null {
  const key = `${ecc}|${text}`;
  if (cache.has(key)) return cache.get(key)!;
  let out: QrModules | null = null;
  if (text && text.length <= MOST_QR_TEXT) {
    try {
      const qr = qrcodegen.QrCode.encodeText(text, ECC[ecc]);
      const dark = new Uint8Array(qr.size * qr.size);
      for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) dark[y * qr.size + x] = qr.getModule(x, y) ? 1 : 0;
      out = { size: qr.size, dark };
    } catch {
      out = null;
    }
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, out);
  return out;
}

/**
 * The code's dark areas as closed loops (mm, y up), the code `width` mm across with its bottom-left corner at (x, y).
 * Straight runs are single lines.
 */
export function qrLoops(text: string, ecc: QrEcc, x: number, y: number, width: number): Pt[][] {
  const m = qrModules(text, ecc);
  if (!m) return [];
  const cell = width / m.size;
  const loops = traceBitmap({ width: m.size, height: m.size, bits: m.dark });
  return loops.map((loop) => corners(loop).map(([px, py]): Pt => [x + px * cell, y + width - py * cell]));
}

/** A loop of grid points with the points along straight runs taken out. */
function corners(loop: Pt[]): Pt[] {
  const n = loop.length;
  return loop.filter((b, i) => {
    const a = loop[(i - 1 + n) % n];
    const c = loop[(i + 1) % n];
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0;
  });
}
