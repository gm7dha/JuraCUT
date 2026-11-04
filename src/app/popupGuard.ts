/**
 * Whether a key press belongs to a popup rather than the bed, so the global
 * shortcuts (R, Delete, arrows…) leave it alone:
 *
 * - While any centred dialog box (`Modal`: Help, Export…) is open, wherever
 *   the key was pressed.
 * - When the key was pressed inside a smaller popup (the Settings menu):
 *   anything with role="dialog".
 * - When the key was typed into a text box, a number box or a drop-down.
 */

interface ClosestLike {
  closest?: (selector: string) => unknown;
  tagName?: string;
  isContentEditable?: boolean;
}

interface PageLike {
  querySelector: (selector: string) => unknown;
}

/** An open dialog box (Modal). */
export const MODAL_SELECTOR = '[aria-modal="true"]';
/** A popup a key was pressed in. */
export const POPUP_SELECTOR = '[role="dialog"], [aria-modal="true"]';

export function inPopup(target: EventTarget | ClosestLike | null, page: PageLike | undefined): boolean {
  if (page?.querySelector(MODAL_SELECTOR)) return true;
  const el = target as ClosestLike | null;
  return typeof el?.closest === "function" && !!el.closest(POPUP_SELECTOR);
}

/** The key was typed into something that takes typing. */
export function inTextBox(target: EventTarget | ClosestLike | null): boolean {
  const el = target as ClosestLike | null;
  const tag = el?.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!el?.isContentEditable;
}
