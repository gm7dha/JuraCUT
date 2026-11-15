/**
 * The bed's right-click menu (Control-click on a Mac): the usual things to do with the shapes under the pointer, or,
 * on an empty spot, paste and select. It closes on a click elsewhere, Esc, scrolling, or after a choice.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { OPS, OP_INFO } from "../model/types";
import { useStore } from "../model/store";
import { copyFromMenu, pasteFromMenu } from "./clipboardApp";

type Entry = { label: string; hint?: string; act: () => void; off?: boolean } | "line";

export function BedMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<[number, number]>([x, y]);
  const selection = useStore((s) => s.selection);
  const items = useStore((s) => s.history.present.items);
  const s = useStore.getState;
  const picked = items.filter((it) => selection.includes(it.id));
  const any = picked.length > 0;
  const grouped = picked.some((it) => it.group);
  const ops = new Set(picked.filter((it) => it.kind !== "picture").map((it) => it.op));

  // Kept inside the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAt([Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), Math.max(4, Math.min(y, window.innerHeight - r.height - 4))]);
  }, [x, y]);

  useEffect(() => {
    const away = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("wheel", away, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", onClose);
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("wheel", away, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const entries: Entry[] = any
    ? [
        { label: "Copy", hint: "Mod+C", act: () => void copyFromMenu(false) },
        { label: "Cut", hint: "Mod+X", act: () => void copyFromMenu(true) },
        { label: "Paste", hint: "Mod+V", act: () => void pasteFromMenu() },
        { label: "Duplicate", hint: "Mod+D", act: () => s().duplicateSelected() },
        { label: "Delete", hint: "Del", act: () => s().deleteSelected() },
        "line",
        ...OPS.map((op): Entry => ({ label: `${OP_INFO[op].label}`, hint: ops.size === 1 && ops.has(op) ? "✓" : undefined, act: () => s().setOp(selection, op) })),
        "line",
        { label: "Turn a quarter turn", act: () => s().rotateSelected(90) },
        { label: "Flip left to right", act: () => s().mirrorSelected() },
        { label: "Group", act: () => s().groupSelected(), off: picked.length < 2 },
        { label: "Ungroup", act: () => s().ungroupSelected(), off: !grouped },
        { label: "Bring to front", act: () => s().orderSelected("front") },
        { label: "Send to back", act: () => s().orderSelected("back") },
        "line",
        { label: "Zoom to selection", hint: "Shift+F", act: () => s().requestFit("selection") },
        ...(ops.size === 1 ? [{ label: `Select every ${OP_INFO[[...ops][0]].label.toLowerCase()} shape`, act: () => s().selectOp([...ops][0]) }] : []),
      ]
    : [
        { label: "Paste", hint: "Mod+V", act: () => void pasteFromMenu() },
        { label: "Select all", hint: "Mod+A", act: () => s().selectAll(), off: !items.length },
        ...OPS.map((op): Entry => ({ label: `Select every ${OP_INFO[op].label.toLowerCase()} shape`, act: () => s().selectOp(op), off: !items.some((it) => it.op === op && it.kind !== "picture" && !it.hidden) })),
        "line",
        { label: "Fit the bed", hint: "F", act: () => s().requestFit("bed") },
      ];

  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
  return (
    <div ref={ref} className="bed-menu" role="menu" style={{ left: at[0], top: at[1] }} onContextMenu={(e) => e.preventDefault()}>
      {entries.map((e, i) =>
        e === "line" ? (
          <div key={i} className="bed-menu-line" role="separator" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={e.off}
            onClick={() => {
              onClose();
              e.act();
            }}
          >
            <span>{e.label}</span>
            {e.hint && <span className="bed-menu-hint">{e.hint.replace("Mod+", mod)}</span>}
          </button>
        ),
      )}
    </div>
  );
}
