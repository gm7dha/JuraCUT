/**
 * Recent designs (pure, over an async store passed in): the designs you've worked on in this browser, each kept as you
 * go, so starting a new one or opening a file never loses the last. The newest `MOST_RECENT` are kept; older ones go.
 * Each has a small picture of its outlines for the list.
 */
import { pathsBox } from "../geometry/segments";
import { svgPathData } from "../laser/files";
import { parseDocument, serializeDocument } from "./document";
import { itemOutlines } from "./shapes";
import type { JuraCUTDocument } from "./types";

export const MOST_RECENT = 12;

export interface RecentMeta {
  id: string;
  name: string;
  /** When it was last changed (ms since 1970). */
  at: number;
  shapes: number;
  /** A small SVG of its outlines ("" when there are too many to draw small). */
  thumb: string;
}

/** Where recent designs are kept (IndexedDB in the browser; a Map in tests). */
export interface RecentStore {
  list(): Promise<RecentMeta[]>;
  put(meta: RecentMeta, text: string): Promise<void>;
  get(id: string): Promise<string | null>;
  remove(id: string): Promise<void>;
}

/** A small picture of a design's outlines, as SVG markup (empty when it would be too big). */
export function thumbnail(doc: JuraCUTDocument, most = 40_000): string {
  const paths = doc.items
    .filter((it) => !it.hidden && it.kind !== "picture")
    .flatMap((it) => itemOutlines(it).map((o) => ({ layer: "outer" as const, segments: o.segments, closed: o.closed, op: it.op })));
  const box = pathsBox(paths);
  if (!box) return "";
  const [x0, y0, x1, y1] = box;
  const w = Math.max(x1 - x0, 1);
  const h = Math.max(y1 - y0, 1);
  const colour = { cut: "#e03131", score: "#2f9e44", engrave: "#343a40" } as const;
  let out = "";
  for (const p of paths) {
    const d = svgPathData({ layer: p.layer, segments: p.segments, closed: p.closed }, null).replace(/(\d+\.\d)\d+/g, "$1");
    out += `<path d="${d}" stroke="${colour[p.op]}"/>`;
    if (out.length > most) return "";
  }
  const pad = Math.max(w, h) * 0.04;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0 - pad} ${-(y1 + pad)} ${w + 2 * pad} ${h + 2 * pad}"><g transform="scale(1 -1)" fill="none" stroke-width="${Math.max(w, h) / 120}" vector-effect="non-scaling-stroke">${out}</g></svg>`;
}

/** Keep a design under its id (newest first; the oldest past `MOST_RECENT` go). Empty designs aren't kept. */
export async function keepRecent(store: RecentStore, id: string, doc: JuraCUTDocument, now = Date.now()): Promise<void> {
  if (!doc.items.length) return;
  await store.put({ id, name: doc.name, at: now, shapes: doc.items.length, thumb: thumbnail(doc) }, serializeDocument(doc));
  const all = (await store.list()).sort((a, b) => b.at - a.at);
  for (const old of all.slice(MOST_RECENT)) await store.remove(old.id);
}

/** The designs kept, newest first. */
export async function recentList(store: RecentStore): Promise<RecentMeta[]> {
  return (await store.list()).sort((a, b) => b.at - a.at);
}

/** A kept design, read back carefully (null if it's gone or damaged). */
export async function openRecent(store: RecentStore, id: string): Promise<JuraCUTDocument | null> {
  const text = await store.get(id);
  if (!text) return null;
  try {
    return parseDocument(JSON.parse(text));
  } catch {
    return null;
  }
}

/** A Map-backed store (tests, and when the browser has no IndexedDB). */
export function memoryStore(): RecentStore {
  const meta = new Map<string, RecentMeta>();
  const texts = new Map<string, string>();
  return {
    list: async () => [...meta.values()],
    put: async (m, t) => {
      meta.set(m.id, m);
      texts.set(m.id, t);
    },
    get: async (id) => texts.get(id) ?? null,
    remove: async (id) => {
      meta.delete(id);
      texts.delete(id);
    },
  };
}
