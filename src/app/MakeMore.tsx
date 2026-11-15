/**
 * "Make more" under the selected shapes' settings: Outline (a border round them), Combine (join, cut out, overlap —
 * two or more shapes) and Step and repeat (a grid of copies). The sizes are remembered on this computer
 * (localStorage `juracut.makeMore`), and the right-click menu uses them too.
 */
import { useEffect, useState } from "react";

import { canCombine } from "../model/combine";
import { useStore } from "../model/store";
import type { Item } from "../model/types";

const KEY = "juracut.makeMore";

export interface MakeMoreSettings {
  distance: number;
  fill: boolean;
  cols: number;
  rows: number;
  gap: number;
}

const DEFAULTS: MakeMoreSettings = { distance: 3, fill: true, cols: 3, rows: 2, gap: 5 };
const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function makeMoreSettings(): MakeMoreSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Record<keyof MakeMoreSettings, unknown>>;
    return {
      distance: clamp(v.distance, 0.1, 100, DEFAULTS.distance),
      fill: v.fill !== false,
      cols: Math.round(clamp(v.cols, 1, 50, DEFAULTS.cols)),
      rows: Math.round(clamp(v.rows, 1, 50, DEFAULTS.rows)),
      gap: clamp(v.gap, -1000, 1000, DEFAULTS.gap),
    };
  } catch {
    return DEFAULTS;
  }
}

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

export function MakeMore({ items }: { items: readonly Item[] }) {
  const [s, setS] = useState(makeMoreSettings);
  const set = (patch: Partial<MakeMoreSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    keep(next);
  };
  const st = useStore.getState;
  const combinable = canCombine(items);
  const copies = s.cols * s.rows - 1;
  return (
    <div className="make-more">
      <div className="field-label">Outline</div>
      <div className="field-row">
        <Num label="Distance out" value={s.distance} unit="mm" min={0.1} max={100} onChange={(distance) => set({ distance })} />
        <button type="button" className="text-button make-button" onClick={() => st().outlineSelected(s.distance, s.fill)} title="A new cut shape round the selection, this far out: a border round words, or a backing to glue them to">
          Add outline
        </button>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={s.fill} onChange={(e) => set({ fill: e.target.checked })} />
        Fill gaps inside (one solid piece)
      </label>

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
      <div className="field-row">
        <Num label="Across" value={s.cols} min={1} max={50} whole onChange={(cols) => set({ cols })} />
        <Num label="Up" value={s.rows} min={1} max={50} whole onChange={(rows) => set({ rows })} />
        <Num label="Gap" value={s.gap} unit="mm" min={-1000} max={1000} onChange={(gap) => set({ gap })} />
      </div>
      <button type="button" className="text-button make-button wide" disabled={copies < 1} onClick={() => st().repeatSelected(s.cols, s.rows, s.gap, s.gap)} title="Copies in a grid, starting from the selection (bottom left)">
        Make {copies} {copies === 1 ? "copy" : "copies"}
      </button>
    </div>
  );
}
