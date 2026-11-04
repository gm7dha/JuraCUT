/**
 * The material library: what the laser cuts, with each material's thickness,
 * kerf (how wide a cut the beam leaves) and notes. A starter list comes with
 * the app; the user's own list is kept on this computer. A design carries a
 * copy of its material, so a file opened elsewhere still knows its kerf.
 * Pure: the storage is passed in, so it's tested without a browser.
 */
import type { Material } from "./types";

export interface LibraryMaterial extends Material {
  /** Anything worth remembering: power and speed that worked, a supplier, "cut from the back". */
  notes: string;
}

export const MATERIALS_KEY = "juracut.materials.v1";
export const MAX_MATERIALS = 200;

/** A starter list: typical kerfs for a CO2 laser like the R1 (check with a test cut and adjust). */
export const DEFAULT_MATERIALS: LibraryMaterial[] = [
  { name: "3 mm plywood", thickness: 3, kerf: 0.15, notes: "" },
  { name: "6 mm plywood", thickness: 6, kerf: 0.2, notes: "" },
  { name: "3 mm MDF", thickness: 3, kerf: 0.15, notes: "" },
  { name: "3 mm acrylic", thickness: 3, kerf: 0.1, notes: "Leave the protective film on for a clean cut" },
  { name: "5 mm acrylic", thickness: 5, kerf: 0.15, notes: "" },
  { name: "2 mm card", thickness: 2, kerf: 0.1, notes: "" },
  { name: "1.5 mm leather", thickness: 1.5, kerf: 0.1, notes: "" },
  { name: "Anodised aluminium (engrave only)", thickness: 1, kerf: 0, notes: "Engrave and score only — a CO2 laser doesn't cut metal" },
];

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback);

/** One material from parsed JSON, or null when it isn't one. */
export function parseMaterial(raw: unknown): LibraryMaterial | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const name = typeof m.name === "string" ? m.name.trim().slice(0, 80) : "";
  if (!name) return null;
  return { name, thickness: num(m.thickness, 3), kerf: num(m.kerf, 0.15), notes: typeof m.notes === "string" ? m.notes.slice(0, 500) : "" };
}

export function parseMaterials(raw: unknown): LibraryMaterial[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map(parseMaterial).filter((m): m is LibraryMaterial => !!m).slice(0, MAX_MATERIALS);
}

interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The library kept on this computer, or the starter list when there's none yet (or it's damaged). */
export function readMaterials(storage: Pick<Storage, "getItem"> | null): LibraryMaterial[] {
  try {
    const text = storage?.getItem(MATERIALS_KEY);
    const list = text ? parseMaterials(JSON.parse(text)) : null;
    return list && list.length ? list : DEFAULT_MATERIALS.map((m) => ({ ...m }));
  } catch {
    return DEFAULT_MATERIALS.map((m) => ({ ...m }));
  }
}

/** Keep the library on this computer. Returns false when the browser won't. */
export function writeMaterials(storage: Storage | null, list: LibraryMaterial[]): boolean {
  try {
    storage?.setItem(MATERIALS_KEY, JSON.stringify(list.slice(0, MAX_MATERIALS)));
    return true;
  } catch {
    return false;
  }
}

/** A name not already in the list ("3 mm plywood" → "3 mm plywood 2"). */
export function freeName(list: readonly LibraryMaterial[], wanted: string): string {
  const base = wanted.trim() || "New material";
  if (!list.some((m) => m.name === base)) return base;
  for (let k = 2; ; k++) {
    const name = `${base} ${k}`;
    if (!list.some((m) => m.name === name)) return name;
  }
}

/** The library entry a design's material matches by name (null = a material of its own). */
export function findMaterial(list: readonly LibraryMaterial[], material: Material): LibraryMaterial | null {
  return list.find((m) => m.name === material.name) ?? null;
}

/** What a design keeps of a library material. */
export const materialForDesign = (m: LibraryMaterial): Material => ({ name: m.name, thickness: m.thickness, kerf: m.kerf });
