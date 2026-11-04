/**
 * The toolbar: drawing tools on the left, then what can be done with the
 * selected shapes, then the bed.
 */
import type { ReactElement } from "react";

import { canRedo, canUndo, useSelection, useStore, type Tool } from "../model/store";
import { OP_INFO } from "../model/types";
import type { State } from "../model/store";

const NONE: string[] = [];
let lastKey = "";
let lastGroups: string[] = NONE;
/** The group of each selected shape ("" = none), cached so the selector returns the same array while nothing changes. */
function groupsOf(s: State): string[] {
  const groups = s.history.present.items.filter((it) => s.selection.includes(it.id)).map((it) => it.group ?? "");
  const key = groups.join("|");
  if (key !== lastKey) {
    lastKey = key;
    lastGroups = groups.length ? groups : NONE;
  }
  return lastGroups;
}
import { ArrangeMenu } from "./ArrangeMenu";
import { Icons } from "./icons";
import { detectPlatform, shortcut } from "./platform";

const TOOLS: { tool: Tool; label: string; key: string; icon: (p: { size?: number }) => ReactElement; hint: string }[] = [
  { tool: "select", label: "Select", key: "V", icon: Icons.Select, hint: "Click a shape to select it, drag to move it, drag on empty bed to select several" },
  { tool: "rect", label: "Rectangle", key: "R", icon: Icons.Rectangle, hint: "Drag a box on the bed. Round its corners in the panel afterwards" },
  { tool: "circle", label: "Circle", key: "C", icon: Icons.Circle, hint: "Drag from the centre out to the edge" },
  { tool: "line", label: "Line", key: "L", icon: Icons.Line, hint: "Drag from one end to the other (cut or score it)" },
  { tool: "text", label: "Text", key: "T", icon: Icons.Text, hint: "Click where the words start, then type them in the panel" },
];

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const selection = useSelection();
  const undoable = useStore(canUndo);
  const redoable = useStore(canRedo);
  const count = useStore((s) => s.history.present.items.length);
  const platform = detectPlatform();
  const s = useStore.getState;
  const any = selection.length > 0;
  const word = selection.length === 1 ? "the selected shape" : "the selected shapes";
  const groups = useStore((st) => groupsOf(st));
  const inGroup = groups.some((g) => g !== "");
  // Already exactly one group: nothing to group.
  const grouped = groups.length > 0 && groups.every((g) => g !== "" && g === groups[0]);

  return (
    <div className="toolbar" role="toolbar" aria-label="Tools">
      <div className="tool-group">
        {TOOLS.map((t) => (
          <button key={t.tool} type="button" className={`tool-button${tool === t.tool ? " active" : ""}`} onClick={() => setTool(t.tool)} title={`${t.hint} (${t.key})`} aria-pressed={tool === t.tool}>
            <t.icon size={20} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="tool-divider" />
      <div className="tool-group">
        <button type="button" className="tool-button" onClick={() => s().openDialog("library")} title="Ready-made designs: a finger-jointed box, tags, coasters, stencils">
          <Icons.Library size={20} />
          <span>Library</span>
        </button>
      </div>
      <div className="tool-divider" />
      <div className="tool-group">
        <button type="button" className="tool-button" onClick={() => s().undo()} disabled={!undoable} title={`Undo (${shortcut(platform, "Z")})`}>
          <Icons.Undo size={20} />
          <span>Undo</span>
        </button>
        <button type="button" className="tool-button" onClick={() => s().redo()} disabled={!redoable} title={`Redo (${shortcut(platform, "Y")})`}>
          <Icons.Redo size={20} />
          <span>Redo</span>
        </button>
      </div>
      <div className="tool-divider" />
      <div className="tool-group">
        {(["cut", "score", "engrave"] as const).map((op) => (
          <button key={op} type="button" className="tool-button op-button" disabled={!any} onClick={() => s().setOp(selection, op)} title={`${OP_INFO[op].label}: ${OP_INFO[op].hint}`}>
            <span className="op-dot big" style={{ background: OP_INFO[op].colour }} />
            <span>{OP_INFO[op].label}</span>
          </button>
        ))}
      </div>
      <div className="tool-divider" />
      <div className="tool-group">
        <button type="button" className="tool-button" disabled={!any} onClick={() => s().rotateSelected(90)} title={`Turn ${word} a quarter turn anticlockwise`}>
          <Icons.Rotate size={20} />
          <span>Turn 90°</span>
        </button>
        <button type="button" className="tool-button" disabled={!any} onClick={() => s().mirrorSelected()} title={`Flip ${word} left to right (for engraving on the back)`}>
          <Icons.Mirror size={20} />
          <span>Flip</span>
        </button>
        <button type="button" className="tool-button" disabled={selection.length < 2 || grouped} onClick={() => s().groupSelected()} title={`Group the selected shapes, so they're picked, moved and turned together (${shortcut(platform, "G")})`}>
          <Icons.Group size={20} />
          <span>Group</span>
        </button>
        <button type="button" className="tool-button" disabled={!inGroup} onClick={() => s().ungroupSelected()} title={`Ungroup, so each shape can be picked on its own (${shortcut(platform, "G", { shift: true })})`}>
          <Icons.Ungroup size={20} />
          <span>Ungroup</span>
        </button>
        <button type="button" className="tool-button" disabled={!any} onClick={() => s().duplicateSelected()} title={`Make a copy of ${word} (${shortcut(platform, "D")})`}>
          <Icons.Duplicate size={20} />
          <span>Copy</span>
        </button>
        <button type="button" className="tool-button" disabled={!any} onClick={() => s().deleteSelected()} title={`Delete ${word} (Delete)`}>
          <Icons.Trash size={20} />
          <span>Delete</span>
        </button>
      </div>
      <div className="tool-divider" />
      <div className="tool-group">
        <ArrangeMenu disabled={count === 0} />
        <button type="button" className="tool-button" onClick={() => s().requestFit()} title="Zoom to fit the whole bed (F)">
          <Icons.Fit size={20} />
          <span>Fit</span>
        </button>
      </div>
    </div>
  );
}
