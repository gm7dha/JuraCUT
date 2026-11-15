/**
 * Copy and paste (pure): shapes go onto the computer's clipboard as text — a small JSON parcel, so they can be pasted
 * into another JuraCUT tab — and come back through the same careful reader as a saved design (`parseDocument`), so
 * nothing odd pasted from elsewhere gets in. Pasting what isn't JuraCUT's (an SVG drawing, plain words) is decided in
 * `whatIsPasted`.
 */
import { newGroupId } from "./arrange";
import { newId, parseDocument } from "./document";
import { movedItem } from "./shapes";
import type { Item } from "./types";

const FORMAT = "juracut-shapes";
/** The most text read from the clipboard (characters). */
export const MAX_PASTE = 20_000_000;

/** The shapes as clipboard text. */
export function clipText(items: readonly Item[]): string {
  return JSON.stringify({ format: FORMAT, version: 1, items });
}

export type Pasted = { kind: "shapes"; items: Item[] } | { kind: "svg"; text: string } | { kind: "words"; text: string } | { kind: "nothing" };

/** What some clipboard text is: JuraCUT's shapes (checked), an SVG drawing, or plain words. */
export function whatIsPasted(text: string): Pasted {
  const t = text.trim();
  if (!t || t.length > MAX_PASTE) return { kind: "nothing" };
  if (t.startsWith("{")) {
    try {
      const raw = JSON.parse(t) as { format?: unknown; items?: unknown };
      if (raw && raw.format === FORMAT) {
        const doc = parseDocument({ format: "juracut", items: raw.items });
        return doc && doc.items.length ? { kind: "shapes", items: doc.items } : { kind: "nothing" };
      }
    } catch {
      // Not JSON after all: words.
    }
  }
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(t)) return { kind: "svg", text: t };
  // Words: one line of up to 200 characters, or a few short lines.
  const lines = t.split(/\r?\n/).slice(0, 12);
  return { kind: "words", text: lines.join("\n").slice(0, 500) };
}

/**
 * Copies of some shapes with new ids, moved by (dx, dy): copies of a group make a new group of their own, so pasting
 * twice gives two separate groups. Names are kept (`name` may rename them, e.g. "Box (copy)").
 */
export function copiesOf(existing: readonly Item[], picked: readonly Item[], dx: number, dy: number, name: (n: string) => string = (n) => n): Item[] {
  const ids = new Set(existing.map((it) => it.id));
  const newGroups = new Map<string, string>();
  let taken: Item[] = [...existing];
  return picked.map((it) => {
    const id = newId(ids);
    ids.add(id);
    let group = it.group;
    if (group) {
      if (!newGroups.has(group)) {
        const g = newGroupId(taken);
        newGroups.set(group, g);
        taken = [...taken, { ...it, id: "_", group: g }];
      }
      group = newGroups.get(group);
    }
    const copy = movedItem({ ...it, id, name: name(it.name) }, dx, dy);
    return group ? { ...copy, group } : copy;
  });
}
