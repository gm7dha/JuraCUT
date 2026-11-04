/**
 * Which kind of computer JuraCUT is running on, so shortcuts can be shown
 * the way that computer's keyboard labels them (⌘ Cmd on a Mac, Ctrl on Windows).
 */
export type Platform = "mac" | "windows";

interface NavigatorLike {
  platform?: string;
  userAgent?: string;
  userAgentData?: { platform?: string };
}

/** Mac (including iPad) or Windows-style (Windows, Linux, ChromeOS…). */
export function detectPlatform(nav: NavigatorLike | undefined = globalThis.navigator as NavigatorLike | undefined): Platform {
  if (!nav) return "windows";
  const hint = nav.userAgentData?.platform || nav.platform || nav.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(hint) ? "mac" : "windows";
}

export interface KeyNames {
  /** The main shortcut key: "⌘ Cmd" or "Ctrl". */
  mod: string;
  shift: string;
  /** The key that deletes things. */
  del: string;
}

export function keyNames(p: Platform): KeyNames {
  return p === "mac" ? { mod: "⌘ Cmd", shift: "⇧ Shift", del: "Delete ⌫" } : { mod: "Ctrl", shift: "Shift", del: "Delete" };
}

/** Short label for tooltips, e.g. "⌘Z" or "Ctrl+Z". */
export function shortcut(p: Platform, key: string, opts: { shift?: boolean } = {}): string {
  if (p === "mac") return `${opts.shift ? "⇧" : ""}⌘${key}`;
  return `Ctrl+${opts.shift ? "Shift+" : ""}${key}`;
}

/** Mouse and keyboard help rows for the Help dialog, worded for this kind of computer. */
export function helpRows(p: Platform) {
  const k = keyNames(p);
  const mac = p === "mac";
  const mouse: [string, string][] = [
    ["Select a shape", "Click it (an outline, or anywhere inside a closed shape)"],
    ["Add to selection", `${k.shift}-click or ${k.mod}-click`],
    ["Select several", "Drag a box round them on an empty part of the bed"],
    ["Move a shape", "Drag it"],
    ["Pan the bed", mac ? "Middle-drag, right-drag, or hold Space and drag" : "Middle-drag, right-drag, or hold Space and drag"],
    ["Zoom (towards the pointer)", mac ? "Scroll wheel, or pinch on a trackpad" : "Scroll wheel, or Ctrl + scroll"],
    ["Touch screen", "One finger drags or draws, two fingers pan and pinch to zoom"],
  ];
  const keys: [string, string][] = [
    ["V", "Select tool"],
    ["R", "Rectangle: drag a box"],
    ["C", "Circle: drag from the centre"],
    ["L", "Line: drag from one end to the other"],
    ["T", "Text: click where the words start, then type them in the panel"],
    ["Esc", "Back to the Select tool, then clear the selection"],
    ["F", "Zoom to fit the bed"],
    ["Arrow keys", "Nudge the selected shapes 1 mm (10 mm with Shift)"],
    [k.del, "Delete the selected shapes"],
    [`${k.mod} + D`, "Duplicate the selected shapes"],
    [`${k.mod} + A`, "Select every shape"],
    [`${k.mod} + Z`, "Undo"],
    [mac ? `${k.mod} + ${k.shift} + Z  or  ${k.mod} + Y` : `${k.mod} + Y  or  ${k.mod} + ${k.shift} + Z`, "Redo"],
    [`${k.mod} + S`, "Save to a .juracut file"],
    [`${k.mod} + ${k.shift} + S`, "Save a copy under a new name"],
    [`${k.mod} + O`, "Open a .juracut file, or an SVG or DXF drawing (or drag one onto the window)"],
    ["?", "Show this help"],
  ];
  return { mouse, keys };
}
