/**
 * The toolbar's Align button and its menu: line the selected shapes up against each other, the key shape or the bed,
 * centre them on the bed, or space them out evenly (the same controls as the side panel's).
 */
import { useEffect, useRef, useState } from "react";

import { AlignControls } from "./AlignControls";
import { Icons } from "./icons";

export function AlignMenu({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.(".align-button")) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <>
      <button
        type="button"
        className={`tool-button align-button${open ? " active" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 300)) });
          setOpen(!open);
        }}
        title="Line the selected shapes up, centre them on the bed, or space them out"
      >
        <Icons.AlignCentre size={20} />
        <span>Align</span>
      </button>
      {open && (
        <div ref={ref} className="settings-menu align-menu" role="dialog" aria-label="Align" style={at ? { top: at.top, left: at.left, right: "auto" } : undefined}>
          <AlignControls />
        </div>
      )}
    </>
  );
}
