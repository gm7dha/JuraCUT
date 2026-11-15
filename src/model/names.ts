/**
 * Copies with different words (pure) — LightBurn's "variable text": one copy of the selection for each name in a list
 * (or each number), laid out in a grid a gap apart. In every words shape of a copy, "#" is replaced by the name — or,
 * with no "#", the words become the name. A QR code's "#" is replaced too (a web address per copy). With `shrink`, words that come out wider than the first copy's are made
 * smaller to fit, so long names still fit the tag.
 */
import { copiesOf } from "./clipboard";
import { boxOfItems } from "./repeat";
import { itemBox, movedItem } from "./shapes";
import type { Item, TextItem } from "./types";

/** The most names at once. */
export const MOST_NAMES = 500;

/** One copy's words: its name (the first column) and, from a spreadsheet, every column by its heading. */
export interface NameEntry {
  name: string;
  fields?: Record<string, string>;
}

/** Split one line of a CSV (commas, or semicolons or tabs if the heading line used them; "quoted, cells" kept whole). */
export function csvCells(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/**
 * A list for named copies: plain names one per line, or — when `table` (the words have {Heading} places) and the first
 * line has commas, semicolons or tabs — a spreadsheet (CSV) whose first line holds the column headings. Each row's
 * first cell is its name.
 */
export function entriesFrom(text: string, table = true): { entries: NameEntry[]; headings: string[] } {
  if (!table) return { entries: namesFrom(text).map((name) => ({ name })), headings: [] };
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const first = lines[0] ?? "";
  const sep = first.includes("\t") ? "\t" : first.includes(";") && !first.includes(",") ? ";" : first.includes(",") ? "," : "";
  if (!sep || lines.length < 2) return { entries: namesFrom(text).map((name) => ({ name })), headings: [] };
  const headings = csvCells(first, sep);
  const entries = lines.slice(1, MOST_NAMES + 1).map((l) => {
    const cells = csvCells(l, sep);
    const fields: Record<string, string> = {};
    headings.forEach((h, i) => (fields[h.toLowerCase()] = cells[i] ?? ""));
    return { name: cells[0] ?? "", fields };
  });
  return { entries, headings };
}

/** Words with a copy's own filled in: {Heading} by that column, "#" by its name; with neither, the words become the name. */
export function filledWords(words: string, e: NameEntry): string {
  let used = false;
  let out = words;
  if (e.fields)
    out = out.replace(/\{([^{}]{1,40})\}/g, (all, key: string) => {
      const v = e.fields![key.trim().toLowerCase()];
      if (v === undefined) return all;
      used = true;
      return v;
    });
  if (out.includes("#")) {
    used = true;
    out = out.split("#").join(e.name);
  }
  return used ? out : e.name;
}

/** Does some words (or a QR code's text) have a place for a copy's own words ("#" or a {Heading})? */
export const hasPlace = (words: string) => words.includes("#") || /\{[^{}]{1,40}\}/.test(words);

/** A list typed one per line (blank lines left out, each trimmed, at most `MOST_NAMES`). */
export function namesFrom(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MOST_NAMES);
}

/** Numbers from `from` to `to` (either way round), `step` apart, as names; `digits` pads with noughts (7 → "007"). */
export function numberNames(from: number, to: number, step = 1, digits = 0): string[] {
  const out: string[] = [];
  const s = Math.max(1, Math.abs(Math.round(step))) * (to >= from ? 1 : -1);
  for (let v = Math.round(from); s > 0 ? v <= to : v >= to; v += s) {
    out.push(String(Math.abs(v)).padStart(digits, "0").replace(/^/, v < 0 ? "-" : ""));
    if (out.length >= MOST_NAMES) break;
  }
  return out;
}

/** A words shape given a name ("#" replaced, else the whole words), made smaller to `maxWidth` if asked. */
export function namedText(t: TextItem, entry: NameEntry | string, maxWidth: number | null): TextItem {
  const text = filledWords(t.text, typeof entry === "string" ? { name: entry } : entry);
  let next: TextItem = { ...t, text };
  if (maxWidth) {
    const b = itemBox(next);
    const w = b ? b[2] - b[0] : 0;
    if (w > maxWidth) {
      next = { ...next, size: (next.size * maxWidth) / w };
      // Keep its middle where it was.
      const was = itemBox({ ...t, text });
      const now = itemBox(next);
      if (was && now) next = movedItem(next, (was[0] + was[2]) / 2 - (now[0] + now[2]) / 2, (was[1] + was[3]) / 2 - (now[1] + now[3]) / 2) as TextItem;
    }
  }
  return next;
}

/**
 * The selection named: the originals take the first name, copies the rest, `cols` across then up, `gap` apart.
 * Returns the originals (renamed) and the new copies.
 */
export function namedCopies(existing: readonly Item[], picked: readonly Item[], list: readonly (string | NameEntry)[], cols: number, gap: number, shrink: boolean): { renamed: Item[]; made: Item[] } {
  const box = boxOfItems(picked);
  const names: NameEntry[] = list.map((e) => (typeof e === "string" ? { name: e } : e));
  if (!box || !names.length || !picked.some((it) => it.kind === "text" || (it.kind === "qr" && hasPlace(it.text)))) return { renamed: [...picked], made: [] };
  const width = (t: TextItem) => {
    const b = itemBox(t);
    return b ? b[2] - b[0] : 0;
  };
  // Each words shape's room: as wide as it is now (or as its "#" text with the first name, if wider).
  const room = new Map(picked.filter((it): it is TextItem => it.kind === "text").map((t) => [t.id, width(t)]));
  const name = (items: readonly Item[], n: NameEntry, from: readonly Item[]) =>
    items.map((it, i) =>
      it.kind === "text" ? namedText(it, n, shrink ? room.get(from[i].id) || null : null) : it.kind === "qr" && hasPlace(it.text) ? { ...it, text: filledWords(it.text, n) } : it,
    );
  cols = Math.max(1, Math.floor(cols));
  const stepX = box[2] - box[0] + gap;
  const stepY = box[3] - box[1] + gap;
  const renamed = name(picked, names[0], picked);
  let all: Item[] = [...existing];
  const made: Item[] = [];
  for (let k = 1; k < names.length; k++) {
    const c = k % cols;
    const r = Math.floor(k / cols);
    const copies = copiesOf(all, picked, c * stepX, r * stepY);
    const named = name(copies, names[k], picked);
    all = [...all, ...named];
    made.push(...named);
  }
  return { renamed, made };
}
