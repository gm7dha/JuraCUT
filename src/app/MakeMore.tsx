/**
 * "Make more" under the selected shapes' settings: Outline (a border round them), Combine (join, cut out, overlap —
 * two or more shapes) and Step and repeat (a grid of copies). The sizes are remembered on this computer
 * (localStorage `juracut.makeMore`), and the right-click menu uses them too.
 */
import { useEffect, useState } from "react";

import { canCombine } from "../model/combine";
import { entriesFrom, hasPlace, numberNames } from "../model/names";
import { MOST_COPIES } from "../model/repeat";
import { useStore } from "../model/store";
import { pathFor } from "../model/textPath";
import { DEFAULT_HATCH, LEAST_SPACING } from "../model/hatch";
import { canTidy, DEFAULT_TIDY_GAP, TIDY_GAPS } from "../model/tidy";
import type { Item } from "../model/types";

const KEY = "juracut.makeMore";

export interface MakeMoreSettings {
  distance: number;
  fill: boolean;
  /** Outline inside the shapes rather than round them. */
  inside: boolean;
  /** Step and repeat in a grid, or round a circle. */
  round: boolean;
  count: number;
  radius: number;
  turn: boolean;
  cols: number;
  rows: number;
  gap: number;
  /** How far apart line ends may be and still be joined by Tidy up (mm). */
  tidyGap: number;
  cornerRadius: number;
  hatchSpacing: number;
  hatchAngle: number;
  hatchCross: boolean;
  /** Copy along a path: how many copies, turned with it. */
  pathCount: number;
  pathTurn: boolean;
}

const DEFAULTS: MakeMoreSettings = { distance: 3, fill: true, inside: false, round: false, count: 8, radius: 40, turn: true, cols: 3, rows: 2, gap: 5, tidyGap: DEFAULT_TIDY_GAP, cornerRadius: 3, hatchSpacing: DEFAULT_HATCH.spacing, hatchAngle: DEFAULT_HATCH.angle, hatchCross: false, pathCount: 8, pathTurn: true };
const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function makeMoreSettings(): MakeMoreSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Record<keyof MakeMoreSettings, unknown>>;
    return {
      distance: clamp(v.distance, 0.1, 100, DEFAULTS.distance),
      fill: v.fill !== false,
      inside: v.inside === true,
      round: v.round === true,
      count: Math.round(clamp(v.count, 2, 360, DEFAULTS.count)),
      radius: clamp(v.radius, 0.1, 5000, DEFAULTS.radius),
      turn: v.turn !== false,
      cols: Math.round(clamp(v.cols, 1, 50, DEFAULTS.cols)),
      rows: Math.round(clamp(v.rows, 1, 50, DEFAULTS.rows)),
      gap: clamp(v.gap, -1000, 1000, DEFAULTS.gap),
      cornerRadius: clamp(v.cornerRadius, 0.1, 500, DEFAULTS.cornerRadius),
      hatchSpacing: clamp(v.hatchSpacing, LEAST_SPACING, 50, DEFAULTS.hatchSpacing),
      hatchAngle: clamp(v.hatchAngle, -360, 360, DEFAULTS.hatchAngle),
      hatchCross: v.hatchCross === true,
      pathCount: Math.round(clamp(v.pathCount, 1, MOST_COPIES, DEFAULTS.pathCount)),
      pathTurn: v.pathTurn !== false,
      tidyGap: (TIDY_GAPS as readonly number[]).includes(v.tidyGap as number) ? (v.tidyGap as number) : DEFAULTS.tidyGap,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Shapes Round corners can change (words, circles, ovals, QR codes and photos have none to round). */
const roundable = (it: Item) => !["text", "qr", "picture", "circle", "ellipse"].includes(it.kind);

function keep(s: MakeMoreSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not remembered; fine.
  }
}

/** A small number box that keeps what's typed until it's a number. */
function Num({ label, value, unit, min, max, whole, onChange }: { label: string; value: number; unit?: string; min: number; max: number; whole?: boolean; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    let v = Number(text.replace(",", "."));
    if (!Number.isFinite(v)) return setText(String(value));
    v = Math.min(max, Math.max(min, whole ? Math.round(v) : v));
    setText(String(v));
    if (v !== value) onChange(v);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-input">
        <input type="text" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </label>
  );
}

const NAMES_KEY = "juracut.names";

/**
 * Copies with different words: a list of names (or numbers), one copy each, laid out like Step and repeat's grid
 * (its "Across" and "Gap"). "#" in the words is replaced by the name; else the words become the name.
 */
function NamedCopies({ cols, gap, table }: { cols: number; gap: number; table: boolean }) {
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(NAMES_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(10);
  const [shrink, setShrink] = useState(true);
  const keepText = (t: string) => {
    setText(t);
    try {
      localStorage.setItem(NAMES_KEY, t.slice(0, 20000));
    } catch {
      // Not kept; fine.
    }
  };
  const { entries: names, headings } = entriesFrom(text, table);
  const openCsv = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) return useStore.getState().showToast("That file is too big for a list of names.", "info");
    void f.text().then(keepText);
  };
  return (
    <>
      <div className="field-label" title="One copy of the selection for each name: name tags, numbered keyrings, labels">
        Copies with different words
      </div>
      <textarea
        className="text-box names-box"
        rows={4}
        value={text}
        placeholder={table ? "A spreadsheet: headings first, e.g.\nName,Table\nAmy,3\nBen,5" : "One per line, e.g.\nAmy\nBen\nCharlotte"}
        aria-label="Names, one per line"
        onChange={(e) => keepText(e.target.value)}
      />
      <label className="text-button make-button wide file-button" title="A .csv file saved from Excel, Numbers or Google Sheets: first row the headings">
        Open a spreadsheet (.csv)…
        <input type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => openCsv(e.target.files?.[0])} />
      </label>
      {headings.length > 0 && <p className="dialog-hint">Columns: {headings.map((h) => `{${h}}`).join(" ")} — put these in the words.</p>}
      <div className="field-row">
        <Num label="Numbers from" value={from} min={-99999} max={99999} whole onChange={setFrom} />
        <Num label="to" value={to} min={-99999} max={99999} whole onChange={setTo} />
        <button type="button" className="text-button make-button" onClick={() => keepText(numberNames(from, to).join("\n"))} title="Fill the list with these numbers">
          Fill
        </button>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={shrink} onChange={(e) => setShrink(e.target.checked)} />
        Make long words smaller to fit
      </label>
      <p className="dialog-hint">
        The first name goes on the shapes you picked. Put # in the words to keep the rest (e.g. "Table #"), or {"{Heading}"} for a spreadsheet's column (e.g. "{"{Name}"} — table {"{Table}"}").
      </p>
      <button type="button" className="text-button make-button wide" disabled={names.length < 1} onClick={() => useStore.getState().nameCopiesSelected(names, cols, gap, shrink)}>
        {names.length > 1 ? `Make ${names.length - 1} named ${names.length === 2 ? "copy" : "copies"}` : names.length === 1 ? "Change the words" : "Type some names first"}
      </button>
    </>
  );
}

export function MakeMore({ items }: { items: readonly Item[] }) {
  const [s, setS] = useState(makeMoreSettings);
  const set = (patch: Partial<MakeMoreSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    keep(next);
  };
  const st = useStore.getState;
  const combinable = canCombine(items);
  const route = pathFor(items);
  const copies = s.cols * s.rows - 1;
  return (
    <div className="make-more">
      <div className="field-label">Outline</div>
      <div className="segmented two" role="radiogroup" aria-label="Outline round or inside">
        <button type="button" role="radio" aria-checked={!s.inside} className={!s.inside ? "selected" : ""} onClick={() => set({ inside: false })} title="Round the outside of the shapes">
          Round them
        </button>
        <button type="button" role="radio" aria-checked={s.inside} className={s.inside ? "selected" : ""} onClick={() => set({ inside: true })} title="Inside the shapes, following their edges (a frame's inner line, an inlay)">
          Inside them
        </button>
      </div>
      <div className="field-row">
        <Num label={s.inside ? "Distance in" : "Distance out"} value={s.distance} unit="mm" min={0.1} max={100} onChange={(distance) => set({ distance })} />
        <button type="button" className="text-button make-button" onClick={() => st().outlineSelected(s.distance, s.fill, s.inside)} title={s.inside ? "A new cut shape inside the selection, this far in from its edges" : "A new cut shape round the selection, this far out: a border round words, or a backing to glue them to"}>
          Add outline
        </button>
      </div>
      {!s.inside && (
        <label className="check-row">
          <input type="checkbox" checked={s.fill} onChange={(e) => set({ fill: e.target.checked })} />
          Fill gaps inside (one solid piece)
        </label>
      )}

      {items.some(roundable) && (
        <>
          <div className="field-label">Corners</div>
          <div className="field-row">
            <Num label="Size" value={s.cornerRadius} unit="mm" min={0.1} max={500} onChange={(cornerRadius) => set({ cornerRadius })} />
            <button type="button" className="text-button make-button" onClick={() => st().roundCornersSelected(s.cornerRadius)} title="Every sharp corner where two straight lines meet becomes a curve of this radius (as big as fits)">
              Round
            </button>
          </div>
          <button type="button" className="text-button make-button" onClick={() => st().roundCornersSelected(s.cornerRadius, true)} title="Every sharp corner where two straight lines meet is cut off straight, this far back along each side (a 45° bevel on a square corner)">
            Cut corners off (chamfer)
          </button>
        </>
      )}

      {items.some((it) => it.kind !== "picture" && it.kind !== "line") && (
        <>
          <div className="field-label">Hatch fill</div>
          <div className="field-row">
            <Num label="Lines apart" value={s.hatchSpacing} unit="mm" min={LEAST_SPACING} max={50} onChange={(hatchSpacing) => set({ hatchSpacing })} />
            <Num label="Angle" value={s.hatchAngle} unit="°" min={-360} max={360} onChange={(hatchAngle) => set({ hatchAngle })} />
          </div>
          <div className="field-row">
            <label className="check-row">
              <input type="checkbox" checked={s.hatchCross} onChange={(e) => set({ hatchCross: e.target.checked })} />
              Cross-hatch
            </label>
            <button type="button" className="text-button make-button" onClick={() => st().hatchSelected({ spacing: s.hatchSpacing, angle: s.hatchAngle, cross: s.hatchCross })} title="Fill the shapes with parallel lines, scored: shades an area much faster than engraving it. The lines are grouped with their shape.">
              Fill with lines
            </button>
          </div>
        </>
      )}

      {items.length > 1 && (
        <>
          <div className="field-label">Combine</div>
          <div className="segmented three combine-buttons">
            <button type="button" disabled={!combinable} onClick={() => st().combineSelected("join")} title="Join the shapes into one (where they overlap, the lines between go)">
              Join
            </button>
            <button type="button" disabled={!combinable} onClick={() => st().combineSelected("cutOut")} title="Cut the smaller shapes out of the biggest one">
              Cut out
            </button>
            <button type="button" disabled={!combinable} onClick={() => st().combineSelected("overlap")} title="Keep only where all the shapes overlap">
              Overlap
            </button>
          </div>
          {!combinable && <p className="dialog-hint">Combine needs two or more shapes with an area (lines and photos can't be combined).</p>}
        </>
      )}

      <div className="field-label">Step and repeat</div>
      <div className="segmented two" role="radiogroup" aria-label="Copies in a grid or round a circle">
        <button type="button" role="radio" aria-checked={!s.round} className={!s.round ? "selected" : ""} onClick={() => set({ round: false })}>
          In a grid
        </button>
        <button type="button" role="radio" aria-checked={s.round} className={s.round ? "selected" : ""} onClick={() => set({ round: true })}>
          Round a circle
        </button>
      </div>
      {!s.round ? (
        <>
          <div className="field-row">
            <Num label="Across" value={s.cols} min={1} max={50} whole onChange={(cols) => set({ cols })} />
            <Num label="Up" value={s.rows} min={1} max={50} whole onChange={(rows) => set({ rows })} />
            <Num label="Gap" value={s.gap} unit="mm" min={-1000} max={1000} onChange={(gap) => set({ gap })} />
          </div>
          <button type="button" className="text-button make-button wide" disabled={copies < 1} onClick={() => st().repeatSelected(s.cols, s.rows, s.gap, s.gap)} title="Copies in a grid, starting from the selection (bottom left)">
            Make {copies} {copies === 1 ? "copy" : "copies"}
          </button>
        </>
      ) : (
        <>
          <div className="field-row">
            <Num label="How many in all" value={s.count} min={2} max={360} whole onChange={(count) => set({ count })} />
            <Num label="Circle's radius" value={s.radius} unit="mm" min={0.1} max={5000} onChange={(radius) => set({ radius })} />
          </div>
          <label className="check-row">
            <input type="checkbox" checked={s.turn} onChange={(e) => set({ turn: e.target.checked })} />
            Turn each copy with the circle
          </label>
          <button type="button" className="text-button make-button wide" onClick={() => st().repeatRoundSelected(s.count, s.radius, s.turn)} title="The selection stays at the top; copies go round clockwise, evenly spaced, round a circle whose middle is this far below it">
            Make {s.count - 1} {s.count === 2 ? "copy" : "copies"} round a circle
          </button>
        </>
      )}
      {route && (
        <>
          <div className="field-label">Copies along a path</div>
          <p className="dialog-hint make-hint">The biggest shape picked, "{route.item.name}", is the path; the others are copied along it.</p>
          <div className="field-row">
            <Num label="How many" value={s.pathCount} min={1} max={MOST_COPIES} whole onChange={(pathCount) => set({ pathCount })} />
            <label className="check-row path-turn">
              <input type="checkbox" checked={s.pathTurn} onChange={(e) => set({ pathTurn: e.target.checked })} />
              Turn with the path
            </label>
          </div>
          <button type="button" className="text-button make-button wide" onClick={() => st().copyAlongPathSelected(s.pathCount, s.pathTurn)} title="Copies spaced evenly along the path's outline — all the way round a closed shape, end to end along a line">
            Copy along the path
          </button>
        </>
      )}
      {items.length === 2 && items.filter((it) => it.kind === "text").length === 1 && items.some((it) => it.kind !== "text" && it.kind !== "qr" && it.kind !== "picture") && (
        <>
          <div className="field-label">Words along a path</div>
          <button type="button" className="text-button make-button wide" onClick={() => useStore.getState().putTextOnPath()} title="The words follow the other shape's outline (its longest), centred on its top or its middle. The shape stays where it is: hide it, or score it, if it's only a guide.">
            Put the words along the shape
          </button>
        </>
      )}
      {items.length === 2 && items.some((it) => it.kind === "picture") && items.some((it) => it.kind !== "picture" && it.kind !== "line") && (
        <>
          <div className="field-label">Photo mask</div>
          <button type="button" className="text-button make-button wide" onClick={() => useStore.getState().maskPictureWithShape()} title="Engrave only the part of the photo inside the shape (a heart, a star, any outline)">
            Engrave the photo only inside the shape
          </button>
        </>
      )}
      {items.some((it) => it.kind === "text" || (it.kind === "qr" && hasPlace(it.text))) && (
        <NamedCopies cols={s.cols} gap={s.gap} table={items.some((it) => (it.kind === "text" || it.kind === "qr") && /\{[^{}]{1,40}\}/.test(it.text))} />
      )}
      {items.some(canTidy) && (
        <>
          <div className="field-label">Tidy up lines</div>
          <div className="tidy-row">
            <label className="field">
              <span className="field-label small">Join ends closer than</span>
              <select value={s.tidyGap} onChange={(e) => set({ tidyGap: Number(e.target.value) })}>
                {TIDY_GAPS.map((g) => (
                  <option key={g} value={g}>
                    {g} mm
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="text-button make-button" onClick={() => st().tidySelected(s.tidyGap)} title="For drawings from other programs: lines drawn twice are kept once, and ends that nearly meet are joined, so outlines close up and cut properly">
              Tidy up
            </button>
          </div>
        </>
      )}
      {items.some((it) => it.kind === "shape" || it.kind === "text") && (
        <button type="button" className="text-button make-button wide" onClick={() => st().breakApartSelected()} title="Split shapes made of separate pieces (a traced picture, an imported drawing, words) into one shape per piece">
          Break apart
        </button>
      )}
    </div>
  );
}
