/**
 * Export's "Cut order": the sheet's lines drawn one after another in the order they're in the file — play it, or drag
 * the slider — with what each one is. Lines done are solid, the one being cut grows, the rest are faint; dashed grey
 * lines show where the head moves with the laser off.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { LASER_LAYERS } from "../geometry/segments";
import { svgPathData } from "../laser/files";
import { orderSteps, orderTotals } from "../laser/order";
import type { Sheet } from "../laser/sheet";
import { lengthText } from "../model/measure";

/** How long a whole play-through takes (seconds), whatever the sheet. */
const PLAY_SECONDS = 8;

export function CutOrder({ sheet }: { sheet: Sheet }) {
  const steps = useMemo(() => orderSteps(sheet.paths), [sheet]);
  const totals = useMemo(() => orderTotals(steps), [steps]);
  const [W, H] = sheet.size;
  // Progress through the steps: whole steps done + how far through the next (0…steps.length).
  const [t, setT] = useState(steps.length);
  const [playing, setPlaying] = useState(false);
  const last = useRef(0);
  useEffect(() => setT(steps.length), [steps]);
  useEffect(() => {
    if (!playing) return;
    // Each step gets time by its length (with a little for each, so short holes still show).
    const weights = steps.map((s) => s.length + totals.length / Math.max(steps.length * 4, 1));
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    let raf = 0;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      setT((cur) => {
        // Step i lasts its share of the play time: PLAY_SECONDS × its weight / all the weights.
        const i = Math.min(steps.length - 1, Math.floor(cur));
        const next = cur + dt / Math.max((PLAY_SECONDS * weights[i]) / sum, 1e-3);
        if (next >= steps.length) {
          setPlaying(false);
          return steps.length;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, steps, totals.length]);

  const done = Math.floor(t);
  const part = t - done;
  const current = steps[Math.min(done, steps.length - 1)];
  const sw = Math.max(W, H) / 400;
  return (
    <div className="cut-order">
      <svg viewBox={`0 0 ${W} ${H}`} className="cut-order-svg" role="img" aria-label="The lines in the order they're cut">
        <rect width={W} height={H} fill="var(--panel)" />
        {steps.map((s, i) => {
          const d = svgPathData(s.path, H);
          const colour = LASER_LAYERS[s.path.layer].colour === "#000000" ? "var(--ink)" : LASER_LAYERS[s.path.layer].colour;
          const state = i < done ? "done" : i === done ? "now" : "todo";
          return (
            <g key={i}>
              {i > 0 && i <= done && s.travel > 0.5 && <line x1={steps[i - 1].end[0]} y1={H - steps[i - 1].end[1]} x2={s.start[0]} y2={H - s.start[1]} className="travel" strokeWidth={sw} strokeDasharray={`${sw * 3} ${sw * 3}`} />}
              <path d={d} fill="none" stroke={colour} strokeWidth={sw * (state === "todo" ? 1 : 2)} opacity={state === "todo" ? 0.2 : 1} pathLength={1} strokeDasharray={state === "now" ? `${part} 1` : undefined} />
            </g>
          );
        })}
        {current && done < steps.length && <circle cx={current.start[0]} cy={H - current.start[1]} r={sw * 4} className="head" />}
      </svg>
      <div className="cut-order-controls">
        <button type="button" className="text-button" onClick={() => (playing ? setPlaying(false) : (t >= steps.length && setT(0), setPlaying(true)))}>
          {playing ? "Pause" : t >= steps.length ? "Play from the start" : "Play"}
        </button>
        <input type="range" min={0} max={steps.length} step={0.01} value={t} aria-label="Step" onChange={(e) => (setPlaying(false), setT(Number(e.target.value)))} />
      </div>
      <p className="dialog-hint">
        {done < steps.length && current ? `Step ${done + 1} of ${steps.length}: ${current.what}, ${lengthText(current.length)}.` : `${steps.length} steps.`} In all {lengthText(totals.length)} of line, and {lengthText(totals.travel)} moving between them. This is the order in the file; check Bambu Studio's own preview too.
      </p>
    </div>
  );
}
