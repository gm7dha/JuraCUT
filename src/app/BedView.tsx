/**
 * The bed: the laser's work area drawn to scale as an SVG, with every shape
 * on it. Clicks select, drags move, the drawing tools draw, the wheel zooms
 * towards the pointer, and two fingers pan and pinch.
 *
 * Coordinates: bed millimetres, y up. The SVG's inner group flips y and
 * scales, so paths are written in millimetres as they are (files.ts
 * `svgPathData(path, null)`).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { svgPathData } from "../laser/files";
import { itemAt, itemBox, itemOutlines, itemsInBox, makeCircle, makeLine, makeRect, makeText, movedItem } from "../model/shapes";
import { newId } from "../model/document";
import { useDocument, useSelection, useStore, type Tool } from "../model/store";
import { OP_INFO, type Item } from "../model/types";
import type { Pt } from "../geometry/segments";

interface View {
  /** Screen pixels per millimetre. */
  scale: number;
  /** Where the bed's origin lands on screen (px, from the top-left of the view). */
  x: number;
  y: number;
}

/** How far from an outline a click still counts, in screen pixels. */
const REACH_PX = 6;
const MIN_SCALE = 0.05;
const MAX_SCALE = 60;

type Gesture =
  | { kind: "pan"; start: Pt; view: View }
  | { kind: "move"; start: Pt; moved: boolean }
  | { kind: "box"; start: Pt; end: Pt }
  | { kind: "draw"; tool: Exclude<Tool, "select" | "text">; start: Pt; end: Pt }
  | { kind: "pinch"; ids: [number, number]; dist: number; mid: Pt; view: View };

export function BedView() {
  const doc = useDocument();
  const selection = useSelection();
  const tool = useStore((s) => s.tool);
  const fitRequest = useStore((s) => s.fitRequest);
  const theme = useStore((s) => s.theme);
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 40, y: 40 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const spaceHeld = useRef(false);
  const [pointerMm, setPointerMm] = useState<Pt | null>(null);

  const setGestureBoth = (g: Gesture | null) => {
    gestureRef.current = g;
    setGesture(g);
  };

  /** Screen px (relative to the view) → bed mm. */
  const toMm = useCallback((px: number, py: number, v: View = viewRef.current): Pt => [(px - v.x) / v.scale, (v.y - py) / v.scale], []);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = host.current?.getBoundingClientRect();
    return [e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0)];
  };

  /** Zoom so the whole bed is in view with a margin. */
  const fit = useCallback(() => {
    const el = host.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    const margin = 36;
    const scale = Math.max(MIN_SCALE, Math.min((w - 2 * margin) / doc.bed[0], (h - 2 * margin) / doc.bed[1]));
    setView({ scale, x: (w - doc.bed[0] * scale) / 2, y: (h + doc.bed[1] * scale) / 2 });
  }, [doc.bed]);

  // Fit when the view first appears and when asked (F, the Fit button, an import).
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && host.current?.clientWidth) {
      fitted.current = true;
      fit();
    }
  });
  useEffect(() => {
    if (fitRequest) fit();
  }, [fitRequest, fit]);
  useEffect(() => {
    const el = host.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let last = [el.clientWidth, el.clientHeight];
    const ro = new ResizeObserver(() => {
      if (!fitted.current) return;
      const now = [el.clientWidth, el.clientHeight];
      // Keep the bed where it was relative to the middle of the view.
      setView((v) => ({ ...v, x: v.x + (now[0] - last[0]) / 2, y: v.y + (now[1] - last[1]) / 2 }));
      last = now;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Space held = pan with any button.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) spaceHeld.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Wheel: zoom towards the pointer (a non-passive listener, so the page itself never zooms or scrolls).
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [px, py] = local(e);
      const v = viewRef.current;
      const factor = Math.exp(-Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 50) * 0.012 * (e.ctrlKey ? 1.5 : 1));
      zoomAt(v, [px, py], factor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomAt = (v: View, at: Pt, factor: number) => {
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
    const k = scale / v.scale;
    setView({ scale, x: at[0] - (at[0] - v.x) * k, y: at[1] - (at[1] - v.y) * k });
  };

  /** Snap a drawn point to the millimetre grid (half millimetres zoomed in), unless Shift is held. */
  const snap = (p: Pt, shift: boolean): Pt => {
    if (shift) return p;
    const step = viewRef.current.scale > 8 ? 0.5 : 1;
    return [Math.round(p[0] / step) * step, Math.round(p[1] / step) * step];
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const s = useStore.getState();
    const [px, py] = local(e);
    pointers.current.set(e.pointerId, [px, py]);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    // A second finger: pinch (and drop whatever the first was doing).
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.entries()];
      if (gestureRef.current?.kind === "move") s.dragEnd();
      setGestureBoth({ kind: "pinch", ids: [a[0], b[0]], dist: Math.hypot(a[1][0] - b[1][0], a[1][1] - b[1][1]), mid: [(a[1][0] + b[1][0]) / 2, (a[1][1] + b[1][1]) / 2], view: viewRef.current });
      return;
    }
    if (pointers.current.size > 2) return;
    if (e.button === 1 || e.button === 2 || spaceHeld.current) {
      setGestureBoth({ kind: "pan", start: [px, py], view: viewRef.current });
      return;
    }
    if (e.button !== 0) return;
    const mm = toMm(px, py);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (tool === "select") {
      const hit = itemAt(doc.items, mm, REACH_PX / viewRef.current.scale);
      if (hit) {
        if (additive) s.select([hit.id], true);
        else if (!selection.includes(hit.id)) s.select([hit.id]);
        s.dragStart();
        setGestureBoth({ kind: "move", start: mm, moved: false });
      } else {
        if (!additive) s.clearSelection();
        setGestureBoth({ kind: "box", start: mm, end: mm });
      }
      return;
    }
    if (tool === "text") {
      const p = snap(mm, e.shiftKey);
      const id = newId(doc.items.map((it) => it.id));
      s.addItems([makeText(id, p[0], p[1])], { select: true, focus: true });
      s.setTool("select");
      return;
    }
    const p = snap(mm, e.shiftKey);
    setGestureBoth({ kind: "draw", tool, start: p, end: p });
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const [px, py] = local(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, [px, py]);
    const mm = toMm(px, py);
    setPointerMm(mm);
    const g = gestureRef.current;
    if (!g) return;
    const s = useStore.getState();
    switch (g.kind) {
      case "pan":
        setView({ ...g.view, x: g.view.x + px - g.start[0], y: g.view.y + py - g.start[1] });
        break;
      case "pinch": {
        const a = pointers.current.get(g.ids[0]);
        const b = pointers.current.get(g.ids[1]);
        if (!a || !b) break;
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, (g.view.scale * dist) / Math.max(1, g.dist)));
        const k = scale / g.view.scale;
        setView({ scale, x: mid[0] - (g.mid[0] - g.view.x) * k, y: mid[1] - (g.mid[1] - g.view.y) * k });
        break;
      }
      case "move": {
        const raw: Pt = [mm[0] - g.start[0], mm[1] - g.start[1]];
        const step = e.shiftKey ? 0 : viewRef.current.scale > 8 ? 0.5 : 1;
        const d: Pt = step ? [Math.round(raw[0] / step) * step, Math.round(raw[1] / step) * step] : raw;
        if (!g.moved && Math.hypot(raw[0], raw[1]) * viewRef.current.scale < 3) break;
        g.moved = true;
        const ids = useStore.getState().selection;
        s.dragUpdate((base) => ({ ...base, items: base.items.map((it) => (ids.includes(it.id) ? movedItem(it, d[0], d[1]) : it)) }));
        break;
      }
      case "box":
        setGestureBoth({ ...g, end: mm });
        break;
      case "draw":
        setGestureBoth({ ...g, end: snap(mm, e.shiftKey) });
        break;
    }
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    const g = gestureRef.current;
    if (!g) return;
    const s = useStore.getState();
    if (g.kind === "pinch") {
      // Nothing more until every finger is off.
      if (pointers.current.size === 0) setGestureBoth(null);
      return;
    }
    setGestureBoth(null);
    switch (g.kind) {
      case "move":
        s.dragEnd();
        break;
      case "box": {
        const picked = itemsInBox(doc.items, [g.start[0], g.start[1], g.end[0], g.end[1]]);
        if (picked.length) s.select(picked.map((it) => it.id), e.shiftKey || e.ctrlKey || e.metaKey);
        break;
      }
      case "draw": {
        const made = drawnItem(g, doc.items.map((it) => it.id));
        if (made) s.addItems([made]);
        break;
      }
    }
  };

  const onPointerCancel = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (gestureRef.current?.kind === "move") useStore.getState().dragEnd();
    setGestureBoth(null);
  };

  // What to draw: every shape's path data, worked out once per design.
  const drawn = useMemo(() => doc.items.filter((it) => !it.hidden).map((it) => ({ item: it, d: itemPathData(it), box: itemBox(it) })), [doc.items]);
  const draft = gesture?.kind === "draw" ? drawnItem(gesture, [], true) : null;
  const selectedBoxes = drawn.filter((x) => selection.includes(x.item.id) && x.box);
  const cursor = gesture?.kind === "pan" ? "grabbing" : tool === "select" ? "default" : tool === "text" ? "text" : "crosshair";
  const [W, H] = doc.bed;
  const px = 1 / view.scale; // one screen pixel in mm
  const dark = theme === "dark";

  return (
    <div className="bed-area" ref={host} data-tool={tool}>
      <svg
        className="bed-svg"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => setPointerMm(null)}
        onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={(e) => {
          if (tool !== "select") return;
          const [x, y] = local(e);
          const hit = itemAt(doc.items, toMm(x, y), REACH_PX / view.scale);
          if (hit) useStore.getState().setFocusItem(hit.id);
        }}
      >
        <defs>
          <pattern id="grid10" width={10} height={10} patternUnits="userSpaceOnUse">
            <path d="M10 0H0V10" fill="none" stroke="var(--grid)" strokeWidth={px} />
          </pattern>
          <pattern id="grid50" width={50} height={50} patternUnits="userSpaceOnUse">
            <rect width={50} height={50} fill="url(#grid10)" />
            <path d="M50 0H0V50" fill="none" stroke="var(--grid-2)" strokeWidth={px} />
          </pattern>
        </defs>
        <g transform={`matrix(${view.scale} 0 0 ${-view.scale} ${view.x} ${view.y})`}>
          {/* The bed. */}
          <rect x={0} y={0} width={W} height={H} className="bed-plate" />
          <rect x={0} y={0} width={W} height={H} fill="url(#grid50)" />
          <rect x={0} y={0} width={W} height={H} fill="none" stroke="var(--bed-edge)" strokeWidth={2 * px} />
          {/* Bed size, written along the bottom edge (text is flipped back the right way up). */}
          <g transform={`translate(${W / 2} ${-14 * px}) scale(1 -1)`}>
            <text className="bed-label" textAnchor="middle" fontSize={11 * px}>
              {W} × {H} mm
            </text>
          </g>
          {/* Shapes, with a halo under the selected ones. */}
          {drawn.map(({ item, d }) => {
            const selected = selection.includes(item.id);
            const colour = opColour(item.op, dark);
            const engrave = item.op === "engrave";
            return (
              <g key={item.id} className={`shape op-${item.op}${selected ? " selected" : ""}`}>
                {selected && <path d={d} fill="none" stroke="var(--accent)" strokeOpacity={0.35} strokeWidth={7 * px} strokeLinejoin="round" strokeLinecap="round" />}
                <path d={d} fill={engrave ? colour : "none"} fillRule="evenodd" fillOpacity={engrave ? 0.85 : undefined} stroke={colour} strokeWidth={(engrave ? 0.75 : 1.5) * px} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            );
          })}
          {/* The selection's box with handles. */}
          {selectedBoxes.map(({ item, box }) => (
            <rect key={`sel-${item.id}`} x={box![0]} y={box![1]} width={box![2] - box![0]} height={box![3] - box![1]} className="selection-box" strokeWidth={px} strokeDasharray={`${4 * px} ${3 * px}`} />
          ))}
          {draft && <path d={itemPathData(draft)} className="draft" fill="none" stroke="var(--accent)" strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} />}
          {gesture?.kind === "box" && (
            <rect
              x={Math.min(gesture.start[0], gesture.end[0])}
              y={Math.min(gesture.start[1], gesture.end[1])}
              width={Math.abs(gesture.end[0] - gesture.start[0])}
              height={Math.abs(gesture.end[1] - gesture.start[1])}
              className="rubber-band"
              strokeWidth={px}
            />
          )}
        </g>
      </svg>
      <div className="bed-readout" aria-live="off">
        {pointerMm ? `${pointerMm[0].toFixed(1)}, ${pointerMm[1].toFixed(1)} mm` : ""}
        {draft && gesture?.kind === "draw" && ` · ${draftSize(gesture)}`}
        <span className="bed-zoom"> {Math.round(view.scale * 100) / 100 >= 1 ? `${(view.scale).toFixed(1)} px/mm` : `${(view.scale * 100).toFixed(0)}%`}</span>
      </div>
    </div>
  );
}

/** A shape's outlines as SVG path data in bed millimetres (y up — the view's group flips it). */
export function itemPathData(item: Item): string {
  return itemOutlines(item)
    .map((o) => svgPathData({ layer: "outer", segments: o.segments, closed: o.closed }, null))
    .join(" ");
}

/** Colours for the bed: the laser colours, a little softer in dark mode. */
function opColour(op: Item["op"], dark: boolean): string {
  if (op === "engrave") return dark ? "#d8dde3" : "#1f2a37";
  if (op === "score") return dark ? "#4dd16b" : "#15a33a";
  return dark ? "#ff6b6b" : OP_INFO.cut.colour;
}

/** The shape a drag with a drawing tool makes (null when it's too small to mean anything). */
function drawnItem(g: Extract<Gesture, { kind: "draw" }>, taken: string[], preview = false): Item | null {
  const id = preview ? "draft" : newId(taken);
  const [x0, y0] = g.start;
  const [x1, y1] = g.end;
  switch (g.tool) {
    case "rect": {
      const w = Math.abs(x1 - x0);
      const h = Math.abs(y1 - y0);
      if (!preview && (w < 0.5 || h < 0.5)) return null;
      return makeRect(id, Math.min(x0, x1), Math.min(y0, y1), Math.max(w, 0.01), Math.max(h, 0.01));
    }
    case "circle": {
      const r = Math.hypot(x1 - x0, y1 - y0);
      if (!preview && r < 0.25) return null;
      return makeCircle(id, x0, y0, Math.max(r, 0.01));
    }
    case "line":
      if (!preview && Math.hypot(x1 - x0, y1 - y0) < 0.5) return null;
      return makeLine(id, x0, y0, x1, y1);
  }
}

function draftSize(g: Extract<Gesture, { kind: "draw" }>): string {
  const [x0, y0] = g.start;
  const [x1, y1] = g.end;
  const n = (v: number) => (Math.round(v * 10) / 10).toString();
  switch (g.tool) {
    case "rect":
      return `${n(Math.abs(x1 - x0))} × ${n(Math.abs(y1 - y0))} mm`;
    case "circle":
      return `⌀ ${n(2 * Math.hypot(x1 - x0, y1 - y0))} mm`;
    case "line":
      return `${n(Math.hypot(x1 - x0, y1 - y0))} mm`;
  }
}
