/**
 * The app's state: the design (with undo and redo), what's selected, the
 * active tool, open dialogs and passing messages. Every change to the design
 * goes through `commit`, which records an undo step; drags use
 * `dragStart`/`dragUpdate`/`dragEnd` so the whole drag is one step.
 */
import { create } from "zustand";

import { arrangeOnBed } from "../geometry/segments";
import { newDocument, newId } from "./document";
import { boxCentre, itemBox, mirroredItem, movedItem, pieceOf, rotatedItem, rotatedItemAbout } from "./shapes";
import type { Item, JuraCUTDocument, Material, Op } from "./types";

export type Tool = "select" | "rect" | "circle" | "line" | "text";
export type DialogName = "export" | "help" | "whatsNew" | "material" | null;

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "success" | "error";
}

export interface History {
  past: JuraCUTDocument[];
  present: JuraCUTDocument;
  future: JuraCUTDocument[];
}

const MAX_UNDO = 100;

export interface State {
  history: History;
  selection: string[];
  tool: Tool;
  dialog: DialogName;
  toasts: Toast[];
  theme: "light" | "dark";
  /** The file the design was last saved to or opened from. */
  fileName: string | null;
  /** The design as last saved to a file (to show "unsaved changes"). */
  savedDoc: JuraCUTDocument | null;
  /** Why the design isn't being kept in the browser (null = it is). */
  storageProblem: string | null;
  /** Bumped to ask the bed view to zoom to fit. */
  fitRequest: number;
  /** The shape whose words are being typed (text tool): its properties panel gets the focus. */
  focusItem: string | null;

  // The design.
  commit(next: JuraCUTDocument): void;
  dragStart(): void;
  dragUpdate(change: (base: JuraCUTDocument) => JuraCUTDocument): void;
  dragEnd(): void;
  undo(): void;
  redo(): void;
  newDocument(): void;
  openDocument(doc: JuraCUTDocument, fileName: string | null): void;
  renameDocument(name: string): void;
  markSaved(fileName: string): void;
  setStorageProblem(problem: string | null): void;
  setMaterial(material: Material): void;
  setBed(bed: [number, number]): void;

  // Shapes.
  addItems(items: Item[], opts?: { select?: boolean; focus?: boolean }): void;
  updateItem(id: string, change: (item: Item) => Item): void;
  updateSelected(change: (item: Item) => Item): void;
  setOp(ids: string[], op: Op): void;
  deleteSelected(): void;
  duplicateSelected(): void;
  moveSelected(dx: number, dy: number): void;
  rotateSelected(angle: number): void;
  mirrorSelected(): void;
  arrangeAll(gap?: number): void;
  reorder(id: string, to: number): void;

  // Selection and tools.
  select(ids: string[], additive?: boolean): void;
  selectAll(): void;
  clearSelection(): void;
  setTool(tool: Tool): void;
  setFocusItem(id: string | null): void;

  // The rest.
  openDialog(dialog: DialogName): void;
  showToast(text: string, kind?: Toast["kind"]): void;
  dismissToast(id: number): void;
  setTheme(theme: "light" | "dark"): void;
  requestFit(): void;
}

let dragBase: JuraCUTDocument | null = null;
let toastId = 0;
const EMPTY: string[] = [];

export const useStore = create<State>((set, get) => ({
  history: { past: [], present: newDocument(), future: [] },
  selection: EMPTY,
  tool: "select",
  dialog: null,
  toasts: [],
  theme: "light",
  fileName: null,
  savedDoc: null,
  storageProblem: null,
  fitRequest: 0,
  focusItem: null,

  commit(next) {
    const { history } = get();
    if (next === history.present) return;
    set({ history: { past: [...history.past.slice(-(MAX_UNDO - 1)), history.present], present: next, future: [] } });
  },
  dragStart() {
    dragBase = get().history.present;
  },
  dragUpdate(change) {
    if (!dragBase) dragBase = get().history.present;
    set({ history: { ...get().history, present: change(dragBase) } });
  },
  dragEnd() {
    const base = dragBase;
    dragBase = null;
    if (!base) return;
    const { history } = get();
    if (history.present === base) return;
    set({ history: { past: [...history.past.slice(-(MAX_UNDO - 1)), base], present: history.present, future: [] } });
  },
  undo() {
    const { history, selection } = get();
    if (!history.past.length) return;
    const present = history.past[history.past.length - 1];
    set({ history: { past: history.past.slice(0, -1), present, future: [history.present, ...history.future] }, selection: keepExisting(selection, present) });
  },
  redo() {
    const { history, selection } = get();
    if (!history.future.length) return;
    const present = history.future[0];
    set({ history: { past: [...history.past, history.present], present, future: history.future.slice(1) }, selection: keepExisting(selection, present) });
  },
  newDocument() {
    get().commit(newDocument());
    set({ selection: EMPTY, fileName: null, savedDoc: null, tool: "select", focusItem: null });
  },
  openDocument(doc, fileName) {
    get().commit(doc);
    set({ selection: EMPTY, fileName, savedDoc: fileName ? doc : null, tool: "select", focusItem: null });
  },
  renameDocument(name) {
    const doc = get().history.present;
    const trimmed = name.trim();
    if (trimmed && trimmed !== doc.name) get().commit({ ...doc, name: trimmed });
  },
  markSaved(fileName) {
    set({ fileName, savedDoc: get().history.present });
  },
  setStorageProblem(problem) {
    if (problem !== get().storageProblem) set({ storageProblem: problem });
  },
  setMaterial(material) {
    get().commit({ ...get().history.present, material });
  },
  setBed(bed) {
    get().commit({ ...get().history.present, bed });
  },

  addItems(items, opts = {}) {
    if (!items.length) return;
    const doc = get().history.present;
    get().commit({ ...doc, items: [...doc.items, ...items] });
    if (opts.select !== false) set({ selection: items.map((i) => i.id) });
    if (opts.focus) set({ focusItem: items[0].id });
  },
  updateItem(id, change) {
    const doc = get().history.present;
    const items = doc.items.map((it) => (it.id === id ? change(it) : it));
    if (items.some((it, i) => it !== doc.items[i])) get().commit({ ...doc, items });
  },
  updateSelected(change) {
    const { history, selection } = get();
    const doc = history.present;
    const items = doc.items.map((it) => (selection.includes(it.id) ? change(it) : it));
    if (items.some((it, i) => it !== doc.items[i])) get().commit({ ...doc, items });
  },
  setOp(ids, op) {
    const doc = get().history.present;
    const items = doc.items.map((it) => (ids.includes(it.id) && it.op !== op ? { ...it, op } : it));
    if (items.some((it, i) => it !== doc.items[i])) get().commit({ ...doc, items });
  },
  deleteSelected() {
    const { history, selection } = get();
    if (!selection.length) return;
    const doc = history.present;
    get().commit({ ...doc, items: doc.items.filter((it) => !selection.includes(it.id)) });
    set({ selection: EMPTY, focusItem: null });
  },
  duplicateSelected() {
    const { history, selection } = get();
    const doc = history.present;
    const picked = doc.items.filter((it) => selection.includes(it.id));
    if (!picked.length) return;
    const ids = new Set(doc.items.map((it) => it.id));
    const copies = picked.map((it) => {
      const id = newId(ids);
      ids.add(id);
      return movedItem({ ...it, id, name: copyName(it.name) }, 10, -10);
    });
    get().commit({ ...doc, items: [...doc.items, ...copies] });
    set({ selection: copies.map((c) => c.id) });
  },
  moveSelected(dx, dy) {
    get().updateSelected((it) => movedItem(it, dx, dy));
  },
  rotateSelected(angle) {
    get().updateSelected((it) => rotatedItem(it, angle));
  },
  mirrorSelected() {
    get().updateSelected(mirroredItem);
  },
  arrangeAll(gap = 5) {
    const doc = get().history.present;
    // Shapes inside another shape (a hole, words on a tag) travel with it as one piece.
    const parents = pieceOf(doc.items);
    const shown = doc.items.filter((it) => !it.hidden && itemBox(it));
    const pieces = new Map<string, Item[]>();
    for (const it of shown) {
      const root = parents.get(it.id) ?? it.id;
      pieces.set(root, [...(pieces.get(root) ?? []), it]);
    }
    if (!pieces.size) return;
    const boxOf = (members: Item[]): [number, number, number, number] => {
      const boxes = members.map((m) => itemBox(m)!);
      return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
    };
    // Biggest first in rows across the bed, a quarter turn when that's the only way a piece fits; what won't fit goes beside the bed.
    const layout = arrangeOnBed(
      [...pieces].map(([id, members]) => {
        const b = boxOf(members);
        return { id, size: [b[2] - b[0] + gap, b[3] - b[1] + gap] };
      }),
      doc.bed,
      0,
    );
    const moved = new Map<string, Item>();
    for (const [id, members] of pieces) {
      const place = layout.places.find((p) => p.id === id);
      if (!place) continue;
      const before = boxOf(members);
      const centre = boxCentre(before);
      const turned = place.turned ? members.map((m) => rotatedItemAbout(m, 90, centre)) : members;
      const b = boxOf(turned);
      const dx = place.x - (b[0] + b[2]) / 2;
      const dy = place.y - (b[1] + b[3]) / 2;
      for (const m of turned) moved.set(m.id, movedItem(m, dx, dy));
    }
    get().commit({ ...doc, items: doc.items.map((it) => moved.get(it.id) ?? it) });
    if (layout.tooBig.length || layout.noRoom.length) {
      const n = layout.tooBig.length + layout.noRoom.length;
      get().showToast(`${n} ${n === 1 ? "piece doesn't" : "pieces don't"} fit on the bed with the others, so ${n === 1 ? "it's" : "they're"} placed beside it.`, "info");
    }
  },
  reorder(id, to) {
    const doc = get().history.present;
    const from = doc.items.findIndex((it) => it.id === id);
    if (from < 0 || to < 0 || to >= doc.items.length || from === to) return;
    const items = [...doc.items];
    const [it] = items.splice(from, 1);
    items.splice(to, 0, it);
    get().commit({ ...doc, items });
  },

  select(ids, additive = false) {
    const { selection } = get();
    let next: string[];
    if (!additive) next = ids;
    else {
      next = [...selection];
      for (const id of ids) {
        const k = next.indexOf(id);
        if (k >= 0) next.splice(k, 1);
        else next.push(id);
      }
    }
    if (!next.length) next = EMPTY;
    if (next.length !== selection.length || next.some((id, i) => id !== selection[i])) set({ selection: next });
  },
  selectAll() {
    const ids = get().history.present.items.filter((it) => !it.hidden).map((it) => it.id);
    set({ selection: ids.length ? ids : EMPTY });
  },
  clearSelection() {
    if (get().selection.length) set({ selection: EMPTY });
  },
  setTool(tool) {
    if (tool !== get().tool) set({ tool });
  },
  setFocusItem(id) {
    set({ focusItem: id });
  },

  openDialog(dialog) {
    set({ dialog });
  },
  showToast(text, kind = "info") {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => get().dismissToast(id), kind === "error" ? 9000 : 5000);
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
  setTheme(theme) {
    if (theme !== get().theme) set({ theme });
  },
  requestFit() {
    set({ fitRequest: get().fitRequest + 1 });
  },
}));

function keepExisting(selection: string[], doc: JuraCUTDocument): string[] {
  const kept = selection.filter((id) => doc.items.some((it) => it.id === id));
  return kept.length ? kept : EMPTY;
}

/** "Rectangle" → "Rectangle copy", "Rectangle copy" → "Rectangle copy 2". */
export function copyName(name: string): string {
  const m = /^(.*?) copy(?: (\d+))?$/.exec(name);
  if (!m) return `${name} copy`;
  return `${m[1]} copy ${(Number(m[2]) || 1) + 1}`;
}

// Selectors (shared constants, so React never loops on a fresh array).
export const useDocument = () => useStore((s) => s.history.present);
export const useSelection = () => useStore((s) => s.selection);
export const canUndo = (s: State) => s.history.past.length > 0;
export const canRedo = (s: State) => s.history.future.length > 0;
export const selectedItems = (s: State): Item[] => s.history.present.items.filter((it) => s.selection.includes(it.id));
