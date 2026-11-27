/**
 * The Island relief window: a real island (or any area of Great Britain) carved into a board by the laser, the land
 * engraved deeper the lower it is — the summits stay at the surface, the coast goes deepest — then cut out round its
 * coast, in one piece or as a jigsaw. Heights come from open map tiles (terrainTiles.ts), the relief is worked out by
 * terrain/relief.ts, and it's put on the bed as ordinary shapes (model/reliefItems.ts): an engraved greys picture for
 * Bambu Studio's Grayscale mode, plus cut and score lines.
 */
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { pathPoints } from "../geometry/segments";
import { newId } from "../model/document";
import { reliefItems, testStripItems } from "../model/reliefItems";
import { useDocument, useStore } from "../model/store";
import type { Item } from "../model/types";
import { areaProblem, readHeights, zoomFor, type HeightGrid } from "../terrain/elevation";
import { ISLANDS } from "../terrain/islands";
import { parseGridRef } from "../terrain/osGrid";
import { LEAST_BASE, makeRelief, passMasks, PUZZLE_PATTERNS, RELIEF_DEFAULTS, reliefProblems, testStripGreys, type Relief, type ReliefArea, type ReliefSpec } from "../terrain/relief";
import { itemPathData } from "./BedView";
import { Icons } from "./icons";
import { Modal } from "./Modal";
import { loadTerrainTile } from "./terrainTiles";

/** Heights already fetched this session, by area. */
const heightsKept = new Map<string, HeightGrid>();
/** For the smoke test: heights given straight in (`?smoke`), so it needs no network. */
export const pretendHeights = new Map<string, HeightGrid>();

const CUSTOM = "custom";

/** Greys (row 0 at the top) as a picture: PNG for the preview, JPEG (much smaller) to keep in the design. */
function greysPicture(greys: Uint8Array, w: number, h: number, type: "image/png" | "image/jpeg"): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw pictures here.");
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const g = greys[i];
    img.data[i * 4] = g;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL(type, 0.95);
}

function Num({ label, value, onChange, unit, min, max, step = 1, hint }: { label: string; value: number; onChange: (v: number) => void; unit?: string; min: number; max: number; step?: number; hint?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const apply = (t: string) => {
    const v = Number(t);
    if (t.trim() !== "" && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
    else setText(String(value));
  };
  return (
    <label className="field" title={hint}>
      <span>{label}</span>
      <span className="field-input">
        <input type="number" min={min} max={max} step={step} value={text} aria-label={label} onChange={(e) => setText(e.target.value)} onBlur={(e) => apply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply((e.target as HTMLInputElement).value)} />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </label>
  );
}

export function IslandReliefDialog() {
  const openDialog = useStore((s) => s.openDialog);
  const doc = useDocument();
  const close = () => openDialog(null);
  const [placeId, setPlaceId] = useState("arran");
  const [ref, setRef] = useState("NR 950 400");
  const [kmWide, setKmWide] = useState(20);
  const [kmTall, setKmTall] = useState(20);
  const [spec, setSpec] = useState<ReliefSpec>(() => {
    const thickness = doc.material.thickness > 0 ? doc.material.thickness : RELIEF_DEFAULTS.thickness;
    return { ...RELIEF_DEFAULTS, thickness, depth: Math.max(0.5, Math.min(RELIEF_DEFAULTS.depth, Math.round((thickness - 2) * 10) / 10)), size: Math.min(RELIEF_DEFAULTS.size, Math.round(Math.min(doc.bed[0], doc.bed[1]) - 40)) };
  });
  const set = <K extends keyof ReliefSpec>(k: K, v: ReliefSpec[K]) => setSpec((s) => ({ ...s, [k]: v }));
  const [grid, setGrid] = useState<HeightGrid | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const place = ISLANDS.find((p) => p.id === placeId);
  const area: ReliefArea | null = useMemo(() => {
    if (place) return { sw: place.sw, width: place.width, height: place.height, only: place.only };
    const c = parseGridRef(ref);
    if (!c) return null;
    const width = Math.round(kmWide * 1000);
    const height = Math.round(kmTall * 1000);
    return { sw: { e: Math.round(c.e - width / 2), n: Math.round(c.n - height / 2) }, width, height };
  }, [place, ref, kmWide, kmTall]);
  const areaKey = area ? `${area.sw.e},${area.sw.n},${area.width},${area.height}` : "";
  const zoom = area ? zoomFor(area.sw, area.width, area.height) : 0;
  const problem = area ? areaProblem(area.sw, area.width, area.height, 1300000, zoom) : "That isn't a grid reference I can read — try one like NR 950 400.";
  const placeName = place?.name ?? "";

  // Fetch the heights when the area changes (kept for the session).
  useEffect(() => {
    setError(null);
    if (!area || problem) {
      setGrid(null);
      return;
    }
    const kept = pretendHeights.get(placeId) ?? heightsKept.get(areaKey);
    if (kept) {
      setGrid(kept);
      return;
    }
    let live = true;
    setGrid(null);
    setLoading(true);
    const spacing = Math.max(10, Math.max(area.width, area.height) / 1000);
    readHeights(loadTerrainTile, area.sw, area.width, area.height, spacing, zoom)
      .then((g) => {
        heightsKept.set(areaKey, g);
        if (live) setGrid(g);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "The heights couldn't be read."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaKey, problem]);

  // The name on the frame follows the island picked, until it's typed over.
  const [nameTyped, setNameTyped] = useState(false);
  useEffect(() => {
    if (!nameTyped) setSpec((s) => ({ ...s, name: placeName }));
  }, [placeName, nameTyped]);

  const later = useDeferredValue(spec);
  const specProblems = reliefProblems(later);
  const made = useMemo((): { relief: Relief | null; error: string | null } => {
    if (!grid || !area || specProblems.length) return { relief: null, error: null };
    try {
      return { relief: makeRelief(grid, area, later), error: null };
    } catch (e) {
      return { relief: null, error: e instanceof Error ? e.message : "This area couldn't be made into a relief." };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, areaKey, later, specProblems.length]);
  const relief = made.relief;
  const previewSrc = useMemo(() => (relief ? greysPicture(relief.greys, relief.gw, relief.gh, "image/png") : ""), [relief]);
  const preview = useMemo(() => (relief ? reliefItems(relief, later, "", later.name, (() => { let k = 0; return () => `p${k++}`; })(), relief.frame ? [relief.frame.x, relief.frame.y] : [0, 0]) : []), [relief, later]);

  const [outW, outH] = relief ? (relief.frame ? [relief.frame.w, relief.frame.h] : [relief.width, relief.height]) : [0, 0];
  const fits = !relief || (outW + 10 <= doc.bed[0] && outH + 10 <= doc.bed[1]) || (outH + 10 <= doc.bed[0] && outW + 10 <= doc.bed[1]);
  const allProblems = [...reliefProblems(spec), ...(fits ? [] : ["That's bigger than the bed: make it smaller, or the frame narrower."])];

  const insert = () => {
    if (!relief) return;
    const s = useStore.getState();
    const taken = new Set(doc.items.map((it) => it.id));
    const freshId = () => {
      const id = newId(taken);
      taken.add(id);
      return id;
    };
    const src = spec.carve === "passes" ? passMasks(relief, spec.steps).map((m) => greysPicture(m, relief.gw, relief.gh, "image/png")) : greysPicture(relief.greys, relief.gw, relief.gh, "image/jpeg");
    const items = reliefItems(relief, spec, src, spec.name || placeName || "Island", freshId);
    s.addItems(items);
    close();
    s.requestFit();
    s.showToast(`Put the island relief on the bed (${items.length} shapes). Engrave the depth picture with Bambu Studio's Grayscale mode, then cut — try the depth test strip on scrap first.`, "success");
  };

  const insertStrip = () => {
    const s = useStore.getState();
    const taken = new Set(doc.items.map((it) => it.id));
    const freshId = () => {
      const id = newId(taken);
      taken.add(id);
      return id;
    };
    // In passes: one square to engrave once, which should come out one layer deep; else six greys from none to full depth.
    const passes = spec.carve === "passes";
    const strip = testStripGreys(passes ? 1 : 6, 100);
    const layer = spec.depth / Math.max(1, spec.steps - 1);
    const items = testStripItems(strip.levels, passes ? layer : spec.depth, greysPicture(strip.greys, strip.w, strip.h, "image/png"), freshId).map((it) => (passes && it.kind === "picture" ? { ...it, mode: "black" as const } : it));
    s.addItems(items);
    close();
    s.requestFit();
    s.showToast("Put a depth test strip on the bed. Engrave it with the settings you'll use: the black square should come out as deep as you chose.", "success");
  };

  // The preview: the depth picture inside the coast, the lines over it.
  const box = relief ? (relief.frame ? [relief.frame.x, relief.frame.y, relief.frame.w, relief.frame.h] : [0, 0, relief.width, relief.height]) : [0, 0, 1, 1];
  const pad = Math.max(box[2], box[3]) * 0.02;
  const vb = `${box[0] - pad} ${-(box[1] + box[3]) - pad} ${box[2] + 2 * pad} ${box[3] + 2 * pad}`;
  const coastPath = relief ? relief.coast.map((l) => "M" + pathPoints(l, true, 0.1).map((p) => `${p[0].toFixed(2)},${(-p[1]).toFixed(2)}`).join("L") + "Z").join(" ") : "";
  const lines = preview.filter((it: Item) => it.kind !== "picture");

  const base = Math.round((spec.thickness - spec.depth) * 10) / 10;
  const field = (n: number) => Math.round(n * 10) / 10;

  return (
    <Modal title="Island relief" onClose={close} width={980}>
      <p className="small" style={{ marginTop: 0 }}>
        A real island carved into a board by the laser: the higher the ground, the less is burnt away, so the hills stand up from the sea. It's cut out round its coast — in one piece, or as a jigsaw — and can sit in a frame.
      </p>
      <div className="trace-layout relief-layout">
        <div className="trace-preview" aria-label="Preview of the island relief">
          {relief ? (
            <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" className="relief-preview">
              <defs>
                <clipPath id="relief-coast">
                  <path d={coastPath} clipRule="evenodd" />
                </clipPath>
              </defs>
              {relief.frame && <rect x={relief.frame.x} y={-(relief.frame.y + relief.frame.h)} width={relief.frame.w} height={relief.frame.h} fill="#fff" />}
              <image href={previewSrc} x={0} y={-relief.height} width={relief.width} height={relief.height} preserveAspectRatio="none" clipPath="url(#relief-coast)" />
              <g transform="scale(1 -1)">
                {lines.map((it) =>
                  it.kind === "text" ? (
                    <path key={it.id} d={itemPathData(it)} fill="#1f2a37" fillRule="evenodd" />
                  ) : (
                    <path key={it.id} d={itemPathData(it)} fill="none" stroke={it.op === "score" ? "#15a33a" : "#e0301e"} strokeWidth={it.op === "score" ? 0.8 : 1.3} vectorEffect="non-scaling-stroke" />
                  ),
                )}
              </g>
            </svg>
          ) : (
            <p className="muted">{loading ? "Fetching the heights…" : error ?? made.error ?? problem ?? (allProblems.length ? allProblems[0] : "Working it out…")}</p>
          )}
        </div>
        <div className="trace-side relief-side">
          <label className="field">
            <span>Island</span>
            <select value={placeId} onChange={(e) => setPlaceId(e.target.value)} aria-label="Island">
              {ISLANDS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value={CUSTOM}>Another place (grid reference)…</option>
            </select>
          </label>
          {placeId === CUSTOM && (
            <>
              <label className="field">
                <span>Middle (OS grid reference)</span>
                <input type="text" value={ref} spellCheck={false} aria-label="Middle (OS grid reference)" onChange={(e) => setRef(e.target.value)} />
              </label>
              <div className="field-row">
                <Num label="Width" value={kmWide} onChange={setKmWide} unit="km" min={0.5} max={1300} step={0.5} />
                <Num label="Height" value={kmTall} onChange={setKmTall} unit="km" min={0.5} max={1300} step={0.5} />
              </div>
            </>
          )}
          <label className="field">
            <span>Land kept</span>
            <select value={spec.land} onChange={(e) => set("land", e.target.value as ReliefSpec["land"])} aria-label="Land kept">
              <option value="islands">Every island (not land running off the edge)</option>
              <option value="biggest">Only the biggest island</option>
              <option value="all">All the land</option>
            </select>
          </label>

          <div className="field-label">The board</div>
          <div className="field-row">
            <Num label="Thickness" value={spec.thickness} onChange={(v) => set("thickness", v)} unit="mm" min={1} max={30} step={0.5} hint="How thick the board (plywood, MDF, acrylic…) is." />
            <Num label="Carve down to" value={spec.depth} onChange={(v) => set("depth", v)} unit="mm" min={0.2} max={29} step={0.1} hint="How deep the coast is carved: the lowest ground. The summits stay at the surface." />
          </div>
          <p className="dialog-hint" style={{ marginTop: 0 }}>
            {base >= LEAST_BASE ? `${base} mm of board left under the coast.` : `Leave at least ${LEAST_BASE} mm under the carving.`}
          </p>
          <div className="field-row">
            <Num label="Size (longer side)" value={spec.size} onChange={(v) => set("size", v)} unit="mm" min={30} max={1000} hint="The island's longer side on the bed." />
            <Num label="Contours every" value={spec.contours} onChange={(v) => set("contours", v)} unit="m" min={0} max={2000} step={10} hint="Score a contour line every so many metres of height (0: none)." />
          </div>

          <div className="field-label">The carving</div>
          <div className="segmented" role="radiogroup" aria-label="How it's carved">
            {(["greys", "passes"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={(spec.carve ?? "greys") === k}
                className={(spec.carve ?? "greys") === k ? "selected" : ""}
                onClick={() => setSpec((s) => ({ ...s, carve: k, ...(k === "passes" ? { style: "terraced" as const } : {}) }))}
                title={k === "greys" ? "One engraving: its greys set the laser's power (Bambu Studio's Grayscale mode). Smooth slopes; needs testing to find the power." : "Terraced steps, one black-and-white engraving per step, all at the same power: each takes off an equal layer. Even, predictable depths."}
              >
                {k === "greys" ? "In greys" : "In passes"}
              </button>
            ))}
          </div>
          <div className="segmented" role="radiogroup" aria-label="Carving style">
            {(["smooth", "terraced"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={spec.style === k} className={spec.style === k ? "selected" : ""} disabled={k === "smooth" && spec.carve === "passes"} onClick={() => set("style", k)} title={k === "smooth" ? "The ground carved smoothly, as it is." : "The ground carved in flat steps, like a contour model."}>
                {k === "smooth" ? "Smooth" : "Terraced steps"}
              </button>
            ))}
          </div>
          {spec.style === "terraced" && <Num label="Steps" value={spec.steps} onChange={(v) => set("steps", Math.round(v))} min={2} max={20} />}
          {spec.carve === "passes" && (
            <p className="dialog-hint" style={{ marginTop: 0 }}>
              {spec.steps - 1} {spec.steps - 1 === 1 ? "pass" : "passes"}, each taking off {Math.round((spec.depth / Math.max(1, spec.steps - 1)) * 100) / 100} mm.
            </p>
          )}
          <label className="field" title="Left lifts the lower ground so more of the island shows; right makes the peaks stand out.">
            <span>Hills {spec.curve < 0.95 ? "(low ground lifted)" : spec.curve > 1.05 ? "(peaks sharpened)" : "(as they are)"}</span>
            <input type="range" className="trace-slider" min={0.4} max={2} step={0.05} value={spec.curve} aria-label="Hills" onChange={(e) => set("curve", Number(e.target.value))} />
          </label>

          <div className="field-label">Pieces</div>
          <label className="field">
            <span>Pattern</span>
            <select value={spec.puzzle} onChange={(e) => set("puzzle", e.target.value as ReliefSpec["puzzle"])} aria-label="Pattern" title={PUZZLE_PATTERNS.find((p) => p.value === spec.puzzle)?.hint}>
              {PUZZLE_PATTERNS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {spec.puzzle !== "none" && (
            <div className="field-row">
              <Num label="Pieces across" value={spec.pieces} onChange={(v) => set("pieces", Math.round(v))} min={2} max={20} hint="Pieces along the island's longer side." />
              <Num label="Pattern number" value={spec.seed} onChange={(v) => set("seed", Math.round(v))} min={1} max={9999} hint="Each number gives another arrangement of the cuts." />
            </div>
          )}
          <div className="field-row">
            <Num label="Frame" value={spec.frame} onChange={(v) => set("frame", v)} unit="mm" min={0} max={60} hint="A frame round the island, cut from the same board, that the island (or its pieces) drops back into. 0: none." />
            {spec.frame > 0 && (
              <label className="field">
                <span>Name on the frame</span>
                <input
                  type="text"
                  value={spec.name}
                  maxLength={60}
                  aria-label="Name on the frame"
                  onChange={(e) => {
                    setNameTyped(true);
                    set("name", e.target.value);
                  }}
                />
              </label>
            )}
          </div>
          {spec.frame > 0 && (
            <label className="check-row">
              <input type="checkbox" checked={spec.scaleBar !== false} onChange={(e) => set("scaleBar", e.target.checked)} />
              A scale bar on the frame (scored, with its distance engraved)
            </label>
          )}

          {relief && (
            <p className="dialog-hint" aria-live="polite">
              {field(relief.width)} × {field(relief.height)} mm{relief.frame ? ` (${field(relief.frame.w)} × ${field(relief.frame.h)} with the frame)` : ""} · highest ground {Math.round(relief.highest)} m · heights {relief.exaggeration >= 1 ? `stretched ×${Math.round(relief.exaggeration * 10) / 10}` : `squashed to ×${Number(relief.exaggeration.toPrecision(2))}`}
              {relief.cuts.length ? ` · about ${relief.pieces} pieces` : ""}
            </p>
          )}
          {[...allProblems, ...(relief?.warnings ?? [])].map((w) => (
            <p key={w} className="dialog-hint attention">
              <Icons.Warning size={14} /> {w}
            </p>
          ))}
        </div>
      </div>
      <details className="relief-how">
        <summary>How to carve it on the Bambu Lab R1</summary>
        <ol className="small">
          {spec.carve === "passes" ? (
            <>
              <li>Engrave the depth test square on a scrap of the same board first, once, and change the power or speed until it comes out {Math.round((spec.depth / Math.max(1, spec.steps - 1)) * 100) / 100} mm deep.</li>
              <li>Engrave each pass picture of the island in turn with those settings (they lie on top of each other). Each only covers the land, so the sea and frame are left untouched.</li>
            </>
          ) : (
            <>
              <li>Engrave the depth test strip on a scrap of the same board first. In Bambu Studio set the depth picture to <b>Grayscale</b>, with the lowest power at 0 (white isn't burnt) and the highest power — or more passes — until the black square is {spec.depth} mm deep.</li>
              <li>Engrave the island's depth picture with those settings. It only covers the land, so the sea and frame are left untouched.</li>
            </>
          )}
          <li>Then cut: the coast, the jigsaw lines and the frame are red cut lines; contours are green score lines.</li>
          <li>With a frame, export without the kerf allowance, so the island and the frame each keep the cut between them and the pieces drop back in.</li>
        </ol>
        <p className="muted small">Heights from the open Terrain Tiles on AWS (Mapzen: SRTM, EU-DEM, OS Terrain and other open data).</p>
      </details>
      <div className="modal-actions">
        <button type="button" className="text-button" onClick={insertStrip} style={{ marginRight: "auto" }} title={spec.carve === "passes" ? "A square to engrave once on scrap, to find the power for one pass." : "Six squares from no burn to full depth, to try your settings on scrap."}>
          {spec.carve === "passes" ? "Depth test square" : "Depth test strip"}
        </button>
        <button type="button" className="text-button" onClick={close}>
          Cancel
        </button>
        <button type="button" className="primary-button" disabled={!relief || allProblems.length > 0} onClick={insert}>
          <Icons.Plus size={18} /> Put on the bed
        </button>
      </div>
    </Modal>
  );
}
