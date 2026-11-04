/**
 * Saving and opening .juracut files on the user's computer, and bringing
 * SVG and DXF drawings in.
 *
 * In Chrome and Edge this uses the browser's real Save / Open windows, and
 * after the first save, Save writes straight back to the same file. Other
 * browsers (Safari, Firefox) save by downloading and open with the normal
 * file picker.
 */
import { FILE_EXTENSION, FILE_MIME, nameFromFileName, readDocumentFile, serializeDocument } from "../model/document";
import { IMPORT_ACCEPT, importDrawing, isImportFile, isPictureFile } from "../model/importFile";
import { useStore } from "../model/store";
import { downloadFile, safeFileName } from "./download";

// The File System Access API isn't in TypeScript's built-in types yet.
interface WritableFile {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}
interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableFile>;
}
interface PickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption?: boolean;
  multiple?: boolean;
}
type PickerWindow = Window & {
  showSaveFilePicker?: (o: PickerOptions) => Promise<FileHandle>;
  showOpenFilePicker?: (o: PickerOptions) => Promise<FileHandle[]>;
};

const FILE_TYPES = [{ description: "JuraCUT design", accept: { [FILE_MIME]: [FILE_EXTENSION], "application/json": [FILE_EXTENSION] } }];

const OPEN_TYPES = [
  {
    description: "JuraCUT design, or an SVG or DXF drawing to bring in",
    accept: {
      [FILE_MIME]: [FILE_EXTENSION],
      "application/json": [FILE_EXTENSION],
      "image/svg+xml": [".svg"],
      "application/dxf": [".dxf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/gif": [".gif"],
      "image/webp": [".webp"],
      "image/bmp": [".bmp"],
    },
  },
];

const IMPORT_TYPES = [
  {
    description: "SVG or DXF drawing, or a picture to trace",
    accept: {
      "image/svg+xml": [".svg"],
      "application/dxf": [".dxf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/gif": [".gif"],
      "image/webp": [".webp"],
      "image/bmp": [".bmp"],
    },
  },
];

/** The file the design was last saved to or opened from (Chrome/Edge only). */
let currentHandle: FileHandle | null = null;

const isCancel = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** Save the design. `saveAs` always asks where; otherwise the same file is reused when possible. */
export async function saveToFile(saveAs = false): Promise<void> {
  const doc = useStore.getState().history.present;
  const text = serializeDocument(doc);
  const suggested = `${safeFileName(doc.name, "JuraCUT design")}${FILE_EXTENSION}`;
  const w = window as PickerWindow;
  try {
    if (w.showSaveFilePicker) {
      if (!currentHandle || saveAs) currentHandle = await w.showSaveFilePicker({ suggestedName: suggested, types: FILE_TYPES });
      const out = await currentHandle.createWritable();
      await out.write(new Blob([text], { type: FILE_MIME }));
      await out.close();
      useStore.getState().markSaved(currentHandle.name);
      useStore.getState().showToast(`Saved ${currentHandle.name}`, "success");
      return;
    }
    downloadFile(new Blob([text], { type: FILE_MIME }), suggested);
    useStore.getState().markSaved(suggested);
    useStore.getState().showToast(`Saved ${suggested} to your Downloads folder`, "success");
  } catch (e) {
    if (isCancel(e)) return;
    currentHandle = null;
    useStore.getState().showToast(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`, "error");
  }
}

/** Open a design file (or bring a drawing in), chosen by the user. */
export async function openFromFile(importOnly = false): Promise<void> {
  const w = window as PickerWindow;
  try {
    if (w.showOpenFilePicker) {
      const handles = await w.showOpenFilePicker({ types: importOnly ? IMPORT_TYPES : OPEN_TYPES, multiple: importOnly });
      for (const handle of handles) {
        const file = await handle.getFile();
        if ((await openFile(file)) && !isImportFile(file.name)) currentHandle = handle;
      }
      return;
    }
  } catch (e) {
    if (isCancel(e)) return;
    useStore.getState().showToast(`Couldn't open: ${e instanceof Error ? e.message : String(e)}`, "error");
    return;
  }
  // Other browsers: the ordinary file picker.
  const input = document.createElement("input");
  input.type = "file";
  input.accept = importOnly ? IMPORT_ACCEPT : `${FILE_EXTENSION},application/json,${IMPORT_ACCEPT}`;
  input.multiple = importOnly;
  input.className = "file-input";
  input.onchange = () => {
    const files = Array.from(input.files ?? []);
    input.remove();
    void (async () => {
      for (const file of files) if ((await openFile(file)) && !isImportFile(file.name)) currentHandle = null;
    })();
  };
  document.body.appendChild(input);
  input.click();
}

/** Open a file (from a picker, or dropped on the window). Returns true if it worked. */
export async function openFile(file: File): Promise<boolean> {
  const s = useStore.getState();
  if (isImportFile(file.name)) return importFile(file);
  const result = readDocumentFile(await file.text(), file.name);
  if (!result.ok) {
    s.showToast(result.error, "error");
    return false;
  }
  const doc = result.doc.name === "Untitled design" ? { ...result.doc, name: nameFromFileName(file.name) || result.doc.name } : result.doc;
  s.openDocument(doc, file.name);
  currentHandle = null;
  useStore.getState().showToast(`Opened ${file.name}. Undo brings back what you had before.`, "success");
  return true;
}

/** Bring an SVG or DXF drawing in as shapes, or open a picture in the Trace window. */
export async function importFile(file: File): Promise<boolean> {
  const s = useStore.getState();
  if (isPictureFile(file.name)) {
    if (file.size > 40 * 1024 * 1024) {
      s.showToast(`${file.name} is too big to trace (over 40 MB). Save a smaller copy and try again.`, "error");
      return false;
    }
    const url = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    s.openTrace(file.name, url);
    return true;
  }
  try {
    const doc = s.history.present;
    const { items, summary } = importDrawing(await file.text(), file.name, doc.items.map((it) => it.id), { bed: doc.bed });
    s.addItems(items);
    s.showToast(summary, "success");
    s.requestFit();
    return true;
  } catch (e) {
    s.showToast(e instanceof Error ? e.message : `Couldn't read ${file.name}.`, "error");
    return false;
  }
}

/** Forget the file (after New), so the next Save asks where to save. */
export function forgetFile(): void {
  currentHandle = null;
}
