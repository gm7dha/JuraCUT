/**
 * Mountain puzzle: pick a mountain (a famous one, a grid reference, or your own OS map picture with its corners'
 * grid references — as in JuraCAD), fetch its heights, and turn it into stacked sheets, each cut into jigsaw pieces.
 * Each bed's worth of sheets is put on the bed in turn (replacing the last), ready to export. The maths is in
 * src/terrain/.
 */
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../model/store";
import { areaProblem, heightAt, readHeights, type HeightGrid } from "../terrain/elevation";
import { bedItems, bedSheets, MOUNTAIN_GROUP } from "../terrain/contourItems";
import { contourChecks, CONTOUR_DEFAULTS, makeContourPuzzle, smallestPiece, type ContourPuzzle, type ContourSpec } from "../terrain/contourPuzzle";
import { formatGridRef, parseGridRef, type GridPoint } from "../terrain/osGrid";
import { PEAKS } from "../terrain/peaks";
import { Modal } from "./Modal";
import { loadTerrainTile } from "./mountainTiles";

type Source = "peak" | "ref" | "picture";

interface Area {
  sw: GridPoint;
  width: number;
  height: number;
  name: string;
}

/** The area the choices describe, or a plain-English reason why not (as JuraCAD's Mountain puzzle). */
function areaFrom(source: Source, peakId: string, ref: string, km: [number, number], corners: [string, string]): Area | string {
  if (source === "picture") {
    const a = parseGridRef(corners[0]);
    const b = parseGridRef(corners[1]);
    if (!a || !b) return "Type the grid references of your picture's bottom-left and top-right corners (like NN 14 69).";
    const sw = { e: Math.min(a.e, b.e), n: Math.min(a.n, b.n) };
    const width = Math.abs(b.e - a.e);
    const height = Math.abs(b.n - a.n);
    return areaProblem(sw, width, height) ?? { sw, width, height, name: "My map" };
  }
  const peak = PEAKS.find((p) => p.id === peakId);
  const centre = parseGridRef(source === "peak" ? peak?.ref ?? "" : ref);
  const width = km[0] * 1000;
  const height = km[1] * 1000;
  if (!centre) return areaProblem(null, width, height)!;
  const sw = { e: centre.e - width / 2, n: centre.n - height / 2 };
  return areaProblem(sw, width, height) ?? { sw, width, height, name: source === "peak" && peak ? peak.name : `Mountain at ${formatGridRef(centre, 6) ?? ref}` };
}

const sameArea = (a: Area | null, b: Area | null) => !!a && !!b && a.sw.e === b.sw.e && a.sw.n === b.sw.n && a.width === b.width && a.height === b.height;

/** The ground's lowest and highest points over an area (m). */
function relief(grid: HeightGrid, area: Area): [number, number] {
  let [lo, hi] = [Infinity, -Infinity];
  const n = 100;
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const h = heightAt(grid, area.sw.e + (area.width * i) / n, area.sw.n + (area.height * j) / n);
      [lo, hi] = [Math.min(lo, h), Math.max(hi, h)];
    }
  return [lo, hi];
}

export function MountainDialog() {
  const close = () => useStore.getState().openDialog(null);
  const bed = useStore((s) => s.history.present.bed);
  const material = useStore((s) => s.history.present.material);
  const [source, setSource] = useState<Source>("peak");
  const [peakId, setPeakId] = useState(PEAKS[0].id);
  const [ref, setRef] = useState("NN 166 712");
  const [km, setKm] = useState<[number, number]>([5, 4]);
  const [corners, setCorners] = useState<[string, string]>(["", ""]);

  const [spec, setSpec] = useState<ContourSpec>(() => ({ ...CONTOUR_DEFAULTS, thickness: material.thickness || CONTOUR_DEFAULTS.thickness }));
  const [stretch, setStretch] = useState(1.5);
  const [loaded, setLoaded] = useState<{ area: Area; grid: HeightGrid; relief: [number, number] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [puzzle, setPuzzle] = useState<ContourPuzzle | null>(null);
  const [working, setWorking] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [shown, setShown] = useState(0);

  const area = areaFrom(source, peakId, ref, km, corners);
  const fresh = typeof area !== "string" && sameArea(loaded?.area ?? null, area);
  const set = <K extends keyof ContourSpec>(key: K, value: ContourSpec[K]) => setSpec((s) => ({ ...s, [key]: value }));

  // Sheets from the height stretch: each sheet is `thickness` mm of the stretched mountain.
  const layers = loaded ? Math.min(60, Math.max(2, Math.round(((loaded.relief[1] - loaded.relief[0]) * (spec.width / loaded.area.width) * stretch) / spec.thickness) + 1)) : spec.layers;
  const full: ContourSpec = { ...spec, layers };
  const checks = contourChecks(full);

  const getHeights = async () => {
    if (typeof area === "string") return;
    setLoading(true);
    setError(null);
    try {
      const grid = await readHeights(loadTerrainTile, area.sw, area.width, area.height);
      // The base sheet fills the bed (less a margin) to start with.
      const width = Math.floor(Math.min(bed[0] - 20, ((bed[1] - 20) * area.width) / area.height));
      set("width", Math.max(60, width));
      setLoaded({ area, grid, relief: relief(grid, area) });
      setShown(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const key = JSON.stringify(full);
  useEffect(() => {
    if (!loaded || checks.problems.length) {
      setPuzzle(null);
      return;
    }
    setWorking(true);
    const timer = setTimeout(() => {
      try {
        setPuzzle(makeContourPuzzle(loaded.grid, loaded.area.width, loaded.area.height, full, loaded.area.sw));
        setBuildError(null);
      } catch (e) {
        setPuzzle(null);
        setBuildError(e instanceof Error ? e.message : String(e));
      } finally {
        setWorking(false);
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, key]);

  const sheets = useMemo(() => (puzzle ? bedSheets(puzzle, bed) : []), [puzzle, bed[0], bed[1]]);
  const layer = puzzle?.layers[Math.min(shown, puzzle.layers.length - 1)];
  const putOnBed = (i: number) => {
    if (!puzzle) return;
    const s = useStore.getState();
    const items = bedItems(puzzle, sheets[i], s.history.present.items.map((x) => x.id));
    s.replaceItems((item) => !!item.group?.startsWith(MOUNTAIN_GROUP), items);
    s.showToast(`Bed ${i + 1} of ${sheets.length} is on the bed: sheets ${sheets[i].layers.map((l) => puzzle.layers[l.at].index + 1).join(", ")}.`);
    close();
  };
  const numberBox = (value: number, onChange: (v: number) => void, step: number, min: number, max: number, unit: string) => (
    <span className="mountain-number">
      <input type="number" value={value} step={step} min={min} max={max} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && onChange(e.target.valueAsNumber)} />
      <span className="muted">{unit}</span>
    </span>
  );

  return (
    <Modal title="Mountain puzzle" onClose={close} width={980}>
      <div className="mountain-layout">
        <div className="mountain-side">
          <h3 className="library-heading">1. The mountain</h3>
          <div className="mountain-choices" role="radiogroup" aria-label="Where the mountain comes from">
            {(
              [
                ["peak", "A famous mountain"],
                ["ref", "A grid reference"],
                ["picture", "My OS map's corners"],
              ] as [Source, string][]
            ).map(([id, label]) => (
              <label key={id}>
                <input type="radio" name="mountain-source" checked={source === id} onChange={() => setSource(id)} /> {label}
              </label>
            ))}
          </div>
          {source === "peak" && (
            <label className="mountain-row">
              <span>Mountain</span>
              <select value={peakId} onChange={(e) => setPeakId(e.target.value)}>
                {PEAKS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.height} m)
                  </option>
                ))}
              </select>
            </label>
          )}
          {source === "ref" && (
            <label className="mountain-row">
              <span>Middle at</span>
              <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="NN 166 712" />
            </label>
          )}
          {source !== "picture" ? (
            <div className="mountain-row">
              <span>Area</span>
              <span>
                {numberBox(km[0], (v) => setKm([v, km[1]]), 0.5, 0.2, 40, "km wide")} {numberBox(km[1], (v) => setKm([km[0], v]), 0.5, 0.2, 40, "km tall")}
              </span>
            </div>
          ) : (
            <>
              <p className="muted small">Type the grid references of your map's bottom-left and top-right corners — read them off the blue grid lines.</p>
              <label className="mountain-row">
                <span>Bottom left</span>
                <input value={corners[0]} onChange={(e) => setCorners([e.target.value, corners[1]])} placeholder="NN 14 69" />
              </label>
              <label className="mountain-row">
                <span>Top right</span>
                <input value={corners[1]} onChange={(e) => setCorners([corners[0], e.target.value])} placeholder="NN 19 73" />
              </label>
            </>
          )}
          {typeof area === "string" ? (
            <p className="error-text small">{area}</p>
          ) : (
            <button type="button" className="primary-button mountain-fetch" onClick={getHeights} disabled={loading || fresh}>
              {loading ? "Getting heights…" : fresh ? "Heights ready" : "Get the heights"}
            </button>
          )}
          {error && <p className="error-text small">{error}</p>}
          {loaded && !fresh && typeof area !== "string" && <p className="muted small">The area has changed — get the heights again to use it.</p>}

          <h3 className="library-heading">2. Sheets</h3>
          <div className="mountain-row">
            <span>Width</span>
            {numberBox(spec.width, (v) => set("width", v), 10, 60, 1000, "mm (the base sheet)")}
          </div>
          <div className="mountain-row">
            <span>Sheet</span>
            {numberBox(spec.thickness, (v) => set("thickness", v), 0.5, 1, 12, "mm thick")}
          </div>
          <div className="mountain-row">
            <span>Height stretch</span>
            <span>
              {numberBox(stretch, setStretch, 0.25, 0.25, 6, "×")}
              <span className="muted small"> → {layers} sheets</span>
            </span>
          </div>
          <div className="mountain-row">
            <span>Piece size</span>
            <span>
              {numberBox(spec.piece, (v) => set("piece", v), 1, 10, 200, "mm")}
              <span className={`small ${spec.piece < smallestPiece(spec.thickness) ? "error-text" : "muted"}`}> at least {smallestPiece(spec.thickness)} mm</span>
            </span>
          </div>
          <div className="mountain-row">
            <span>Pattern</span>
            {numberBox(spec.seed, (v) => set("seed", Math.round(v)), 1, 1, 999999, "")}
          </div>
          <label className="mountain-check">
            <input type="checkbox" checked={spec.stagger} onChange={(e) => set("stagger", e.target.checked)} /> Offset every other sheet's joins (like brickwork)
          </label>
          <label className="mountain-check">
            <input type="checkbox" checked={spec.guides} onChange={(e) => set("guides", e.target.checked)} /> Score where the next sheet sits
          </label>
          <label className="mountain-check">
            <input type="checkbox" checked={spec.labels} onChange={(e) => set("labels", e.target.checked)} /> Engrave each piece's name
          </label>
        </div>

        <div className="mountain-main">
          {!loaded ? (
            <div className="mountain-empty muted">
              <p>
                Choose a mountain and press <strong>Get the heights</strong>.
              </p>
              <p className="small">Heights come free from Amazon's open Terrain Tiles (built on OS Terrain 50 and NASA data), about 20–30 m apart.</p>
            </div>
          ) : (
            <>
              {layer && puzzle && <SheetPreview puzzle={puzzle} at={puzzle.layers.indexOf(layer)} />}
              {puzzle && (
                <label className="mountain-explode small">
                  Sheet {layer ? layer.index + 1 : 1} of {puzzle.spec.layers}
                  <input type="range" min={0} max={puzzle.layers.length - 1} value={Math.min(shown, puzzle.layers.length - 1)} onChange={(e) => setShown(Number(e.target.value))} />
                </label>
              )}
              {checks.problems.map((p) => (
                <p key={p} className="error-text small">
                  {p}
                </p>
              ))}
              {buildError && <p className="error-text small">{buildError}</p>}
              {working && <p className="muted small">Working…</p>}
              {puzzle && (
                <div className="mountain-summary small">
                  <p>
                    <strong>
                      {puzzle.layers.length} sheets, {puzzle.layers.reduce((n, l) => n + l.pieces, 0)} pieces
                    </strong>{" "}
                    — {Math.round(puzzle.width)} × {Math.round(puzzle.height)} mm and {Math.round(puzzle.layers.length * spec.thickness)} mm tall. Each sheet is{" "}
                    {Math.round(puzzle.metresPerLayer)} m of height; ground from {Math.round(puzzle.low)} m to {Math.round(puzzle.high)} m.
                  </p>
                  {puzzle.warnings.map((w) => (
                    <p key={w} className="mountain-warn">
                      {w}
                    </p>
                  ))}
                </div>
              )}
              {puzzle && sheets.length > 0 && (
                <div className="mountain-downloads">
                  <span className="small">
                    {sheets.length} {sheets.length === 1 ? "bed" : "beds"} of material:
                  </span>
                  {sheets.map((s, i) => (
                    <button key={i} type="button" className={i === 0 ? "primary-button" : "text-button"} onClick={() => putOnBed(i)} title="Puts these sheets on the bed, in place of any mountain sheets already there">
                      Bed {i + 1} (sheet{s.layers.length > 1 ? "s" : ""} {s.layers.map((l) => puzzle.layers[l.at].index + 1).join(", ")})
                    </button>
                  ))}
                </div>
              )}
              {puzzle && (
                <p className="muted small">
                  Put a bed's sheets on the bed, export and cut, then come back for the next. Pieces are named sheet-piece (3-7: sheet 3,
                  piece 7). Leave “Allow for the kerf” off: the pieces share their cuts, like the jigsaw.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** One sheet as it'll be cut: outline and cuts red, the next sheet's outline green, names in black. */
function SheetPreview({ puzzle, at }: { puzzle: ContourPuzzle; at: number }) {
  const L = puzzle.layers[at];
  const [W, H] = [puzzle.width, puzzle.height];
  const pt = (p: [number, number]) => `${p[0].toFixed(2)},${(H - p[1]).toFixed(2)}`;
  return (
    <svg className="mountain-sheet" viewBox={`-2 -2 ${W + 4} ${H + 4}`} role="img" aria-label={`Sheet ${L.index + 1}`}>
      {L.loops.length > 0 && <path d={L.loops.map((l) => `M${l.map(pt).join("L")}Z`).join("")} fill="var(--sheet-fill, #efe3cc)" fillRule="evenodd" stroke="#e03030" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />}
      {L.guide.map((l, i) => (
        <polygon key={`g${i}`} points={l.map(pt).join(" ")} fill="none" stroke="#18a018" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      ))}
      {L.cuts.map((c, i) => (
        <polyline key={`c${i}`} points={c.map(pt).join(" ")} fill="none" stroke="#e03030" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {L.labels.map((l, i) => (
        <text key={`t${i}`} x={l.at[0]} y={H - l.at[1] + 1.1} fontSize={3} textAnchor="middle" fill="#222">
          {l.text}
        </text>
      ))}
    </svg>
  );
}
