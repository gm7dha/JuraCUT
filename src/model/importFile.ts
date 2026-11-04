/**
 * Bringing a drawing file (SVG or DXF) into a design as shapes: the outlines
 * are grouped by what the laser does with them (one shape per group, so the
 * list stays short), placed on the bed, and summed up in plain words.
 */
import { dxfOutlines, parseDxf, DxfError } from "../geometry/dxfImport";
import { svgOutlines, SvgError } from "../geometry/svgImport";
import { pathsBox } from "../geometry/segments";
import { newId, nameFromFileName } from "./document";
import { makeShape, movedItem } from "./shapes";
import { OP_INFO, type Item, type Op, type Outline } from "./types";

export const PICTURE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];
export const IMPORT_EXTENSIONS = [".svg", ".dxf", ...PICTURE_EXTENSIONS];
export const IMPORT_ACCEPT = `image/svg+xml,.svg,.dxf,image/png,image/jpeg,image/gif,image/webp,image/bmp,${PICTURE_EXTENSIONS.join(",")}`;

export const isPictureFile = (name: string) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
export const isImportFile = (name: string) => /\.(svg|dxf)$/i.test(name) || isPictureFile(name);

export interface ImportResult {
  items: Item[];
  /** What came in, in plain words. */
  summary: string;
}

/** Read a drawing file's text. Throws a plain-English error when it can't be read. */
export function importDrawing(text: string, fileName: string, taken: Iterable<string>, place: { bed: [number, number] }): ImportResult {
  const name = nameFromFileName(fileName) || "Drawing";
  let groups: { outline: Outline; op: Op }[];
  let skipped: Record<string, number>;
  let unitNote = "";
  if (/\.dxf$/i.test(fileName)) {
    const drawing = parseDxf(text);
    const r = dxfOutlines(drawing);
    groups = r.outlines;
    skipped = r.skipped;
    unitNote = drawing.unitName ? ` Sizes are in ${drawing.unitName}, as the file says.` : " The file doesn't say its units, so sizes are taken as millimetres.";
  } else {
    const r = svgOutlines(text);
    groups = r.outlines;
    skipped = r.skipped;
  }
  const byOp = new Map<Op, Outline[]>();
  for (const g of groups) byOp.set(g.op, [...(byOp.get(g.op) ?? []), g.outline]);
  if (!byOp.size) throw new (/\.dxf$/i.test(fileName) ? DxfError : SvgError)(`${fileName} has no lines or shapes JuraCUT can use.${skippedNote(skipped)}`);
  const ids = new Set(taken);
  let items: Item[] = [];
  for (const op of ["cut", "score", "engrave"] as Op[]) {
    const outlines = byOp.get(op);
    if (!outlines) continue;
    const id = newId(ids);
    ids.add(id);
    const item = makeShape(id, byOp.size > 1 ? `${name} (${OP_INFO[op].label.toLowerCase()})` : name, outlines);
    items.push({ ...item, op });
  }
  // Onto the bed: the drawing's bottom-left corner 10 mm in from the bed's front-left corner, and shrink nothing.
  const box = pathsBox(items.flatMap((it) => (it.kind === "shape" ? it.outlines : [])).map((o) => ({ layer: "outer" as const, ...o })));
  if (box) {
    const dx = 10 - box[0];
    const dy = 10 - box[1];
    items = items.map((it) => movedItem(it, dx, dy));
  }
  const w = box ? box[2] - box[0] : 0;
  const h = box ? box[3] - box[1] : 0;
  const n = groups.length;
  const tooBig = box && (w > place.bed[0] || h > place.bed[1]) ? ` It's bigger than the bed (${Math.round(w)} × ${Math.round(h)} mm).` : "";
  const summary = `Brought in ${n} ${n === 1 ? "shape" : "shapes"} from ${fileName} (${Math.round(w * 10) / 10} × ${Math.round(h * 10) / 10} mm).${unitNote}${tooBig}${skippedNote(skipped)}`;
  return { items, summary };
}

function skippedNote(skipped: Record<string, number>): string {
  const parts = Object.entries(skipped).map(([k, v]) => `${v} ${k}`);
  return parts.length ? ` Left out: ${parts.join(", ")}.` : "";
}
