/**
 * Finding designs in the library window: grouped under headings, and a search.
 * As JuraCAD's browse.ts: every word typed must start a word of the design's
 * name, heading, description or one of its choices; matches in the name first.
 * Pure.
 */
import { LIBRARY } from "./designs";
import type { LibraryDesign } from "./kit";
import { DEFAULT_MATERIAL } from "../model/document";

/** The order headings are shown in (any others follow, in the library's order). */
export const GROUP_ORDER = ["Boxes and stands", "Signs and stamps", "Home", "Workshop"];

export interface DesignGroup {
  group: string;
  designs: LibraryDesign[];
}

export function groupDesigns(designs: readonly LibraryDesign[] = LIBRARY): DesignGroup[] {
  const names = [...GROUP_ORDER, ...designs.map((d) => d.group).filter((g) => !GROUP_ORDER.includes(g))];
  return [...new Set(names)].map((group) => ({ group, designs: designs.filter((d) => d.group === group) })).filter((g) => g.designs.length);
}

const words = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9.]+/)
    .filter(Boolean);

export function searchDesigns(query: string, designs: readonly LibraryDesign[] = LIBRARY): LibraryDesign[] {
  const wanted = words(query);
  if (!wanted.length) return [];
  const scored = designs.flatMap((d) => {
    const name = words(d.name);
    const choices = d.inputs(DEFAULT_MATERIAL).flatMap((i) => (i.choices ?? []).flatMap((c) => words(c.label)));
    const all = [...name, ...words(d.group), ...words(d.description), ...choices];
    if (!wanted.every((w) => all.some((x) => x.startsWith(w)))) return [];
    return [{ d, inName: wanted.filter((w) => name.some((x) => x.startsWith(w))).length }];
  });
  return scored.sort((a, b) => b.inName - a.inName).map((s) => s.d);
}
