/**
 * The material library on this computer, shared by the Settings menu and the
 * Materials window: read once from the browser, written on every change.
 */
import { useSyncExternalStore } from "react";

import { readMaterials, writeMaterials, type LibraryMaterial } from "../model/materials";

const storage = (() => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
})();

let list: LibraryMaterial[] = readMaterials(storage);
const listeners = new Set<() => void>();

export function useMaterials(): LibraryMaterial[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => list,
    () => list,
  );
}

export const getMaterials = () => list;

/** Replace the library (and keep it). Returns false when the browser won't keep it. */
export function setMaterials(next: LibraryMaterial[]): boolean {
  list = next;
  listeners.forEach((l) => l());
  return writeMaterials(storage, next);
}
