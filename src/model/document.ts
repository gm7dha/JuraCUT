/**
 * Designs: a new one, reading a saved one (checking every value, so a damaged
 * or hand-edited file can't break the app), and writing one out.
 */
import { isFontId } from "../geometry/text";
import { R1_BED, type Pt, type Segment } from "../geometry/segments";
import { isOp, type Item, type JuraCUTDocument, type Material, type Outline } from "./types";

export const FILE_EXTENSION = ".juracut";
export const FILE_MIME = "application/x-juracut+json";
export const DEFAULT_NAME = "Untitled design";

export const DEFAULT_MATERIAL: Material = { name: "3 mm plywood", thickness: 3, kerf: 0.15 };

export function newDocument(name = DEFAULT_NAME): JuraCUTDocument {
  return { format: "juracut", version: 1, name, bed: [...R1_BED], material: { ...DEFAULT_MATERIAL }, items: [] };
}

/** A new id for a shape (short, random; unique within a design — checked by the caller). */
export function newId(taken: Iterable<string> = []): string {
  const have = new Set(taken);
  for (;;) {
    const id = Math.random().toString(36).slice(2, 8);
    if (!have.has(id)) return id;
  }
}

/** A design name from a file name ("Sign.juracut" → "Sign"). */
export function nameFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").trim();
}

export function serializeDocument(doc: JuraCUTDocument): string {
  return JSON.stringify(doc, null, 2);
}

// ---------------------------------------------------------------------------
// Reading, carefully.

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const pt = (v: unknown): Pt | null => (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? [v[0], v[1]] : null);

function parseSegment(v: unknown): Segment | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  switch (s.kind) {
    case "line": {
      const from = pt(s.from), to = pt(s.to);
      return from && to ? { kind: "line", from, to } : null;
    }
    case "arc": {
      const from = pt(s.from), mid = pt(s.mid), to = pt(s.to);
      return from && mid && to ? { kind: "arc", from, mid, to } : null;
    }
    case "circle": {
      const center = pt(s.center);
      return center && num(s.radius) > 0 ? { kind: "circle", center, radius: num(s.radius) } : null;
    }
    case "bezier": {
      const from = pt(s.from), c1 = pt(s.c1), c2 = pt(s.c2), to = pt(s.to);
      return from && c1 && c2 && to ? { kind: "bezier", from, c1, c2, to } : null;
    }
    case "ellipse": {
      const center = pt(s.center);
      return center && num(s.rx) > 0 && num(s.ry) > 0 ? { kind: "ellipse", center, rx: num(s.rx), ry: num(s.ry), angle: num(s.angle) } : null;
    }
    case "ellipseArc": {
      const center = pt(s.center), from = pt(s.from), to = pt(s.to);
      return center && from && to && num(s.rx) > 0 && num(s.ry) > 0
        ? { kind: "ellipseArc", center, rx: num(s.rx), ry: num(s.ry), angle: num(s.angle), t0: num(s.t0), t1: num(s.t1), from, to }
        : null;
    }
    default:
      return null;
  }
}

function parseOutline(v: unknown): Outline | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.segments)) return null;
  const segments = o.segments.map(parseSegment).filter((s): s is Segment => !!s);
  return segments.length ? { segments, closed: o.closed === true } : null;
}

function parseItem(v: unknown, taken: Set<string>): Item | null {
  if (!v || typeof v !== "object") return null;
  const it = v as Record<string, unknown>;
  const base = {
    id: typeof it.id === "string" && it.id && !taken.has(it.id) ? it.id : newId(taken),
    name: str(it.name, "Shape"),
    op: isOp(it.op) ? it.op : ("cut" as const),
    ...(it.hidden === true ? { hidden: true } : {}),
    ...(typeof it.group === "string" && it.group ? { group: it.group.slice(0, 40) } : {}),
  };
  taken.add(base.id);
  switch (it.kind) {
    case "rect":
      return { ...base, kind: "rect", x: num(it.x), y: num(it.y), w: Math.max(num(it.w, 10), 0.01), h: Math.max(num(it.h, 10), 0.01), radius: Math.max(num(it.radius), 0), angle: num(it.angle) };
    case "circle":
      return { ...base, kind: "circle", cx: num(it.cx), cy: num(it.cy), r: Math.max(num(it.r, 5), 0.005) };
    case "line":
      return { ...base, kind: "line", x1: num(it.x1), y1: num(it.y1), x2: num(it.x2, 10), y2: num(it.y2) };
    case "text":
      return {
        ...base,
        kind: "text",
        text: str(it.text).slice(0, 2000),
        x: num(it.x),
        y: num(it.y),
        size: Math.max(num(it.size, 20), 0.1),
        font: isFontId(it.font) ? it.font : "inter-regular",
        align: it.align === "centre" || it.align === "right" ? it.align : "left",
        angle: num(it.angle),
      };
    case "picture": {
      const src = typeof it.src === "string" && /^data:image\/(png|jpeg|webp|gif);base64,/.test(it.src) && it.src.length <= 8_000_000 ? it.src : null;
      if (!src) return null;
      return {
        ...base,
        op: "engrave",
        kind: "picture",
        src,
        cx: num(it.cx),
        cy: num(it.cy),
        w: Math.max(num(it.w, 50), 1),
        h: Math.max(num(it.h, 50), 1),
        turns: ((Math.round(num(it.turns)) % 4) + 4) % 4,
        flip: it.flip === true,
        mode: it.mode === "black" || it.mode === "greys" ? it.mode : "dots",
        brightness: Math.max(-100, Math.min(100, num(it.brightness))),
        contrast: Math.max(-100, Math.min(100, num(it.contrast))),
        invert: it.invert === true,
        dpm: Math.max(2, Math.min(25, num(it.dpm, 10))),
      };
    }
    case "shape": {
      const outlines = Array.isArray(it.outlines) ? it.outlines.map(parseOutline).filter((o): o is Outline => !!o) : [];
      return { ...base, kind: "shape", outlines };
    }
    default:
      return null;
  }
}

/** A design from parsed JSON, or null when it isn't one. Any odd value falls back to something sensible. */
export function parseDocument(raw: unknown): JuraCUTDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (d.format !== "juracut") return null;
  const bedRaw = pt(d.bed);
  const bed: [number, number] = bedRaw && bedRaw[0] > 0 && bedRaw[1] > 0 ? bedRaw : [...R1_BED];
  const m = (d.material && typeof d.material === "object" ? d.material : {}) as Record<string, unknown>;
  const material: Material = { name: str(m.name, DEFAULT_MATERIAL.name), thickness: Math.max(num(m.thickness, DEFAULT_MATERIAL.thickness), 0), kerf: Math.max(num(m.kerf, DEFAULT_MATERIAL.kerf), 0) };
  const taken = new Set<string>();
  const items = Array.isArray(d.items) ? d.items.map((v) => parseItem(v, taken)).filter((it): it is Item => !!it) : [];
  return { format: "juracut", version: 1, name: str(d.name, DEFAULT_NAME) || DEFAULT_NAME, bed, material, items };
}

export type ReadResult = { ok: true; doc: JuraCUTDocument } | { ok: false; error: string };

/** Read a .juracut file's text. */
export function readDocumentFile(text: string, fileName = "the file"): ReadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: `${fileName} isn't a JuraCUT design (it isn't valid JSON).` };
  }
  const doc = parseDocument(raw);
  if (!doc) return { ok: false, error: `${fileName} isn't a JuraCUT design. Choose a .juracut file, or Import an SVG or DXF drawing.` };
  return { ok: true, doc };
}
