/**
 * The side panel: the list of shapes on the bed (click to select, the eye to
 * hide, arrows to reorder) and, below it, the selected shape's settings.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { FONTS, FONT_IDS, JOINED_FONTS } from "../geometry/text";
import { boxOf, piecesOf } from "../model/arrange";
import { describeItem, itemBox, pictureSize, placedAt } from "../model/shapes";
import { PHOTO_MODES, RESOLUTIONS } from "./PhotoTab";
import { useDocument, useSelection, useStore } from "../model/store";
import { DEFAULT_TAB_WIDTH, MOST_TABS, OPS, OP_INFO, type Item, type Op, type PictureItem } from "../model/types";
import { AlignControls } from "./AlignControls";
import { MakeMore } from "./MakeMore";
import { curved, straightened } from "../model/nodes";
import { offPath } from "../model/textPath";
import { MOST_QR_TEXT, qrModules } from "../geometry/qr";
import { areaText, itemArea, itemLength, lengthText } from "../model/measure";
import { keepPolygonStyle } from "./polygonStyle";
import { Icons } from "./icons";

/** One chip per colour on the bed: click it to select every shape of that colour, the eye to hide or show them all. */
function OpChips({ items }: { items: readonly Item[] }) {
  const s = useStore.getState;
  return (
    <div className="op-chips" aria-label="Shapes by colour">
      {OPS.map((op) => {
        const mine = items.filter((it) => it.op === op);
        if (!mine.length) return null;
        const hidden = mine.every((it) => it.hidden);
        const label = OP_INFO[op].label.toLowerCase();
        return (
          <span key={op} className={`op-chip${hidden ? " all-hidden" : ""}`}>
            <button type="button" disabled={hidden} onClick={() => s().selectOp(op)} title={`Select every ${label} shape`}>
              <span className="op-dot" style={{ background: OP_INFO[op].colour }} />
              {OP_INFO[op].label} {mine.length}
            </button>
            <button type="button" onClick={() => s().setOpHidden(op, !hidden)} title={hidden ? `Show every ${label} shape` : `Hide every ${label} shape (hidden shapes aren't exported)`} aria-label={hidden ? `Show ${label} shapes` : `Hide ${label} shapes`}>
              {hidden ? <Icons.EyeOff size={14} /> : <Icons.Eye size={14} />}
            </button>
          </span>
        );
      })}
    </div>
  );
}

export function SidePanel() {
  const doc = useDocument();
  const selection = useSelection();
  const select = useStore((s) => s.select);
  const updateItem = useStore((s) => s.updateItem);
  const reorder = useStore((s) => s.reorder);
  const selected = useMemo(() => doc.items.filter((it) => selection.includes(it.id)), [doc.items, selection]);
  // Picking a shape on the bed scrolls the list to it, so it's never out of sight.
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(".shape-row.selected");
    row?.scrollIntoView?.({ block: "nearest" });
  }, [selection]);

  return (
    <aside className="side-panel">
      <section className="panel-section shapes">
        <h3>
          Shapes <span className="count">{doc.items.length}</span>
        </h3>
        {doc.items.length === 0 ? (
          <p className="panel-hint">Nothing on the bed yet. Draw a rectangle, circle, line or words with the tools above, or Import an SVG or DXF drawing.</p>
        ) : (
          <>
          <OpChips items={doc.items} />
          <ul className="shape-list" role="listbox" aria-label="Shapes" ref={listRef}>
            {[...doc.items].reverse().map((it, k) => {
              const index = doc.items.length - 1 - k;
              const isSelected = selection.includes(it.id);
              return (
                <li
                  key={it.id}
                  role="option"
                  aria-selected={isSelected}
                  className={`shape-row${isSelected ? " selected" : ""}${it.hidden ? " hidden" : ""}`}
                  onClick={(e) => select([it.id], e.shiftKey || e.ctrlKey || e.metaKey)}
                  onDoubleClick={() => useStore.getState().setFocusItem(it.id)}
                  title={`${describeItem(it)} — ${OP_INFO[it.op].label}`}
                >
                  <span className="op-dot" style={{ background: OP_INFO[it.op].colour }} aria-label={OP_INFO[it.op].label} />
                  <span className="shape-name">
                    {it.group && <span className="group-mark" title="In a group" aria-label="In a group" />}
                    {it.name}
                  </span>
                  <span className="shape-size muted small">{describeItem(it)}</span>
                  <button
                    type="button"
                    className="icon-button small row-button"
                    title={it.hidden ? "Show (hidden shapes aren't exported)" : "Hide (hidden shapes aren't exported)"}
                    aria-label={it.hidden ? "Show" : "Hide"}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateItem(it.id, (x) => ({ ...x, hidden: !x.hidden }));
                    }}
                  >
                    {it.hidden ? <Icons.EyeOff size={16} /> : <Icons.Eye size={16} />}
                  </button>
                  <button
                    type="button"
                    className={`icon-button small row-button${it.locked ? " on" : ""}`}
                    title={it.locked ? "Unlock (so it can be picked and moved on the bed)" : "Lock (it can't be picked or moved on the bed)"}
                    aria-label={it.locked ? "Unlock" : "Lock"}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateItem(it.id, (x) => {
                        const { locked, ...rest } = x;
                        return (locked ? rest : { ...rest, locked: true }) as Item;
                      });
                    }}
                  >
                    {it.locked ? <Icons.Lock size={15} /> : <Icons.Unlock size={15} />}
                  </button>
                  <button type="button" className="icon-button small row-button" title="Bring forward (drawn on top)" aria-label="Bring forward" disabled={index === doc.items.length - 1} onClick={(e) => (e.stopPropagation(), reorder(it.id, index + 1))}>
                    <Icons.Up size={14} />
                  </button>
                  <button type="button" className="icon-button small row-button" title="Send back" aria-label="Send back" disabled={index === 0} onClick={(e) => (e.stopPropagation(), reorder(it.id, index - 1))}>
                    <Icons.Down size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
          </>
        )}
      </section>
      <section className="panel-section properties">
        {selected.length === 0 ? (
          <>
            <h3>Nothing selected</h3>
            <p className="panel-hint">Click a shape on the bed or in the list to see its settings. Drag a box round several to select them together.</p>
          </>
        ) : selected.length === 1 ? (
          <ItemProperties item={selected[0]} />
        ) : (
          <ManyProperties items={selected} />
        )}
        {selected.length > 0 && <MakeMore items={selected} />}
      </section>
    </aside>
  );
}

/** What the laser does: Cut / Score / Engrave. */
function OpPicker({ value, onChange }: { value: Op | null; onChange: (op: Op) => void }) {
  return (
    <>
      <div className="field-label">Laser</div>
      <div className="segmented three" role="radiogroup" aria-label="What the laser does">
        {OPS.map((op) => (
          <button type="button" key={op} role="radio" aria-checked={value === op} className={value === op ? "selected" : ""} title={OP_INFO[op].hint} onClick={() => onChange(op)}>
            <span className="op-dot" style={{ background: OP_INFO[op].colour }} /> {OP_INFO[op].label}
          </button>
        ))}
      </div>
    </>
  );
}

function ItemProperties({ item }: { item: Item }) {
  const updateItem = useStore((s) => s.updateItem);
  const focusItem = useStore((s) => s.focusItem);
  const box = itemBox(item);
  const change = (patch: Partial<Item>) => updateItem(item.id, (it) => ({ ...it, ...patch }) as Item);
  return (
    <>
      <h3>
        <NameBox item={item} />
      </h3>
      {item.kind === "picture" ? <PictureFields item={item} /> : <OpPicker value={item.op} onChange={(op) => change({ op })} />}
      {item.kind === "text" && <TextFields item={item} focus={focusItem === item.id} />}
      <div className="field-label">Position (bottom-left corner)</div>
      <div className="field-row">
        <NumberBox label="X" value={box ? box[0] : 0} unit="mm" onCommit={(v) => box && updateItem(item.id, (it) => placedAt(it, v, box[1]))} />
        <NumberBox label="Y" value={box ? box[1] : 0} unit="mm" onCommit={(v) => box && updateItem(item.id, (it) => placedAt(it, box[0], v))} />
      </div>
      {item.kind === "rect" && (
        <>
          <div className="field-label">Size</div>
          <div className="field-row">
            <NumberBox label="Width" value={item.w} unit="mm" min={0.01} onCommit={(w) => change({ w })} />
            <NumberBox label="Height" value={item.h} unit="mm" min={0.01} onCommit={(h) => change({ h })} />
          </div>
          <div className="field-row">
            <NumberBox label="Corner radius" value={item.radius} unit="mm" min={0} onCommit={(radius) => change({ radius })} />
            <NumberBox label="Angle" value={item.angle} unit="°" onCommit={(angle) => change({ angle })} />
          </div>
        </>
      )}
      {item.kind === "circle" && (
        <>
          <div className="field-label">Size</div>
          <div className="field-row">
            <NumberBox label="Diameter" value={item.r * 2} unit="mm" min={0.01} onCommit={(d) => change({ r: d / 2 })} />
          </div>
        </>
      )}
      {item.kind === "polygon" && <PolygonFields item={item} />}
      {item.kind === "ellipse" && (
        <>
          <div className="field-label">Size</div>
          <div className="field-row">
            <NumberBox label="Width" value={item.rx * 2} unit="mm" min={0.01} onCommit={(w) => change({ rx: w / 2 })} />
            <NumberBox label="Height" value={item.ry * 2} unit="mm" min={0.01} onCommit={(h) => change({ ry: h / 2 })} />
          </div>
          <div className="field-row">
            <NumberBox label="Angle" value={item.angle} unit="°" onCommit={(angle) => change({ angle })} />
          </div>
        </>
      )}
      {item.kind === "qr" && <QrFields item={item} focus={focusItem === item.id} />}
      {item.kind === "line" && (
        <>
          <div className="field-label">Ends</div>
          <div className="field-row">
            <NumberBox label="X1" value={item.x1} unit="mm" onCommit={(x1) => change({ x1 })} />
            <NumberBox label="Y1" value={item.y1} unit="mm" onCommit={(y1) => change({ y1 })} />
          </div>
          <div className="field-row">
            <NumberBox label="X2" value={item.x2} unit="mm" onCommit={(x2) => change({ x2 })} />
            <NumberBox label="Y2" value={item.y2} unit="mm" onCommit={(y2) => change({ y2 })} />
          </div>
        </>
      )}
      <TabFields items={[item]} />
      {item.kind !== "picture" && <Measures item={item} />}
      {item.kind !== "picture" && <PointsBar item={item} />}
      {item.kind === "shape" && box && (
        <p className="dialog-hint">
          {describeItem(item)}, {item.outlines.length} {item.outlines.length === 1 ? "outline" : "outlines"}. Use the toolbar to turn or flip it.
        </p>
      )}
    </>
  );
}

/**
 * Holding tabs, for cut shapes with a closed outline: how many small uncut gaps each outline gets, and how wide.
 * Several shapes: set for all of them.
 */
function TabFields({ items }: { items: readonly Item[] }) {
  const updateSelected = useStore((s) => s.updateSelected);
  const updateItem = useStore((s) => s.updateItem);
  const cut = items.filter((it) => it.op === "cut" && it.kind !== "picture" && it.kind !== "line");
  if (!cut.length) return null;
  const counts = new Set(cut.map((it) => it.tabs ?? 0));
  const widths = new Set(cut.map((it) => it.tabWidth ?? DEFAULT_TAB_WIDTH));
  const count = counts.size === 1 ? [...counts][0] : 0;
  const width = widths.size === 1 ? [...widths][0] : DEFAULT_TAB_WIDTH;
  const change = (patch: { tabs?: number; tabWidth?: number }) => {
    const apply = (it: Item): Item => {
      if (it.op !== "cut" || it.kind === "picture" || it.kind === "line") return it;
      const next = { ...it, ...patch };
      if (!next.tabs) {
        delete next.tabs;
        delete next.tabWidth;
      }
      return next as Item;
    };
    if (items.length === 1) updateItem(items[0].id, apply);
    else updateSelected(apply);
  };
  return (
    <>
      <div className="field-label" title="Small gaps left uncut, so pieces stay held in the sheet until you snap them out (they can't drop through the honeycomb or tip up into the head).">
        Holding tabs
      </div>
      <div className="field-row">
        <NumberBox label="Tabs on each outline (0 = none)" value={count} unit="" min={0} onCommit={(v) => change({ tabs: Math.round(Math.min(MOST_TABS, v)) })} />
        {count > 0 && <NumberBox label="Tab width" value={width} unit="mm" min={0.1} onCommit={(v) => change({ tabWidth: Math.min(20, v) })} />}
      </div>
    </>
  );
}

/**
 * Edit points: the button that starts it, or — while editing — how it works, and making the piece after the picked
 * point straight or curved.
 */
function PointsBar({ item }: { item: Item }) {
  const pointsOf = useStore((s) => s.pointsOf);
  const picked = useStore((s) => s.pickedNode);
  const s = useStore.getState;
  if (pointsOf !== item.id || item.kind !== "shape") {
    return (
      <button type="button" className="text-button make-button wide" onClick={() => s().editPoints(item.id)} title="Reshape it point by point (double-click a shape does this too). It becomes a free shape of lines and curves.">
        Edit points
      </button>
    );
  }
  const piece = picked ? item.outlines[picked.outline]?.segments[picked.index] : undefined;
  return (
    <div className="points-bar">
      <p className="small">
        <strong>Editing points.</strong> Drag a point, or a curve's handle (pick a point to see them). Double-click a line to add a point; Delete takes the picked point out. Shift: no snapping.
      </p>
      <div className="field-row">
        {piece && (
          <button
            type="button"
            className="text-button"
            onClick={() => s().changePoints((o) => (piece.kind === "line" ? curved(o, picked!.outline, picked!.index) : straightened(o, picked!.outline, picked!.index)))}
            title="The piece from the picked point to the next"
          >
            {piece.kind === "line" ? "Make the next piece a curve" : "Make the next piece straight"}
          </button>
        )}
        <button type="button" className="primary-button" onClick={() => s().stopEditingPoints()}>
          Done
        </button>
      </div>
    </div>
  );
}

/** How long the shape's lines are and the area it covers (worked out only when it changes). */
function Measures({ item }: { item: Item }) {
  const [len, area] = useMemo(() => [itemLength(item), itemArea(item)], [item]);
  return (
    <p className="measures muted small" title="Line length: how far the laser travels along this shape's lines. Area: what it covers (holes left out).">
      Line length {lengthText(len)}
      {area > 0 ? ` · area ${areaText(area)}` : ""}
    </p>
  );
}

/** A QR code's settings: what it holds, how big, how sturdy. */
function QrFields({ item, focus }: { item: Extract<Item, { kind: "qr" }>; focus: boolean }) {
  const updateItem = useStore((s) => s.updateItem);
  const ref = useRef<HTMLTextAreaElement>(null);
  const change = (patch: Partial<typeof item>) => updateItem(item.id, (it) => ({ ...it, ...patch }) as Item);
  useEffect(() => {
    if (focus) {
      ref.current?.focus();
      ref.current?.select();
      useStore.getState().setFocusItem(null);
    }
  }, [focus]);
  const m = qrModules(item.text, item.ecc);
  const cell = m ? item.size / m.size : 0;
  return (
    <>
      <div className="field-label">Web address or words</div>
      <textarea ref={ref} className="text-box" rows={2} value={item.text} aria-label="What the QR code holds" maxLength={MOST_QR_TEXT} onChange={(e) => change({ text: e.target.value })} />
      <div className="field-row">
        <NumberBox label="Size" value={item.size} unit="mm" min={5} onCommit={(size) => change({ size })} />
        <label className="field">
          <span>Sturdiness</span>
          <select value={item.ecc} onChange={(e) => change({ ecc: e.target.value as typeof item.ecc })} title="How much of the code can be scratched or burnt and still read. More means more, smaller squares.">
            <option value="L">Low (7%)</option>
            <option value="M">Medium (15%)</option>
            <option value="Q">High (25%)</option>
            <option value="H">Highest (30%)</option>
          </select>
        </label>
      </div>
      {!item.text ? (
        <p className="dialog-hint attention">Type a web address or some words for the code.</p>
      ) : !m ? (
        <p className="dialog-hint attention">That's too much for a QR code: make it shorter, or choose a lower sturdiness.</p>
      ) : (
        <p className={`dialog-hint${cell < 0.5 ? " attention" : ""}`}>
          {m.size} × {m.size} squares, each {Math.round(cell * 100) / 100} mm.
          {cell < 0.5 ? " That's very small to engrave cleanly: make the code bigger or hold less." : " Leave a light margin round it (a few squares wide) so phones can read it."}
        </p>
      )}
    </>
  );
}

/** A polygon's or star's settings: corners, star or not (and how deep), size, angle. */
function PolygonFields({ item }: { item: Extract<Item, { kind: "polygon" }> }) {
  const updateItem = useStore((s) => s.updateItem);
  const change = (patch: Partial<typeof item>) => {
    const next = { ...item, ...patch };
    keepPolygonStyle({ sides: next.sides, star: next.star ?? 0 });
    updateItem(item.id, (it) => ({ ...it, ...patch }) as Item);
  };
  return (
    <>
      <div className="segmented two" role="radiogroup" aria-label="Polygon or star">
        <button type="button" role="radio" aria-checked={!item.star} className={!item.star ? "selected" : ""} onClick={() => change({ star: undefined, name: item.name === "Star" ? "Polygon" : item.name })}>
          <Icons.Polygon size={16} /> Polygon
        </button>
        <button type="button" role="radio" aria-checked={!!item.star} className={item.star ? "selected" : ""} onClick={() => change({ star: item.star ?? 0.5, name: item.name === "Polygon" ? "Star" : item.name })}>
          <Icons.Star size={16} /> Star
        </button>
      </div>
      <div className="field-row">
        <NumberBox label={item.star ? "Points" : "Sides"} value={item.sides} unit="" min={3} onCommit={(v) => change({ sides: Math.round(Math.min(100, v)) })} />
        <NumberBox label="Across the corners" value={item.r * 2} unit="mm" min={0.01} onCommit={(d) => change({ r: d / 2 })} />
      </div>
      <div className="field-row">
        {!!item.star && <NumberBox label="Inner corners (% of the size)" value={Math.round(item.star * 100)} unit="%" min={5} onCommit={(v) => change({ star: Math.min(95, Math.max(5, v)) / 100 })} />}
        <NumberBox label="Angle" value={item.angle} unit="°" onCommit={(angle) => change({ angle })} />
      </div>
    </>
  );
}

function TextFields({ item, focus }: { item: Extract<Item, { kind: "text" }>; focus: boolean }) {
  const updateItem = useStore((s) => s.updateItem);
  const ref = useRef<HTMLTextAreaElement>(null);
  const change = (patch: Partial<typeof item>) => updateItem(item.id, (it) => ({ ...it, ...patch }) as Item);
  useEffect(() => {
    if (focus) {
      ref.current?.focus();
      ref.current?.select();
      useStore.getState().setFocusItem(null);
    }
  }, [focus]);
  return (
    <>
      <div className="field-label">Words</div>
      <textarea ref={ref} className="text-box" rows={2} value={item.text} aria-label="Words" onChange={(e) => change({ text: e.target.value.slice(0, 2000) })} />
      <div className="field-row">
        <label className="field">
          <span>Font</span>
          <select
            value={item.font}
            onChange={(e) => {
              const font = e.target.value as typeof item.font;
              // Script fonts' letters overlap: join them (as one shape) unless asked not to.
              change(JOINED_FONTS.includes(font) && !JOINED_FONTS.includes(item.font) ? { font, weld: true } : { font });
            }}
          >
            {FONT_IDS.map((id) => (
              <option key={id} value={id}>
                {FONTS[id].label}
              </option>
            ))}
          </select>
        </label>
        <NumberBox label="Letter height" value={item.size} unit="mm" min={0.5} onCommit={(size) => change({ size })} />
      </div>
      <label className="check-row" title="Letters that touch or overlap (in a script font, say) become one shape, so they engrave solid and cut as one piece">
        <input type="checkbox" checked={!!item.weld} onChange={(e) => change({ weld: e.target.checked || undefined })} />
        Join the letters into one shape
      </label>
      <div className="field-row">
        <label className="field">
          <span>Lines</span>
          <select value={item.align} onChange={(e) => change({ align: e.target.value as typeof item.align })}>
            <option value="left">Left</option>
            <option value="centre">Centred</option>
            <option value="right">Right</option>
          </select>
        </label>
        <NumberBox label="Angle" value={item.angle} unit="°" onCommit={(angle) => change({ angle })} />
      </div>
      {item.path ? (
        <>
          <div className="field-label">Along a path</div>
          <div className="field-row">
            <NumberBox label="Slide along it" value={item.pathAt ?? 0} unit="mm" onCommit={(pathAt) => change({ pathAt })} />
            <button type="button" className="text-button make-button" onClick={() => change({ pathFlip: !item.pathFlip || undefined })} title="Run the other way round the path, the letters on its other side">
              Other side
            </button>
          </div>
          <button type="button" className="text-button make-button wide" onClick={() => updateItem(item.id, (it) => offPath(it as Extract<Item, { kind: "text" }>))}>
            Back to a straight line
          </button>
        </>
      ) : (
        <>
      <div className="field-label">Round a circle</div>
      <div className="segmented three" role="radiogroup" aria-label="Round a circle">
        {(
          [
            ["straight", "Straight", "In a straight line"],
            ["top", "Over the top", "Bent over the top of a circle, reading clockwise (the top of a badge)"],
            ["bottom", "Under", "Bent under the bottom of a circle, the tops of the letters towards its middle (the bottom of a badge)"],
          ] as const
        ).map(([k, label, hint]) => {
          const now = !item.curve ? "straight" : item.curve > 0 ? "top" : "bottom";
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={now === k}
              className={now === k ? "selected" : ""}
              title={hint}
              onClick={() => {
                if (k === "straight") return change({ curve: undefined });
                // A radius that bends the words about a third of the way round, unless one is set already.
                const box = itemBox({ ...item, curve: undefined, angle: 0 });
                const r = Math.abs(item.curve ?? 0) || Math.max(10, Math.round(box ? (box[2] - box[0]) / 2 : 30));
                change({ curve: k === "top" ? r : -r, align: "centre" });
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      {!!item.curve && (
        <div className="field-row">
          <NumberBox label="Circle's radius (to the line under the letters)" value={Math.abs(item.curve)} unit="mm" min={1} onCommit={(r) => change({ curve: Math.sign(item.curve ?? 1) * Math.max(1, r) })} />
        </div>
      )}
        </>
      )}
    </>
  );
}

/** A photo's settings: size (keeping its shape), style, lighter/darker, contrast, light parts, detail. */
function PictureFields({ item }: { item: PictureItem }) {
  const updateItem = useStore((s) => s.updateItem);
  const change = (patch: Partial<PictureItem>) => updateItem(item.id, (it) => ({ ...it, ...patch }) as Item);
  const [W, H] = pictureSize(item);
  const ratio = item.h / item.w;
  return (
    <>
      <p className="dialog-hint" style={{ marginTop: 0 }}>
        A photo, engraved. Turn it with Turn 90°; Flip mirrors it.
      </p>
      <div className="field-label">Size</div>
      <div className="field-row">
        <NumberBox label="Width" value={W} unit="mm" min={2} onCommit={(v) => change(item.turns % 2 ? { h: v, w: v / ratio } : { w: v, h: v * ratio })} />
        <NumberBox label="Height" value={H} unit="mm" min={2} onCommit={(v) => change(item.turns % 2 ? { w: v, h: v * ratio } : { h: v, w: v / ratio })} />
      </div>
      <div className="field-label">Style</div>
      <div className="segmented three" role="radiogroup" aria-label="Style">
        {PHOTO_MODES.map(([k, label, hint]) => (
          <button key={k} type="button" role="radio" aria-checked={item.mode === k} className={item.mode === k ? "selected" : ""} title={hint} onClick={() => change({ mode: k })}>
            {label}
          </button>
        ))}
      </div>
      <div className="field-row">
        <NumberBox label="Lighter (+) / darker (−)" value={item.brightness} unit="" onCommit={(v) => change({ brightness: Math.max(-100, Math.min(100, v)) })} />
        <NumberBox label="Contrast" value={item.contrast} unit="" onCommit={(v) => change({ contrast: Math.max(-100, Math.min(100, v)) })} />
      </div>
      <label className="check-row">
        <input type="checkbox" checked={item.invert} onChange={(e) => change({ invert: e.target.checked })} />
        Engrave the light parts
      </label>
      <label className="field">
        <span>Detail</span>
        <select value={item.dpm} onChange={(e) => change({ dpm: Number(e.target.value) })}>
          {RESOLUTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
          {!RESOLUTIONS.some(([v]) => v === item.dpm) && <option value={item.dpm}>{item.dpm} per mm</option>}
        </select>
      </label>
      <PhotoShape item={item} />
    </>
  );
}

/** A photo's shape (rectangle, rounded, round), how much is cropped off each side, and a cut line round it. */
function PhotoShape({ item }: { item: PictureItem }) {
  const updateItem = useStore((s) => s.updateItem);
  const change = (patch: Partial<PictureItem>) => updateItem(item.id, (it) => ({ ...it, ...patch }) as Item);
  const crop = item.crop ?? [0, 0, 1, 1];
  // Cropping keeps the picture's scale: the frame shrinks or grows with the part kept.
  const setCrop = (next: [number, number, number, number]) => {
    const sx = (next[2] - next[0]) / (crop[2] - crop[0]);
    const sy = (next[3] - next[1]) / (crop[3] - crop[1]);
    const whole = next[0] === 0 && next[1] === 0 && next[2] === 1 && next[3] === 1;
    updateItem(item.id, (it) => {
      const p: PictureItem = { ...(it as PictureItem), w: (it as PictureItem).w * sx, h: (it as PictureItem).h * sy, crop: next };
      if (whole) delete p.crop;
      return p;
    });
  };
  const pct = (v: number) => Math.round(v * 1000) / 10;
  const side = (i: 0 | 1 | 2 | 3, v: number) => {
    const next = [...crop] as [number, number, number, number];
    const share = Math.min(0.98, Math.max(0, v / 100));
    next[i] = i < 2 ? share : 1 - share;
    // At least 2% kept each way.
    if (next[2] - next[0] < 0.02 || next[3] - next[1] < 0.02) return;
    setCrop(next);
  };
  return (
    <>
      {item.clip && (
        <div className="points-bar">
          <p className="small">Engraved only inside a shape you chose.</p>
          <button type="button" className="text-button" onClick={() => updateItem(item.id, (it) => ({ ...(it as PictureItem), clip: undefined }) as Item)}>
            Take the mask shape off
          </button>
        </div>
      )}
      <div className="field-label">Shape</div>
      <div className="segmented three" role="radiogroup" aria-label="Photo's shape">
        {(
          [
            [undefined, "Rectangle"],
            ["rounded", "Rounded"],
            ["round", "Round"],
          ] as const
        ).map(([m, label]) => (
          <button key={label} type="button" role="radio" aria-checked={item.mask === m} className={item.mask === m ? "selected" : ""} onClick={() => change({ mask: m })}>
            {label}
          </button>
        ))}
      </div>
      <div className="field-label" title="As the picture was brought in (before turning or flipping)">
        Crop off (% of the picture)
      </div>
      <div className="field-row">
        <NumberBox label="Left" value={pct(crop[0])} unit="%" min={0} onCommit={(v) => side(0, v)} />
        <NumberBox label="Right" value={pct(1 - crop[2])} unit="%" min={0} onCommit={(v) => side(2, v)} />
      </div>
      <div className="field-row">
        <NumberBox label="Top" value={pct(crop[1])} unit="%" min={0} onCommit={(v) => side(1, v)} />
        <NumberBox label="Bottom" value={pct(1 - crop[3])} unit="%" min={0} onCommit={(v) => side(3, v)} />
      </div>
      <button type="button" className="text-button make-button wide" onClick={() => useStore.getState().addCutRoundPicture(item.id)} title="A cut line the same shape as the photo, round its edge — for a coaster or a tag with the photo on it">
        Add a cut line round it
      </button>
    </>
  );
}

function ManyProperties({ items }: { items: Item[] }) {
  const setOp = useStore((s) => s.setOp);
  const doc = useDocument();
  const ops = new Set(items.map((it) => it.op));
  const ids = items.map((it) => it.id);
  const pieces = piecesOf(doc.items, ids).length;
  const groups = new Set(items.map((it) => it.group ?? ""));
  const oneGroup = groups.size === 1 && !groups.has("");
  const box = boxOf(doc.items, ids);
  const s = useStore.getState;
  const [gap, setGap] = useState(5);
  const lone = pieces === 1;
  return (
    <>
      <h3>{oneGroup ? `Group of ${items.length} shapes` : `${items.length} shapes selected`}</h3>
      <OpPicker value={ops.size === 1 ? items[0].op : null} onChange={(op) => setOp(ids, op)} />
      {box && (
        <>
          <div className="field-label">Position (bottom-left corner of them all)</div>
          <div className="field-row">
            <NumberBox label="X" value={box[0]} unit="mm" onCommit={(v) => s().moveSelected(v - box[0], 0)} />
            <NumberBox label="Y" value={box[1]} unit="mm" onCommit={(v) => s().moveSelected(0, v - box[1])} />
          </div>
          <p className="dialog-hint" style={{ marginTop: 0 }}>
            {Math.round((box[2] - box[0]) * 100) / 100} × {Math.round((box[3] - box[1]) * 100) / 100} mm
          </p>
        </>
      )}
      <TabFields items={items} />
      <AlignControls />
      {!lone && (
        <>
          <div className="field-label">Set a gap</div>
          <div className="icon-row" role="group" aria-label="Set a gap">
            <label className="field inline-gap">
              <span className="field-input">
                <input type="number" min={0} step="any" value={gap} aria-label="Gap" onChange={(e) => setGap(Math.max(0, Number(e.target.value) || 0))} />
                <span className="unit">mm</span>
              </span>
            </label>
            <button type="button" className="text-button small-button" title={`Set them ${gap} mm apart in a row, left to right`} onClick={() => s().distributeSelected("x", gap)}>
              Row
            </button>
            <button type="button" className="text-button small-button" title={`Set them ${gap} mm apart in a column, bottom to top`} onClick={() => s().distributeSelected("y", gap)}>
              Column
            </button>
          </div>
        </>
      )}
      <p className="dialog-hint">{oneGroup ? "Clicking any shape in a group picks the whole group. Ungroup (toolbar) to change one on its own." : "Group them (toolbar) to keep them together."}</p>
    </>
  );
}

/** The shape's name, edited in place. */
function NameBox({ item }: { item: Item }) {
  const updateItem = useStore((s) => s.updateItem);
  const [name, setName] = useState(item.name);
  useEffect(() => setName(item.name), [item.name, item.id]);
  return (
    <input
      className="name-box"
      value={name}
      aria-label="Shape name"
      title="Click to rename"
      onChange={(e) => setName(e.target.value)}
      onBlur={() => (name.trim() ? updateItem(item.id, (it) => ({ ...it, name: name.trim() })) : setName(item.name))}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setName(item.name);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** A number box that applies its value when you leave it or press Enter (so half-typed numbers don't jump the shape about). */
function NumberBox({ label, value, unit, min, onCommit }: { label: string; value: number; unit: string; min?: number; onCommit: (v: number) => void }) {
  const shown = String(Math.round(value * 1000) / 1000);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(shown);
  }, [shown, editing]);
  const commit = () => {
    setEditing(false);
    const v = Number(text.replace(",", "."));
    if (!Number.isFinite(v)) return setText(shown);
    const clamped = min !== undefined ? Math.max(min, v) : v;
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-input">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onFocus={() => setEditing(true)}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setText(shown);
              setEditing(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="unit">{unit}</span>
      </span>
    </label>
  );
}
