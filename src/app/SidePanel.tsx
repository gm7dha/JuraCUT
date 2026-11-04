/**
 * The side panel: the list of shapes on the bed (click to select, the eye to
 * hide, arrows to reorder) and, below it, the selected shape's settings.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { FONTS, FONT_IDS } from "../geometry/text";
import { describeItem, itemBox, placedAt } from "../model/shapes";
import { useDocument, useSelection, useStore } from "../model/store";
import { OPS, OP_INFO, type Item, type Op } from "../model/types";
import { Icons } from "./icons";

export function SidePanel() {
  const doc = useDocument();
  const selection = useSelection();
  const select = useStore((s) => s.select);
  const updateItem = useStore((s) => s.updateItem);
  const reorder = useStore((s) => s.reorder);
  const selected = useMemo(() => doc.items.filter((it) => selection.includes(it.id)), [doc.items, selection]);

  return (
    <aside className="side-panel">
      <section className="panel-section shapes">
        <h3>
          Shapes <span className="count">{doc.items.length}</span>
        </h3>
        {doc.items.length === 0 ? (
          <p className="panel-hint">Nothing on the bed yet. Draw a rectangle, circle, line or words with the tools above, or Import an SVG or DXF drawing.</p>
        ) : (
          <ul className="shape-list" role="listbox" aria-label="Shapes">
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
                  <span className="shape-name">{it.name}</span>
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
      <OpPicker value={item.op} onChange={(op) => change({ op })} />
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
      {item.kind === "shape" && box && (
        <p className="dialog-hint">
          {describeItem(item)}, {item.outlines.length} {item.outlines.length === 1 ? "outline" : "outlines"}. Use the toolbar to turn or flip it.
        </p>
      )}
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
          <select value={item.font} onChange={(e) => change({ font: e.target.value as typeof item.font })}>
            {FONT_IDS.map((id) => (
              <option key={id} value={id}>
                {FONTS[id].label}
              </option>
            ))}
          </select>
        </label>
        <NumberBox label="Letter height" value={item.size} unit="mm" min={0.5} onCommit={(size) => change({ size })} />
      </div>
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
    </>
  );
}

function ManyProperties({ items }: { items: Item[] }) {
  const setOp = useStore((s) => s.setOp);
  const ops = new Set(items.map((it) => it.op));
  return (
    <>
      <h3>{items.length} shapes selected</h3>
      <OpPicker value={ops.size === 1 ? items[0].op : null} onChange={(op) => setOp(items.map((it) => it.id), op)} />
      <p className="dialog-hint">Drag them together on the bed, or use the toolbar to turn, flip, copy or delete them all.</p>
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
