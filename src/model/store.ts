/**
 * The app's state: the design (with undo and redo), what's selected, the
 * active tool, open dialogs and passing messages. Every change to the design
 * goes through `commit`, which records an undo step; drags use
 * `dragStart`/`dragUpdate`/`dragEnd` so the whole drag is one step.
 */
import { create } from "zustand";

import { arrangeOnBed } from "../geometry/segments";
import { newDocument, newId } from "./document";
import { copiesOf } from "./clipboard";
import { combinedRings, insetRings, outlineRings, ringsShape, type CombineHow } from "./combine";
import { MOST_COPIES, repeatedItems, roundItems } from "./repeat";
import { brokenApart } from "./breakApart";
import { namedCopies } from "./names";
import { aligned, centredOnBed, distributed, grouped, mirroredPieces, tidyGroups, turnedPieces, ungrouped, withGroups, type AlignAgainst, type AlignTo } from "./arrange";
import { packPieces } from "../geometry/pack";
import { baseOf, boxCentre, itemBox, itemOutlines, movedItem, pieceOf, rotatedItemAbout } from "./shapes";
import { editable, type NodeRef } from "./nodes";
import type { Item, JuraCUTDocument, Material, Op, Outline } from "./types";

export type Tool = "select" | "rect" | "circle" | "polygon" | "line" | "text" | "qr";
export type DialogName = "export" | "help" | "whatsNew" | "material" | "library" | "trace" | null;

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
  /** What the last fit was for: the whole bed, or the selected shapes. */
  fitTarget: "bed" | "selection";
  /** The shape whose words are being typed (text tool): its properties panel gets the focus. */
  focusItem: string | null;
  /** The shape whose points are being edited (Edit points), and the point picked in it. */
  pointsOf: string | null;
  pickedNode: NodeRef | null;
  /** What Line up lines pieces up against (kept in this browser). */
  alignAgainst: AlignAgainst;
  /** A picture waiting to be traced (the Trace window shows it). */
  picture: { name: string; url: string } | null;

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
  /** Copies of shapes (from the clipboard), moved `offset` mm right and down, selected. */
  pasteItems(items: Item[], offset: number): void;
  /** The selected shapes made one: joined, the others cut out of the biggest, or only where they overlap. */
  combineSelected(how: CombineHow): void;
  /** A new shape round the selection, `distance` mm out (gaps closed in filled unless `fillGaps` is false). */
  outlineSelected(distance: number, fillGaps?: boolean, inside?: boolean): void;
  /** Copies of the selection in a grid (`cols` × `rows`, the originals the first, bottom left), `gap` mm apart. */
  repeatSelected(cols: number, rows: number, gapX: number, gapY: number): void;
  /** Copies of the selection round a circle (`count` in all), turned with it or not. */
  repeatRoundSelected(count: number, radius: number, turn: boolean): void;
  /** A copy of the selection for each name (its words become the name), `cols` across, `gap` apart. */
  nameCopiesSelected(names: string[], cols: number, gap: number, shrink: boolean): void;
  /** Start editing a shape's points (it becomes a free shape of lines and curves, one undo step). */
  editPoints(id: string): void;
  stopEditingPoints(): void;
  pickNode(node: NodeRef | null): void;
  /** A change to the edited shape's points (one undo step); a change that returns null is refused. */
  changePoints(change: (outlines: Outline[]) => Outline[] | null): void;
  /** Shapes made of separate pieces split into one shape per piece. */
  breakApartSelected(): void;
  /** Select every shape the laser cuts (or scores, or engraves). */
  selectOp(op: Op): void;
  /** Hide (or show) every shape of one colour. */
  setOpHidden(op: Op, hidden: boolean): void;
  moveSelected(dx: number, dy: number): void;
  rotateSelected(angle: number): void;
  mirrorSelected(): void;
  arrangeAll(gap?: number): void;
  /** Fit pieces together by their real shapes (and into each other's holes), turning them if `turns`. */
  packAll(gap?: number, turns?: boolean): void;
  groupSelected(): void;
  ungroupSelected(): void;
  alignSelected(to: AlignTo): void;
  setAlignAgainst(against: AlignAgainst): void;
  /** Move the selection, as it is, to the middle of the bed. */
  centreSelected(axis?: "x" | "y" | "both"): void;
  distributeSelected(axis: "x" | "y", gap?: number): void;
  reorder(id: string, to: number): void;
  /** The selected shapes moved to the end of the list (drawn on top, "front") or the start ("back"), keeping their order. */
  orderSelected(where: "front" | "back"): void;

  // Selection and tools.
  select(ids: string[], additive?: boolean): void;
  selectAll(): void;
  clearSelection(): void;
  setTool(tool: Tool): void;
  setFocusItem(id: string | null): void;
  /** Open the Trace window for a picture (a data: URL). */
  openTrace(name: string, url: string): void;

  // The rest.
  openDialog(dialog: DialogName): void;
  showToast(text: string, kind?: Toast["kind"]): void;
  dismissToast(id: number): void;
  setTheme(theme: "light" | "dark"): void;
  requestFit(target?: "bed" | "selection"): void;
}

let dragBase: JuraCUTDocument | null = null;

const AGAINST_KEY = "juracut.alignAgainst";
function rememberedAgainst(): AlignAgainst {
  try {
    const v = globalThis.localStorage?.getItem(AGAINST_KEY);
    return v === "key" || v === "bed" ? v : "each";
  } catch {
    return "each";
  }
}
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
  fitTarget: "bed",
  focusItem: null,
  pointsOf: null,
  pickedNode: null,
  picture: null,
  alignAgainst: rememberedAgainst(),

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
    // Photos are always engraved.
    const items = doc.items.map((it) => (ids.includes(it.id) && it.op !== op && it.kind !== "picture" ? { ...it, op } : it));
    if (items.some((it, i) => it !== doc.items[i])) get().commit({ ...doc, items });
  },
  deleteSelected() {
    const { history, selection } = get();
    if (!selection.length) return;
    const doc = history.present;
    get().commit({ ...doc, items: tidyGroups(doc.items.filter((it) => !selection.includes(it.id))) });
    set({ selection: EMPTY, focusItem: null });
  },
  duplicateSelected() {
    const { history, selection } = get();
    const doc = history.present;
    const picked = doc.items.filter((it) => selection.includes(it.id));
    if (!picked.length) return;
    const copies = copiesOf(doc.items, picked, 10, -10, copyName);
    get().commit({ ...doc, items: [...doc.items, ...copies] });
    set({ selection: copies.map((c) => c.id) });
  },
  pasteItems(items, offset) {
    if (!items.length) return;
    const doc = get().history.present;
    const copies = copiesOf(doc.items, items, offset, -offset);
    get().commit({ ...doc, items: [...doc.items, ...copies] });
    set({ selection: copies.map((c) => c.id), tool: "select" });
  },
  combineSelected(how) {
    const { history, selection } = get();
    const doc = history.present;
    const picked = doc.items.filter((it) => selection.includes(it.id) && it.kind !== "picture");
    const rings = combinedRings(picked, how);
    if (!rings) {
      get().showToast(how === "overlap" && picked.length >= 2 ? "These shapes don't overlap anywhere." : how === "cutOut" && picked.length >= 2 ? "Nothing is left once they're cut out." : "Pick two or more shapes with an area (not lines) to combine.", "info");
      return;
    }
    const names = { join: "Joined shape", cutOut: "Cut-out shape", overlap: "Overlap" } as const;
    const ids = new Set(picked.map((it) => it.id));
    const at = doc.items.findIndex((it) => ids.has(it.id));
    const id = newId(doc.items.map((it) => it.id));
    const shape = ringsShape(id, names[how], picked[0].op, rings);
    const items = doc.items.filter((it) => !ids.has(it.id));
    items.splice(Math.min(at, items.length), 0, shape);
    get().commit({ ...doc, items: tidyGroups(items) });
    set({ selection: [id], focusItem: null });
  },
  outlineSelected(distance, fillGaps = true, inside = false) {
    const { history, selection } = get();
    const doc = history.present;
    const picked = doc.items.filter((it) => selection.includes(it.id));
    if (!picked.length || !(distance > 0)) return;
    const rings = inside ? insetRings(picked, distance) : outlineRings(picked, distance, fillGaps);
    if (!rings.length) {
      get().showToast(inside ? `Nothing is left ${distance} mm inside: the shapes are too thin for that.` : "There's nothing to go round (photos have no outline).", "info");
      return;
    }
    const id = newId(doc.items.map((it) => it.id));
    // Behind the shapes it goes round, cut.
    const at = doc.items.findIndex((it) => selection.includes(it.id));
    const items = [...doc.items];
    // An inside outline goes on top (it's within the shape); an outside one behind.
    items.splice(inside ? at + 1 : at, 0, ringsShape(id, inside ? "Inside outline" : "Outline", "cut", rings));
    get().commit({ ...doc, items });
    set({ selection: [id], focusItem: null });
  },
  repeatSelected(cols, rows, gapX, gapY) {
    const { history, selection } = get();
    const doc = history.present;
    const picked = doc.items.filter((it) => selection.includes(it.id));
    if (!picked.length) return;
    if (cols * rows > MOST_COPIES) {
      get().showToast(`That's more than ${MOST_COPIES} copies: try fewer rows or columns.`, "info");
      return;
    }
    const made = repeatedItems(doc.items, picked, cols, rows, gapX, gapY);
    if (!made.length) return;
    get().commit({ ...doc, items: [...doc.items, ...made] });
    set({ selection: [...selection, ...made.map((it) => it.id)] });
  },
  repeatRoundSelected(count, radius, turn) {
    const { history, selection } = get();
    const doc = history.present;
    const picked = doc.items.filter((it) => selection.includes(it.id));
    if (!picked.length || count < 2) return;
    if (count > MOST_COPIES) {
      get().showToast(`That's more than ${MOST_COPIES} copies: try fewer.`, "info");
      return;
    }
    const made = roundItems(doc.items, picked, count, radius, turn);
    if (!made.length) return;
    get().commit({ ...doc, items: [...doc.items, ...made] });
    set({ selection: [...selection, ...made.map((it) => it.id)] });
  },
  nameCopiesSelected(names, cols, gap, shrink) {
    const { history, selection } = get();
    const doc = history.present;
    const picked = doc.items.filter((it) => selection.includes(it.id));
    if (!picked.some((it) => it.kind === "text" || (it.kind === "qr" && it.text.includes("#")))) {
      get().showToast("Pick some words (and anything that goes with them, like a tag) first.", "info");
      return;
    }
    if (!names.length) return;
    const { renamed, made } = namedCopies(doc.items, picked, names, cols, gap, shrink);
    const byId = new Map(renamed.map((it) => [it.id, it]));
    get().commit({ ...doc, items: [...doc.items.map((it) => byId.get(it.id) ?? it), ...made] });
    set({ selection: [...selection, ...made.map((it) => it.id)] });
    const copies = names.length - 1;
    if (copies) get().showToast(`Made ${copies} ${copies === 1 ? "copy" : "copies"}: ${names.length} in all, each with its own words.`, "info");
  },
  editPoints(id) {
    const doc = get().history.present;
    const it = doc.items.find((i) => i.id === id);
    if (!it) return;
    if (it.kind === "picture") {
      get().showToast("A photo has no points to edit.", "info");
      return;
    }
    const ready = it.kind === "shape" && it.outlines.every((o) => o.segments.every((s) => s.kind === "line" || s.kind === "bezier"));
    if (!ready) {
      const shape: Item = { ...baseOf(it), kind: "shape", outlines: editable(itemOutlines(it)) };
      get().commit({ ...doc, items: doc.items.map((i) => (i.id === id ? shape : i)) });
    }
    set({ selection: [id], pointsOf: id, pickedNode: null, tool: "select", focusItem: null });
  },
  stopEditingPoints() {
    if (get().pointsOf) set({ pointsOf: null, pickedNode: null });
  },
  pickNode(node) {
    set({ pickedNode: node });
  },
  changePoints(change) {
    const { history, pointsOf } = get();
    const doc = history.present;
    const it = doc.items.find((i) => i.id === pointsOf);
    if (!it || it.kind !== "shape") return;
    const outlines = change(it.outlines);
    if (!outlines) return;
    get().commit({ ...doc, items: doc.items.map((i) => (i.id === it.id ? { ...it, outlines } : i)) });
  },
  breakApartSelected() {
    const { history, selection } = get();
    const doc = history.present;
    const ids = new Set(doc.items.map((it) => it.id));
    const fresh = () => {
      const id = newId(ids);
      ids.add(id);
      return id;
    };
    const picked = new Set<string>();
    let split = 0;
    const items = doc.items.flatMap((it) => {
      if (!selection.includes(it.id)) return [it];
      const parts = brokenApart(it, fresh);
      if (parts.length > 1) split++;
      parts.forEach((p) => picked.add(p.id));
      return parts;
    });
    if (!split) {
      get().showToast("Nothing to break apart: each selected shape is already one piece.", "info");
      return;
    }
    get().commit({ ...doc, items: tidyGroups(items) });
    set({ selection: [...picked], focusItem: null });
  },
  selectOp(op) {
    const ids = get().history.present.items.filter((it) => it.op === op && !it.hidden).map((it) => it.id);
    set({ selection: ids.length ? ids : EMPTY });
  },
  setOpHidden(op, hidden) {
    const doc = get().history.present;
    const items = doc.items.map((it) => (it.op === op && !!it.hidden !== hidden ? { ...it, hidden } : it));
    if (items.some((it, i) => it !== doc.items[i])) get().commit({ ...doc, items });
    if (hidden) {
      const visible = get().selection.filter((id) => !items.find((it) => it.id === id)?.hidden);
      if (visible.length !== get().selection.length) set({ selection: visible.length ? visible : EMPTY });
    }
  },
  moveSelected(dx, dy) {
    get().updateSelected((it) => movedItem(it, dx, dy));
  },
  rotateSelected(angle) {
    const { history, selection } = get();
    if (selection.length) get().commit({ ...history.present, items: turnedPieces(history.present.items, selection, angle) });
  },
  mirrorSelected() {
    const { history, selection } = get();
    if (selection.length) get().commit({ ...history.present, items: mirroredPieces(history.present.items, selection) });
  },
  groupSelected() {
    const { history, selection } = get();
    if (selection.length < 2) return;
    get().commit({ ...history.present, items: grouped(history.present.items, selection) });
  },
  ungroupSelected() {
    const { history, selection } = get();
    if (!selection.length) return;
    get().commit({ ...history.present, items: ungrouped(history.present.items, selection) });
  },
  alignSelected(to) {
    const { history, selection, alignAgainst } = get();
    if (!selection.length) return;
    const items = aligned(history.present.items, selection, to, history.present.bed, alignAgainst);
    if (items.some((it, i) => it !== history.present.items[i])) get().commit({ ...history.present, items });
  },
  setAlignAgainst(against) {
    if (against === get().alignAgainst) return;
    set({ alignAgainst: against });
    try {
      globalThis.localStorage?.setItem(AGAINST_KEY, against);
    } catch {
      // Not remembered; fine.
    }
  },
  centreSelected(axis = "both") {
    const { history, selection } = get();
    if (!selection.length) return;
    const items = centredOnBed(history.present.items, selection, history.present.bed, axis);
    if (items.some((it, i) => it !== history.present.items[i])) get().commit({ ...history.present, items });
  },
  distributeSelected(axis, gap) {
    const { history, selection } = get();
    get().commit({ ...history.present, items: distributed(history.present.items, selection, axis, gap) });
  },
  arrangeAll(gap = 5) {
    const doc = get().history.present;
    const pieces = bedPieces(doc.items);
    if (!pieces.size) return;
    // Biggest first in rows across the bed, a quarter turn when that's the only way a piece fits; what won't fit goes beside the bed.
    const layout = arrangeOnBed(
      [...pieces].map(([id, members]) => {
        const b = unionBox(members);
        return { id, size: [b[2] - b[0] + gap, b[3] - b[1] + gap] };
      }),
      doc.bed,
      0,
    );
    const moved = new Map<string, Item>();
    for (const [id, members] of pieces) {
      const place = layout.places.find((p) => p.id === id);
      if (!place) continue;
      const centre = boxCentre(unionBox(members));
      const turned = place.turned ? members.map((m) => rotatedItemAbout(m, 90, centre)) : members;
      const b = unionBox(turned);
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
  packAll(gap = 3, turns = true) {
    const doc = get().history.present;
    const pieces = bedPieces(doc.items);
    if (!pieces.size) return;
    const result = packPieces(
      [...pieces].map(([id, members]) => ({ id, outlines: members.flatMap((m) => itemOutlines(m)) })),
      doc.bed,
      { gap, turns, cell: 1 },
    );
    const moved = new Map<string, Item>();
    for (const place of result.places) {
      const members = pieces.get(place.id)!;
      const centre = boxCentre(unionBox(members));
      const turned = place.turns ? members.map((m) => rotatedItemAbout(m, 90 * place.turns, centre)) : members;
      const b = unionBox(turned);
      for (const m of turned) moved.set(m.id, movedItem(m, place.x - b[0], place.y - b[1]));
    }
    // What didn't fit goes in a row beside the bed.
    let x = doc.bed[0] + 10;
    for (const id of result.left) {
      const members = pieces.get(id)!;
      const b = unionBox(members);
      for (const m of members) moved.set(m.id, movedItem(m, x - b[0], -b[1]));
      x += b[2] - b[0] + gap;
    }
    get().commit({ ...doc, items: doc.items.map((it) => moved.get(it.id) ?? it) });
    const n = result.left.length;
    if (n) get().showToast(`${n} ${n === 1 ? "piece doesn't" : "pieces don't"} fit on the bed with the others, so ${n === 1 ? "it's" : "they're"} placed beside it.`, "info");
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

  orderSelected(where) {
    const { history, selection } = get();
    const doc = history.present;
    const picked = doc.items.filter((it) => selection.includes(it.id));
    if (!picked.length) return;
    const rest = doc.items.filter((it) => !selection.includes(it.id));
    const items = where === "front" ? [...rest, ...picked] : [...picked, ...rest];
    if (items.every((it, i) => it === doc.items[i])) return;
    get().commit({ ...doc, items });
  },

  select(picked, additive = false) {
    const { selection, history } = get();
    // A shape in a group brings the rest of its group.
    const ids = withGroups(history.present.items, picked);
    let next: string[];
    if (!additive) next = ids;
    else {
      // Shift-click toggles the whole piece: off if it was all selected, else on.
      const allIn = ids.every((id) => selection.includes(id));
      next = allIn ? selection.filter((id) => !ids.includes(id)) : [...selection, ...ids.filter((id) => !selection.includes(id))];
    }
    if (!next.length) next = EMPTY;
    if (get().pointsOf && !next.includes(get().pointsOf!)) set({ pointsOf: null, pickedNode: null });
    if (next.length !== selection.length || next.some((id, i) => id !== selection[i])) set({ selection: next });
  },
  selectAll() {
    const ids = get().history.present.items.filter((it) => !it.hidden).map((it) => it.id);
    set({ selection: ids.length ? ids : EMPTY });
  },
  clearSelection() {
    if (get().pointsOf) set({ pointsOf: null, pickedNode: null });
    if (get().selection.length) set({ selection: EMPTY });
  },
  setTool(tool) {
    if (tool !== get().tool) set({ tool });
  },
  setFocusItem(id) {
    set({ focusItem: id });
  },
  openTrace(name, url) {
    set({ picture: { name, url }, dialog: "trace" });
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
  requestFit(target = "bed") {
    set({ fitRequest: get().fitRequest + 1, fitTarget: target === "selection" && get().selection.length ? "selection" : "bed" });
  },
}));

/**
 * The design's shapes as pieces for laying out: a group is one piece, and a shape inside another (a hole, words on a
 * tag) goes with that one — and with its group, if it has one. Hidden and empty shapes are left where they are.
 */
function bedPieces(items: readonly Item[]): Map<string, Item[]> {
  const parents = pieceOf(items);
  const pieces = new Map<string, Item[]>();
  for (const it of items) {
    if (it.hidden || !itemBox(it)) continue;
    const holder = items.find((x) => x.id === (parents.get(it.id) ?? it.id)) ?? it;
    const root = it.group ? `group:${it.group}` : holder.group ? `group:${holder.group}` : holder.id;
    pieces.set(root, [...(pieces.get(root) ?? []), it]);
  }
  return pieces;
}

function unionBox(members: Item[]): [number, number, number, number] {
  const boxes = members.map((m) => itemBox(m)!);
  return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
}

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
