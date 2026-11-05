/**
 * Export for laser: a preview of what the laser gets, the colour key, and
 * Save SVG / Save DXF — files Bambu Studio's laser mode opens at true size.
 */
import { useEffect, useMemo, useState } from "react";

import { layerCounts, LASER_LAYERS, LAYER_ORDER } from "../geometry/segments";
import { colourKey, laserDxf, laserSvg } from "../laser/files";
import { sendToJuraCAD } from "./juraLinkApp";
import { makeSheet, offBed } from "../laser/sheet";
import { useDocument, useSelection, useStore } from "../model/store";
import { downloadFile, safeFileName } from "./download";
import { Icons } from "./icons";
import { Modal } from "./Modal";
import { renderPicture, type RenderedPicture } from "./pictures";

export function ExportDialog() {
  const doc = useDocument();
  const selection = useSelection();
  const openDialog = useStore((s) => s.openDialog);
  const [what, setWhat] = useState<"all" | "selected">(selection.length ? "selected" : "all");
  const [mirror, setMirror] = useState(false);
  const [wholeBed, setWholeBed] = useState(false);
  const kerf = doc.material.kerf;
  const [useKerf, setUseKerf] = useState(kerf > 0);
  // Kept the same between redraws, so the sheet (and the photos drawn from it) only change when something does.
  const items = useMemo(() => (what === "selected" ? doc.items.filter((it) => selection.includes(it.id)) : doc.items), [what, doc.items, selection]);
  const sheet = useMemo(() => makeSheet(doc, { items, mirror, wholeBed, kerf: useKerf ? kerf : 0 }), [doc, items, mirror, wholeBed, useKerf, kerf]);
  const counts = layerCounts(sheet);
  // Photos: drawn small for the preview straight away, and at full detail for the files.
  const [small, setSmall] = useState<(RenderedPicture | null)[]>([]);
  const [full, setFull] = useState<(RenderedPicture | null)[] | null>(null);
  useEffect(() => {
    let live = true;
    setFull(null);
    const pics = sheet.pictures;
    void Promise.all(pics.map((p) => renderPicture(p.item, Math.min(4, p.item.dpm), p.mirrored).catch(() => null))).then((r) => live && setSmall(r));
    void Promise.all(pics.map((p) => renderPicture(p.item, p.item.dpm, p.mirrored).catch(() => null))).then((r) => live && setFull(r));
    return () => {
      live = false;
    };
  }, [sheet]);
  const imagesOf = (r: (RenderedPicture | null)[]) => sheet.pictures.flatMap((p, i) => (r[i] ? [{ box: p.box, href: r[i]!.url }] : []));
  const preview = useMemo(() => laserSvg(sheet, { preview: true, title: doc.name, images: imagesOf(small) }), [sheet, doc.name, small]);
  const outside = offBed(doc).filter((it) => items.includes(it));
  const photos = sheet.pictures.length;
  const photosReady = !photos || !!full;
  const empty = sheet.paths.length === 0 && !photos;
  const n = (v: number) => Math.round(v * 10) / 10;
  const base = safeFileName(doc.name, "JuraCUT design");

  const save = (kind: "svg" | "dxf") => {
    const text = kind === "svg" ? laserSvg(sheet, { title: doc.name, images: imagesOf(full ?? []) }) : laserDxf(sheet);
    const name = `${base}${mirror ? " (mirrored)" : ""}.${kind}`;
    downloadFile(new Blob([text], { type: kind === "svg" ? "image/svg+xml" : "application/dxf" }), name);
    const photoNote = photos ? (kind === "dxf" ? " DXF files can't hold photos: save them as PNG too." : " The photos are inside it as pictures.") : "";
    useStore.getState().showToast(`Saved ${name}. In Bambu Studio's laser mode, open it and set each colour as in the key.${photoNote}`, "success");
  };
  const savePhotos = () => {
    if (!full) return;
    full.forEach((r, i) => {
      if (!r) return;
      const p = sheet.pictures[i];
      const name = `${base} - ${safeFileName(p.item.name, "photo")}${mirror ? " (mirrored)" : ""}.png`;
      downloadFile(new Blob([r.bytes as BlobPart], { type: "image/png" }), name);
    });
    useStore.getState().showToast(
      `Saved ${photos === 1 ? "the photo" : `${photos} photos`} as PNG at true size (${full[0]?.dpm ?? 10} dots per mm). In Bambu Studio, import ${photos === 1 ? "it" : "them"} as an engraving and place ${photos === 1 ? "it" : "them"} over the cut lines.`,
      "success",
    );
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
          <label className="check-row" title="The beam takes away a strip as wide as the kerf, half each side of the line. Moving the lines by half of it makes pieces and holes come out the size you drew. Set the kerf for your material in Settings.">
            <input type="checkbox" checked={useKerf} disabled={kerf <= 0} onChange={(e) => setUseKerf(e.target.checked)} />
            {kerf > 0 ? `Allow for the kerf (${kerf} mm, ${doc.material.name}): cut lines moved out by half of it, holes in` : "Allow for the kerf (set the material's kerf in Settings first)"}
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
      {photos > 0 && (
        <p className="dialog-hint">
          {photos === 1 ? "The photo is" : `${photos} photos are`} in the SVG as {photos === 1 ? "a picture" : "pictures"}, at true size. If Bambu Studio leaves {photos === 1 ? "it" : "them"} out, save {photos === 1 ? "it" : "them"} as PNG and import {photos === 1 ? "it" : "them"} as an engraving.
          {!photosReady && " Getting the photos ready…"}
        </p>
      )}
      <div className="modal-actions">
        {photos > 0 && (
          <button type="button" className="text-button" onClick={savePhotos} disabled={!photosReady} style={{ marginRight: "auto" }} title="Each photo as a PNG at true size (it says its dots per mm), ready for the laser">
            <Icons.Export size={18} /> Save {photos === 1 ? "photo" : "photos"} as PNG
          </button>
        )}
        <button
          type="button"
          className="text-button send-to-juracad"
          onClick={() => void sendToJuraCAD(doc.name, laserDxf(makeSheet(doc, { items })))}
          disabled={sheet.paths.length === 0}
          title="Open these outlines in JuraCAD as a sketch, ready to extrude into a part (true size, not mirrored, no kerf)"
        >
          <Icons.Share size={18} /> Send to JuraCAD
        </button>
        <button type="button" className="text-button" onClick={() => save("dxf")} disabled={empty} title="DXF: for Bambu Studio and every other laser or CAD program; arcs stay exact">
          <Icons.Export size={18} /> Save DXF
        </button>
        <button type="button" className="primary-button" onClick={() => save("svg")} disabled={empty || !photosReady} title="SVG: what Bambu Studio's laser mode opens, with each colour as a layer">
          <Icons.Export size={18} /> Save SVG
        </button>
      </div>
    </Modal>
  );
}
