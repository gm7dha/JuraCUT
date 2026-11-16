/**
 * Recent designs in this browser (IndexedDB, which has room for photos): the design on the bed is kept under its own id
 * a couple of seconds after each change; starting a new design or opening another one starts a new id, after keeping
 * the old one. If the browser has no IndexedDB (or it's blocked), they're kept for this visit only.
 */
import { keepRecent, memoryStore, openRecent, recentList, type RecentMeta, type RecentStore } from "../model/recent";
import { useStore } from "../model/store";

const DB = "juracut";
const ID_KEY = "juracut.recentId";

function idbStore(): RecentStore | null {
  if (typeof indexedDB === "undefined") return null;
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("recentMeta", { keyPath: "id" });
        req.result.createObjectStore("recentDocs");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  let db: Promise<IDBDatabase> | null = null;
  const tx = async <T>(stores: string[], mode: IDBTransactionMode, run: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> => {
    db ??= open();
    const t = (await db).transaction(stores, mode);
    const req = run(t);
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  };
  return {
    list: async () => ((await tx(["recentMeta"], "readonly", (t) => t.objectStore("recentMeta").getAll())) as RecentMeta[]) ?? [],
    put: async (meta, text) => {
      await tx(["recentMeta", "recentDocs"], "readwrite", (t) => {
        t.objectStore("recentMeta").put(meta);
        t.objectStore("recentDocs").put(text, meta.id);
      });
    },
    get: async (id) => ((await tx(["recentDocs"], "readonly", (t) => t.objectStore("recentDocs").get(id))) as string | undefined) ?? null,
    remove: async (id) => {
      await tx(["recentMeta", "recentDocs"], "readwrite", (t) => {
        t.objectStore("recentMeta").delete(id);
        t.objectStore("recentDocs").delete(id);
      });
    },
  };
}

let store: RecentStore = idbStore() ?? memoryStore();
const fresh = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let currentId = (() => {
  try {
    return localStorage.getItem(ID_KEY) || fresh();
  } catch {
    return fresh();
  }
})();
const rememberId = () => {
  try {
    localStorage.setItem(ID_KEY, currentId);
  } catch {
    // Kept for this visit only.
  }
};

let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

/** Keep the design on the bed now (under its id). */
export async function keepNow(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  try {
    await keepRecent(store, currentId, useStore.getState().history.present);
  } catch {
    // The browser said no (full, or private browsing): keep them for this visit instead.
    store = memoryStore();
    await keepRecent(store, currentId, useStore.getState().history.present).catch(() => {});
  }
  changed();
}

/** Start keeping the design as it changes (call once, after the kept design is back). */
export function startRecent(): () => void {
  rememberId();
  return useStore.subscribe((s, prev) => {
    if (s.history.present === prev.history.present) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void keepNow(), 2000);
  });
}

/** The design on the bed is about to be replaced by another (New, Open): keep it, then start a new id. */
export async function beforeOtherDesign(): Promise<void> {
  await keepNow();
  currentId = fresh();
  rememberId();
}

export const listRecent = () => recentList(store);
export const forgetRecent = async (id: string) => {
  await store.remove(id);
  changed();
};
export function onRecentChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Open a kept design (the one on the bed is kept first). */
export async function openRecentDesign(id: string): Promise<boolean> {
  if (id === currentId) return true;
  const doc = await openRecent(store, id);
  if (!doc) {
    useStore.getState().showToast("That design couldn't be read back.", "error");
    return false;
  }
  await keepNow();
  currentId = id;
  rememberId();
  // A fresh start (no undo back into the other design, which would then be kept under this one's name).
  useStore.setState({ history: { past: [], present: doc, future: [] }, selection: [], fileName: null, savedDoc: null, tool: "select" });
  useStore.getState().requestFit();
  return true;
}

export const isCurrent = (id: string) => id === currentId;
