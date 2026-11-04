/**
 * Keeping the design in the browser (localStorage), so a refresh brings it
 * back. Pure: the storage is passed in, so it's tested without a browser.
 */
import { parseDocument, serializeDocument } from "./document";
import type { JuraCUTDocument } from "./types";

export const STORAGE_KEY = "juracut.document.v1";

export interface KeepStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Keep the design. Returns false when the browser won't (full, or storage blocked). */
export function keepInBrowser(storage: KeepStorage, doc: JuraCUTDocument): boolean {
  try {
    storage.setItem(STORAGE_KEY, serializeDocument(doc));
    return true;
  } catch {
    return false;
  }
}

/** The design kept in the browser, or null when there's none (or it's damaged). */
export function readKept(storage: Pick<KeepStorage, "getItem">): JuraCUTDocument | null {
  try {
    const text = storage.getItem(STORAGE_KEY);
    return text ? parseDocument(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

export const KEEP_PROBLEM = "This design is too big for the browser to keep, so your latest changes would be lost if the page is closed or reloaded. Use Save to keep it as a file.";
