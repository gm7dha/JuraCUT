/**
 * The toolbar's Arrange button and its little menu: lay every piece out in
 * rows, or pack them tightly by their real shapes (turning them, and using
 * the holes of big pieces), with the gap between pieces.
 */
import { useEffect, useRef, useState } from "react";

import { useStore } from "../model/store";
import { Icons } from "./icons";

const KEY = "juracut.arrange";

function remembered(): { gap: number; turns: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { gap?: unknown; turns?: unknown };
    return { gap: typeof v.gap === "number" && v.gap >= 0 && v.gap <= 50 ? v.gap : 3, turns: v.turns !== false };
  } catch {
    return { gap: 3, turns: true };
  }
}

export function ArrangeMenu({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [{ gap, turns }, setSettings] = useState(remembered);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ gap, turns }));
    } catch {
      // Not remembered; fine.
    }
  }, [gap, turns]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.(".arrange-button")) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const run = (how: "rows" | "pack") => {
    const s = useStore.getState();
    if (how === "rows") s.arrangeAll(gap);
    else s.packAll(gap, turns);
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        className={`tool-button arrange-button${open ? " active" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 300) });
          setOpen(!open);
        }}
        title="Lay every piece out on the bed: in rows, or packed tightly by shape"
      >
        <Icons.Arrange size={20} />
        <span>Arrange</span>
      </button>
      {open && (
        <div ref={ref} className="settings-menu arrange-menu" role="dialog" aria-label="Arrange" style={at ? { top: at.top, left: at.left, right: "auto" } : undefined}>
          <button type="button" className="menu-choice" onClick={() => run("pack")}>
            <strong>Pack tightly</strong>
            <span className="muted small">Fit pieces together by their real shapes — into each other's corners and big holes — to use less material.</span>
          </button>
          <button type="button" className="menu-choice" onClick={() => run("rows")}>
            <strong>In rows</strong>
            <span className="muted small">Neat rows across the bed, biggest first. Quick and easy to find things.</span>
          </button>
          <div className="field-row settings-gap">
            <label className="field">
              <span>Gap between pieces</span>
              <span className="field-input">
                <input type="number" min={0} max={50} step="any" value={gap} onChange={(e) => setSettings({ gap: Math.min(50, Math.max(0, Number(e.target.value) || 0)), turns })} />
                <span className="unit">mm</span>
              </span>
            </label>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={turns} onChange={(e) => setSettings({ gap, turns: e.target.checked })} />
            Pieces may be turned (for wood grain, untick this)
          </label>
          <p className="dialog-hint">Shapes inside another (holes, words on a tag) and groups stay together. Undo puts everything back.</p>
        </div>
      )}
    </>
  );
}
