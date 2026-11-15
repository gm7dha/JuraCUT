/**
 * Copies with different words (pure) — LightBurn's "variable text": one copy of the selection for each name in a list
 * (or each number), laid out in a grid a gap apart. In every words shape of a copy, "#" is replaced by the name — or,
 * with no "#", the words become the name. With `shrink`, words that come out wider than the first copy's are made
 * smaller to fit, so long names still fit the tag.
 */
import { copiesOf } from "./clipboard";
import { boxOfItems } from "./repeat";
import { itemBox, movedItem } from "./shapes";
import type { Item, TextItem } from "./types";

/** The most names at once. */
export const MOST_NAMES = 500;

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
export function namedText(t: TextItem, name: string, maxWidth: number | null): TextItem {
  const text = t.text.includes("#") ? t.text.split("#").join(name) : name;
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
export function namedCopies(existing: readonly Item[], picked: readonly Item[], names: string[], cols: number, gap: number, shrink: boolean): { renamed: Item[]; made: Item[] } {
  const box = boxOfItems(picked);
  if (!box || !names.length || !picked.some((it) => it.kind === "text")) return { renamed: [...picked], made: [] };
  const width = (t: TextItem) => {
    const b = itemBox(t);
    return b ? b[2] - b[0] : 0;
  };
  // Each words shape's room: as wide as it is now (or as its "#" text with the first name, if wider).
  const room = new Map(picked.filter((it): it is TextItem => it.kind === "text").map((t) => [t.id, width(t)]));
  const name = (items: readonly Item[], n: string, from: readonly Item[]) =>
    items.map((it, i) => (it.kind === "text" ? namedText(it, n, shrink ? room.get(from[i].id) || null : null) : it));
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
