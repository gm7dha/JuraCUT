/**
 * Keeping the design in the browser (localStorage), so a refresh brings it
 * back. Pure: the storage is passed in, so it's tested without a browser.
 */
import { parseDocument } from "./document";
import type { JuraCUTDocument } from "./types";

export const STORAGE_KEY = "juracut.document.v1";

export interface KeepStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The design as kept: compact JSON, with each picture and clip outline that several shapes share written once (the
 * passes of an island relief, copies of a photo). Saved files are unchanged — this is only the browser's copy.
 */
export function keptText(doc: JuraCUTDocument): string {
  const srcs: string[] = [];
  const clips: string[] = [];
  const at = (list: string[], v: string) => {
    let i = list.indexOf(v);
    if (i < 0) i = list.push(v) - 1;
    return i;
  };
  const items = doc.items.map((it) => {
    if (it.kind !== "picture") return it;
    const out: Record<string, unknown> = { ...it, src: { kept: at(srcs, it.src) } };
    if (it.clip) out.clip = { kept: at(clips, JSON.stringify(it.clip)) };
    return out;
  });
  if (!srcs.length) return JSON.stringify(doc);
  return JSON.stringify({ kept: KEPT_FORMAT, srcs, clips, doc: { ...doc, items } });
}

const KEPT_FORMAT = "juracut-kept-1";

/** The design back from `keptText` (or from older, plain copies). */
export function fromKeptText(text: string): unknown {
  const v = JSON.parse(text) as Record<string, unknown>;
  if (!v || v.kept !== KEPT_FORMAT) return v;
  const srcs = Array.isArray(v.srcs) ? v.srcs : [];
  const clips = Array.isArray(v.clips) ? v.clips : [];
  const ref = (x: unknown, list: unknown[]) => (x && typeof x === "object" && typeof (x as { kept?: unknown }).kept === "number" ? list[(x as { kept: number }).kept] : x);
  const doc = (v.doc ?? {}) as Record<string, unknown>;
  const items = Array.isArray(doc.items)
    ? doc.items.map((it: Record<string, unknown>) => {
        if (!it || it.kind !== "picture") return it;
        const clip = ref(it.clip, clips);
        return { ...it, src: ref(it.src, srcs), ...(it.clip !== undefined ? { clip: typeof clip === "string" ? JSON.parse(clip) : clip } : {}) };
      })
    : doc.items;
  return { ...doc, items };
}

/** Keep the design. Returns false when the browser won't (full, or storage blocked). */
export function keepInBrowser(storage: KeepStorage, doc: JuraCUTDocument): boolean {
  try {
    storage.setItem(STORAGE_KEY, keptText(doc));
    return true;
  } catch {
    return false;
  }
}

/** The design kept in the browser, or null when there's none (or it's damaged). */
export function readKept(storage: Pick<KeepStorage, "getItem">): JuraCUTDocument | null {
  try {
    const text = storage.getItem(STORAGE_KEY);
    return text ? parseDocument(fromKeptText(text)) : null;
  } catch {
    return null;
  }
}

export const KEEP_PROBLEM = "This design is too big for the browser to keep, so your latest changes would be lost if the page is closed or reloaded. Use Save to keep it as a file.";
