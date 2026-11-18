/**
 * The toolbar's History button: every step undo can go back to, newest at the top, each said in a few words —
 * click one to go straight back (or forward) to it. Nothing is lost: steps after it stay, greyed, until you change
 * something.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { historySteps } from "../model/historyLabel";
import { useStore } from "../model/store";
import { Icons } from "./icons";

function HistoryList({ close }: { close: () => void }) {
  const history = useStore((s) => s.history);
  const steps = useMemo(() => historySteps(history.past, history.present, history.future).reverse(), [history]);
  const here = useRef<HTMLLIElement>(null);
  useEffect(() => {
    here.current?.scrollIntoView({ block: "nearest" });
  }, []);
  if (steps.length < 2) return <p className="dialog-hint">Nothing to go back to yet. Each change you make is listed here.</p>;
  return (
    <ul className="history-list">
      {steps.map((st) => (
        <li key={st.offset} ref={st.offset === 0 ? here : undefined} className={st.offset === 0 ? "current" : st.offset > 0 ? "undone" : ""}>
          <button
            type="button"
            className="history-step"
            disabled={st.offset === 0}
            onClick={() => {
              useStore.getState().jumpHistory(st.offset);
              close();
            }}
            title={st.offset === 0 ? "The design as it is now" : st.offset < 0 ? `Go back ${-st.offset} step${st.offset === -1 ? "" : "s"}` : `Go forward ${st.offset} step${st.offset === 1 ? "" : "s"} (redo)`}
          >
            {st.label}
            {st.offset === 0 && <span className="muted small"> — now</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function HistoryMenu() {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const any = useStore((s) => s.history.past.length + s.history.future.length > 0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.(".history-button")) setOpen(false);
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
        className={`tool-button icon-only history-button${open ? " active" : ""}`}
        aria-label="History"
        aria-expanded={open}
        disabled={!any}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 308)) });
          setOpen(!open);
        }}
        title="History: every change you've made — go straight back to any of them"
      >
        <Icons.History size={20} />
        <span>History</span>
      </button>
      {open && (
        <div ref={ref} className="settings-menu history-menu" role="dialog" aria-label="History" style={at ? { top: at.top, left: at.left, right: "auto" } : undefined}>
          <div className="field-label" style={{ marginTop: 0 }}>
            History
          </div>
          <HistoryList close={() => setOpen(false)} />
          <p className="dialog-hint">The last 100 changes are kept. Going back doesn't lose the later ones until you change something.</p>
        </div>
      )}
    </>
  );
}
