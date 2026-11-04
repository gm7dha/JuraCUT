/**
 * Photo engraving: a picture made ready for the laser. Brightness, contrast
 * and "the other way round" are applied to its greys, then either:
 *  - "dots": Floyd–Steinberg dithering — black dots spread so they look like
 *    the greys from a little way off (how laser photos are usually done);
 *  - "black": plain black and white at a threshold;
 *  - "greys": the greys left as they are, for Bambu Studio to handle.
 * Pure (greys in, greys out), plus a helper that writes a PNG's size in
 * dots per mm so it opens at true size elsewhere.
 */

export type PhotoMode = "dots" | "black" | "greys";

export interface PhotoSettings {
  mode: PhotoMode;
  /** −100 (darker) … +100 (lighter). */
  brightness: number;
  /** −100 (flatter) … +100 (punchier). */
  contrast: number;
  /** Light parts engraved instead of dark (for dark materials, or slate). */
  invert: boolean;
}

export const DEFAULT_PHOTO: PhotoSettings = { mode: "dots", brightness: 0, contrast: 0, invert: false };

/** Brightness, contrast and inverting applied to greys (0 = black … 255 = white). */
export function adjustGreys(grey: Uint8Array, s: Pick<PhotoSettings, "brightness" | "contrast" | "invert">): Uint8Array {
  const b = (Math.max(-100, Math.min(100, s.brightness)) / 100) * 128;
  const c = Math.max(-100, Math.min(100, s.contrast));
  // The usual contrast curve: 259(c+255)/(255(259−c)), with c scaled to −255…255.
  const C = c * 2.55;
  const f = (259 * (C + 255)) / (255 * (259 - C));
  const out = new Uint8Array(grey.length);
  for (let i = 0; i < grey.length; i++) {
    let v = f * (grey[i] - 128) + 128 + b;
    if (s.invert) v = 255 - v;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }
  return out;
}

/** Floyd–Steinberg dithering: each pixel black (0) or white (255), the rounding passed on to its neighbours. */
export function ditherFloydSteinberg(grey: Uint8Array, width: number, height: number): Uint8Array {
  const err = new Float32Array(grey.length);
  for (let i = 0; i < grey.length; i++) err[i] = grey[i];
  const out = new Uint8Array(grey.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = err[i];
      const v = old < 128 ? 0 : 255;
      out[i] = v;
      const e = old - v;
      if (x + 1 < width) err[i + 1] += (e * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) err[i + width - 1] += (e * 3) / 16;
        err[i + width] += (e * 5) / 16;
        if (x + 1 < width) err[i + width + 1] += e / 16;
      }
    }
  }
  return out;
}

/** The picture's greys made ready for the laser (same size: one value per pixel). */
export function processPhoto(grey: Uint8Array, width: number, height: number, s: PhotoSettings): Uint8Array {
  const adjusted = adjustGreys(grey, s);
  if (s.mode === "greys") return adjusted;
  if (s.mode === "black") return adjusted.map((v) => (v < 128 ? 0 : 255));
  return ditherFloydSteinberg(adjusted, width, height);
}

/** How much of the picture the laser engraves (0 … 1: the share of "black"). */
export function darkness(processed: Uint8Array): number {
  let sum = 0;
  for (const v of processed) sum += 255 - v;
  return processed.length ? sum / (255 * processed.length) : 0;
}

// ---------------------------------------------------------------------------
// PNG size in dots per mm (a pHYs chunk), so the file opens at true size.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * The PNG with its resolution set to `dotsPerMm` (as dots per metre, PNG's
 * unit). Any resolution it had is replaced. Not a PNG → returned as it is.
 */
export function withPngDpi(png: Uint8Array, dotsPerMm: number): Uint8Array {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (png.length < 33 || sig.some((b, i) => png[i] !== b)) return png;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Uint8Array[] = [png.subarray(0, 8)];
  let at = 8;
  let wrote = false;
  const perMetre = Math.round(dotsPerMm * 1000);
  const phys = new Uint8Array(21);
  const pv = new DataView(phys.buffer);
  pv.setUint32(0, 9);
  phys.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  pv.setUint32(8, perMetre);
  pv.setUint32(12, perMetre);
  phys[16] = 1; // unit: metre
  pv.setUint32(17, crc32(phys.subarray(4, 17)));
  while (at + 8 <= png.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(png[at + 4], png[at + 5], png[at + 6], png[at + 7]);
    const end = at + 12 + len;
    if (end > png.length) break;
    if (type !== "pHYs") chunks.push(png.subarray(at, end));
    if (type === "IHDR" && !wrote) {
      chunks.push(phys);
      wrote = true;
    }
    at = end;
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let k = 0;
  for (const c of chunks) {
    out.set(c, k);
    k += c.length;
  }
  return out;
}

/** A PNG's resolution in dots per mm, or null when it doesn't say (for tests and import). */
export function pngDotsPerMm(png: Uint8Array): number | null {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let at = 8;
  while (at + 8 <= png.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(png[at + 4], png[at + 5], png[at + 6], png[at + 7]);
    if (type === "pHYs" && png[at + 16] === 1) return view.getUint32(at + 8) / 1000;
    at += 12 + len;
  }
  return null;
}
