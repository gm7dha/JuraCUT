/**
 * The Picture window's "Engrave as a photo" tab: the picture made ready for
 * the laser (dots, black and white, or greys), lighter or darker, with more or
 * less contrast, at a size and a number of dots per mm, previewed as it'll
 * engrave. Put on the bed as a picture item.
 */
import { useMemo, useState } from "react";

import { newId, nameFromFileName } from "../model/document";
import { makePicture } from "../model/shapes";
import { useDocument, useStore } from "../model/store";
import type { PictureItem } from "../model/types";
import { Icons } from "./icons";
import { keepableSource, usePicturePreview } from "./pictures";
import type { Pixels } from "./TraceDialog";

export const PHOTO_MODES: [PictureItem["mode"], string, string][] = [
  ["dots", "Dots", "Shades made of tiny dots, as newspapers print photos — the usual way to laser a photo."],
  ["black", "Black & white", "Each spot either engraved or not, split at the middle grey: for drawings and signatures."],
  ["greys", "Greys", "The greys left as they are, for Bambu Studio to turn into its own engraving."],
];

export const RESOLUTIONS: [number, string][] = [
  [5, "Coarse (5 per mm)"],
  [10, "Normal (10 per mm)"],
  [15, "Fine (15 per mm)"],
];

export function PhotoTab({ picture, pixels, onDone }: { picture: { name: string; url: string }; pixels: Pixels | null; onDone: () => void }) {
  const doc = useDocument();
  const [mode, setMode] = useState<PictureItem["mode"]>("dots");
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [invert, setInvert] = useState(false);
  const [dpm, setDpm] = useState(10);
  const [width, setWidth] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const aspect = pixels ? pixels.height / pixels.width : 1;
  // Start at 100 mm across, or smaller to fit the bed.
  const w = width ?? Math.round(Math.min(100, (doc.bed[0] - 20) * 0.9, ((doc.bed[1] - 20) * 0.9) / aspect));
  const h = w * aspect;
  const item = useMemo(
    () => (pixels ? { ...makePicture("preview", "", picture.url, 0, 0, w, h), mode, brightness, contrast, invert, dpm } : null),
    [pixels, picture.url, w, h, mode, brightness, contrast, invert, dpm],
  );
  const preview = usePicturePreview(item);

  const insert = async () => {
    if (!item) return;
    setBusy(true);
    try {
      const kept = await keepableSource(picture.url);
      const s = useStore.getState();
      const id = newId(doc.items.map((it) => it.id));
      const name = nameFromFileName(picture.name) || "Photo";
      s.addItems([{ ...item, id, name, src: kept.url, cx: 10 + w / 2, cy: 10 + h / 2 }]);
      onDone();
      s.requestFit();
      s.showToast(`Put ${name} on the bed to engrave as a photo, ${Math.round(w)} × ${Math.round(h)} mm. Try a small test on scrap first.`, "success");
    } catch (e) {
      useStore.getState().showToast(e instanceof Error ? e.message : "That picture couldn't be read.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="trace-layout">
        <div className="trace-preview" aria-label="Preview of the photo as it will engrave">
          {preview ? <img src={preview} alt="" className="photo-preview" /> : <p className="muted">{pixels ? "Getting the preview ready…" : "Reading the picture…"}</p>}
        </div>
        <div className="trace-side">
          <div className="field-label">Style</div>
          <div className="segmented three" role="radiogroup" aria-label="Style">
            {PHOTO_MODES.map(([k, label, hint]) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} className={mode === k ? "selected" : ""} onClick={() => setMode(k)} title={hint}>
                {label}
              </button>
            ))}
          </div>
          <p className="dialog-hint field-hint">{PHOTO_MODES.find((m) => m[0] === mode)![2]}</p>
          <label className="field-label" htmlFor="photo-brightness">
            Lighter or darker ({brightness > 0 ? "+" : ""}
            {brightness})
          </label>
          <input id="photo-brightness" className="trace-slider" type="range" min={-100} max={100} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} />
          <label className="field-label" htmlFor="photo-contrast">
            Contrast ({contrast > 0 ? "+" : ""}
            {contrast})
          </label>
          <input id="photo-contrast" className="trace-slider" type="range" min={-100} max={100} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} />
          <label className="check-row">
            <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
            Engrave the light parts (for slate or dark materials that engrave light)
          </label>
          <div className="field-row">
            <label className="field">
              <span>Width</span>
              <span className="field-input">
                <input type="number" min={5} max={600} step="any" value={Math.round(w * 10) / 10} onChange={(e) => setWidth(Math.min(600, Math.max(5, Number(e.target.value) || 5)))} />
                <span className="unit">mm</span>
              </span>
            </label>
            <label className="field">
              <span>Detail</span>
              <select value={dpm} onChange={(e) => setDpm(Number(e.target.value))}>
                {RESOLUTIONS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="dialog-hint" style={{ marginTop: 0 }}>
            {Math.round(w * 10) / 10} × {Math.round(h * 10) / 10} mm. More dots per mm is finer but slower to engrave; 10 suits most wood.
          </p>
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="text-button" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="primary-button" disabled={!item || busy} onClick={() => void insert()}>
          <Icons.Plus size={18} /> Put on the bed
        </button>
      </div>
    </>
  );
}
