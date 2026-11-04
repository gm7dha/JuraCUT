/**
 * Lining shapes up: what they line up against (each other, the key shape — the one picked first, which stays put — or
 * the bed), the six line-up buttons, centre on the bed, and equal spacing. Used by the toolbar's Align menu and the
 * side panel, so both work the same way.
 */
import type { ReactElement } from "react";

import { piecesOf, type AlignAgainst, type AlignTo } from "../model/arrange";
import { useDocument, useSelection, useStore } from "../model/store";
import { Icons } from "./icons";
import { altShortcut, detectPlatform } from "./platform";

export const LINE_UP: readonly { to: AlignTo; icon: (p: { size?: number }) => ReactElement; what: string; key: string }[] = [
  { to: "left", icon: Icons.AlignLeft, what: "left edges", key: "A" },
  { to: "centre", icon: Icons.AlignCentre, what: "middles, across", key: "H" },
  { to: "right", icon: Icons.AlignRight, what: "right edges", key: "D" },
  { to: "top", icon: Icons.AlignTop, what: "tops", key: "W" },
  { to: "middle", icon: Icons.AlignMiddle, what: "middles, up and down", key: "V" },
  { to: "bottom", icon: Icons.AlignBottom, what: "bottoms", key: "S" },
];

const AGAINST: readonly { value: AlignAgainst; label: string; hint: string }[] = [
  { value: "each", label: "Each other", hint: "Line them up with the box round them all" },
  { value: "key", label: "Key shape", hint: "Line them up with the shape you picked first, which stays put" },
  { value: "bed", label: "The bed", hint: "Line each one up with the edge or middle of the bed" },
];

export function AlignControls({ spacing = true }: { spacing?: boolean }) {
  const doc = useDocument();
  const selection = useSelection();
  const against = useStore((s) => s.alignAgainst);
  const s = useStore.getState;
  const platform = detectPlatform();
  const pieces = piecesOf(doc.items, selection).length;
  const lone = pieces === 1;
  const used: AlignAgainst = lone ? "bed" : against;
  const hint = used === "bed" ? (lone ? "Line it up with the bed" : "Line each up with the bed") : used === "key" ? "Line them up with the key shape" : "Line them up with each other";
  return (
    <div className="align-controls">
      <div className="field-label">Line up against</div>
      <div className="segmented three" role="radiogroup" aria-label="Line up against">
        {AGAINST.map((a) => (
          <button
            key={a.value}
            type="button"
            role="radio"
            aria-checked={used === a.value}
            className={used === a.value ? "selected" : ""}
            disabled={lone && a.value !== "bed"}
            title={lone && a.value !== "bed" ? "With one shape (or group) selected, it lines up with the bed" : a.hint}
            onClick={() => s().setAlignAgainst(a.value)}
          >
            {a.label}
          </button>
        ))}
      </div>
      {used === "key" && <p className="dialog-hint align-hint">The key shape is the one you picked first (outlined on the bed). It stays put; the others line up with it.</p>}
      <div className="icon-row" role="group" aria-label="Line up">
        {LINE_UP.map(({ to, icon: Icon, what, key }) => (
          <button key={to} type="button" className="icon-button" disabled={!pieces} title={`${hint}: ${what} (${altShortcut(platform, key)})`} aria-label={`Line up ${what}`} onClick={() => s().alignSelected(to)}>
            <Icon size={18} />
          </button>
        ))}
      </div>
      <button type="button" className="text-button small-button centre-on-bed" disabled={!pieces} title={`Move them, as they are, to the middle of the bed (${altShortcut(platform, "C")})`} onClick={() => s().centreSelected()}>
        <Icons.Fit size={16} /> Centre on the bed
      </button>
      {spacing && pieces >= 3 && (
        <>
          <div className="field-label">Space out evenly</div>
          <div className="icon-row" role="group" aria-label="Space out evenly">
            <button type="button" className="icon-button" title={`Equal gaps across; the outside two stay put (${altShortcut(platform, "H", { shift: true })})`} aria-label="Equal gaps across" onClick={() => s().distributeSelected("x")}>
              <Icons.SpreadX size={18} />
            </button>
            <button type="button" className="icon-button" title={`Equal gaps up and down; the outside two stay put (${altShortcut(platform, "V", { shift: true })})`} aria-label="Equal gaps up and down" onClick={() => s().distributeSelected("y")}>
              <Icons.SpreadY size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
