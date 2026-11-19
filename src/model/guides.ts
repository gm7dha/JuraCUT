/**
 * Guide lines (pure): straight lines right across the bed that shapes snap to while you draw and move them — pulled
 * out of the rulers, as in Inkscape and LightBurn. `xs` are upright guides (at an x), `ys` level ones (at a y). They're
 * saved with the design but never cut.
 */
import type { JuraCUTDocument } from "./types";

export interface Guides {
  xs: number[];
  ys: number[];
}

export type GuideAxis = "x" | "y";

export const NO_GUIDES: Guides = { xs: [], ys: [] };
/** At most this many guides each way. */
export const MOST_GUIDES = 100;

export const guidesOf = (doc: JuraCUTDocument): Guides => doc.guides ?? NO_GUIDES;

const listOf = (g: Guides, axis: GuideAxis) => (axis === "x" ? g.xs : g.ys);

/** The design with guide `index` on `axis` put at `at` (index = how many there are: a new one). */
export function withGuideAt(doc: JuraCUTDocument, axis: GuideAxis, index: number, at: number): JuraCUTDocument {
  const g = guidesOf(doc);
  const list = [...listOf(g, axis)];
  if (index >= list.length) {
    if (list.length >= MOST_GUIDES) return doc;
    list.push(at);
  } else list[index] = at;
  return { ...doc, guides: axis === "x" ? { xs: list, ys: g.ys } : { xs: g.xs, ys: list } };
}

/** The design without guide `index` on `axis` (no guides left = none kept). */
export function withoutGuide(doc: JuraCUTDocument, axis: GuideAxis, index: number): JuraCUTDocument {
  const g = guidesOf(doc);
  const list = listOf(g, axis).filter((_, i) => i !== index);
  const next = axis === "x" ? { xs: list, ys: g.ys } : { xs: g.xs, ys: list };
  return withGuides(doc, next);
}

/** The design with these guides (none = the field left out, as files without guides have). */
export function withGuides(doc: JuraCUTDocument, g: Guides): JuraCUTDocument {
  if (!g.xs.length && !g.ys.length) {
    if (!doc.guides) return doc;
    const { guides: _gone, ...rest } = doc;
    return rest;
  }
  return { ...doc, guides: g };
}

/** The guide nearest a point within `reach` (mm), if any. */
export function guideNear(g: Guides, p: [number, number], reach: number): { axis: GuideAxis; index: number } | null {
  let best: { axis: GuideAxis; index: number; d: number } | null = null;
  g.xs.forEach((x, index) => {
    const d = Math.abs(p[0] - x);
    if (d <= reach && (!best || d < best.d)) best = { axis: "x", index, d };
  });
  g.ys.forEach((y, index) => {
    const d = Math.abs(p[1] - y);
    if (d <= reach && (!best || d < best.d)) best = { axis: "y", index, d };
  });
  if (!best) return null;
  const { axis, index } = best;
  return { axis, index };
}

/** Guides read from a file, carefully (finite numbers only, at most `MOST_GUIDES` each way). */
export function parseGuides(v: unknown): Guides | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const list = (a: unknown) => (Array.isArray(a) ? a.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e6).slice(0, MOST_GUIDES) : []);
  const g = { xs: list(r.xs), ys: list(r.ys) };
  return g.xs.length || g.ys.length ? g : undefined;
}
