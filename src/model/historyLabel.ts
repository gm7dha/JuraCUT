/**
 * What an undo step did, in a few words (pure): worked out by comparing the design before and after, so nothing has to
 * name its own changes. Shapes that weren't touched are the very same objects in both designs, so only the changed
 * ones are looked at.
 */
import { itemBox } from "./shapes";
import type { Item, JuraCUTDocument } from "./types";

const OP_WORD = { cut: "cut", score: "scored", engrave: "engraved" } as const;

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** "Rectangle 1", or "3 shapes". */
function named(items: readonly Item[]): string {
  if (items.length === 1) return `"${items[0].name}"`;
  return `${items.length} shapes`;
}

/** The fields of a shape that differ (ignoring which object it is). */
function changedKeys(a: Item, b: Item): Set<string> {
  const keys = new Set<string>();
  const all = new Set([...Object.keys(a), ...Object.keys(b)]);
  const ra = a as unknown as Record<string, unknown>;
  const rb = b as unknown as Record<string, unknown>;
  for (const k of all) if (ra[k] !== rb[k] && JSON.stringify(ra[k]) !== JSON.stringify(rb[k])) keys.add(k);
  return keys;
}

type Kind = "moved" | "resized" | "renamed" | "op" | "hidden" | "shown" | "locked" | "unlocked" | "grouped" | "ungrouped" | "changed";

function kindOf(a: Item, b: Item): Kind {
  const keys = changedKeys(a, b);
  const only = (...ks: string[]) => [...keys].every((k) => ks.includes(k));
  if (only("name")) return "renamed";
  if (only("op")) return "op";
  if (only("hidden")) return b.hidden ? "hidden" : "shown";
  if (only("locked")) return b.locked ? "locked" : "unlocked";
  if (only("group")) return b.group ? "grouped" : "ungrouped";
  if (a.kind === b.kind) {
    const ba = itemBox(a);
    const bb = itemBox(b);
    if (ba && bb) {
      const sameSize = close(ba[2] - ba[0], bb[2] - bb[0]) && close(ba[3] - ba[1], bb[3] - bb[1]);
      if (sameSize && keys.size && only("x", "y", "cx", "cy", "x1", "y1", "x2", "y2", "outlines", "path", "clip"))
        return close(ba[0], bb[0]) && close(ba[1], bb[1]) ? "changed" : "moved";
      if (!sameSize && only("x", "y", "w", "h", "r", "rx", "ry", "cx", "cy", "size", "radius", "outlines", "x1", "y1", "x2", "y2", "curve", "path"))
        return "resized";
    }
  }
  return "changed";
}

const KIND_WORDS: Record<Exclude<Kind, "op">, string> = {
  moved: "Moved",
  resized: "Resized",
  renamed: "Renamed",
  hidden: "Hid",
  shown: "Showed",
  locked: "Locked",
  unlocked: "Unlocked",
  grouped: "Grouped",
  ungrouped: "Ungrouped",
  changed: "Changed",
};

/** A few words for what changed from `before` to `after`. */
export function changeLabel(before: JuraCUTDocument, after: JuraCUTDocument): string {
  const was = new Map(before.items.map((it) => [it.id, it]));
  const now = new Map(after.items.map((it) => [it.id, it]));
  const added = after.items.filter((it) => !was.has(it.id));
  const removed = before.items.filter((it) => !now.has(it.id));
  const changed = after.items.filter((it) => was.has(it.id) && was.get(it.id) !== it);

  if (!before.items.length && !after.items.length && before.name !== after.name) return `Named the design "${after.name}"`;
  if (added.length && removed.length) {
    if (!before.items.length || !after.items.length || removed.length >= before.items.length) return added.length ? "Started a new design" : "Cleared the bed";
    return `Made ${named(removed)} into ${named(added)}`;
  }
  if (added.length && !before.items.length && before.name !== after.name) return `Opened "${after.name}"`;
  if (added.length) return `Added ${named(added)}`;
  if (removed.length) return `Deleted ${named(removed)}`;

  if (changed.length) {
    const kinds = changed.map((it) => kindOf(was.get(it.id)!, it));
    const first = kinds[0];
    if (kinds.every((k) => k === first)) {
      if (first === "op") {
        const op = changed[0].op;
        if (changed.every((it) => it.op === op)) return `Set ${named(changed)} to be ${OP_WORD[op]}`;
        return `Changed how ${named(changed)} are cut`;
      }
      if (first === "renamed" && changed.length === 1) return `Renamed "${was.get(changed[0].id)!.name}" to "${changed[0].name}"`;
      return `${KIND_WORDS[first]} ${named(changed)}`;
    }
    return `Changed ${named(changed)}`;
  }

  const order = (d: JuraCUTDocument) => d.items.map((it) => it.id).join("\n");
  if (order(before) !== order(after)) return "Changed the order";
  if (before.name !== after.name) return `Named the design "${after.name}"`;
  if (before.bed[0] !== after.bed[0] || before.bed[1] !== after.bed[1]) return `Bed size ${after.bed[0]} × ${after.bed[1]} mm`;
  if (JSON.stringify(before.material) !== JSON.stringify(after.material)) return `Material: ${after.material.name}`;
  if (!before.items.length && !after.items.length) return "Started a new design";
  return "A small change";
}

/** One line of the history list. */
export interface HistoryStep {
  /** How many steps away from now: negative = undo that many, positive = redo. 0 = the design as it is. */
  offset: number;
  label: string;
}

/**
 * The steps from the oldest kept to the newest, each labelled with the change that led to it. The first entry is
 * where the history starts ("Start").
 */
export function historySteps(past: readonly JuraCUTDocument[], present: JuraCUTDocument, future: readonly JuraCUTDocument[]): HistoryStep[] {
  const all = [...past, present, ...future];
  const here = past.length;
  return all.map((doc, i) => ({ offset: i - here, label: i === 0 ? "Where the history starts" : changeLabel(all[i - 1], doc) }));
}
