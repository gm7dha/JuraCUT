/**
 * Copy, cut and paste with the computer's clipboard: Ctrl/⌘ + C, X and V (the browser's own copy/paste events, so no
 * permission is asked), and the right-click menu's Paste (which reads the clipboard when the browser allows, else what
 * was copied last in this tab). Pasting JuraCUT shapes from another tab works too, and so does pasting an SVG drawing,
 * a picture (it opens in the Picture window) or plain words (they become words on the bed).
 */
import { clipText, whatIsPasted } from "../model/clipboard";
import { makeText } from "../model/shapes";
import { newId } from "../model/document";
import { useStore } from "../model/store";
import { importFile } from "./fileActions";
import { inPopup, inTextBox } from "./popupGuard";

/** What this tab copied last (for the menu's Paste when the browser won't let it read the clipboard). */
let lastCopied = "";
/** How many times the same thing has been pasted in a row (each lands a little further on). */
let pasteRun = { text: "", count: 0 };

/** The selected shapes as clipboard text (and taken out with `cut`). Null when nothing's selected. */
export function copySelection(cut = false): string | null {
  const s = useStore.getState();
  const picked = s.history.present.items.filter((it) => s.selection.includes(it.id));
  if (!picked.length) return null;
  const text = clipText(picked);
  lastCopied = text;
  pasteRun = { text: "", count: 0 };
  if (cut) s.deleteSelected();
  return text;
}

/** Put pasted text (or a pasted picture) into the design. */
export async function pasteText(text: string, picture?: File | null): Promise<void> {
  const s = useStore.getState();
  if (picture) {
    await importFile(new File([picture], picture.name && picture.name !== "image.png" ? picture.name : "Pasted picture.png", { type: picture.type }));
    return;
  }
  const what = whatIsPasted(text);
  switch (what.kind) {
    case "shapes": {
      // Pasted beside the originals while they're still there (further on each time); where they were after a cut.
      const ids = new Set(s.history.present.items.map((it) => it.id));
      const stillThere = what.items.some((it) => ids.has(it.id));
      pasteRun = pasteRun.text === text ? { text, count: pasteRun.count + 1 } : { text, count: stillThere ? 1 : 0 };
      s.pasteItems(what.items, 10 * pasteRun.count);
      s.showToast(`Pasted ${what.items.length} ${what.items.length === 1 ? "shape" : "shapes"}.`, "info");
      return;
    }
    case "svg":
      await importFile(new File([what.text], "Pasted drawing.svg", { type: "image/svg+xml" }));
      return;
    case "words": {
      const id = newId(s.history.present.items.map((it) => it.id));
      s.addItems([{ ...makeText(id, 10, 10, what.text, 10), name: "Pasted words" }], { select: true, focus: true });
      s.setTool("select");
      return;
    }
    case "nothing":
      s.showToast("There's nothing on the clipboard JuraCUT can paste.", "info");
  }
}

/** The menu's Paste: the clipboard if the browser lets us read it, else what this tab copied last. */
export async function pasteFromMenu(): Promise<void> {
  let text = "";
  try {
    text = (await navigator.clipboard?.readText?.()) ?? "";
  } catch {
    text = "";
  }
  if (!text.trim()) text = lastCopied;
  await pasteText(text);
}

/** The menu's Copy/Cut: onto the clipboard where the browser allows. */
export async function copyFromMenu(cut = false): Promise<void> {
  const text = copySelection(cut);
  if (text === null) return;
  try {
    await navigator.clipboard?.writeText?.(text);
  } catch {
    // Kept for this tab's Paste.
  }
}

/** Listen for the browser's copy, cut and paste (not while typing in a box or a window is open). */
export function listenForClipboard(): () => void {
  const away = (e: Event) => inTextBox(e.target) || inPopup(e.target, document) || !!useStore.getState().dialog;
  const onCopy = (cut: boolean) => (e: ClipboardEvent) => {
    if (away(e)) return;
    const text = copySelection(cut);
    if (text === null) return;
    e.preventDefault();
    e.clipboardData?.setData("text/plain", text);
  };
  const copy = onCopy(false);
  const cut = onCopy(true);
  const paste = (e: ClipboardEvent) => {
    if (away(e)) return;
    const data = e.clipboardData;
    if (!data) return;
    e.preventDefault();
    const picture = [...data.files].find((f) => f.type.startsWith("image/") && f.type !== "image/svg+xml") ?? null;
    void pasteText(data.getData("text/plain"), picture);
  };
  document.addEventListener("copy", copy);
  document.addEventListener("cut", cut);
  document.addEventListener("paste", paste);
  return () => {
    document.removeEventListener("copy", copy);
    document.removeEventListener("cut", cut);
    document.removeEventListener("paste", paste);
  };
}
