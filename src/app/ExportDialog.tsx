/**
 * Export for laser: a preview of what the laser gets, the colour key, and
 * Save SVG / Save DXF — files Bambu Studio's laser mode opens at true size.
 */
import { useMemo, useState } from "react";

import { layerCounts, LASER_LAYERS, LAYER_ORDER } from "../geometry/segments";
import { colourKey, laserDxf, laserSvg } from "../laser/files";
import { makeSheet, offBed } from "../laser/sheet";
import { useDocument, useSelection, useStore } from "../model/store";
import { downloadFile, safeFileName } from "./download";
import { Icons } from "./icons";
import { Modal } from "./Modal";

export function ExportDialog() {
  const doc = useDocument();
  const selection = useSelection();
  const openDialog = useStore((s) => s.openDialog);
  const [what, setWhat] = useState<"all" | "selected">(selection.length ? "selected" : "all");
  const [mirror, setMirror] = useState(false);
  const [wholeBed, setWholeBed] = useState(false);
  const items = what === "selected" ? doc.items.filter((it) => selection.includes(it.id)) : doc.items;
  const sheet = useMemo(() => makeSheet(doc, { items, mirror, wholeBed }), [doc, items, mirror, wholeBed]);
  const counts = layerCounts(sheet);
  const preview = useMemo(() => laserSvg(sheet, { preview: true, title: doc.name }), [sheet, doc.name]);
  const outside = offBed(doc).filter((it) => items.includes(it));
  const empty = sheet.paths.length === 0;
  const n = (v: number) => Math.round(v * 10) / 10;
  const base = safeFileName(doc.name, "JuraCUT design");

  const save = (kind: "svg" | "dxf") => {
    const text = kind === "svg" ? laserSvg(sheet, { title: doc.name }) : laserDxf(sheet);
    const name = `${base}${mirror ? " (mirrored)" : ""}.${kind}`;
    downloadFile(new Blob([text], { type: kind === "svg" ? "image/svg+xml" : "application/dxf" }), name);
    useStore.getState().showToast(`Saved ${name}. In Bambu Studio's laser mode, open it and set each colour as in the key.`, "success");
  };

  return (
    <Modal title="Export for laser" onClose={() => openDialog(null)} width={640}>
      <div className="export-layout">
        <div className="export-preview" aria-label="Preview of the exported sheet">
          {empty ? <p className="muted">Nothing to export: every shape is hidden, or there are none.</p> : <div className="preview-svg" dangerouslySetInnerHTML={{ __html: preview }} />}
        </div>
        <div className="export-side">
          {selection.length > 0 && (
            <>
              <div className="field-label">What to export</div>
              <div className="segmented two" role="radiogroup" aria-label="What to export">
                <button type="button" role="radio" aria-checked={what === "all"} className={what === "all" ? "selected" : ""} onClick={() => setWhat("all")}>
                  Everything
                </button>
                <button type="button" role="radio" aria-checked={what === "selected"} className={what === "selected" ? "selected" : ""} onClick={() => setWhat("selected")}>
                  Selected ({selection.length})
                </button>
              </div>
            </>
          )}
          <label className="check-row">
            <input type="checkbox" checked={wholeBed} onChange={(e) => setWholeBed(e.target.checked)} />
            Keep the bed layout (the file is the whole {doc.bed[0]} × {doc.bed[1]} mm bed)
          </label>
          <label className="check-row">
            <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
            Mirror (flip left to right, for engraving on the back)
          </label>
          <p className="dialog-hint">
            Sheet: {n(sheet.size[0])} × {n(sheet.size[1])} mm, true size.
          </p>
          <div className="colour-key">
            {LAYER_ORDER.map((l) =>
              counts[l] ? (
                <div key={l} className="colour-key-row">
                  <span className="op-dot big" style={{ background: LASER_LAYERS[l].colour, borderColor: LASER_LAYERS[l].colour === "#000000" ? "var(--line)" : "transparent" }} />
                  <span>
                    <strong>{LASER_LAYERS[l].label}</strong> ({counts[l]}): {LASER_LAYERS[l].hint}
                  </span>
                </div>
              ) : null,
            )}
          </div>
          {outside.length > 0 && (
            <p className="dialog-hint attention">
              <Icons.Warning size={16} /> {outside.length === 1 ? `"${outside[0].name}" lies` : `${outside.length} shapes lie`} outside the bed. Move {outside.length === 1 ? "it" : "them"} back on, or use Arrange.
            </p>
          )}
        </div>
      </div>
      <details className="whats-new-earlier">
        <summary>In Bambu Studio</summary>
        <ol className="help-steps">
          <li>Switch to laser mode and choose your material, then Import the SVG (or DXF) — it comes in at true size.</li>
          <li>Each colour is a layer: set the red and blue lines to cut, green lines to score (a light pass), and the black areas to engrave (fill).</li>
          <li>Cut the blue holes before the red outlines, so pieces don't move before their holes are done — the file lists them in that order.</li>
        </ol>
        <p className="muted small">{colourKey().join(". ")}.</p>
      </details>
      <div className="modal-actions">
        <button type="button" className="text-button" onClick={() => save("dxf")} disabled={empty} title="DXF: for Bambu Studio and every other laser or CAD program; arcs stay exact">
          <Icons.Export size={18} /> Save DXF
        </button>
        <button type="button" className="primary-button" onClick={() => save("svg")} disabled={empty} title="SVG: what Bambu Studio's laser mode opens, with each colour as a layer">
          <Icons.Export size={18} /> Save SVG
        </button>
      </div>
    </Modal>
  );
}
