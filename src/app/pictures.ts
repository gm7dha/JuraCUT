/**
 * Photos in the browser: drawing a picture item at the size and turn it has,
 * made ready for the laser (geometry/photo.ts), as a PNG. Used small for the
 * bed and big for Export. Results are kept, so redrawing the bed is quick.
 */
import { useEffect, useState } from "react";

import { greyscale } from "../geometry/trace";
import { processPhoto, withPngDpi } from "../geometry/photo";
import { pictureSize } from "../model/shapes";
import type { PictureItem } from "../model/types";

/** Longest side (pixels) a picture is engraved at; bigger asks are made coarser to keep the file and browser happy. */
export const MAX_ENGRAVE_SIDE = 6000;

const images = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  let p = images.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That picture couldn't be read."));
      img.src = src;
    });
    images.set(src, p);
    if (images.size > 30) images.delete(images.keys().next().value!);
  }
  return p;
}

export interface RenderedPicture {
  /** A PNG data: URL. */
  url: string;
  /** The PNG's bytes (with its size in dots per mm). */
  bytes: Uint8Array;
  width: number;
  height: number;
  /** Dots per mm it was drawn at. */
  dpm: number;
}

/**
 * The picture drawn at `dpm` dots per mm (or fewer, if it would be over MAX_ENGRAVE_SIDE), turned and flipped as it
 * sits on the bed — and flipped once more if the whole sheet is mirrored — then made ready for the laser.
 */
export async function renderPicture(item: PictureItem, dpm: number, mirrored = false): Promise<RenderedPicture> {
  const img = await loadImage(item.src);
  const [W, H] = pictureSize(item);
  const k = Math.min(dpm, MAX_ENGRAVE_SIDE / Math.max(W, H));
  const width = Math.max(1, Math.round(W * k));
  const height = Math.max(1, Math.round(H * k));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser can't draw pictures here.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  // On screen y is down, so the bed's anticlockwise turn is clockwise here. Flip last (outermost), as on the bed.
  ctx.translate(width / 2, height / 2);
  if (item.flip !== mirrored) ctx.scale(-1, 1);
  ctx.rotate((-item.turns * Math.PI) / 2);
  const w = item.w * k;
  const h = item.h * k;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  const data = ctx.getImageData(0, 0, width, height);
  const ready = processPhoto(greyscale(data.data, width, height), width, height, item);
  for (let i = 0; i < ready.length; i++) {
    data.data[4 * i] = data.data[4 * i + 1] = data.data[4 * i + 2] = ready[i];
    data.data[4 * i + 3] = 255;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(data, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture couldn't be made."))), "image/png"));
  const bytes = withPngDpi(new Uint8Array(await blob.arrayBuffer()), k);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { url: `data:image/png;base64,${btoa(bin)}`, bytes, width, height, dpm: k };
}

const previews = new Map<string, string>();
const keyOf = (p: PictureItem, dpm: number) => `${p.src.length}:${p.src.slice(-48)}|${p.w}|${p.h}|${p.turns}|${p.flip}|${p.mode}|${p.brightness}|${p.contrast}|${p.invert}|${dpm}`;

/** A small version of the picture as it'll engrave, for the bed (null while it's being made). */
export function usePicturePreview(p: PictureItem | null): string | null {
  // Enough dots to look right on screen: about 4 per mm, at most 900 pixels a side.
  const dpm = p ? Math.min(p.dpm, 4, 900 / Math.max(p.w, p.h)) : 0;
  const key = p ? keyOf(p, dpm) : "";
  const [url, setUrl] = useState<string | null>(() => previews.get(key) ?? null);
  useEffect(() => {
    if (!p) return;
    const have = previews.get(key);
    if (have) {
      setUrl(have);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      renderPicture(p, dpm)
        .then((r) => {
          previews.set(key, r.url);
          if (previews.size > 40) previews.delete(previews.keys().next().value!);
          if (live) setUrl(r.url);
        })
        .catch(() => live && setUrl(null));
    }, 60);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

/** A picture file made small enough to keep in a design (≤ 1600 pixels a side, JPEG on white), as a data: URL. */
export async function keepableSource(src: string): Promise<{ url: string; width: number; height: number }> {
  const img = await loadImage(src);
  const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * k));
  const height = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw pictures here.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return { url: canvas.toDataURL("image/jpeg", 0.9), width, height };
}
