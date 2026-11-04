import { useEffect } from "react";

import { KEEP_PROBLEM, keepInBrowser, readKept } from "../model/keep";
import { useStore } from "../model/store";
import { BedView } from "./BedView";
import { ExportDialog } from "./ExportDialog";
import { HelpDialog } from "./HelpDialog";
import { MaterialsDialog } from "./MaterialsDialog";
import { LibraryDialog } from "./LibraryDialog";
import { TraceDialog } from "./TraceDialog";
import { Icons } from "./icons";
import { openFile, saveToFile, openFromFile } from "./fileActions";
import { inPopup, inTextBox } from "./popupGuard";
import { SidePanel } from "./SidePanel";
import { Toolbar } from "./Toolbar";
import { TopBar } from "./TopBar";
import { WhatsNewDialog } from "./WhatsNewDialog";

export function App() {
  const dialog = useStore((s) => s.dialog);
  useShortcuts();
  useKeepInBrowser();
  useFileDrop();

  return (
    <div className="app">
      <TopBar />
      <Toolbar />
      <div className="workspace">
        <SidePanel />
        <BedView />
      </div>
      <ToastView />
      {dialog === "export" && <ExportDialog />}
      {dialog === "help" && <HelpDialog />}
      {dialog === "material" && <MaterialsDialog />}
      {dialog === "library" && <LibraryDialog />}
      {dialog === "trace" && <TraceDialog />}
      {dialog === "whatsNew" && <WhatsNewDialog />}
    </div>
  );
}

/** The keyboard: tools, nudging, undo, save… (not while typing in a box or a dialog is open). */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (inTextBox(e.target)) return;
      // Save, open and undo work anywhere; the rest only on the bed.
      if (mod && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "s") {
          e.preventDefault();
          void saveToFile(e.shiftKey);
          return;
        }
        if (k === "o") {
          e.preventDefault();
          void openFromFile();
          return;
        }
        if (k === "z") {
          e.preventDefault();
          e.shiftKey ? s.redo() : s.undo();
          return;
        }
        if (k === "y") {
          e.preventDefault();
          s.redo();
          return;
        }
      }
      if (inPopup(e.target, document)) return;
      if (mod && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "d") {
          e.preventDefault();
          s.duplicateSelected();
        } else if (k === "a") {
          e.preventDefault();
          s.selectAll();
        } else if (k === "g") {
          e.preventDefault();
          e.shiftKey ? s.ungroupSelected() : s.groupSelected();
        }
        return;
      }
      if (e.altKey) return;
      const step = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case "Escape":
          if (s.tool !== "select") s.setTool("select");
          else s.clearSelection();
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          s.deleteSelected();
          break;
        case "ArrowLeft":
          e.preventDefault();
          s.moveSelected(-step, 0);
          break;
        case "ArrowRight":
          e.preventDefault();
          s.moveSelected(step, 0);
          break;
        case "ArrowUp":
          e.preventDefault();
          s.moveSelected(0, step);
          break;
        case "ArrowDown":
          e.preventDefault();
          s.moveSelected(0, -step);
          break;
        case "?":
          s.openDialog("help");
          break;
        default: {
          if (e.shiftKey) break;
          const k = e.key.toLowerCase();
          if (k === "v") s.setTool("select");
          else if (k === "r") s.setTool("rect");
          else if (k === "c") s.setTool("circle");
          else if (k === "l") s.setTool("line");
          else if (k === "t") s.setTool("text");
          else if (k === "f") s.requestFit();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** The design kept in this browser: brought back on load, written after every change. */
function useKeepInBrowser() {
  useEffect(() => {
    const s = useStore.getState();
    try {
      const kept = readKept(localStorage);
      if (kept && (kept.items.length || kept.name !== s.history.present.name)) {
        // Straight in, with no undo step (there's nothing before it).
        useStore.setState({ history: { past: [], present: kept, future: [] } });
      }
    } catch {
      // No storage (private browsing): the design just isn't kept.
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useStore.subscribe((state, prev) => {
      if (state.history.present === prev.history.present) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        let ok = false;
        try {
          ok = keepInBrowser(localStorage, useStore.getState().history.present);
        } catch {
          ok = false;
        }
        useStore.getState().setStorageProblem(ok ? null : KEEP_PROBLEM);
      }, 400);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);
}

/** Files dragged onto the window: .juracut designs open, SVG and DXF drawings come in as shapes. */
function useFileDrop() {
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    };
    const drop = (e: DragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      void (async () => {
        for (const f of files) await openFile(f);
      })();
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);
}

function ToastView() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  if (!toasts.length) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
          {t.text}
          <button className="icon-button small" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <Icons.Cross size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
