/**
 * The Trace window: a picture (a logo, a drawing, a scan) turned into
 * outlines to engrave, cut or score. The picture is read into a canvas (made
 * smaller first if it's very big), traced with geometry/trace.ts as the
 * settings change, and shown with the outlines over it.
 */
import { useEffect, useMemo, useState } from "react";

import { greyscale, otsuThreshold, tracePicture } from "../geometry/trace";
import { newId, nameFromFileName } from "../model/document";
import { makeShape, movedItem } from "../model/shapes";
import { useDocument, useStore } from "../model/store";
import { OPS, OP_INFO, type Op } from "../model/types";
import { itemPathData } from "./BedView";
import { Icons } from "./icons";
import { Modal } from "./Modal";
import { PhotoTab } from "./PhotoTab";

/** Pictures bigger than this (pixels along the longer side) are made smaller before tracing: plenty for a laser, and quick. */
const MAX_SIDE = 1000;

export interface Pixels {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  /** Otsu's threshold for this picture. */
  auto: number;
}

async function readPixels(url: string): Promise<Pixels> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * k));
  const height = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser can't read pictures here.");
  ctx.drawImage(img, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  return { rgba, width, height, auto: otsuThreshold(greyscale(rgba, width, height)) };
}

const DETAIL = { fine: 0.4, normal: 0.8, simple: 1.6 } as const;
const HOW_KEY = "juracut.pictureHow";
type Detail = keyof typeof DETAIL;

export function TraceDialog() {
  const picture = useStore((s) => s.picture);
  const openDialog = useStore((s) => s.openDialog);
  const doc = useDocument();
  const [pixels, setPixels] = useState<Pixels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [invert, setInvert] = useState(false);
  const [detail, setDetail] = useState<Detail>("normal");
  const [smooth, setSmooth] = useState(true);
  const [specks, setSpecks] = useState(1);
  const [width, setWidth] = useState(100);
  const [op, setOp] = useState<Op>("engrave");
  const [how, setHow] = useState<"trace" | "photo">(() => {
    try {
      return localStorage.getItem(HOW_KEY) === "photo" ? "photo" : "trace";
    } catch {
      return "trace";
    }
  });
  const chooseHow = (k: "trace" | "photo") => {
    setHow(k);
    try {
      localStorage.setItem(HOW_KEY, k);
    } catch {
      // Not remembered; fine.
    }
  };

  useEffect(() => {
    if (!picture) return;
    let live = true;
    readPixels(picture.url)
      .then((p) => {
        if (!live) return;
        setPixels(p);
        setThreshold(p.auto);
        // Start at a sensible size: 100 mm across, or smaller if that wouldn't fit the bed.
        const aspect = p.height / p.width;
        setWidth(Math.round(Math.min(100, (doc.bed[0] - 20) * 0.9, ((doc.bed[1] - 20) * 0.9) / aspect)));
      })
      .catch(() => live && setError("That picture couldn't be read. Try saving it as a PNG or JPG."));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picture?.url]);

  const scale = pixels ? width / pixels.width : 1;
  const traced = useMemo(() => {
    if (!pixels || threshold === null) return null;
    // Specks are set in mm²; the tracer works in pixels.
    return tracePicture(pixels.rgba, pixels.width, pixels.height, { threshold, invert, tolerance: DETAIL[detail], smooth, minArea: specks / (scale * scale), scale });
  }, [pixels, threshold, invert, detail, smooth, specks, scale]);

  const item = useMemo(() => (traced && traced.loops.length ? makeShape("preview", "Traced", traced.loops.map((segments) => ({ segments, closed: true }))) : null), [traced]);
  const d = useMemo(() => (item ? itemPathData(item) : ""), [item]);
  const heightMm = pixels ? (pixels.height * width) / pixels.width : 0;

  if (!picture) return null;
  const close = () => {
    useStore.setState({ picture: null });
    openDialog(null);
  };
  const insert = () => {
    if (!item || !traced) return;
    const s = useStore.getState();
    const id = newId(doc.items.map((it) => it.id));
    const name = nameFromFileName(picture.name) || "Traced picture";
    const shape = movedItem({ ...item, id, name, op }, 10, 10);
    s.addItems([shape]);
    close();
    s.requestFit();
    s.showToast(`Traced ${name}: ${traced.loops.length} ${traced.loops.length === 1 ? "outline" : "outlines"}, ${Math.round(width)} × ${Math.round(heightMm)} mm, to ${OP_INFO[op].label.toLowerCase()}.`, "success");
  };

  const vb = pixels ? `0 ${-heightMm} ${width} ${heightMm}` : "0 0 1 1";

  const tabs = (
    <div className="library-tabs" role="tablist" aria-label="What to make of the picture">
      {(
        [
          ["trace", "Trace into outlines"],
          ["photo", "Engrave as a photo"],
        ] as const
      ).map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={how === k} className={how === k ? "selected" : ""} onClick={() => chooseHow(k)}>
          {label}
        </button>
      ))}
    </div>
  );

  if (how === "photo" && !error)
    return (
      <Modal title={`Picture — ${picture.name}`} onClose={close} width={900}>
        {tabs}
        <PhotoTab picture={picture} pixels={pixels} onDone={close} />
      </Modal>
    );

  return (
    <Modal title={`Picture — ${picture.name}`} onClose={close} width={900}>
      {!error && tabs}
      {error ? (
        <p className="dialog-hint attention">
          <Icons.Warning size={16} /> {error}
        </p>
      ) : (
        <div className="trace-layout">
          <div className="trace-preview" aria-label="Preview of the traced outlines">
            {pixels && (
              <svg viewBox={vb} preserveAspectRatio="xMidYMid meet">
                <image href={picture.url} x={0} y={-heightMm} width={width} height={heightMm} opacity={0.25} preserveAspectRatio="none" />
                <g transform="scale(1 -1)">
                  <path
                    d={d}
                    fill={op === "engrave" ? "var(--ink)" : "none"}
                    fillOpacity={0.85}
                    fillRule="evenodd"
                    stroke={op === "engrave" ? "none" : op === "score" ? "#15a33a" : OP_INFO.cut.colour}
                    strokeWidth={1.2}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              </svg>
            )}
            {!pixels && <p className="muted">Reading the picture…</p>}
          </div>
          <div className="trace-side">
            <div className="field-label">Light and dark</div>
            <input
              type="range"
              min={0}
              max={255}
              value={threshold ?? 128}
              aria-label="Light and dark"
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="trace-slider"
              title="Pixels darker than this are traced. Move right to take in lighter greys."
            />
            <div className="trace-slider-row muted small">
              <span>Only the darkest</span>
              <button type="button" className="link-button small" onClick={() => pixels && setThreshold(pixels.auto)} title="Let JuraCUT pick the split between dark and light">
                Automatic
              </button>
              <span>Lighter greys too</span>
            </div>
            <label className="check-row">
              <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
              Trace the light parts instead (white on black)
            </label>
            <div className="field-label">Detail</div>
            <div className="segmented three" role="radiogroup" aria-label="Detail">
              {(["fine", "normal", "simple"] as Detail[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={detail === k} className={detail === k ? "selected" : ""} onClick={() => setDetail(k)}>
                  {k === "fine" ? "Fine" : k === "normal" ? "Normal" : "Simple"}
                </button>
              ))}
            </div>
            <label className="check-row">
              <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} />
              Smooth curves (sharp corners stay sharp)
            </label>
            <div className="field-row">
              <label className="field">
                <span>Width</span>
                <span className="field-input">
                  <input type="number" min={2} max={2000} step="any" value={width} onChange={(e) => setWidth(Math.min(2000, Math.max(2, Number(e.target.value) || 2)))} />
                  <span className="unit">mm</span>
                </span>
              </label>
              <label className="field">
                <span>Leave out specks under</span>
                <span className="field-input">
                  <input type="number" min={0} max={1000} step="any" value={specks} onChange={(e) => setSpecks(Math.max(0, Number(e.target.value) || 0))} />
                  <span className="unit">mm²</span>
                </span>
              </label>
            </div>
            <p className="dialog-hint" style={{ marginTop: 0 }}>
              {Math.round(width * 10) / 10} × {Math.round(heightMm * 10) / 10} mm
              {traced ? ` · ${traced.loops.length} ${traced.loops.length === 1 ? "outline" : "outlines"}${traced.specks ? `, ${traced.specks} specks left out` : ""}` : ""}
            </p>
            <div className="field-label">The laser should</div>
            <div className="segmented three" role="radiogroup" aria-label="What the laser does">
              {OPS.map((o) => (
                <button key={o} type="button" role="radio" aria-checked={op === o} className={op === o ? "selected" : ""} onClick={() => setOp(o)} title={OP_INFO[o].hint}>
                  <span className="op-dot" style={{ background: OP_INFO[o].colour }} /> {OP_INFO[o].label}
                </button>
              ))}
            </div>
            <p className="dialog-hint">Engrave fills the dark parts in. Cut or Score follows their outlines. Simple black-and-white pictures (logos, drawings) trace best.</p>
          </div>
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="text-button" onClick={close}>
          Cancel
        </button>
        <button type="button" className="primary-button" disabled={!item} onClick={insert}>
          <Icons.Plus size={18} /> Put on the bed
        </button>
      </div>
    </Modal>
  );
}
